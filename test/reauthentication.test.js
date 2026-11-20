const test = require('node:test');
const assert = require('node:assert/strict');
const {
  issueReauthProof,
  verifyReauthProof,
  consumeReauthProof,
  REAUTH_TTL_SECONDS
} = require('../src/modules/auth/reauthentication');

const secret = 'dedicated-reauth-secret-with-at-least-32-characters';
const now = 1_800_000_000;

test('issues a five-minute proof bound to one user and purpose', () => {
  const proof = issueReauthProof({ userId: 'user-1', secret, now });
  assert.equal(proof.expiresIn, REAUTH_TTL_SECONDS);
  assert.equal(proof.expiresAt.getTime(), (now + 300) * 1000);
  assert.ok(proof.proofHash);
  assert.equal(verifyReauthProof(proof.token, { userId: 'user-1', secret, now }).proofHash, proof.proofHash);
});

test('rejects another user, another secret, malformed and expired proofs', () => {
  const proof = issueReauthProof({ userId: 'user-1', secret, now });
  assert.equal(verifyReauthProof(proof.token, { userId: 'user-2', secret, now }), null);
  assert.equal(verifyReauthProof(proof.token, { userId: 'user-1', secret: 'another-secret-with-at-least-32-characters', now }), null);
  assert.equal(verifyReauthProof('not-a-token', { userId: 'user-1', secret, now }), null);
  assert.equal(verifyReauthProof(proof.token, { userId: 'user-1', secret, now: now + 301 }), null);
});

test('requires strong distinct signing input', () => {
  assert.throws(() => issueReauthProof({ userId: 'user-1', secret: 'short' }));
  assert.throws(() => issueReauthProof({ userId: '', secret }));
});

test('consumes a proof atomically once and rejects reuse', async () => {
  const proof = issueReauthProof({ userId: 'user-1', secret, now });
  let storedHash = proof.proofHash;
  let storedExpiry = proof.expiresAt;
  const model = {
    async findOneAndUpdate(filter, update) {
      assert.equal(filter._id, 'user-1');
      assert.equal(filter.reauthProofHash, storedHash);
      assert.equal(filter.reauthProofExpiresAt.$gt.getTime(), now * 1000);
      if (!storedHash || storedExpiry <= filter.reauthProofExpiresAt.$gt) return null;
      storedHash = '';
      storedExpiry = null;
      assert.deepEqual(update, { $unset: { reauthProofHash: 1, reauthProofExpiresAt: 1 } });
      return { _id: 'user-1' };
    }
  };
  assert.equal(await consumeReauthProof(model, { userId: 'user-1', token: proof.token, secret, now: new Date(now * 1000) }), true);
  assert.equal(await consumeReauthProof(model, { userId: 'user-1', token: proof.token, secret, now: new Date(now * 1000) }), false);
});

test('does not consume expired stored proof or invalid model input', async () => {
  const proof = issueReauthProof({ userId: 'user-1', secret, now });
  const model = { async findOneAndUpdate() { return null; } };
  assert.equal(await consumeReauthProof(model, { userId: 'user-1', token: proof.token, secret, now: new Date((now + 301) * 1000) }), false);
  assert.equal(await consumeReauthProof(null, { userId: 'user-1', token: proof.token, secret, now: new Date(now * 1000) }), false);
});
