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
  paths: { w2: true, leadership: true, c2c: true, cto: true },
  fields: [
    { label: 'W-2 compensation range', value: '$300,000 or more · Executive' },
    { label: 'Project budget', value: '$100,000 or more' },
    { label: 'Preferred management arrangement', value: 'Full time' },
    { label: 'Preferred executive arrangement', value: 'Fractional CTO' }
  ],
  chips: ['Technology strategy and roadmap'],
  brief: 'We need technology leadership across strategy, delivery, and governance.'
};

test('renders owner email for all engagement paths with preference fields', () => {
  const html = formatOwnerInquiryHtml(lead, body);
  assert.match(html, /W-2 compensation range/);
  assert.match(html, /Project budget/);
  assert.match(html, /Preferred management arrangement/);
  assert.match(html, /Preferred executive arrangement/);
});

test('renders leadership resume language for manager and director inquiries', () => {
  const html = formatSubmitterReplyHtml(lead, {
    ...body,
    paths: { w2: false, leadership: true, c2c: false, cto: false }
  }, { resumeLabel: 'Architecture & Leadership Resume' });
  assert.match(html, /Architecture &amp; Leadership resume/);
  assert.match(html, /management, architecture, and delivery experience/);
});

test('renders submitter email for all engagement paths with preference fields', () => {
  const html = formatSubmitterReplyHtml(lead, body, { resumeLabel: 'Technology Executive Resume' });
  assert.match(html, /Technology Executive resume/);
  assert.match(html, /Technology strategy and roadmap/);
});
