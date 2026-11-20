const crypto = require('node:crypto');

const REFRESH_TOKEN_BYTES = 32;
const REFRESH_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function generateRefreshToken() {
  return crypto.randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
}

function hashRefreshToken(token) {
  if (typeof token !== 'string' || !REFRESH_TOKEN_PATTERN.test(token)) {
    throw new TypeError('Refresh token malformado.');
  }
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

function safeHashEquals(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' ||
      !/^[a-f0-9]{64}$/.test(left) || !/^[a-f0-9]{64}$/.test(right)) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

module.exports = {
  REFRESH_TOKEN_BYTES,
  REFRESH_TOKEN_PATTERN,
  generateRefreshToken,
  hashRefreshToken,
  safeHashEquals
};
