const test = require('node:test');
const assert = require('node:assert/strict');
const { selectResume } = require('../src/resume-selection');

test('selects the executive resume for technology leadership inquiries', () => {
  const resume = selectResume(
    { cto: true },
    {
      RESUME_BLOB_URL: 'https://example.com/general.pdf',
      RESUME_EXECUTIVE_BLOB_URL: 'https://example.com/executive.pdf'
    }
  );

  assert.equal(resume.kind, 'executive');
  assert.equal(resume.label, 'Technology Executive Resume');
  assert.equal(resume.url, 'https://example.com/executive.pdf');
});

test('selects the standard resume for engineering and consulting inquiries', () => {
  const resume = selectResume(
    { w2: true, c2c: true },
    {
      RESUME_BLOB_URL: 'https://example.com/general.pdf',
      RESUME_EXECUTIVE_BLOB_URL: 'https://example.com/executive.pdf'
    }
  );

  assert.equal(resume.kind, 'standard');
  assert.equal(resume.url, 'https://example.com/general.pdf');
});

test('selects the leadership resume for manager and director inquiries', () => {
  const resume = selectResume(
    { leadership: true },
    {
      RESUME_BLOB_URL: 'https://example.com/engineering.pdf',
      RESUME_LEADERSHIP_BLOB_URL: 'https://example.com/leadership.pdf',
      RESUME_EXECUTIVE_BLOB_URL: 'https://example.com/executive.pdf'
    }
  );

  assert.equal(resume.kind, 'leadership');
  assert.equal(resume.label, 'Architecture & Leadership Resume');
  assert.equal(resume.url, 'https://example.com/leadership.pdf');
});

test('gives the executive resume priority when multiple paths are selected', () => {
  const resume = selectResume(
    { leadership: true, cto: true },
    {
      RESUME_BLOB_URL: 'https://example.com/engineering.pdf',
      RESUME_LEADERSHIP_BLOB_URL: 'https://example.com/leadership.pdf',
      RESUME_EXECUTIVE_BLOB_URL: 'https://example.com/executive.pdf'
    }
  );

  assert.equal(resume.kind, 'executive');
});

test('falls back to the standard resume when the executive resume is unavailable', () => {
  const resume = selectResume(
    { cto: true },
    { RESUME_BLOB_URL: 'https://example.com/general.pdf' }
  );

  assert.equal(resume.kind, 'standard');
  assert.equal(resume.url, 'https://example.com/general.pdf');
});

test('falls back to the leadership resume when the executive file is unavailable', () => {
  const resume = selectResume(
    { cto: true },
    {
      RESUME_BLOB_URL: 'https://example.com/engineering.pdf',
      RESUME_LEADERSHIP_BLOB_URL: 'https://example.com/leadership.pdf'
    }
  );

  assert.equal(resume.kind, 'leadership');
  assert.equal(resume.url, 'https://example.com/leadership.pdf');
});
