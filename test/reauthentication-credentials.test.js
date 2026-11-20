const test = require('node:test');
const assert = require('node:assert/strict');
const { verifyReauthenticationCredential } = require('../src/modules/auth/reauthentication-credentials');

const passwordUser = { _id: 'user-1', email: 'local@example.com', passwordHash: 'bcrypt-hash', googleId: '' };
const googleUser = { _id: 'user-2', email: 'google@example.com', passwordHash: '', googleId: 'google-sub-2' };
const validGooglePayload = {
  sub: 'google-sub-2',
  email: 'google@example.com',
  email_verified: true
};
const googleClient = (payload) => ({
  async verifyIdToken(args) {
    assert.equal(args.idToken, 'x'.repeat(40));
    assert.equal(args.audience, 'test-client-id');
    return { getPayload: () => payload };
  }
});

test('accepts a correct password and never needs Google verification', async () => {
  let calls = 0;
  const result = await verifyReauthenticationCredential({
    user: passwordUser,
    body: { password: 'correct-password' },
    bcrypt: { async compare(password, hash) { calls++; return password === 'correct-password' && hash === 'bcrypt-hash'; } }
  });
  assert.deepEqual(result, { ok: true, method: 'password' });
  assert.equal(calls, 1);
});

test('rejects wrong password, absent hash, oversized password and comparison failure', async () => {
  const wrong = await verifyReauthenticationCredential({
    user: passwordUser, body: { password: 'wrong' }, bcrypt: { async compare() { return false; } }
  });
  assert.equal(wrong.ok, false);
  assert.equal(wrong.status, 401);
  const absentHash = await verifyReauthenticationCredential({
    user: { ...passwordUser, passwordHash: '' }, body: { password: 'anything' }, bcrypt: { async compare() { return true; } }
  });
  assert.equal(absentHash.ok, false);
  const oversized = await verifyReauthenticationCredential({
    user: passwordUser, body: { password: 'x'.repeat(129) }, bcrypt: { async compare() { return true; } }
  });
  assert.equal(oversized.ok, false);
  const compareError = await verifyReauthenticationCredential({
    user: passwordUser, body: { password: 'x' }, bcrypt: { async compare() { throw new Error('internal'); } }
  });
  assert.equal(compareError.ok, false);
});

test('accepts Google token only when subject, email and verified claim match', async () => {
  const result = await verifyReauthenticationCredential({
    user: googleUser,
    body: { credential: 'x'.repeat(40) },
    googleClient: googleClient(validGooglePayload),
    googleClientId: 'test-client-id'
  });
  assert.deepEqual(result, { ok: true, method: 'google' });
});

test('rejects mismatched Google subject, email, unverified email and invalid token', async () => {
  for (const payload of [
    { ...validGooglePayload, sub: 'different-sub' },
    { ...validGooglePayload, email: 'other@example.com' },
    { ...validGooglePayload, email_verified: false },
    null
  ]) {
    const result = await verifyReauthenticationCredential({
      user: googleUser, body: { credential: 'x'.repeat(40) },
      googleClient: googleClient(payload), googleClientId: 'test-client-id'
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, 401);
  }
  const invalid = await verifyReauthenticationCredential({
    user: googleUser, body: { credential: 'x'.repeat(40) },
    googleClient: { async verifyIdToken() { throw new Error('invalid token'); } },
    googleClientId: 'test-client-id'
  });
  assert.equal(invalid.ok, false);
});

test('rejects cross-method credentials and malformed requests', async () => {
  const passwordWithGoogle = await verifyReauthenticationCredential({
    user: passwordUser, body: { credential: 'x'.repeat(40) },
    googleClient: googleClient(validGooglePayload), googleClientId: 'test-client-id'
  });
  assert.equal(passwordWithGoogle.ok, false);
  const googleWithPassword = await verifyReauthenticationCredential({
    user: googleUser, body: { password: 'password' }, bcrypt: { async compare() { return true; } }
  });
  assert.equal(googleWithPassword.ok, false);
  const mixed = await verifyReauthenticationCredential({
    user: passwordUser, body: { password: 'x', credential: 'x'.repeat(40) }
  });
  assert.equal(mixed.status, 400);
  const extraField = await verifyReauthenticationCredential({
    user: passwordUser, body: { password: 'x', ignored: true }
  });
  assert.equal(extraField.status, 400);
  const arrayBody = await verifyReauthenticationCredential({ user: passwordUser, body: [] });
  assert.equal(arrayBody.status, 400);
  const missingUser = await verifyReauthenticationCredential({ body: { password: 'x' } });
  assert.equal(missingUser.status, 400);
});

test('normalizes Google email comparison case but still requires verified identity', async () => {
  const result = await verifyReauthenticationCredential({
    user: { ...googleUser, email: 'GOOGLE@example.com' },
    body: { credential: 'x'.repeat(40) },
    googleClient: googleClient(validGooglePayload),
    googleClientId: 'test-client-id'
  });
  assert.equal(result.ok, true);
});
