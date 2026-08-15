const { app } = require('@azure/functions');
const { TableClient } = require('@azure/data-tables');
const { emailShell, sendReport, transcriptText } = require('../chat-email');
const { recentSessions } = require('../chat-storage');

const escapeHtml = (value) => String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const dayKey = (date) => date.toISOString().slice(0, 10).replace(/-/g, '');

function chicagoParts(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

async function siteEventsSince(since) {
  const connection = process.env.STORAGE_CONNECTION_STRING;
  if (!connection) return [];
  const table = TableClient.fromConnectionString(connection, process.env.EVENTS_TABLE || 'siteEvents');
  const dates = [new Date(), new Date(Date.now() - 86400000)];
  const rows = [];
  for (const partition of [...new Set(dates.map((date) => `event-${dayKey(date)}`))]) {
    const entities = table.listEntities({ queryOptions: { filter: `PartitionKey eq '${partition}'` } });
    for await (const entity of entities) {
      if (new Date(entity.serverTime) >= since) rows.push(entity);
    }
  }
  return rows;
}

function firstVisitorMessage(session) {
  try {
    return JSON.parse(session.transcript || '[]').find((item) => item.role === 'user')?.text || '';
  } catch { return ''; }
}

function percent(numerator, denominator) {
  return denominator ? `${Math.round(numerator / denominator * 100)}%` : '0%';
}

function parseProps(value) {
  try { return JSON.parse(value || '{}') || {}; } catch { return {}; }
}

function parseUserAgent(value = '') {
  const ua = String(value || '');
  const lower = ua.toLowerCase();
  let device = 'Desktop';
  if (/bot|crawler|spider|preview|slurp/.test(lower)) device = 'Bot';
  else if (/ipad|tablet/.test(lower)) device = 'Tablet';
  else if (/mobile|iphone|android/.test(lower)) device = 'Mobile';

  let os = 'Unknown OS';
  if (/iphone|ipad|ipod/.test(lower)) os = 'iOS';
  else if (/android/.test(lower)) os = 'Android';
  else if (/windows nt/.test(lower)) os = 'Windows';
  else if (/mac os x|macintosh/.test(lower)) os = 'macOS';
  else if (/linux/.test(lower)) os = 'Linux';

  let browser = 'Unknown browser';
  if (/edg\//.test(lower)) browser = 'Microsoft Edge';
  else if (/opr\/|opera/.test(lower)) browser = 'Opera';
  else if (/samsungbrowser/.test(lower)) browser = 'Samsung Internet';
  else if (/chrome|crios/.test(lower) && !/edg\//.test(lower)) browser = 'Chrome';
  else if (/firefox|fxios/.test(lower)) browser = 'Firefox';
  else if (/safari/.test(lower) && !/chrome|crios|android/.test(lower)) browser = 'Safari';
  return { device, os, browser };
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds || 0)));
  if (!total) return 'Unknown';
  const minutes = Math.floor(total / 60);
  const remaining = total % 60;
  if (!minutes) return `${remaining}s`;
  if (minutes < 60) return `${minutes}m ${remaining}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function locationLabel(event) {
  return [event.city, event.region, event.country].filter(Boolean).join(', ') || 'Unknown';
}

function visitorSummaries(events) {
  const bySession = new Map();
  for (const event of events) {
    const key = event.sessionId || event.visitorId || event.rowKey;
    if (!key) continue;
    const props = parseProps(event.props);
    const current = bySession.get(key) || {
      sessionId: key,
      visitorId: event.visitorId || '',
      start: null,
      end: null,
      durationSeconds: 0,
      pages: new Set(),
      events: 0,
      location: '',
      userAgent: ''
    };
    const when = new Date(event.serverTime || event.clientTime || 0);
    if (!Number.isNaN(when.valueOf())) {
      current.start = current.start && current.start < when ? current.start : when;
      current.end = current.end && current.end > when ? current.end : when;
    }
    current.events += 1;
    if (event.path) current.pages.add(event.path);
    if (!current.location || current.location === 'Unknown') current.location = locationLabel(event);
    if (!current.userAgent && event.userAgent) current.userAgent = event.userAgent;
    if (event.event === 'site_session_end' && Number(props.durationSeconds) > current.durationSeconds) {
      current.durationSeconds = Number(props.durationSeconds);
    }
    bySession.set(key, current);
  }
  return [...bySession.values()].map((item) => {
    const fallbackDuration = item.start && item.end ? Math.round((item.end - item.start) / 1000) : 0;
    return {
      ...item,
      durationSeconds: Math.max(item.durationSeconds, fallbackDuration),
      pages: [...item.pages],
      ...parseUserAgent(item.userAgent)
    };
  }).sort((a, b) => b.durationSeconds - a.durationSeconds || b.events - a.events);
}

app.http('chat-report', {
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const secret = process.env.CHAT_REPORT_SECRET || '';
    const supplied = request.headers.get('x-chat-report-secret')
      || (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!secret || supplied !== secret) return { status: 401, jsonBody: { ok: false } };

    let body = {};
    try { body = await request.json(); } catch {}
    const chicago = chicagoParts();
    if (!body.force && chicago.hour !== 8) return { status: 204 };

    const connection = process.env.STORAGE_CONNECTION_STRING;
    if (!connection) return { status: 503, jsonBody: { ok: false, error: 'storage not configured' } };
    const reports = TableClient.fromConnectionString(connection, process.env.CHAT_REPORTS_TABLE || 'chatReports');
    await reports.createTable().catch(() => {});
    try {
      await reports.getEntity('daily', chicago.date);
      if (!body.force) return { status: 204 };
    } catch (error) {
      if (error.statusCode !== 404) throw error;
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [sessions, events] = await Promise.all([recentSessions(since), siteEventsSince(since)]);
    const visitors = visitorSummaries(events);
    const uniqueVisitors = new Set(events.map((event) => event.visitorId).filter(Boolean)).size;
    const eventCount = (name) => events.filter((event) => event.event === name).length;
    const started = sessions.filter((session) => Number(session.questionCount || 0) > 0).length;
    const twoQuestions = sessions.filter((session) => Number(session.questionCount || 0) >= 2).length;
    const names = sessions.filter((session) => session.name).length;
    const emails = sessions.filter((session) => session.email).length;
    const qualified = sessions.filter((session) => session.qualified).length;
    const spam = sessions.filter((session) => Number(session.spamProbability || 0) >= 0.65 || session.classification === 'spam');
    const inputTokens = sessions.reduce((sum, session) => sum + Number(session.inputTokens || 0), 0);
    const outputTokens = sessions.reduce((sum, session) => sum + Number(session.outputTokens || 0), 0);
    const cost = sessions.reduce((sum, session) => sum + Number(session.estimatedCost || 0), 0);
    const intents = Object.entries(sessions.reduce((counts, session) => {
      const intent = session.intent || 'general';
      counts[intent] = (counts[intent] || 0) + 1;
      return counts;
    }, {})).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const rows = [
      ['Unique site visitors', uniqueVisitors], ['Chat opens', eventCount('chat_open')],
      ['Conversations started', started], ['Reached two questions', twoQuestions],
      ['Names captured', names], ['Emails captured', emails],
      ['Job descriptions analyzed', sessions.filter((session) => session.jobDescriptionAnalyzed).length],
      ['Qualified opportunities', qualified], ['Inquiry forms started', eventCount('inquiry_form_started')],
      ['Inquiry forms submitted', eventCount('inquiry_submit_success')],
      ['Resume emails sent from chat', sessions.filter((session) => session.resumeSent).length],
      ['Booking/contact clicks', eventCount('booking_click') + eventCount('contact_click')],
      ['Visitor to chat conversion', percent(started, uniqueVisitors)],
      ['Chat to qualified conversion', percent(qualified, started)],
      ['AI input tokens', inputTokens.toLocaleString()], ['AI output tokens', outputTokens.toLocaleString()],
      ['Estimated AI cost', `$${cost.toFixed(2)}`]
    ];
    const metricHtml = rows.map(([label, value]) => `<tr><td style="padding:8px 12px 8px 0;color:#66727c;border-bottom:1px solid #e7edf2;">${escapeHtml(label)}</td><td style="padding:8px 0;text-align:right;font-weight:800;border-bottom:1px solid #e7edf2;">${escapeHtml(value)}</td></tr>`).join('');
    const topicHtml = intents.length ? intents.map(([intent, count]) => `<li>${escapeHtml(intent)}: ${count}</li>`).join('') : '<li>No conversations</li>';
    const spamHtml = spam.slice(0, 5).map((session) => `<li><strong>${escapeHtml(session.rowKey)}</strong>: ${escapeHtml(firstVisitorMessage(session).slice(0, 180))}</li>`).join('') || '<li>No likely spam conversations</li>';
    const visitorRows = visitors.slice(0, 20).map((visitor) => `<tr><td style="padding:8px 10px 8px 0;border-bottom:1px solid #e7edf2;">${escapeHtml(visitor.location || 'Unknown')}</td><td style="padding:8px 10px;border-bottom:1px solid #e7edf2;">${escapeHtml(visitor.device)}</td><td style="padding:8px 10px;border-bottom:1px solid #e7edf2;">${escapeHtml(visitor.os)}</td><td style="padding:8px 10px;border-bottom:1px solid #e7edf2;">${escapeHtml(visitor.browser)}</td><td style="padding:8px 0;text-align:right;border-bottom:1px solid #e7edf2;">${escapeHtml(formatDuration(visitor.durationSeconds))}</td></tr>`).join('');
    const visitorHtml = visitorRows || '<tr><td colspan="5" style="padding:8px 0;color:#66727c;">No visitor sessions captured.</td></tr>';
    const visitorText = visitors.slice(0, 20).map((visitor) => `- ${visitor.location || 'Unknown'} | ${visitor.device} | ${visitor.os} | ${visitor.browser} | ${formatDuration(visitor.durationSeconds)} | pages: ${visitor.pages.join(', ') || 'unknown'}`).join('\n') || '- No visitor sessions captured.';
    const reportText = rows.map(([label, value]) => `${label}: ${value}`).join('\n');
    const message = {
      recipient: process.env.MAIL_TO,
      recipientName: 'Andrew DiCosmo',
      subject: `AndrewDiCosmo.com | Daily conversion report | ${chicago.date}`,
      text: `${reportText}\n\nVisitor sessions\n${visitorText}\n\nTop topics\n${intents.map(([intent, count]) => `- ${intent}: ${count}`).join('\n')}\n\nPotential spam (${spam.length})\n${spam.slice(0, 5).map((session) => `- ${session.rowKey}: ${firstVisitorMessage(session).slice(0, 180)}`).join('\n')}\n\nAsk Codex for a conversation by its ID when you want the full transcript.`,
      html: emailShell('Daily conversion report', `<div style="margin-bottom:16px;color:#66727c;">Reporting window: previous 24 hours · ${escapeHtml(chicago.date)}</div><table role="presentation" width="100%" style="border-top:3px solid #1e6f8f;margin-bottom:24px;">${metricHtml}</table><h3 style="font-size:12px;letter-spacing:1.4px;text-transform:uppercase;">Visitor sessions</h3><table role="presentation" width="100%" style="border-top:3px solid #1e6f8f;margin-bottom:24px;font-size:12px;"><tr><th align="left" style="padding:8px 10px 8px 0;color:#66727c;">Location</th><th align="left" style="padding:8px 10px;color:#66727c;">Device</th><th align="left" style="padding:8px 10px;color:#66727c;">OS</th><th align="left" style="padding:8px 10px;color:#66727c;">Browser</th><th align="right" style="padding:8px 0;color:#66727c;">Time on site</th></tr>${visitorHtml}</table><h3 style="font-size:12px;letter-spacing:1.4px;text-transform:uppercase;">Top conversation topics</h3><ul>${topicHtml}</ul><h3 style="font-size:12px;letter-spacing:1.4px;text-transform:uppercase;">Potential spam (${spam.length})</h3><ol>${spamHtml}</ol><p style="color:#66727c;font-size:12px;">Ask Codex for a conversation by its ID when you want the full transcript.</p>`),
      attachments: []
    };
    const delivery = await sendReport(message);
    if (!delivery.accepted) {
      context.error('daily chat report email failed', delivery.error);
      return { status: 502, jsonBody: { ok: false, error: 'email delivery failed' } };
    }
    await reports.upsertEntity({ partitionKey: 'daily', rowKey: chicago.date, sentAt: new Date().toISOString(), sessionCount: sessions.length }, 'Replace');
    return { jsonBody: { ok: true, date: chicago.date, sessions: sessions.length } };
  }
});
