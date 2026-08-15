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

function clientIp(request) {
  const forwarded = request.headers.get('x-forwarded-for') || request.headers.get('x-client-ip') || '';
  return forwarded.split(',').map((item) => item.trim()).find(Boolean) || '';
}

function headerLocation(request) {
  return {
    city: clean(request.headers.get('x-ms-client-city') || request.headers.get('x-azure-clientip-city'), 120),
    region: clean(request.headers.get('x-ms-client-region') || request.headers.get('x-azure-clientip-region'), 120),
    country: clean(request.headers.get('x-ms-client-country') || request.headers.get('x-azure-clientip-country'), 80)
  };
}

async function geoLookup(ip, context) {
  if (!ip || /^(10\.|127\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|::1|fc|fd)/i.test(ip)) return {};
  try {
    const response = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
      headers: { 'User-Agent': 'andrewdicosmo.com analytics' },
      signal: AbortSignal.timeout(1200)
    });
    if (!response.ok) return {};
    const data = await response.json();
    return {
      city: clean(data.city, 120),
      region: clean(data.region || data.region_code, 120),
      country: clean(data.country_name || data.country, 80)
    };
  } catch (error) {
    context.warn('geo lookup skipped', error.message);
    return {};
  }
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
    const bodyGeo = page.geo && typeof page.geo === 'object' ? page.geo : {};
    const now = new Date();
    const fromHeaders = headerLocation(request);
    const fromGeo = fromHeaders.city || fromHeaders.region || fromHeaders.country ? {} : await geoLookup(clientIp(request), context);
    const location = {
      city: clean(bodyGeo.city, 120) || fromHeaders.city || fromGeo.city || '',
      region: clean(bodyGeo.region, 120) || fromHeaders.region || fromGeo.region || '',
      country: clean(bodyGeo.country, 80) || fromHeaders.country || fromGeo.country || ''
    };
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
      city: location.city,
      region: location.region,
      country: location.country,
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
