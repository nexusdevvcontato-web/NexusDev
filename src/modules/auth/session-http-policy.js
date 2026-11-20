const crypto = require('node:crypto');

const SESSION_COOKIE_NAME = '__Host-nexusdev_refresh';
const CSRF_COOKIE_NAME = '__Host-nexusdev_csrf';
const CSRF_HEADER_NAME = 'x-csrf-token';

function createCsrfToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function safeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' ||
      !/^[A-Za-z0-9_-]{43}$/.test(left) || !/^[A-Za-z0-9_-]{43}$/.test(right)) {
    return false;
  }
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function isTrustedOrigin(origin, allowedOrigins) {
  if (typeof origin !== 'string' || !Array.isArray(allowedOrigins)) return false;
  return allowedOrigins.includes(origin);
}

function validateCsrfRequest({ origin, allowedOrigins, cookieToken, headerToken }) {
  return isTrustedOrigin(origin, allowedOrigins) && safeEqual(cookieToken, headerToken);
}

function getRefreshCookieOptions({ maxAgeMs, sameSite = 'lax' } = {}) {
  if (!Number.isSafeInteger(maxAgeMs) || maxAgeMs <= 0) {
    throw new TypeError('Duração do cookie inválida.');
  }
  if (!['strict', 'lax', 'none'].includes(sameSite)) {
    throw new TypeError('SameSite deve ser strict, lax ou none.');
  }
  return Object.freeze({
    httpOnly: true,
    secure: true,
    sameSite,
    path: '/',
    maxAge: maxAgeMs
  });
}

function getCsrfCookieOptions({ maxAgeMs, sameSite = 'lax' } = {}) {
  const refreshOptions = getRefreshCookieOptions({ maxAgeMs, sameSite });
  return Object.freeze({
    httpOnly: false,
    secure: true,
    sameSite: refreshOptions.sameSite,
    path: '/',
    maxAge: maxAgeMs
  });
}

function getClearCookieOptions({ sameSite = 'lax' } = {}) {
  if (!['strict', 'lax', 'none'].includes(sameSite)) {
    throw new TypeError('SameSite deve ser strict, lax ou none.');
  }
  return Object.freeze({
    httpOnly: true,
    secure: true,
    sameSite,
    path: '/'
  });
}

module.exports = {
  SESSION_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  createCsrfToken,
  safeEqual,
  isTrustedOrigin,
  validateCsrfRequest,
  getRefreshCookieOptions,
  getCsrfCookieOptions,
  getClearCookieOptions
};
