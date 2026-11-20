const test = require('node:test');
const assert = require('node:assert/strict');
const {
  REFRESH_TOKEN_BYTES,
  REFRESH_TOKEN_PATTERN,
  generateRefreshToken,
  hashRefreshToken,
  safeHashEquals
} = require('../src/modules/auth/refresh-token');

test('generates opaque refresh tokens with 256 bits of entropy', () => {
  const first = generateRefreshToken();
  const second = generateRefreshToken();
  assert.match(first, REFRESH_TOKEN_PATTERN);
  assert.equal(Buffer.from(first, 'base64url').length, REFRESH_TOKEN_BYTES);
  assert.notEqual(first, second);
});

test('hashes valid tokens deterministically without storing raw token', () => {
  const token = generateRefreshToken();
  const hash = hashRefreshToken(token);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.notEqual(hash, token);
  assert.equal(hashRefreshToken(token), hash);
});

test('rejects malformed tokens before hashing', () => {
  for (const token of ['', 'short', 'x'.repeat(43), null, 123]) {
    assert.throws(() => hashRefreshToken(token), TypeError);
  }
});

test('compares hashes safely and rejects malformed or unequal values', () => {
  const hash = hashRefreshToken(generateRefreshToken());
  assert.equal(safeHashEquals(hash, hash), true);
  assert.equal(safeHashEquals(hash, '0'.repeat(64)), false);
  assert.equal(safeHashEquals(hash, 'not-a-hash'), false);
  assert.equal(safeHashEquals(null, hash), false);
});
