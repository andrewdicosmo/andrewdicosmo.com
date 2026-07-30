const MIN_CONTEXT_LENGTH = 40;
const MAX_ATTACHMENT_DATA_LENGTH = 7_500_000;

const clean = (value) => String(value || '').trim();

function validEmail(value) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
}

function validJobUrl(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

function validateInquiry(body = {}) {
  const paths = {
    w2: body.paths?.w2 === true,
    c2c: body.paths?.c2c === true
  };
  const name = clean(body.name);
  const email = clean(body.email);
  const company = clean(body.company);
  const role = clean(body.role);
  const brief = clean(body.brief).slice(0, 8000);
  const reqLinkInput = clean(body.reqLink);
  const reqLink = validJobUrl(reqLinkInput) ? reqLinkInput : '';
  const chips = Array.isArray(body.chips) ? body.chips.map(clean).filter(Boolean) : [];
  const specificChips = chips.filter((chip) => chip.toLowerCase() !== 'not sure yet');
  const attachmentData = clean(body.attachment?.data);
  const hasAttachment = !!attachmentData && attachmentData.length < MAX_ATTACHMENT_DATA_LENGTH;
  const hasRequirement = !!reqLink || hasAttachment;
  const hasContext = brief.length >= MIN_CONTEXT_LENGTH;
  const missing = [];

  if (!paths.w2 && !paths.c2c) missing.push('Select Hiring, Consulting, or both.');
  if (!name) missing.push('Enter your name.');
  if (!validEmail(email)) missing.push('Enter a valid email address.');
  if (!company) missing.push('Enter your company.');
  if (!role) missing.push('Enter your role or title.');
  if (reqLinkInput && !reqLink) missing.push('Enter a valid job requirement URL.');
  if (attachmentData.length >= MAX_ATTACHMENT_DATA_LENGTH) {
    missing.push('Keep the job requirement attachment under 5 MB.');
  }

  if (paths.w2 && !paths.c2c && !hasRequirement && !hasContext) {
    missing.push('Supply a job requirement or at least 40 characters describing the hiring need.');
  } else if (paths.c2c && !paths.w2) {
    if (!specificChips.length) missing.push('Select at least one specific work area.');
    if (!hasContext) missing.push('Describe the project in at least 40 characters.');
  } else if (paths.w2 && paths.c2c && !hasRequirement && !hasContext) {
    missing.push('Supply a job requirement or at least 40 characters describing the opportunity.');
  }

  return {
    valid: missing.length === 0,
    missing,
    normalized: {
      name,
      email,
      company,
      role,
      paths,
      brief,
      reqLink,
      chips
    }
  };
}

module.exports = {
  MIN_CONTEXT_LENGTH,
  validateInquiry
};
