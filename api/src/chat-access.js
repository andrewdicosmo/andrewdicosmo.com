const EMAIL = /\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/;
const QUESTION_START = /^(?:what|when|where|which|who|why|how|can|could|would|should|do|does|is|are)\b/i;

function cleanName(value) {
  return String(value || '').trim().replace(/[.!?,;:]+$/, '').replace(/\s+/g, ' ').slice(0, 80);
}

function nameFromMessage(message, nameRequested = false) {
  const text = String(message || '').trim();
  const introduced = text.match(/^(?:my name is|call me)\s+([A-Za-z][A-Za-z .'-]{0,79})[.!]?$/i)
    || text.match(/^(?:i am|i'm)\s+([A-Z][A-Za-z .'-]{0,79})[.!]?$/);
  if (introduced) return cleanName(introduced[1]);
  if (!nameRequested || text.includes('?') || QUESTION_START.test(text)) return '';
  if (!/^[A-Za-z][A-Za-z .'-]{0,79}$/.test(text) || text.split(/\s+/).length > 4) return '';
  return cleanName(text);
}

function contactFromMessage(message, nameRequested = false) {
  const text = String(message || '');
  return {
    name: nameFromMessage(text, nameRequested),
    email: text.match(EMAIL)?.[0] || ''
  };
}

function accessGate(session, message) {
  const questions = Number(session.questionCount || 0);
  const contact = contactFromMessage(message, Boolean(session.nameRequested));
  if (!session.name && contact.name) session.name = contact.name;
  if (!session.email && contact.email) session.email = contact.email;

  if (questions >= 2 && !session.name) {
    session.nameRequested = true;
    return {
      blockedOn: 'name',
      reply: 'Before we continue, what should I call you? A first name is enough.'
    };
  }
  if (questions >= 6 && !session.email) {
    return {
      blockedOn: 'email',
      reply: 'You have reached the no-email preview limit. To continue, please share a valid email address Andrew can use if follow-up is useful.'
    };
  }
  return null;
}

module.exports = { accessGate, contactFromMessage, nameFromMessage };
