const path = require('node:path');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const { BlobServiceClient } = require('@azure/storage-blob');

const MAX_RAW_BYTES = 5 * 1024 * 1024;
const MAX_TEXT_CHARS = 12000;
const EMAIL = /\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/;

const clean = (value, max = 1200) => String(value || '')
  .trim()
  .replace(/\u0000/g, '')
  .replace(/\s+/g, ' ')
  .slice(0, max);

function attachmentExt(name = '') {
  return path.extname(String(name || '')).toLowerCase();
}

function attachmentKind(name = '') {
  const ext = attachmentExt(name);
  if (ext === '.txt' || ext === '.md') return 'text';
  if (ext === '.pdf') return 'pdf';
  if (ext === '.docx') return 'docx';
  if (ext === '.doc') return 'doc';
  return '';
}

function decodeAttachment(attachment = {}) {
  const name = clean(attachment.name, 160) || 'job-requirement';
  const kind = attachmentKind(name);
  if (!kind) return { ok: false, error: 'unsupported_type', message: 'Upload a .txt, .pdf, .docx, or .doc job requirement.' };
  const data = String(attachment.data || '');
  if (!data) return { ok: false, error: 'missing_data', message: 'Attach the job requirement again and try once more.' };
  let buffer;
  try {
    buffer = Buffer.from(data, 'base64');
  } catch {
    return { ok: false, error: 'invalid_data', message: 'The attachment could not be read. Attach the job requirement again and try once more.' };
  }
  if (!buffer.length || buffer.length > MAX_RAW_BYTES) {
    return { ok: false, error: 'too_large', message: 'Keep the job requirement attachment under 5 MB.' };
  }
  return { ok: true, name, kind, buffer };
}

function applyMinimumContact(session, message) {
  const text = String(message || '');
  if (!session.email) session.email = text.match(EMAIL)?.[0] || '';
  if (!session.name) {
    const name = text.match(/\b(?:my name is|i am|i'm|name[:\s]+)\s*([A-Za-z][A-Za-z .'-]{0,79}?)(?=\.|,|;|\n|$|\s+(?:email|company|organization|org|role|title)\b)/i)?.[1];
    if (name) session.name = clean(name, 80).replace(/[.!?,;:]+$/, '');
  }
  if (!session.company) {
    const company = text.match(/\b(?:company|organization|org)[:\s]+([A-Za-z0-9&.,' -]{2,120}?)(?=\.|;|\n|$|\s+(?:email|role|title|preferred|name)\b)/i)?.[1]
      || text.match(/\bat\s+([A-Z][A-Za-z0-9&.,' -]{2,120}?)(?=\.|;|\n|$|\s+(?:email|role|title|preferred|name)\b)/)?.[1];
    if (company) session.company = clean(company, 120).replace(/[.!?;:]+$/, '');
  }
  if (!session.role) {
    const role = text.match(/\b(?:role|title)[:\s]+([A-Za-z0-9&.,' /-]{2,120}?)(?=\.|;|\n|$|\s+(?:email|company|organization|org|preferred|name)\b)/i)?.[1];
    if (role) session.role = clean(role, 120).replace(/[.!?;:]+$/, '');
  }
}

function missingMinimumContact(session) {
  return [
    ['name', session.name],
    ['email', session.email],
    ['company', session.company],
    ['role', session.role]
  ].filter(([, value]) => !clean(value)).map(([field]) => field);
}

function minimumContactGate(session, message) {
  applyMinimumContact(session, message);
  const missing = missingMinimumContact(session);
  if (!missing.length) return null;
  return {
    blockedOn: 'job_req_contact',
    missing,
    reply: `I can compare the job requirement, but first I need a little context so Andrew knows who requested it. Please send your ${missing.join(', ')} in one message.`
  };
}

async function extractAttachmentText(decoded) {
  if (decoded.kind === 'text') return clean(decoded.buffer.toString('utf8'), MAX_TEXT_CHARS);
  if (decoded.kind === 'pdf') {
    const parsed = await pdfParse(decoded.buffer);
    return clean(parsed.text, MAX_TEXT_CHARS);
  }
  if (decoded.kind === 'docx') {
    const parsed = await mammoth.extractRawText({ buffer: decoded.buffer });
    return clean(parsed.value, MAX_TEXT_CHARS);
  }
  return '';
}

async function storeAttachment(session, decoded) {
  const connection = process.env.STORAGE_CONNECTION_STRING;
  if (!connection) return '';
  const service = BlobServiceClient.fromConnectionString(connection);
  const container = service.getContainerClient(process.env.ATTACH_CONTAINER || 'briefs');
  await container.createIfNotExists();
  const safe = decoded.name.replace(/[^\w.\-]/g, '_').slice(0, 120);
  const blobName = `${session.rowKey}-chat-jobreq-${Date.now()}-${safe}`;
  await container.getBlockBlobClient(blobName).uploadData(decoded.buffer);
  return blobName;
}

module.exports = {
  MAX_RAW_BYTES,
  applyMinimumContact,
  decodeAttachment,
  extractAttachmentText,
  minimumContactGate,
  missingMinimumContact,
  storeAttachment
};
