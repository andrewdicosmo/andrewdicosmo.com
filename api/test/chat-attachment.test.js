const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MAX_RAW_BYTES,
  decodeAttachment,
  extractAttachmentText,
  minimumContactGate,
  missingMinimumContact
} = require('../src/chat-attachment');

const base64 = (value) => Buffer.from(value, 'utf8').toString('base64');

test('decodes supported text attachments', () => {
  const decoded = decodeAttachment({
    name: 'senior-ai-engineer.txt',
    data: base64('Python REST APIs, computer vision, cloud architecture')
  });
  assert.equal(decoded.ok, true);
  assert.equal(decoded.name, 'senior-ai-engineer.txt');
  assert.equal(decoded.kind, 'text');
  assert.equal(decoded.buffer.toString('utf8'), 'Python REST APIs, computer vision, cloud architecture');
});

test('rejects unsupported and oversized attachments', () => {
  assert.equal(decodeAttachment({ name: 'job.png', data: base64('test') }).error, 'unsupported_type');
  const large = Buffer.alloc(MAX_RAW_BYTES + 1).toString('base64');
  assert.equal(decodeAttachment({ name: 'job.txt', data: large }).error, 'too_large');
});

test('requires minimum contact context before job requirement processing', () => {
  const session = {};
  const blocked = minimumContactGate(session, 'Please compare this job.');
  assert.equal(blocked.blockedOn, 'job_req_contact');
  assert.deepEqual(blocked.missing, ['name', 'email', 'company', 'role']);
  assert.match(blocked.reply, /name, email, company, role/);
});

test('extracts contact context from a natural message', () => {
  const session = {};
  const gate = minimumContactGate(
    session,
    'My name is Jamie Smith. Email jamie@example.com. Company: Acme AI. Role: Director of Engineering.'
  );
  assert.equal(gate, null);
  assert.equal(session.name, 'Jamie Smith');
  assert.equal(session.email, 'jamie@example.com');
  assert.equal(session.company, 'Acme AI');
  assert.equal(session.role, 'Director of Engineering');
  assert.deepEqual(missingMinimumContact(session), []);
});

test('extracts text attachment content', async () => {
  const decoded = decodeAttachment({ name: 'job.md', data: base64('# Role\nBuild production AI systems.') });
  const text = await extractAttachmentText(decoded);
  assert.match(text, /Build production AI systems/);
});
