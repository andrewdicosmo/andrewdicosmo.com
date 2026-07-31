const test = require('node:test');
const assert = require('node:assert/strict');
const {
  deliverMessagesIndependently,
  sendAcsMessage,
  sendGridMessage
} = require('../src/email-delivery');

const message = {
  recipient: 'person@example.com',
  subject: 'Test',
  text: 'Test message',
  attachments: []
};

test('accepts a successful ACS send result', async () => {
  const client = {
    beginSend: async () => ({
      pollUntilDone: async () => ({ status: 'Succeeded', id: 'acs-message-id' })
    })
  };

  assert.equal(await sendAcsMessage(client, 'sender@example.com', message), 'acs-message-id');
});

test('rejects a failed ACS send result', async () => {
  const client = {
    beginSend: async () => ({
      pollUntilDone: async () => ({ status: 'Failed', error: { message: 'Rejected' } })
    })
  };

  await assert.rejects(
    sendAcsMessage(client, 'sender@example.com', message),
    /Azure Communication Services email delivery failed \(Failed\): Rejected/
  );
});

test('rejects a non-success SendGrid response', async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 401,
    text: async () => 'Unauthorized',
    headers: { get: () => null }
  });

  await assert.rejects(
    sendGridMessage(fetchImpl, 'key', 'sender@example.com', 'Sender', message),
    /SendGrid email delivery failed \(401\): Unauthorized/
  );
});

test('attempts owner notification when resume delivery fails', async () => {
  const attempted = [];
  const results = await deliverMessagesIndependently(async (outbound) => {
    attempted.push(outbound.recipient);
    if (outbound.recipient === 'submitter@example.com') throw new Error('Resume rejected');
    return 'owner-message-id';
  }, [
    { key: 'resume', message: { recipient: 'submitter@example.com' } },
    { key: 'owner', message: { recipient: 'owner@example.com' } }
  ]);

  assert.deepEqual(attempted, ['submitter@example.com', 'owner@example.com']);
  assert.equal(results[0].status, 'failed');
  assert.equal(results[1].status, 'accepted');
  assert.equal(results[1].messageId, 'owner-message-id');
});
