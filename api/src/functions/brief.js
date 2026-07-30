const { app } = require('@azure/functions');
const { TableClient } = require('@azure/data-tables');
const { BlobServiceClient } = require('@azure/storage-blob');
const { EmailClient } = require('@azure/communication-email');

const clean = (value) => String(value || '').trim();
const compact = (items) => items.filter(Boolean);
const escapeHtml = (value) => clean(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

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

function getSubmitterReplyModel(lead, body) {
  const paths = body.paths || {};
  const fields = formatFields(body.fields || [], paths);
  const chips = Array.isArray(body.chips) ? body.chips.map(clean).filter(Boolean) : [];
  const hasNotes = !!clean(body.brief);
  const selectedPath = formatPath(paths);
  const companyLine = clean(lead.company) ? ` from ${clean(lead.company)}` : '';
  let pathMessage;

  if (paths.w2 && paths.c2c) {
    pathMessage = 'I saw that you selected both W-2 hiring and C2C consulting. I can discuss either path and will look at the role, scope, timeline, and team needs before recommending the cleanest fit.';
  } else if (paths.w2) {
    pathMessage = 'I saw that this is for a W-2 role. I will review the role details and follow up with how my AI engineering, computer vision, cloud, and security background maps to what you are hiring for.';
  } else if (paths.c2c) {
    pathMessage = 'I saw that this is for C2C consulting. I will review the scope and follow up with how I would approach the work, timeline, and next steps.';
  } else {
    pathMessage = 'I will review what you sent and follow up with the best next step.';
  }

  const summary = compact([
    selectedPath ? ['Engagement path', selectedPath] : null,
    clean(lead.company) ? ['Company', clean(lead.company)] : null,
    clean(lead.role) ? ['Role or title', clean(lead.role)] : null,
    ...fields.map((field) => [field.label, field.value]),
    chips.length ? ['Focus areas', chips.join(', ')] : null,
    hasNotes ? ['Additional context', 'Received'] : null
  ]);

  return {
    name: lead.name,
    companyLine,
    pathMessage,
    summary,
    complete: !!lead.complete
  };
}

function formatSubmitterReplyText(lead, body) {
  const reply = getSubmitterReplyModel(lead, body);
  const lines = [
    `Hi ${reply.name},`,
    '',
    `Thanks for reaching out${reply.companyLine}. I attached my resume for easy forwarding.`
  ];

  lines.push('', reply.pathMessage);

  if (reply.summary.length) {
    lines.push('', 'I received:');
    reply.summary.forEach(([label, value]) => lines.push(`- ${label}: ${value}`));
  }

  if (reply.complete) {
    lines.push('', 'This looks complete enough for me to respond without another intake round. I will follow up within one business day.');
  } else {
    lines.push('', 'If anything important was left out, you can reply directly to this email with the missing context. I will still review what came through.');
  }

  lines.push('', 'Thanks,', 'Andrew DiCosmo');
  return lines.join('\n').slice(0, 12000);
}

function formatSubmitterReplyHtml(lead, body) {
  const reply = getSubmitterReplyModel(lead, body);
  const rows = reply.summary.map(([label, value]) => `
                    <tr>
                      <td style="padding:10px 0;color:#66727c;font-size:13px;line-height:1.4;width:38%;border-bottom:1px solid #e7edf2;">${escapeHtml(label)}</td>
                      <td style="padding:10px 0;color:#16222b;font-size:13px;line-height:1.4;font-weight:700;border-bottom:1px solid #e7edf2;">${escapeHtml(value)}</td>
                    </tr>`).join('');
  const nextStep = reply.complete
    ? 'This looks complete enough for me to respond without another intake round. I will follow up within one business day.'
    : 'If anything important was left out, you can reply directly to this email with the missing context. I will still review what came through.';

  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f4f7f9;font-family:Arial,Helvetica,sans-serif;color:#16222b;">
    <div style="display:none;max-height:0;overflow:hidden;color:transparent;">Resume attached. I received your inquiry and will follow up within one business day.</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7f9;margin:0;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border:1px solid #dfe7ee;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background:#16222b;padding:20px 26px;">
                <div style="font-size:12px;line-height:1.4;letter-spacing:2px;text-transform:uppercase;color:#9fb7c9;font-weight:700;">AndrewDiCosmo.com</div>
                <div style="font-size:24px;line-height:1.25;color:#ffffff;font-weight:800;margin-top:8px;">Thanks for reaching out</div>
              </td>
            </tr>
            <tr>
              <td style="padding:26px;">
                <p style="margin:0 0 16px;color:#16222b;font-size:15px;line-height:1.7;">Hi ${escapeHtml(reply.name)},</p>
                <p style="margin:0 0 16px;color:#16222b;font-size:15px;line-height:1.7;">Thanks for reaching out${escapeHtml(reply.companyLine)}. I attached my resume for easy forwarding.</p>
                <p style="margin:0 0 22px;color:#364653;font-size:14px;line-height:1.7;">${escapeHtml(reply.pathMessage)}</p>

                ${rows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:3px solid #1e6f8f;margin:18px 0 22px;">
                  <tr>
                    <td colspan="2" style="padding:14px 0 4px;color:#16222b;font-size:12px;line-height:1.4;letter-spacing:1.5px;text-transform:uppercase;font-weight:800;">I received</td>
                  </tr>
                  ${rows}
                </table>` : ''}

                <div style="background:#eef6fa;border-left:4px solid #1e6f8f;padding:14px 16px;margin:0 0 22px;">
                  <p style="margin:0;color:#243540;font-size:14px;line-height:1.7;">${escapeHtml(nextStep)}</p>
                </div>

                <p style="margin:0;color:#16222b;font-size:15px;line-height:1.7;">Thanks,<br><strong>Andrew DiCosmo</strong></p>
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
    if ((acs || sg) && from) {
      try {
        let resumeAttachment = null;
        if (process.env.RESUME_BLOB_URL) {
          const pdf = await fetch(process.env.RESUME_BLOB_URL);
          if (pdf.ok) resumeAttachment = {
            content: Buffer.from(await pdf.arrayBuffer()).toString('base64'),
            filename: 'Andrew_DiCosmo_Resume.pdf', type: 'application/pdf', disposition: 'attachment'
          };
        }
        const submitterMessage = {
          recipient: email,
          subject: 'Resume attached, and thanks for reaching out',
          text: formatSubmitterReplyText(lead, body),
          html: formatSubmitterReplyHtml(lead, body),
          attachments: resumeAttachment ? [resumeAttachment] : []
        };
        const ownerMessage = to ? {
          recipient: to,
          subject: `INQUIRY · ${name}${lead.company ? ' · ' + lead.company : ''}${lead.complete ? ' · COMPLETE' : ''}`,
          text: formatOwnerInquiry(lead, body),
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
              recipients: { to: [{ address: msg.recipient }] },
              attachments: msg.attachments.map((a) => ({
                name: a.filename,
                contentType: a.type,
                contentInBase64: a.content
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
              personalizations: [{ to: [{ email: msg.recipient }] }],
              from: { email: from },
              subject: msg.subject,
              content: compact([
                { type: 'text/plain', value: msg.text },
                msg.html ? { type: 'text/html', value: msg.html } : null
              ]),
              attachments: msg.attachments
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
