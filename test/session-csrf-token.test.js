const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createSessionCsrfToken,
  hashSessionCsrfToken,
  verifySessionCsrfToken
} = require('../src/modules/auth/session-csrf-token');

test('creates high-entropy URL-safe synchronizer tokens', () => {
  const first = createSessionCsrfToken();
  const second = createSessionCsrfToken();
  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first, second);
});

test('stores only a SHA-256 hash and verifies the original token', () => {
  const token = createSessionCsrfToken();
  const hash = hashSessionCsrfToken(token);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.notEqual(hash, token);
  assert.equal(verifySessionCsrfToken(token, hash), true);
  assert.equal(verifySessionCsrfToken(createSessionCsrfToken(), hash), false);
});

test('rejects malformed tokens and hashes without throwing during verification', () => {
  assert.throws(() => hashSessionCsrfToken('short'), TypeError);
  assert.equal(verifySessionCsrfToken('short', 'a'.repeat(64)), false);
  assert.equal(verifySessionCsrfToken(createSessionCsrfToken(), 'bad-hash'), false);
  assert.equal(verifySessionCsrfToken(null, null), false);
});
