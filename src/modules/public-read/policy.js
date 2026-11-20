const { isKnownChallengeId } = require('../curriculum/catalog');

function normalizeCertificateLookupCode(value) {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  if (code.length < 8 || code.length > 100 || !/^[A-Z0-9-]+$/.test(code)) return null;
  return code;
}

function isPublicLessonLookupAllowed(value) {
  return typeof value === 'string' && isKnownChallengeId(value.trim());
}

module.exports = {
  normalizeCertificateLookupCode,
  isPublicLessonLookupAllowed
};
