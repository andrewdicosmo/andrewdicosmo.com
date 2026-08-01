const fs = require('node:fs');
const path = require('node:path');
const { EmailClient } = require('@azure/communication-email');
const { deliverMessagesIndependently, sendAcsMessage, sendGridMessage } = require('./email-delivery');
const { selectResume } = require('./resume-selection');

const clean = (value, max = 4000) => String(value || '').trim().slice(0, max);
const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function logoAttachment() {
  try {
    return {
      content: fs.readFileSync(path.join(__dirname, '../assets/ad-monogram.png')).toString('base64'),
      filename: 'ad-monogram.png',
      type: 'image/png',
      disposition: 'inline',
      contentId: 'ad-monogram',
      content_id: 'ad-monogram'
    };
  } catch {
    return null;
  }
}

function configuredSender() {
  const acs = process.env.AZURE_COMMUNICATION_CONNECTION_STRING;
  const sendGrid = process.env.SENDGRID_API_KEY;
  const from = process.env.EMAIL_SENDER_ADDRESS || process.env.MAIL_FROM;
  if (!from || (!acs && !sendGrid)) return null;
  const senderName = process.env.MAIL_FROM_NAME || 'Andrew DiCosmo';
  return {
    from,
    senderName,
    send: acs
      ? ((message) => sendAcsMessage(new EmailClient(acs), from, message))
      : ((message) => sendGridMessage(fetch, sendGrid, from, senderName, message))
  };
}

function transcriptMessages(session) {
  let messages = [];
  try { messages = JSON.parse(session.transcript || '[]'); } catch {}
  return Array.isArray(messages) ? messages.filter((item) => item && ['user', 'assistant'].includes(item.role)) : [];
}

function transcriptText(session) {
  return transcriptMessages(session).map((item) => `${item.role === 'user' ? 'Visitor' : 'AI Assistant'}: ${clean(item.text)}`).join('\n\n').slice(0, 18000);
}

function messageTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  }).format(date);
}

function formatTranscriptHtml(session, visitorName = 'Visitor') {
  const messages = transcriptMessages(session);
  if (!messages.length) return '<p style="margin:0;color:#66727c;">No conversation messages were recorded.</p>';

  return messages.map((item) => {
    const assistant = item.role === 'assistant';
    const alignment = assistant ? 'right' : 'left';
    const label = assistant ? "Andrew's AI Assistant" : visitorName;
    const background = assistant ? '#0a84ff' : '#26252a';
    const radius = assistant ? '18px 18px 4px 18px' : '18px 18px 18px 4px';
    const timestamp = messageTime(item.at);
    const message = escapeHtml(clean(item.text)).replace(/\r?\n/g, '<br>');

    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#000000" style="margin:0 0 14px;background-color:#000000;"><tr><td align="${alignment}" style="color:#ffffff;">
      <table role="presentation" cellpadding="0" cellspacing="0" align="${alignment}" style="max-width:82%;">
        <tr><td style="padding:0 6px 4px;color:#8e8e93 !important;-webkit-text-fill-color:#8e8e93;font-size:10px;line-height:1.3;">${escapeHtml(label)}${timestamp ? ` &middot; ${escapeHtml(timestamp)}` : ''}</td></tr>
        <tr><td bgcolor="${background}" style="padding:10px 14px;background-color:${background} !important;color:#ffffff !important;-webkit-text-fill-color:#ffffff;border-radius:${radius};font-size:14px;line-height:1.45;overflow-wrap:anywhere;word-break:break-word;"><span style="color:#ffffff !important;-webkit-text-fill-color:#ffffff;">${message}</span></td></tr>
      </table>
    </td></tr></table>`;
  }).join('');
}

function emailShell(title, body, theme = 'light') {
  const dark = theme === 'dark';
  const canvas = dark ? '#000000' : '#f4f7f9';
  const card = dark ? '#000000' : '#ffffff';
  const header = dark ? '#111111' : '#16222b';
  const border = dark ? '#38383a' : '#dfe7ee';
  const text = dark ? '#ffffff' : '#16222b';
  const colorMeta = dark ? '<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">' : '';
  return `<!doctype html><html lang="en"><head>${colorMeta}</head><body bgcolor="${canvas}" style="margin:0;background-color:${canvas} !important;color:${text} !important;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${canvas}" style="padding:28px 12px;background-color:${canvas} !important;"><tr><td align="center" bgcolor="${canvas}" style="background-color:${canvas} !important;color:${text} !important;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${card}" style="max-width:640px;background-color:${card} !important;border:1px solid ${border};border-radius:8px;overflow:hidden;color:${text} !important;">
        <tr><td bgcolor="${header}" style="padding:20px 26px;background-color:${header} !important;"><table role="presentation"><tr><td style="padding-right:14px;"><img src="cid:ad-monogram" width="54" height="36" alt="AD" style="display:block"></td><td><div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#9fb7c9 !important;-webkit-text-fill-color:#9fb7c9;font-weight:700;">AndrewDiCosmo.com</div><div style="margin-top:5px;font-size:23px;color:#ffffff !important;-webkit-text-fill-color:#ffffff;font-weight:800;">${escapeHtml(title)}</div></td></tr></table></td></tr>
        <tr><td bgcolor="${card}" style="padding:26px;background-color:${card} !important;color:${text} !important;-webkit-text-fill-color:${text};font-size:14px;line-height:1.7;">${body}</td></tr>
      </table>
    </td></tr></table>
  </body></html>`;
}

function ownerMessage(session, kind) {
  const name = clean(session.name, 100) || 'Anonymous visitor';
  const company = clean(session.company, 120);
  const intent = clean(session.intent, 80) || 'general';
  const challenge = kind === 'accuracy';
  const title = challenge ? 'Accuracy feedback received' : 'Qualified AI Assistant inquiry';
  const subject = [challenge ? 'Accuracy review' : 'AI Assistant lead', intent, company || name].filter(Boolean).join(' | ').slice(0, 180);
  const details = [
    ['Name', name], ['Email', session.email], ['Company', company], ['Role', session.role],
    ['Intent', intent], ['Preferred time', session.preferredTime], ['Timezone', session.timezone],
    ['Conversation ID', session.rowKey]
  ].filter(([, value]) => value).map(([label, value]) => `<tr><td style="padding:8px 12px 8px 0;color:#8e8e93 !important;-webkit-text-fill-color:#8e8e93;vertical-align:top;">${escapeHtml(label)}</td><td style="padding:8px 0;color:#ffffff !important;-webkit-text-fill-color:#ffffff;font-weight:700;">${escapeHtml(value)}</td></tr>`).join('');
  const transcript = formatTranscriptHtml(session, name);
  return {
    recipient: process.env.MAIL_TO,
    recipientName: 'Andrew DiCosmo',
    subject,
    text: `${title}\n\nConversation ID: ${session.rowKey}\nName: ${name}\nEmail: ${session.email || ''}\nCompany: ${company}\nRole: ${session.role || ''}\nIntent: ${intent}\nPreferred time: ${session.preferredTime || ''} ${session.timezone || ''}\n\nConversation\n${transcriptText(session)}`,
    html: emailShell(title, `<table role="presentation" width="100%" bgcolor="#000000" style="background-color:#000000 !important;border-top:3px solid #0a84ff;margin-bottom:20px;color:#ffffff !important;">${details}</table><div style="color:#ffffff !important;-webkit-text-fill-color:#ffffff;font-size:11px;letter-spacing:1.4px;text-transform:uppercase;font-weight:800;margin-bottom:12px;">Conversation transcript</div><div style="padding:18px 14px 4px;background-color:#000000 !important;border:1px solid #38383a;border-radius:12px;color:#ffffff !important;">${transcript}</div>`, 'dark'),
    replyTo: session.email || process.env.MAIL_REPLY_TO || process.env.MAIL_TO,
    replyToName: name,
    attachments: [logoAttachment()].filter(Boolean)
  };
}

async function resumeMessage(session, kind) {
  const paths = { cto: kind === 'executive', w2: kind !== 'executive', c2c: false };
  const selection = selectResume(paths, process.env);
  const attachments = [logoAttachment()].filter(Boolean);
  if (selection.url) {
    const response = await fetch(selection.url);
    if (response.ok) {
      attachments.push({
        content: Buffer.from(await response.arrayBuffer()).toString('base64'),
        filename: selection.filename,
        type: 'application/pdf',
        disposition: 'attachment'
      });
    }
  }
  const name = clean(session.name, 100) || 'there';
  const summary = kind === 'executive'
    ? 'I selected the Technology Executive resume based on your interest in technology leadership.'
    : 'I selected the Engineering & Delivery resume based on what you discussed.';
  return {
    recipient: session.email,
    recipientName: clean(session.name, 100),
    subject: kind === 'executive'
      ? 'Andrew DiCosmo | Technology Executive resume'
      : 'Andrew DiCosmo | Engineering & Delivery resume',
    text: `Hi ${name},\n\nThanks for speaking with my AI Assistant. ${summary}\n\nThe resume is attached for your review and to share if helpful. I will review the conversation and follow up personally when a response is needed.\n\nThanks,\nAndrew DiCosmo\nhttps://andrewdicosmo.com`,
    html: emailShell('Resume requested', `<p style="margin:0 0 15px;">Hi ${escapeHtml(name)},</p><p style="margin:0 0 15px;">Thanks for speaking with my AI Assistant. ${escapeHtml(summary)}</p><p style="margin:0 0 20px;">The resume is attached for your review and to share if helpful. I will review the conversation and follow up personally when a response is needed.</p><p style="margin:0;">Thanks,<br><strong>Andrew DiCosmo</strong><br><a href="https://andrewdicosmo.com" style="color:#1e6f8f;">AndrewDiCosmo.com</a></p>`),
    replyTo: process.env.MAIL_REPLY_TO || process.env.MAIL_TO,
    replyToName: 'Andrew DiCosmo',
    attachments
  };
}

async function deliverChatNotifications(session, result, context) {
  const sender = configuredSender();
  if (!sender) return { sent: [] };
  const messages = [];
  const hasContact = Boolean(session.email && session.name);
  const challengeComplete = Boolean(result.accuracyChallenge?.complete && hasContact);
  if (challengeComplete && !session.challengeNotified && process.env.MAIL_TO) {
    messages.push({ key: 'challenge', message: ownerMessage(session, 'accuracy') });
  } else if (session.qualified && hasContact && !session.ownerNotified && process.env.MAIL_TO) {
    messages.push({ key: 'owner', message: ownerMessage(session, 'lead') });
  }
  if (result.resumeRequested && hasContact && !session.resumeSent) {
    messages.push({ key: 'resume', message: await resumeMessage(session, result.resumeKind === 'executive' ? 'executive' : 'standard') });
  }
  if (!messages.length) return { sent: [] };

  const results = await deliverMessagesIndependently(sender.send, messages);
  const sent = [];
  for (const delivery of results) {
    if (delivery.status === 'accepted') {
      sent.push(delivery.key);
      if (delivery.key === 'challenge') session.challengeNotified = true;
      if (delivery.key === 'owner') session.ownerNotified = true;
      if (delivery.key === 'resume') session.resumeSent = true;
    } else {
      context.error(`chat ${delivery.key} email failed`, delivery.error);
    }
  }
  return { sent };
}

async function sendReport(message) {
  const sender = configuredSender();
  if (!sender || !process.env.MAIL_TO) return { accepted: false };
  const [result] = await deliverMessagesIndependently(sender.send, [{ key: 'report', message }]);
  return { accepted: result.status === 'accepted', error: result.error };
}

module.exports = { deliverChatNotifications, emailShell, formatTranscriptHtml, ownerMessage, sendReport, transcriptText };
