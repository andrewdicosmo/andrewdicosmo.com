const STANDARD_RESUME = {
  kind: 'standard',
  label: 'Engineering & Delivery Resume',
  filename: 'Andrew_DiCosmo_Resume.pdf'
};

const EXECUTIVE_RESUME = {
  kind: 'executive',
  label: 'Technology Executive Resume',
  filename: 'Andrew_DiCosmo_Technology_Executive_Resume.pdf'
};

function selectResume(paths = {}, env = process.env) {
  if (paths.cto === true && env.RESUME_EXECUTIVE_BLOB_URL) {
    return { ...EXECUTIVE_RESUME, url: env.RESUME_EXECUTIVE_BLOB_URL };
  }

  return { ...STANDARD_RESUME, url: env.RESUME_BLOB_URL || '' };
}

module.exports = { selectResume };
