const test = require('node:test');
const assert = require('node:assert/strict');
const { searchKnowledge } = require('../src/chat-knowledge');

const chunks = [
  { id: 'lead', type: 'leadership', title: 'Technology Leadership', text: 'Strategy, governance, and engineering leadership.' },
  { id: 'vision', type: 'capability', title: 'Computer Vision', text: 'Production imagery and object detection.' },
  { id: 'history', type: 'history', title: 'Work History', text: 'A summary of prior engagements.' }
];

test('retrieval favors title and domain matches', () => {
  assert.equal(searchKnowledge('computer vision systems', chunks, 2)[0].id, 'vision');
  assert.equal(searchKnowledge('CTO leadership strategy', chunks, 2)[0].id, 'lead');
});
