const crypto = require('node:crypto');
const { TableClient } = require('@azure/data-tables');

const clean = (value, max = 1200) => String(value || '').trim().replace(/\u0000/g, '').slice(0, max);
const monthKey = (date = new Date()) => date.toISOString().slice(0, 7).replace('-', '');
let budgetCache = { key: '', value: 0, at: 0 };

function tableClient() {
  const connection = process.env.STORAGE_CONNECTION_STRING;
  if (!connection) return null;
  return TableClient.fromConnectionString(connection, process.env.CHAT_TABLE || 'chatSessions');
}

function sessionSecret() {
  return process.env.CHAT_SESSION_SECRET || '';
}

function signature(sessionId) {
  return crypto.createHmac('sha256', sessionSecret()).update(`v1:${sessionId}`).digest('base64url');
}

function validSessionId(sessionId) {
  return /^\d{6}-[0-9a-f-]{36}$/i.test(String(sessionId || ''));
}

function verifySession(sessionId, token) {
  if (!validSessionId(sessionId) || !sessionSecret()) return false;
  const expected = signature(sessionId);
  const actual = String(token || '');
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

function clientHash(request) {
  const forwarded = request.headers.get('x-forwarded-for') || request.headers.get('x-client-ip') || '';
  const value = forwarded.split(',')[0].trim() || 'unknown';
  return sessionSecret()
    ? crypto.createHmac('sha256', sessionSecret()).update(value).digest('hex').slice(0, 24)
    : '';
}

function newSession(request) {
  const now = new Date();
  const sessionId = `${monthKey(now)}-${crypto.randomUUID()}`;
  return {
    partitionKey: `chat-${monthKey(now)}`,
    rowKey: sessionId,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 30 * 86400000).toISOString(),
    clientHash: clientHash(request),
    userAgent: clean(request.headers.get('user-agent'), 500),
    transcript: '[]',
    requestTimes: '[]',
    intent: 'general',
    stage: 'exploring',
    classification: 'anonymous',
    name: '',
    email: '',
    company: '',
    role: '',
    timezone: '',
    preferredTime: '',
    questionCount: 0,
    assistantCount: 0,
    qualified: false,
    jobDescriptionAnalyzed: false,
    spamProbability: 0,
    inputTokens: 0,
    outputTokens: 0,
    webSearches: 0,
    estimatedCost: 0,
    ownerNotified: false,
    challengeNotified: false,
    resumeSent: false
  };
}

function parseList(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function transcript(session) {
  return parseList(session.transcript);
}

function checkRateLimit(session, now = Date.now()) {
  const times = parseList(session.requestTimes).map(Number).filter((time) => now - time < 600000);
  const inMinute = times.filter((time) => now - time < 60000).length;
  if (inMinute >= 8 || times.length >= 30 || Number(session.questionCount || 0) >= 24) {
    return { allowed: false, retryAfter: inMinute >= 8 ? 60 : 600 };
  }
  times.push(now);
  session.requestTimes = JSON.stringify(times);
  return { allowed: true };
}

async function openSession(request, sessionId, token) {
  const client = tableClient();
  if (!client || !sessionSecret()) return { mode: 'mock', session: null, token: '' };
  await client.createTable().catch(() => {});

  if (!sessionId && !token) {
    const session = newSession(request);
    await client.createEntity(session);
    return { mode: 'live', session, token: signature(session.rowKey) };
  }
  if (!verifySession(sessionId, token)) return { mode: 'invalid', session: null, token: '' };

  const partitionKey = `chat-${String(sessionId).slice(0, 6)}`;
  try {
    const session = await client.getEntity(partitionKey, sessionId);
    return { mode: 'live', session, token };
  } catch (error) {
    if (error.statusCode === 404) return { mode: 'invalid', session: null, token: '' };
    throw error;
  }
}

async function saveSession(session) {
  const client = tableClient();
  if (!client) return;
  const entity = { ...session, updatedAt: new Date().toISOString() };
  delete entity.etag;
  delete entity.timestamp;
  await client.upsertEntity(entity, 'Replace');
}

function appendMessage(session, role, text, extra = {}) {
  const messages = transcript(session);
  messages.push({
    role,
    text: clean(text, role === 'user' ? 1200 : 4000),
    at: new Date().toISOString(),
    ...extra
  });
  session.transcript = JSON.stringify(messages.slice(-32));
  if (role === 'user') session.questionCount = Number(session.questionCount || 0) + 1;
  if (role === 'assistant') session.assistantCount = Number(session.assistantCount || 0) + 1;
  return messages;
}

function applyAssistantState(session, result) {
  const contact = result.contact || {};
  for (const field of ['name', 'email', 'company', 'role', 'timezone', 'preferredTime']) {
    if (contact[field]) session[field] = clean(contact[field], field === 'email' ? 240 : 500);
  }
  session.intent = result.intent || session.intent;
  session.stage = result.stage || session.stage;
  session.classification = result.classification || session.classification;
  session.qualified = Boolean(session.qualified || result.qualified);
  session.jobDescriptionAnalyzed = Boolean(session.jobDescriptionAnalyzed || result.jobDescriptionAnalyzed);
  session.spamProbability = Math.max(Number(session.spamProbability || 0), Number(result.spamProbability || 0));
  if (result.accuracyChallenge) session.accuracyChallenge = JSON.stringify(result.accuracyChallenge).slice(0, 8000);
}

function recordUsage(session, usage = {}, webSearched = false) {
  const input = Number(usage.input_tokens || usage.inputTokens || 0);
  const output = Number(usage.output_tokens || usage.outputTokens || 0);
  const inputRate = Number(process.env.CHAT_INPUT_USD_PER_MILLION || 5);
  const outputRate = Number(process.env.CHAT_OUTPUT_USD_PER_MILLION || 30);
  const searchRate = Number(process.env.CHAT_WEB_SEARCH_USD || 0.01);
  session.inputTokens = Number(session.inputTokens || 0) + input;
  session.outputTokens = Number(session.outputTokens || 0) + output;
  session.webSearches = Number(session.webSearches || 0) + Number(webSearched);
  session.estimatedCost = Number(session.estimatedCost || 0) + (input / 1_000_000 * inputRate) + (output / 1_000_000 * outputRate) + (webSearched ? searchRate : 0);
}

async function monthlySpend(date = new Date()) {
  const client = tableClient();
  if (!client) return 0;
  const key = monthKey(date);
  if (budgetCache.key === key && Date.now() - budgetCache.at < 60000) return budgetCache.value;
  let total = 0;
  const entities = client.listEntities({
    queryOptions: { filter: `PartitionKey eq 'chat-${key}'`, select: ['estimatedCost'] }
  });
  for await (const entity of entities) total += Number(entity.estimatedCost || 0);
  budgetCache = { key, value: total, at: Date.now() };
  return total;
}

async function withinBudget() {
  const limit = Number(process.env.CHAT_MONTHLY_BUDGET_USD || 25);
  return { allowed: await monthlySpend() < limit, limit };
}

async function recentSessions(since) {
  const client = tableClient();
  if (!client) return [];
  const dates = [new Date(), new Date(Date.now() - 31 * 86400000)];
  const partitions = [...new Set(dates.map((date) => `chat-${monthKey(date)}`))];
  const rows = [];
  for (const partition of partitions) {
    const entities = client.listEntities({ queryOptions: { filter: `PartitionKey eq '${partition}'` } });
    for await (const entity of entities) {
      if (new Date(entity.updatedAt || entity.createdAt) >= since) rows.push(entity);
    }
  }
  return rows;
}

module.exports = {
  appendMessage,
  applyAssistantState,
  checkRateLimit,
  clientHash,
  openSession,
  recentSessions,
  recordUsage,
  saveSession,
  transcript,
  verifySession,
  withinBudget
};
