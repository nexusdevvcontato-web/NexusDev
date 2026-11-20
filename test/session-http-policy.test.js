const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SESSION_COOKIE_NAME, CSRF_COOKIE_NAME, CSRF_HEADER_NAME,
  createCsrfToken, safeEqual, isTrustedOrigin, validateCsrfRequest,
  getRefreshCookieOptions, getCsrfCookieOptions, getClearCookieOptions
} = require('../src/modules/auth/session-http-policy');

test('uses host-only secure cookie names and explicit CSRF header', () => {
  assert.equal(SESSION_COOKIE_NAME.startsWith('__Host-'), true);
  assert.equal(CSRF_COOKIE_NAME.startsWith('__Host-'), true);
  assert.equal(CSRF_HEADER_NAME, 'x-csrf-token');
});

test('creates unpredictable URL-safe CSRF tokens', () => {
  const a = createCsrfToken();
  const b = createCsrfToken();
  assert.match(a, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a, b);
});

test('compares CSRF tokens in constant time and rejects malformed values', () => {
  const token = createCsrfToken();
  assert.equal(safeEqual(token, token), true);
  assert.equal(safeEqual(token, createCsrfToken()), false);
  assert.equal(safeEqual(token, 'x'), false);
  assert.equal(safeEqual(null, token), false);
});

test('requires exact allowlisted Origin and matching double-submit tokens', () => {
  const token = createCsrfToken();
  const allowedOrigins = ['https://app.example.test'];
  assert.equal(isTrustedOrigin('https://app.example.test', allowedOrigins), true);
  assert.equal(isTrustedOrigin('https://evil.example.test', allowedOrigins), false);
  assert.equal(validateCsrfRequest({
    origin: 'https://app.example.test', allowedOrigins,
    cookieToken: token, headerToken: token
  }), true);
  assert.equal(validateCsrfRequest({
    origin: 'https://evil.example.test', allowedOrigins,
    cookieToken: token, headerToken: token
  }), false);
  assert.equal(validateCsrfRequest({
    origin: 'https://app.example.test', allowedOrigins,
    cookieToken: token, headerToken: createCsrfToken()
  }), false);
  assert.equal(validateCsrfRequest({
    origin: undefined, allowedOrigins, cookieToken: token, headerToken: token
  }), false);
});

test('refresh cookie is HttpOnly, Secure, host-only and path-scoped', () => {
  const options = getRefreshCookieOptions({ maxAgeMs: 60000, sameSite: 'lax' });
  assert.deepEqual(options, {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60000
  });
  assert.equal('domain' in options, false);
  assert.throws(() => getRefreshCookieOptions({ maxAgeMs: 0 }), TypeError);
  assert.throws(() => getRefreshCookieOptions({ maxAgeMs: 1000, sameSite: 'invalid' }), TypeError);
});

test('CSRF cookie is readable by the frontend but remains Secure and host-only', () => {
  const options = getCsrfCookieOptions({ maxAgeMs: 60000, sameSite: 'strict' });
  assert.deepEqual(options, {
    httpOnly: false, secure: true, sameSite: 'strict', path: '/', maxAge: 60000
  });
  assert.equal('domain' in options, false);
});

test('cookie clearing uses the same scope and validates SameSite', () => {
  assert.deepEqual(getClearCookieOptions(), {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/'
  });
  assert.throws(() => getClearCookieOptions({ sameSite: 'invalid' }), TypeError);
});
