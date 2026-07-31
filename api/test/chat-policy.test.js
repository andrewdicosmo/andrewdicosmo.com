const test = require('node:test');
const assert = require('node:assert/strict');
const { isEngineeringRequest, shouldUseWebSearch } = require('../src/chat-policy');

test('engineering work requests are detected without blocking concept questions', () => {
  assert.equal(isEngineeringRequest('Can you debug my Python API?'), true);
  assert.equal(isEngineeringRequest('What is the difference between a terabyte and a megabyte?'), false);
});

test('web search is limited to current context without personal data', () => {
  const original = process.env.CHAT_WEB_SEARCH_ENABLED;
  process.env.CHAT_WEB_SEARCH_ENABLED = 'true';
  assert.equal(shouldUseWebSearch('What is the current market rate for this type of project?'), true);
  assert.equal(shouldUseWebSearch('Current rate for me at visitor@example.com'), false);
  assert.equal(shouldUseWebSearch('How does this Astro template work?'), false);
  if (original === undefined) delete process.env.CHAT_WEB_SEARCH_ENABLED;
  else process.env.CHAT_WEB_SEARCH_ENABLED = original;
});
