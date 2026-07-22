const { app } = require('@azure/functions');
const { TableClient } = require('@azure/data-tables');
const { BlobServiceClient } = require('@azure/storage-blob');
const { EmailClient } = require('@azure/communication-email');

// POST /api/brief
// Stores the lead, uploads any job-req attachment, emails the ATS resume to the
// submitter, notifies the owner, and returns the scheduler URL for complete
// briefs. Email prefers Azure Communication Services, matching InstaMapp's
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
            filename: 'resume.pdf', type: 'application/pdf', disposition: 'attachment'
          };
        }
        const submitterMessage = {
          recipient: email,
          subject: 'Resume attached, and thanks for the brief',
          text: `${name},\n\nThe ATS friendly resume is attached. I read every brief personally and will follow up within one business day.\n\nAndrew`,
          attachments: resumeAttachment ? [resumeAttachment] : []
        };
        const ownerMessage = to ? {
          recipient: to,
          subject: `BRIEF · ${name}${lead.company ? ' · ' + lead.company : ''}${lead.complete ? ' · COMPLETE' : ''}`,
          text: JSON.stringify(body, null, 2).slice(0, 20000),
          attachments: []
        } : null;

        if (acs) {
          const client = new EmailClient(acs);
          const sendAcs = async (msg) => {
            const poller = await client.beginSend({
              senderAddress: from,
              content: { subject: msg.subject, plainText: msg.text },
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
              content: [{ type: 'text/plain', value: msg.text }],
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
