const test = require('node:test');
const assert = require('node:assert/strict');
const { mockResult, normalizeResult } = require('../src/chat-ai');

test('public clones receive a safe template response', () => {
  const result = mockResult('I am exploring the website template');
  assert.equal(result.intent, 'template');
  assert.match(result.reply, /public clone/i);
  assert.match(result.reply, /private content/i);
});

test('model contact output rejects malformed email addresses', () => {
  const result = normalizeResult({ reply: 'Hello', contact: { email: 'not-an-email' } });
  assert.equal(result.contact.email, null);
});
