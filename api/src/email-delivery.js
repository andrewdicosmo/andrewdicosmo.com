function formatDeliveryError(provider, status, detail) {
  const suffix = detail ? `: ${detail}` : '';
  return new Error(`${provider} email delivery failed (${status || 'unknown'})${suffix}`);
}

async function sendAcsMessage(client, from, message) {
  const poller = await client.beginSend({
    senderAddress: from,
    content: message.html
      ? { subject: message.subject, plainText: message.text, html: message.html }
      : { subject: message.subject, plainText: message.text },
    recipients: { to: [{ address: message.recipient, displayName: message.recipientName }] },
    replyTo: message.replyTo
      ? [{ address: message.replyTo, displayName: message.replyToName }]
      : undefined,
    attachments: (message.attachments || []).map((attachment) => ({
      name: attachment.filename,
      contentType: attachment.type,
      contentInBase64: attachment.content,
      contentId: attachment.contentId
    }))
  });
  const result = await poller.pollUntilDone();
  if (!result || result.status !== 'Succeeded') {
    throw formatDeliveryError('Azure Communication Services', result?.status, result?.error?.message);
  }
  return result.id || '';
}

async function sendGridMessage(fetchImpl, apiKey, from, senderName, message) {
  const response = await fetchImpl('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: message.recipient, name: message.recipientName }] }],
      from: { email: from, name: senderName },
      reply_to: message.replyTo
        ? { email: message.replyTo, name: message.replyToName }
        : undefined,
      subject: message.subject,
      content: [
        { type: 'text/plain', value: message.text },
        message.html ? { type: 'text/html', value: message.html } : null
      ].filter(Boolean),
      attachments: (message.attachments || []).map((attachment) => ({
        content: attachment.content,
        filename: attachment.filename,
        type: attachment.type,
        disposition: attachment.disposition,
        content_id: attachment.content_id
      }))
    })
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 1000);
    throw formatDeliveryError('SendGrid', response.status, detail);
  }
  return response.headers.get('x-message-id') || '';
}

async function deliverMessagesIndependently(sendMessage, messages) {
  return Promise.all(messages.map(async ({ key, message }) => {
    try {
      return { key, status: 'accepted', messageId: await sendMessage(message) };
    } catch (error) {
      return { key, status: 'failed', error };
    }
  }));
}

module.exports = { deliverMessagesIndependently, sendAcsMessage, sendGridMessage };
