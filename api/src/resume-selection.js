const STANDARD_RESUME = {
  kind: 'standard',
  label: 'Engineering & Delivery Resume',
  filename: 'Andrew_DiCosmo_Engineering.pdf'
};

const LEADERSHIP_RESUME = {
  kind: 'leadership',
  label: 'Architecture & Leadership Resume',
  filename: 'Andrew_DiCosmo_Leadership.pdf'
};

const EXECUTIVE_RESUME = {
  kind: 'executive',
  label: 'Technology Executive Resume',
  filename: 'Andrew_DiCosmo_Executive.pdf'
};

function selectResume(paths = {}, env = process.env) {
  if (paths.cto === true && env.RESUME_EXECUTIVE_BLOB_URL) {
    return { ...EXECUTIVE_RESUME, url: env.RESUME_EXECUTIVE_BLOB_URL };
  }

  if ((paths.cto === true || paths.leadership === true) && env.RESUME_LEADERSHIP_BLOB_URL) {
    return { ...LEADERSHIP_RESUME, url: env.RESUME_LEADERSHIP_BLOB_URL };
  }

  return { ...STANDARD_RESUME, url: env.RESUME_BLOB_URL || '' };
}

module.exports = { selectResume };
