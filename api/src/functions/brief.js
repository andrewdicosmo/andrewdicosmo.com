const { app } = require('@azure/functions');
const { TableClient } = require('@azure/data-tables');
const { BlobServiceClient } = require('@azure/storage-blob');

// POST /api/brief
// Stores the lead, uploads any job-req attachment, emails the ATS resume to the
// submitter via SendGrid, notifies the owner, and returns the scheduler URL for
// complete briefs. Every external dependency is env-driven; missing config
// degrades gracefully instead of failing the visitor.
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
    const sg = process.env.SENDGRID_API_KEY, from = process.env.MAIL_FROM, to = process.env.MAIL_TO;
    if (sg && from) {
      try {
        let attachments = [];
        if (process.env.RESUME_BLOB_URL) {
          const pdf = await fetch(process.env.RESUME_BLOB_URL);
          if (pdf.ok) attachments = [{
            content: Buffer.from(await pdf.arrayBuffer()).toString('base64'),
            filename: 'resume.pdf', type: 'application/pdf', disposition: 'attachment'
          }];
        }
        const send = (msg) => fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: { Authorization: `Bearer ${sg}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(msg)
        });
        await send({
          personalizations: [{ to: [{ email }] }], from: { email: from },
          subject: 'Resume attached, and thanks for the brief',
          content: [{ type: 'text/plain', value: `${name},\n\nThe ATS friendly resume is attached. I read every brief personally and will follow up within one business day.\n\nAndrew` }],
          attachments
        });
        if (to) await send({
          personalizations: [{ to: [{ email: to }] }], from: { email: from },
          subject: `BRIEF · ${name}${lead.company ? ' · ' + lead.company : ''}${lead.complete ? ' · COMPLETE' : ''}`,
          content: [{ type: 'text/plain', value: JSON.stringify(body, null, 2).slice(0, 20000) }]
        });
      } catch (e) { context.error('mail failed', e); }
    } else context.warn('SendGrid not configured; no mail sent');

    return { jsonBody: { ok: true, bookingsUrl: lead.complete ? (process.env.BOOKINGS_URL || '') : '' } };
  }
});
