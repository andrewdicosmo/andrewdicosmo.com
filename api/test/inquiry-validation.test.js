const test = require('node:test');
const assert = require('node:assert/strict');
const { validateInquiry } = require('../src/inquiry-validation');

const common = {
  name: 'Taylor Recruiter',
  email: 'taylor@example.com',
  company: 'Example Co',
  role: 'Technical Recruiter',
  fields: [],
  chips: []
};

test('accepts a W-2 inquiry with substantive context', () => {
  const result = validateInquiry({
    ...common,
    paths: { w2: true },
    brief: 'We are hiring a senior AI engineer to lead production computer vision delivery.'
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.missing, []);
});

test('still requires W-2 context when an optional job link is supplied', () => {
  const result = validateInquiry({
    ...common,
    paths: { w2: true },
    reqLink: 'https://example.com/jobs/senior-ai-engineer'
  });

  assert.equal(result.valid, false);
  assert.ok(result.missing.includes('Please describe the role in at least 40 characters.'));
});

test('rejects an insecure job link', () => {
  const result = validateInquiry({
    ...common,
    paths: { w2: true },
    reqLink: 'http://example.com/jobs/senior-ai-engineer'
  });

  assert.equal(result.valid, false);
  assert.ok(result.missing.includes('Enter a valid link to the job posting.'));
});

test('rejects contact-only submissions even when complete is spoofed', () => {
  const result = validateInquiry({
    name: 'Taylor',
    email: 'taylor@example.com',
    complete: true,
    paths: { w2: true }
  });

  assert.equal(result.valid, false);
  assert.ok(result.missing.includes('Enter your company or organization.'));
  assert.ok(result.missing.includes('Enter your title or role.'));
  assert.ok(result.missing.includes('Please describe the role in at least 40 characters.'));
});

test('requires a specific work area and context for C2C inquiries', () => {
  const result = validateInquiry({
    ...common,
    paths: { c2c: true },
    chips: ['Not sure yet'],
    brief: 'Too short'
  });

  assert.equal(result.valid, false);
  assert.ok(result.missing.includes('Select at least one type of help you need.'));
  assert.ok(result.missing.includes('Please describe the project in at least 40 characters.'));
});

test('accepts a complete C2C inquiry', () => {
  const result = validateInquiry({
    ...common,
    paths: { c2c: true },
    chips: ['AI and machine learning'],
    brief: 'We need help moving an AI workflow from prototype into a supported production service.'
  });

  assert.equal(result.valid, true);
});

test('still requires context when an optional attachment is supplied', () => {
  const result = validateInquiry({
    ...common,
    paths: { w2: true, c2c: true },
    attachment: { name: 'job.pdf', data: 'cGRm' }
  });

  assert.equal(result.valid, false);
  assert.ok(result.missing.includes('Please describe the opportunity in at least 40 characters.'));
});

test('accepts a combined inquiry with context and an optional attachment', () => {
  const result = validateInquiry({
    ...common,
    paths: { w2: true, c2c: true },
    brief: 'We are considering both a direct hire and consulting support for a production AI initiative.',
    attachment: { name: 'job.pdf', data: 'cGRm' }
  });

  assert.equal(result.valid, true);
});

test('requires context for a technology leadership inquiry', () => {
  const result = validateInquiry({
    ...common,
    paths: { cto: true },
    brief: 'Too short'
  });

  assert.equal(result.valid, false);
  assert.ok(result.missing.includes('Please describe the leadership need in at least 40 characters.'));
});

test('accepts a complete technology leadership inquiry', () => {
  const result = validateInquiry({
    ...common,
    paths: { cto: true },
    brief: 'We need an interim technology leader to establish the roadmap and strengthen engineering delivery.'
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.normalized.paths, { w2: false, c2c: false, cto: true });
});
