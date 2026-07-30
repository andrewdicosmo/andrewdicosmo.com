const { app } = require('@azure/functions');
const { TableClient } = require('@azure/data-tables');
const { BlobServiceClient } = require('@azure/storage-blob');
const { EmailClient } = require('@azure/communication-email');
const fs = require('node:fs');
const path = require('node:path');

const clean = (value) => String(value || '').trim();
const compact = (items) => items.filter(Boolean);
const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

function safeHttpsUrl(value) {
  try {
    const url = new URL(clean(value));
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function getEmailLogoAttachment() {
  try {
    return {
      content: fs.readFileSync(path.join(__dirname, '../../assets/ad-monogram.png')).toString('base64'),
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

function formatPath(paths = {}) {
  const selected = compact([
    paths.w2 ? 'W-2 role' : '',
    paths.c2c ? 'C2C consulting' : ''
  ]);
  return selected.length ? selected.join(' + ') : '';
}

function formatFields(fields = [], paths = {}) {
  const defaultValues = new Set(['Prefer to discuss', 'Not sure yet', 'Just an idea']);
  return fields
    .map((field) => ({ label: clean(field.label), value: clean(field.value) }))
    .filter((field) => {
      if (!field.label || !field.value || defaultValues.has(field.value)) return false;
      const label = field.label.toLowerCase();
      if (!paths.w2 && label.includes('w-2')) return false;
      if (!paths.c2c && (label.includes('budget') || label === 'term' || label.includes('project stands'))) return false;
      return true;
    });
}

function formatOwnerInquiry(lead, body) {
  const paths = formatPath(body.paths || {});
  const fields = formatFields(body.fields || [], body.paths || {});
  const chips = Array.isArray(body.chips) ? body.chips.map(clean).filter(Boolean) : [];
  const inquiryNotes = clean(body.brief);
  const reqLink = clean(body.reqLink);
  const lines = [
    'New AndrewDiCosmo.com inquiry',
    '',
    `Status: ${lead.complete ? 'Complete' : 'Partial'}`,
    paths ? `Path: ${paths}` : null,
    `Lead ID: ${lead.rowKey}`,
    '',
    'Contact',
    `Name: ${lead.name}`,
    `Email: ${lead.email}`,
    clean(lead.company) ? `Company: ${clean(lead.company)}` : null,
    clean(lead.role) ? `Role: ${clean(lead.role)}` : null
  ];

  if (fields.length) {
    lines.push('', 'Preferences');
    fields.forEach((field) => lines.push(`${field.label}: ${field.value}`));
  }

  if (chips.length) {
    lines.push('', 'Work Areas');
    chips.forEach((chip) => lines.push(`- ${chip}`));
  }

  if (reqLink || lead.attachmentBlob) {
    lines.push('', 'Job Requirement');
    if (reqLink) lines.push(`Link: ${reqLink}`);
    if (lead.attachmentBlob) lines.push(`Attachment stored: ${lead.attachmentBlob}`);
  }

  if (inquiryNotes) lines.push('', 'Inquiry notes', inquiryNotes);

  return lines.filter((line) => line !== null && line !== undefined).join('\n').slice(0, 20000);
}

function getSubmitterReplyModel(lead, body, options = {}) {
  const paths = body.paths || {};
  const fields = formatFields(body.fields || [], paths);
  const chips = Array.isArray(body.chips) ? body.chips.map(clean).filter(Boolean) : [];
  const selectedPath = formatPath(paths);
  const company = clean(lead.company);
  const role = clean(lead.role);
  let opening;
  let pathMessage;

  if (company && role) {
    opening = `Thanks for reaching out regarding ${role} at ${company}. I attached my resume for easy forwarding.`;
  } else if (company) {
    opening = `Thanks for reaching out from ${company}. I attached my resume for easy forwarding.`;
  } else if (role) {
    opening = `Thanks for reaching out regarding ${role}. I attached my resume for easy forwarding.`;
  } else {
    opening = 'Thanks for reaching out. I attached my resume for easy forwarding.';
  }

  if (paths.w2 && paths.c2c) {
    pathMessage = 'I will review the role and scope, then follow up about the engagement path that best fits the work.';
  } else if (paths.w2) {
    pathMessage = 'I will review the role details and follow up about how my experience aligns with what you are building.';
  } else if (paths.c2c) {
    pathMessage = 'I will review the scope and follow up with an initial perspective on the work and next steps.';
  } else {
    pathMessage = 'I will review what you sent and follow up with the best next step.';
  }

  const summary = compact([
    selectedPath ? ['Engagement path', selectedPath] : null,
    clean(lead.company) ? ['Company', clean(lead.company)] : null,
    clean(lead.role) ? ['Role or title', clean(lead.role)] : null,
    ...fields.map((field) => [field.label, field.value]),
    chips.length ? ['Focus areas', chips.join(', ')] : null
  ]);

  return {
    name: lead.name,
    opening,
    pathMessage,
    summary,
    complete: !!lead.complete,
    bookingUrl: safeHttpsUrl(options.bookingUrl),
    replyEmail: clean(options.replyEmail),
    linkedinUrl: safeHttpsUrl(options.linkedinUrl)
  };
}

function formatSubmitterReplyText(lead, body, options = {}) {
  const reply = getSubmitterReplyModel(lead, body, options);
  const lines = [
    `Hi ${reply.name},`,
    '',
    reply.opening
  ];

  lines.push('', reply.pathMessage);

  if (reply.summary.length) {
    lines.push('', 'Your inquiry summary:');
    reply.summary.forEach(([label, value]) => lines.push(`- ${label}: ${value}`));
  }

  if (reply.complete) {
    lines.push('', 'Thanks for sharing these details. I will review everything and respond personally within one business day.');
  } else {
    lines.push('', 'I will review what came through. If anything important was left out, reply directly to this email with the missing context.');
  }

  if (reply.bookingUrl) {
    lines.push('', 'Schedule a conversation:', reply.bookingUrl);
  }

  lines.push('', 'Thanks,', 'Andrew DiCosmo', 'https://andrewdicosmo.com');
  if (reply.replyEmail) lines.push(reply.replyEmail);
  if (reply.linkedinUrl) lines.push(reply.linkedinUrl);
  return lines.join('\n').slice(0, 12000);
}

function formatSubmitterReplyHtml(lead, body, options = {}) {
  const reply = getSubmitterReplyModel(lead, body, options);
  const rows = reply.summary.map(([label, value]) => `
                    <tr>
                      <td class="summary-row" style="padding:11px 0;border-bottom:1px solid #e7edf2;">
                        <div class="muted" style="color:#66727c;font-size:12px;line-height:1.4;text-transform:uppercase;letter-spacing:0.6px;">${escapeHtml(label)}</div>
                        <div class="body-copy" style="margin-top:3px;color:#16222b;font-size:14px;line-height:1.5;font-weight:700;">${escapeHtml(value)}</div>
                      </td>
                    </tr>`).join('');
  const nextStep = reply.complete
    ? 'Thanks for sharing these details. I will review everything and respond personally within one business day.'
    : 'I will review what came through. If anything important was left out, reply directly to this email with the missing context.';
  const bookingButton = reply.bookingUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                  <tr>
                    <td style="background:#1e6f8f;border-radius:5px;">
                      <a href="${escapeHtml(reply.bookingUrl)}" style="display:inline-block;padding:13px 20px;color:#ffffff;text-decoration:none;font-size:14px;line-height:1.2;font-weight:700;">Schedule a conversation</a>
                    </td>
                  </tr>
                </table>`
    : '';
  const replyEmail = reply.replyEmail
    ? ` &nbsp;·&nbsp; <a href="mailto:${escapeHtml(reply.replyEmail)}" style="color:#456575;text-decoration:underline;">${escapeHtml(reply.replyEmail)}</a>`
    : '';
  const linkedinLink = reply.linkedinUrl
    ? ` &nbsp;·&nbsp; <a href="${escapeHtml(reply.linkedinUrl)}" style="color:#456575;text-decoration:underline;">LinkedIn</a>`
    : '';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <style>
      @media (prefers-color-scheme: dark) {
        .page-bg { background: #10171c !important; }
        .email-card { background: #182229 !important; border-color: #33434e !important; }
        .body-copy { color: #f2f6f8 !important; }
        .muted { color: #b2c0c9 !important; }
        .summary-row { border-color: #33434e !important; }
        .callout { background: #21343e !important; }
        .footer-copy, .footer-copy a { color: #b2c0c9 !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#f4f7f9;font-family:Arial,Helvetica,sans-serif;color:#16222b;">
    <div style="display:none;max-height:0;overflow:hidden;color:transparent;">Andrew DiCosmo's resume is attached. I will review your inquiry and follow up personally.</div>
    <table class="page-bg" role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7f9;margin:0;padding:28px 12px;">
      <tr>
        <td align="center">
          <table class="email-card" role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border:1px solid #dfe7ee;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="background:#16222b;padding:20px 26px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td width="68" style="width:68px;padding:0 14px 0 0;vertical-align:middle;">
                      <img src="cid:ad-monogram" width="54" height="36" alt="AD" style="display:block;width:54px;height:36px;border:0;">
                    </td>
                    <td style="vertical-align:middle;">
                      <div style="font-size:12px;line-height:1.4;letter-spacing:2px;text-transform:uppercase;color:#9fb7c9;font-weight:700;">AndrewDiCosmo.com</div>
                      <div style="font-size:24px;line-height:1.25;color:#ffffff;font-weight:800;margin-top:6px;">Thanks for reaching out</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:26px;">
                <p class="body-copy" style="margin:0 0 16px;color:#16222b;font-size:15px;line-height:1.7;">Hi ${escapeHtml(reply.name)},</p>
                <p class="body-copy" style="margin:0 0 16px;color:#16222b;font-size:15px;line-height:1.7;">${escapeHtml(reply.opening)}</p>
                <p class="muted" style="margin:0 0 22px;color:#364653;font-size:14px;line-height:1.7;">${escapeHtml(reply.pathMessage)}</p>

                ${rows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:3px solid #1e6f8f;margin:18px 0 22px;">
                  <tr>
                    <td class="body-copy" style="padding:14px 0 4px;color:#16222b;font-size:12px;line-height:1.4;letter-spacing:1.5px;text-transform:uppercase;font-weight:800;">Your inquiry summary</td>
                  </tr>
                  ${rows}
                </table>` : ''}

                <div class="callout" style="background:#eef6fa;border-left:4px solid #1e6f8f;padding:14px 16px;margin:0 0 22px;">
                  <p class="body-copy" style="margin:0;color:#243540;font-size:14px;line-height:1.7;">${escapeHtml(nextStep)}</p>
                </div>

                ${bookingButton}

                <p class="body-copy" style="margin:0 0 20px;color:#16222b;font-size:15px;line-height:1.7;">Thanks,<br><strong>Andrew DiCosmo</strong></p>
                <p class="footer-copy" style="margin:0;padding-top:16px;border-top:1px solid #e7edf2;color:#66727c;font-size:12px;line-height:1.7;">
                  <a href="https://andrewdicosmo.com" style="color:#456575;text-decoration:underline;">AndrewDiCosmo.com</a>${replyEmail}${linkedinLink}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`.slice(0, 20000);
}

// POST /api/brief
// Stores the lead, uploads any job-req attachment, emails the resume to the
// submitter, notifies the owner, and returns the scheduler URL for complete
// inquiries. Email prefers Azure Communication Services, matching InstaMapp's
// production pattern, with SendGrid retained as a fallback. Every external
// dependency is env-driven; missing config degrades gracefully instead of
// failing the visitor.
app.http('brief', {
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    let body;
    try { body = await request.json(); } catch { return { status: 400, jsonBody: { ok: false, error: 'invalid json' } }; }

    const email = String(body.email || '').trim();
    const name = String(body.name || '').trim();
    if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return { status: 400, jsonBody: { ok: false, error: 'name and valid email required' } };
    }

    const conn = process.env.STORAGE_CONNECTION_STRING;
    const lead = {
      partitionKey: 'lead',
      rowKey: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name, email,
      company: String(body.company || ''), role: String(body.role || ''),
      paths: JSON.stringify(body.paths || {}),
      fields: JSON.stringify(body.fields || []),
      chips: JSON.stringify(body.chips || []),
      reqLink: String(body.reqLink || ''),
      brief: String(body.brief || '').slice(0, 8000),
      complete: !!body.complete,
      ua: request.headers.get('user-agent') || ''
    };

    // 1) store the lead
    if (conn) {
      try {
        const table = TableClient.fromConnectionString(conn, process.env.LEADS_TABLE || 'leads');
        await table.createTable().catch(() => {});
        // 2) attachment to blob, reference on the lead
        if (body.attachment && body.attachment.data && body.attachment.data.length < 7_500_000) {
          const svc = BlobServiceClient.fromConnectionString(conn);
          const container = svc.getContainerClient(process.env.ATTACH_CONTAINER || 'briefs');
          await container.createIfNotExists();
          const safe = String(body.attachment.name || 'req').replace(/[^\w.\-]/g, '_').slice(0, 120);
          const blobName = `${lead.rowKey}-${safe}`;
          await container.getBlockBlobClient(blobName).uploadData(Buffer.from(body.attachment.data, 'base64'));
          lead.attachmentBlob = blobName;
        }
        await table.createEntity(lead);
      } catch (e) { context.error('storage failed', e); }
    } else context.warn('STORAGE_CONNECTION_STRING not set; lead not persisted');

    // 3) email the resume to the submitter + notify the owner
    const acs = process.env.AZURE_COMMUNICATION_CONNECTION_STRING;
    const sg = process.env.SENDGRID_API_KEY;
    const from = process.env.EMAIL_SENDER_ADDRESS || process.env.MAIL_FROM;
    const to = process.env.MAIL_TO;
    const replyTo = process.env.MAIL_REPLY_TO || to || from;
    const senderName = process.env.MAIL_FROM_NAME || 'Andrew DiCosmo';
    const submitterReplyOptions = {
      bookingUrl: lead.complete ? process.env.BOOKINGS_URL : '',
      replyEmail: replyTo,
      linkedinUrl: process.env.LINKEDIN_URL
    };
    if ((acs || sg) && from) {
      try {
        let resumeAttachment = null;
        const emailLogoAttachment = getEmailLogoAttachment();
        if (process.env.RESUME_BLOB_URL) {
          const pdf = await fetch(process.env.RESUME_BLOB_URL);
          if (pdf.ok) resumeAttachment = {
            content: Buffer.from(await pdf.arrayBuffer()).toString('base64'),
            filename: 'Andrew_DiCosmo_Resume.pdf', type: 'application/pdf', disposition: 'attachment'
          };
        }
        const submitterMessage = {
          recipient: email,
          recipientName: name,
          subject: 'Andrew DiCosmo | Resume and next steps',
          text: formatSubmitterReplyText(lead, body, submitterReplyOptions),
          html: formatSubmitterReplyHtml(lead, body, submitterReplyOptions),
          replyTo,
          replyToName: senderName,
          attachments: compact([emailLogoAttachment, resumeAttachment])
        };
        const ownerMessage = to ? {
          recipient: to,
          subject: `INQUIRY · ${name}${lead.company ? ' · ' + lead.company : ''}${lead.complete ? ' · COMPLETE' : ''}`,
          text: formatOwnerInquiry(lead, body),
          replyTo: email,
          replyToName: name,
          attachments: []
        } : null;

        if (acs) {
          const client = new EmailClient(acs);
          const sendAcs = async (msg) => {
            const poller = await client.beginSend({
              senderAddress: from,
              content: msg.html
                ? { subject: msg.subject, plainText: msg.text, html: msg.html }
                : { subject: msg.subject, plainText: msg.text },
              recipients: { to: [{ address: msg.recipient, displayName: msg.recipientName }] },
              replyTo: msg.replyTo ? [{ address: msg.replyTo, displayName: msg.replyToName }] : undefined,
              attachments: msg.attachments.map((a) => ({
                name: a.filename,
                contentType: a.type,
                contentInBase64: a.content,
                contentId: a.contentId
              }))
            });
            await poller.pollUntilDone();
          };
          await sendAcs(submitterMessage);
          if (ownerMessage) await sendAcs(ownerMessage);
        } else {
          const sendGrid = (msg) => fetch('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: { Authorization: `Bearer ${sg}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              personalizations: [{ to: [{ email: msg.recipient, name: msg.recipientName }] }],
              from: { email: from, name: senderName },
              reply_to: msg.replyTo ? { email: msg.replyTo, name: msg.replyToName } : undefined,
              subject: msg.subject,
              content: compact([
                { type: 'text/plain', value: msg.text },
                msg.html ? { type: 'text/html', value: msg.html } : null
              ]),
              attachments: msg.attachments.map((a) => ({
                content: a.content,
                filename: a.filename,
                type: a.type,
                disposition: a.disposition,
                content_id: a.content_id
              }))
            })
          });
          await sendGrid(submitterMessage);
          if (ownerMessage) await sendGrid(ownerMessage);
        }
      } catch (e) { context.error('mail failed', e); }
    } else context.warn('Mail not configured; no mail sent');

    return { jsonBody: { ok: true, bookingsUrl: lead.complete ? (process.env.BOOKINGS_URL || '') : '' } };
  }
});
