import fs from 'node:fs';
import path from 'node:path';

const dataDir = path.resolve('src/data');
const outputFile = path.resolve('api/data/chat-knowledge.json');

const clean = (value) => String(value ?? '')
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

function readJson(name) {
  const file = path.join(dataDir, name);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
}

function textValues(value, prefix = '') {
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return [];
  if (typeof value === 'string') {
    const body = clean(value);
    return body ? [`${prefix ? `${prefix}: ` : ''}${body}`] : [];
  }
  if (Array.isArray(value)) return value.flatMap((item) => textValues(item, prefix));
  if (typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => {
      if (key.startsWith('_') || ['apiEndpoint', 'metricsEndpoint', 'bookingsUrl'].includes(key)) return [];
      return textValues(item, clean(key.replace(/([a-z])([A-Z])/g, '$1 $2')));
    });
  }
  return [];
}

const chunks = [];
function add(type, id, title, value, anchor = '') {
  const text = textValues(value).join(' | ').slice(0, 7000);
  if (text) chunks.push({ id, type, title: clean(title) || id, text, anchor });
}

const profile = readJson('profile.json');
add('profile', 'profile', profile.name || 'Profile', profile, '#top');

const leadership = readJson('leadership.json');
add('leadership', 'leadership-summary', leadership.title || 'Technology Leadership', {
  kicker: leadership.kicker,
  intro: leadership.intro,
  footer: leadership.footer
}, '#leadership');
(leadership.items || []).forEach((item, index) => add(
  'leadership', `leadership-${index + 1}`, item.title || `Leadership ${index + 1}`, item, '#leadership'
));

const proof = readJson('proof.json');
add('engineering', 'engineering-summary', proof.title || 'Hands-On Engineering', {
  kicker: proof.kicker,
  intro: proof.intro,
  footer: proof.footer
}, '#proof');
(proof.items || []).forEach((item, index) => add(
  'engineering', `engineering-${index + 1}`, item.title || `Engineering ${index + 1}`, item, '#proof'
));

const timeline = readJson('timeline.json');
(timeline.items || []).forEach((item, index) => add(
  'history', `history-${index + 1}`, item.title || item.tag || `History ${index + 1}`, item, '#timeline'
));

const loadout = readJson('loadout.json');
(loadout.cards || []).forEach((card, index) => add(
  'capability', `capability-${index + 1}`, card.title || card.code || `Capability ${index + 1}`, card, '#loadout'
));

const sectors = readJson('sectors.json');
add('sector', 'sector-summary', sectors.title || 'Sector Coverage', {
  intro: sectors.intro,
  sectors: sectors.sectors
}, '#sectors');

const brief = readJson('brief.json');
add('engagement', 'engagement', 'Ways to work with Andrew', {
  availability: brief.availability,
  terms: brief.terms,
  stage: brief.stage,
  workAreas: brief.chips,
  leadershipArrangements: brief.leadershipArrangement
}, '#brief');

const sectionsDir = path.join(dataDir, 'sections');
if (fs.existsSync(sectionsDir)) {
  for (const name of fs.readdirSync(sectionsDir).filter((file) => file.endsWith('.html')).sort()) {
    add('site', `section-${path.basename(name, '.html').toLowerCase()}`, path.basename(name, '.html'), fs.readFileSync(path.join(sectionsDir, name), 'utf8'));
  }
}

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, `${JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), chunks }, null, 2)}\n`);
console.log(`Built private chat knowledge: ${chunks.length} approved chunks`);
