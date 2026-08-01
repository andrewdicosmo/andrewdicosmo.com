const test = require('node:test');
const assert = require('node:assert/strict');
const { formatTranscriptHtml, ownerMessage } = require('../src/chat-email');

const session = {
  rowKey: '202607-test-session',
  name: 'Taylor',
  email: 'taylor@example.com',
  intent: 'hiring',
  preferredTime: 'Weekday evenings',
  transcript: JSON.stringify([
    { role: 'user', text: 'Can Andrew lead our AI program?', at: '2026-07-31T22:30:00.000Z' },
    { role: 'assistant', text: 'Yes. What outcome matters most?\nDelivery, governance, or both?', at: '2026-07-31T22:31:00.000Z' }
  ])
};

test('renders owner transcript as readable left and right message bubbles', () => {
  const html = formatTranscriptHtml(session, session.name);
  assert.match(html, /align="left"/);
  assert.match(html, /align="right"/);
  assert.match(html, /background-color:#26252a/);
  assert.match(html, /background-color:#0a84ff/);
  assert.match(html, /bgcolor="#26252a"/);
  assert.match(html, /bgcolor="#0a84ff"/);
  assert.match(html, /color:#ffffff !important/);
  assert.match(html, /-webkit-text-fill-color:#ffffff/);
  assert.match(html, /font-size:16px/);
  assert.match(html, /Taylor/);
  assert.match(html, /Andrew&#39;s AI Assistant/);
  assert.match(html, /Jul 31/);
  assert.match(html, /Delivery, governance, or both\?/);
});

test('uses the message thread in the complete owner notification', () => {
  const message = ownerMessage(session, 'lead');
  assert.match(message.html, /Conversation transcript/);
  assert.match(message.html, /<body bgcolor="#000000"/);
  assert.match(message.html, /background-color:#000000 !important/);
  assert.match(message.html, /name="viewport" content="width=device-width,initial-scale=1.0"/);
  assert.match(message.html, /max-width:640px/);
  assert.match(message.html, /\.email-canvas\{padding:10px 4px !important;/);
  assert.match(message.html, /class="detail-value"/);
  assert.match(message.html, /table-layout:fixed/);
  assert.match(message.html, /Name:<\/td>/);
  assert.match(message.html, /Preferred time:<\/td>/);
  assert.match(message.html, /padding:3px 10px 3px 0/);
  assert.match(message.html, /Can Andrew lead our AI program\?/);
  assert.match(message.text, /Visitor: Can Andrew lead our AI program\?/);
});

test('escapes visitor-provided transcript content', () => {
  const html = formatTranscriptHtml({
    transcript: JSON.stringify([{ role: 'user', text: '<script>alert("x")</script>' }])
  });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});
