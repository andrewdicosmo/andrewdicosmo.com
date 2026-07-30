const { app } = require('@azure/functions');
const { TableClient } = require('@azure/data-tables');

const clean = (value, max = 240) => String(value || '')
  .trim()
  .replace(/[\r\n\t]+/g, ' ')
  .slice(0, max);

function eventName(value) {
  return clean(value, 80).toLowerCase().replace(/[^a-z0-9_.:-]/g, '_');
}

function safeJson(value, max = 4000) {
  try {
    return JSON.stringify(value || {}).slice(0, max);
  } catch {
    return '{}';
  }
}

function dayStamp(date) {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

app.http('metrics', {
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    let body;
    try {
      body = await request.json();
    } catch {
      return { status: 400, jsonBody: { ok: false, error: 'invalid json' } };
    }

    const event = eventName(body.event);
    if (!event) return { status: 400, jsonBody: { ok: false, error: 'missing event' } };

    const conn = process.env.STORAGE_CONNECTION_STRING;
    if (!conn) {
      context.warn('STORAGE_CONNECTION_STRING not set; analytics event not persisted');
      return { status: 204 };
    }

    const page = body.page && typeof body.page === 'object' ? body.page : {};
    const utm = page.utm && typeof page.utm === 'object' ? page.utm : {};
    const now = new Date();
    const entity = {
      partitionKey: `event-${dayStamp(now)}`,
      rowKey: `${now.getTime()}-${Math.random().toString(36).slice(2, 10)}`,
      event,
      sessionId: clean(body.sessionId, 80),
      visitorId: clean(page.visitorId, 80),
      path: clean(page.path, 300),
      title: clean(page.title, 300),
      referrer: clean(page.referrer || request.headers.get('referer'), 500),
      search: clean(page.search, 500),
      clientTime: clean(body.clientTime, 80),
      serverTime: now.toISOString(),
      userAgent: clean(request.headers.get('user-agent'), 500),
      utmSource: clean(utm.source, 180),
      utmMedium: clean(utm.medium, 180),
      utmCampaign: clean(utm.campaign, 180),
      utmTerm: clean(utm.term, 180),
      utmContent: clean(utm.content, 180),
      props: safeJson(body.props)
    };

    try {
      const table = TableClient.fromConnectionString(conn, process.env.EVENTS_TABLE || 'siteEvents');
      await table.createTable().catch(() => {});
      await table.createEntity(entity);
    } catch (error) {
      context.error('analytics storage failed', error);
    }

    return { status: 204 };
  }
});
