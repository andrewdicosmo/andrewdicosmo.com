const test = require('node:test');
const assert = require('node:assert/strict');
const { formatOwnerInquiryHtml, formatSubmitterReplyHtml } = require('../src/functions/brief');

const lead = {
  rowKey: 'test-lead',
  name: 'All Paths Test',
  email: 'test@example.com',
  company: 'Example Company',
  role: 'Technology Executive'
};

const body = {
  paths: { w2: true, c2c: true, cto: true },
  fields: [
    { label: 'W-2 compensation range', value: '$300,000 or more · Executive' },
    { label: 'Project budget', value: '$100,000 or more' },
    { label: 'Leadership arrangement', value: 'Fractional CTO' }
  ],
  chips: ['Technology strategy and roadmap'],
  brief: 'We need technology leadership across strategy, delivery, and governance.'
};

test('renders owner email for all engagement paths with preference fields', () => {
  const html = formatOwnerInquiryHtml(lead, body);
  assert.match(html, /W-2 compensation range/);
  assert.match(html, /Project budget/);
  assert.match(html, /Leadership arrangement/);
});

test('renders submitter email for all engagement paths with preference fields', () => {
  const html = formatSubmitterReplyHtml(lead, body, { resumeLabel: 'Technology Executive Resume' });
  assert.match(html, /Technology Executive resume/);
  assert.match(html, /Technology strategy and roadmap/);
});
