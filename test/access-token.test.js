const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { extractBearerToken, verifyAccessToken } = require('../src/modules/auth/access-token');

test('accepts a single well-formed Bearer token', () => {
  const token = 'aaa.bbb.ccc';
  assert.equal(extractBearerToken(`Bearer ${token}`), token);
  assert.equal(extractBearerToken(`bearer ${token}`), token);
});

test('rejects missing, malformed, duplicated, or trailing authorization data', () => {
  for (const header of [undefined, null, '', 'Basic aaa.bbb.ccc', 'Bearer', 'Bearer  aaa.bbb.ccc',
    'Bearer aaa.bbb.ccc extra', 'Bearer aaa.bbb', 'Bearer aaa.bbb.ccc\n']) {
    assert.equal(extractBearerToken(header), null);
  }
});

test('verifies access tokens with HS256 only and requires a non-empty user id', () => {
  const secret = 'test-secret-with-at-least-32-characters-long';
  const valid = jwt.sign({ id: 'user-123', role: 'student' }, secret, { algorithm: 'HS256', expiresIn: '1m' });
  assert.equal(verifyAccessToken(valid, secret).id, 'user-123');

  const missingId = jwt.sign({ role: 'student' }, secret, { algorithm: 'HS256' });
  assert.throws(() => verifyAccessToken(missingId, secret), /invalid-access-token-claims/);

  const otherAlgorithm = jwt.sign({ id: 'user-123' }, secret, { algorithm: 'HS384' });
  assert.throws(() => verifyAccessToken(otherAlgorithm, secret));
  assert.throws(() => verifyAccessToken(valid, 'different-secret-with-at-least-32-characters'));
});
