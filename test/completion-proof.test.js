const test = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync } = require('node:crypto');
const jwt = require('jsonwebtoken');
const { verifyCompletionProof } = require('../src/modules/proofs/verifyCompletionProof');

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});
const now = Math.floor(Date.now() / 1000);
const context = { publicKey, userId: 'user-123', challengeId: 'html-00-o-que-e-web', nowSeconds: now };

function sign(overrides = {}) {
  return jwt.sign({
    purpose: 'lesson-completion',
    challengeId: context.challengeId,
    sub: context.userId,
    iss: 'nexusdev-runner',
    aud: 'nexusdev-progress',
    iat: now - 10,
    exp: now + 110,
    ...overrides
  }, privateKey, { algorithm: 'RS256' });
}

test('accepts a correctly signed proof for the same user and lesson', () => {
  const token = sign({ exp: now + 230 });
  assert.equal(verifyCompletionProof(token, context).ok, true);
});

test('rejects missing key, missing token, and oversized token', () => {
  assert.equal(verifyCompletionProof('x', { ...context, publicKey: '' }).reason, 'not-configured');
  assert.equal(verifyCompletionProof(null, context).reason, 'invalid-token');
  assert.equal(verifyCompletionProof('x'.repeat(8193), context).reason, 'invalid-token');
});

test('rejects a token signed by another key', () => {
  const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const token = jwt.sign({ purpose: 'lesson-completion', challengeId: context.challengeId }, other.privateKey, {
    algorithm: 'RS256', subject: context.userId, issuer: 'nexusdev-runner',
    audience: 'nexusdev-progress', expiresIn: 120
  });
  assert.equal(verifyCompletionProof(token, context).ok, false);
});

test('rejects wrong user, lesson, purpose, issuer, or audience', () => {
  const cases = [
    { sub: 'another-user' },
    { challengeId: 'another-lesson' },
    { purpose: 'other-purpose' },
    { iss: 'untrusted-runner' },
    { aud: 'other-api' }
  ];
  for (const claims of cases) {
    const token = sign(claims);
    assert.equal(verifyCompletionProof(token, context).ok, false);
  }
});

test('rejects expired, future-issued, and longer-than-five-minute proofs', () => {
  const make = (iat, exp) => jwt.sign({
    purpose: 'lesson-completion',
    challengeId: context.challengeId,
    sub: context.userId,
    iss: 'nexusdev-runner',
    aud: 'nexusdev-progress',
    iat,
    exp
  }, privateKey, { algorithm: 'RS256' });
  assert.equal(verifyCompletionProof(make(now - 60, now - 1), context).ok, false);
  assert.equal(verifyCompletionProof(make(now + 31, now + 100), context).ok, false);
  assert.equal(verifyCompletionProof(make(now - 1, now + 300), context).ok, false);
});

test('rejects a token using a non-RS256 algorithm', () => {
  const token = jwt.sign({
    purpose: 'lesson-completion',
    challengeId: context.challengeId,
    sub: context.userId,
    iss: 'nexusdev-runner',
    aud: 'nexusdev-progress',
    exp: now + 120
  }, 'symmetric-secret', { algorithm: 'HS256', noTimestamp: true });
  assert.equal(verifyCompletionProof(token, context).ok, false);
});
