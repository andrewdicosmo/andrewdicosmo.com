const test = require('node:test');
const assert = require('node:assert/strict');
const { isEngineeringRequest, shouldUseWebSearch, systemPrompt } = require('../src/chat-policy');

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

test('system prompt includes the response behavior playbook', () => {
  const prompt = systemPrompt({
    evidence: [{ id: 'EV-001', title: 'Approved sample', text: 'Andrew has approved public experience.' }],
    engineeringRequest: false,
    webEnabled: true
  });
  assert.match(prompt, /RESPONSE PLAYBOOK/);
  assert.match(prompt, /Hiring manager or recruiter/);
  assert.match(prompt, /Consulting lead/);
  assert.match(prompt, /Technology leadership lead/);
  assert.match(prompt, /Template explorer/);
  assert.match(prompt, /Accuracy challenge/);
  assert.match(prompt, /Do not ask for both name and email in the same reply/);
  assert.match(prompt, /Suggestions should be two or three short next-step options/);
});

test('engineering work requests force the scope boundary', () => {
  const prompt = systemPrompt({ evidence: [], engineeringRequest: true, webEnabled: false });
  assert.match(prompt, /The visitor appears to be requesting engineering work/);
  assert.match(prompt, /I can explain how this relates to Andrew's experience, but I'm not configured to perform engineering work/);
});
