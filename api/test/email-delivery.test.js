const test = require('node:test');
const assert = require('node:assert/strict');
const { sendAcsMessage, sendGridMessage } = require('../src/email-delivery');

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
