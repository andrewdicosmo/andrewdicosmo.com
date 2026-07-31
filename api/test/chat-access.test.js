const test = require('node:test');
const assert = require('node:assert/strict');
const { accessGate, contactFromMessage } = require('../src/chat-access');

test('allows two anonymous questions', () => {
  assert.equal(accessGate({ questionCount: 0 }, 'Tell me about Andrew'), null);
  assert.equal(accessGate({ questionCount: 1 }, 'What did he build?'), null);
});

test('requires a name before the third model call', () => {
  const session = { questionCount: 2, name: '', email: '' };
  const gate = accessGate(session, 'Tell me more about his AI work');
  assert.equal(gate.blockedOn, 'name');
  assert.equal(session.nameRequested, true);
});

test('accepts a naturally introduced name', () => {
  const session = { questionCount: 2, name: '', email: '' };
  assert.equal(accessGate(session, 'My name is Tim'), null);
  assert.equal(session.name, 'Tim');
});

test('accepts a short name after the assistant asks', () => {
  const session = { questionCount: 3, name: '', email: '', nameRequested: true };
  assert.equal(accessGate(session, 'Tim Jones'), null);
  assert.equal(session.name, 'Tim Jones');
});

test('requires email after the bounded preview', () => {
  const session = { questionCount: 6, name: 'Tim', email: '' };
  assert.equal(accessGate(session, 'What else has Andrew built?').blockedOn, 'email');
});

test('accepts a valid email at the preview limit', () => {
  const session = { questionCount: 6, name: 'Tim', email: '' };
  assert.equal(accessGate(session, 'Use tim@example.com'), null);
  assert.equal(session.email, 'tim@example.com');
});

test('does not mistake a question for a requested name', () => {
  assert.deepEqual(contactFromMessage('What is Azure AI?', true), { name: '', email: '' });
});
