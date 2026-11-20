const crypto = require('node:crypto');

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;

function createSessionCsrfToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashSessionCsrfToken(token) {
  if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) {
    throw new TypeError('Token CSRF inválido.');
  }
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

function verifySessionCsrfToken(token, expectedHash) {
  if (typeof token !== 'string' || !TOKEN_PATTERN.test(token) ||
      typeof expectedHash !== 'string' || !HASH_PATTERN.test(expectedHash)) {
    return false;
  }
  const actual = Buffer.from(hashSessionCsrfToken(token), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

module.exports = {
  createSessionCsrfToken,
  hashSessionCsrfToken,
  verifySessionCsrfToken
};
