const fs = require('node:fs');
const path = require('node:path');

const STOP = new Set(['about', 'after', 'andrew', 'because', 'could', 'from', 'have', 'into', 'just', 'more', 'that', 'their', 'there', 'these', 'they', 'this', 'what', 'when', 'where', 'which', 'with', 'would', 'your']);

function tokens(value) {
  return [...new Set(String(value || '').toLowerCase().match(/[a-z0-9][a-z0-9+#.-]{2,}/g) || [])]
    .filter((word) => !STOP.has(word));
}

function loadKnowledge(file = path.join(__dirname, '../data/chat-knowledge.json')) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(parsed.chunks) ? parsed.chunks : [];
  } catch {
    return [];
  }
}

function searchKnowledge(query, chunks = loadKnowledge(), limit = 6) {
  const terms = tokens(query);
  const scored = chunks.map((chunk) => {
    const title = String(chunk.title || '').toLowerCase();
    const text = String(chunk.text || '').toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (title.includes(term)) score += 5;
      if (text.includes(term)) score += 1 + Math.min(2, text.split(term).length - 2);
    }
    if (/cto|leadership|executive|strategy/.test(query.toLowerCase()) && chunk.type === 'leadership') score += 4;
    if (/code|engineering|python|api|cloud|security|ai|vision/.test(query.toLowerCase()) && ['engineering', 'capability'].includes(chunk.type)) score += 3;
    if (/history|worked|employer|client|experience|where/.test(query.toLowerCase()) && chunk.type === 'history') score += 3;
    if (/hire|role|project|consult|available|resume/.test(query.toLowerCase()) && chunk.type === 'engagement') score += 4;
    if (/template|clone|site|github/.test(query.toLowerCase()) && chunk.type === 'site') score += 4;
    return { ...chunk, score };
  }).filter((chunk) => chunk.score > 0).sort((a, b) => b.score - a.score);

  const selected = scored.slice(0, limit);
  if (!selected.length) {
    return chunks.filter((chunk) => ['profile', 'engagement'].includes(chunk.type)).slice(0, 3);
  }
  return selected;
}

module.exports = { loadKnowledge, searchKnowledge, tokens };
