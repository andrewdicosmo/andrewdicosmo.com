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

test('accepts a W-2 inquiry with a valid job link instead of context', () => {
  const result = validateInquiry({
    ...common,
    paths: { w2: true },
    reqLink: 'https://example.com/jobs/senior-ai-engineer'
  });

  assert.equal(result.valid, true);
});

test('rejects an insecure job link', () => {
  const result = validateInquiry({
    ...common,
    paths: { w2: true },
    reqLink: 'http://example.com/jobs/senior-ai-engineer'
  });

  assert.equal(result.valid, false);
  assert.ok(result.missing.includes('Enter a valid job requirement URL.'));
});

test('rejects contact-only submissions even when complete is spoofed', () => {
  const result = validateInquiry({
    name: 'Taylor',
    email: 'taylor@example.com',
    complete: true,
    paths: { w2: true }
  });

  assert.equal(result.valid, false);
  assert.ok(result.missing.includes('Enter your company.'));
  assert.ok(result.missing.includes('Enter your role or title.'));
  assert.ok(result.missing.some((item) => item.includes('Supply a job requirement')));
});

test('requires a specific work area and context for C2C inquiries', () => {
  const result = validateInquiry({
    ...common,
    paths: { c2c: true },
    chips: ['Not sure yet'],
    brief: 'Too short'
  });

  assert.equal(result.valid, false);
  assert.ok(result.missing.includes('Select at least one specific work area.'));
  assert.ok(result.missing.includes('Describe the project in at least 40 characters.'));
});

test('accepts a complete C2C inquiry', () => {
  const result = validateInquiry({
    ...common,
    paths: { c2c: true },
    chips: ['AI / ML engineering'],
    brief: 'We need help moving an AI workflow from prototype into a supported production service.'
  });

  assert.equal(result.valid, true);
});

test('accepts a combined inquiry with a valid attachment', () => {
  const result = validateInquiry({
    ...common,
    paths: { w2: true, c2c: true },
    attachment: { name: 'job.pdf', data: 'cGRm' }
  });

  assert.equal(result.valid, true);
});
