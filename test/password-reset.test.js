const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PASSWORD_RESET_TTL_MS,
  normalizeEmail,
  createPasswordResetToken,
  hashPasswordResetToken,
  isValidPasswordResetToken,
  createPasswordResetService
} = require('../src/modules/auth/password-reset');

test('normalizes email without accepting malformed or oversized input', () => {
  assert.equal(normalizeEmail('  STUDENT@Example.com '), 'student@example.com');
  assert.equal(normalizeEmail('bad-email'), null);
  assert.equal(normalizeEmail('x'.repeat(255)), null);
});

test('creates cryptographically random URL-safe tokens and stores only a SHA-256 digest', () => {
  const first = createPasswordResetToken();
  const second = createPasswordResetToken();
  assert.equal(first.token.length, 43);
  assert.match(first.token, /^[A-Za-z0-9_-]+$/);
  assert.equal(first.tokenHash, hashPasswordResetToken(first.token));
  assert.notEqual(first.tokenHash, first.token);
  assert.notEqual(first.token, second.token);
  assert.equal(isValidPasswordResetToken(first.token), true);
  assert.equal(isValidPasswordResetToken('not-a-token'), false);
});

function makeHarness({ user = { _id: 'user-1', email: 'student@example.com', name: 'Student' }, sendError = false } = {}) {
  let stored = null;
  let sessionEnded = false;
  let sessionRevoked = false;
  let transactionCount = 0;
  let passwordUpdate = null;
  const User = {
    findOne() {
      return { select() { return { lean: async () => user }; } };
    },
    async updateOne(filter, update) {
      if (update.$set) stored = { ...update.$set };
      if (update.$unset && stored?.passwordResetTokenHash === filter.passwordResetTokenHash) stored = null;
      return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
    },
    async findOneAndUpdate(filter, update) {
      passwordUpdate = update;
      if (!stored || stored.passwordResetTokenHash !== filter.passwordResetTokenHash ||
          stored.passwordResetExpiresAt <= filter.passwordResetExpiresAt.$gt) return null;
      stored = null;
      return { _id: 'user-1' };
    }
  };
  const Session = {
    async updateMany(filter, update, options) {
      assert.equal(filter.userId, 'user-1');
      assert.equal(update.$set.revokeReason, 'security');
      assert.ok(options.session);
      sessionRevoked = true;
      return { modifiedCount: 2 };
    }
  };
  const mongoose = {
    async startSession() {
      return {
        async withTransaction(fn) { transactionCount++; await fn(); },
        async endSession() { sessionEnded = true; }
      };
    }
  };
  const sent = [];
  const service = createPasswordResetService({
    mongoose, User, Session,
    bcrypt: { async hash(value, rounds) { assert.equal(rounds, 10); return 'hash:' + value; } },
    async sendResetEmail(message) {
      sent.push(message);
      if (sendError) throw new Error('mail provider unavailable');
    },
    now: () => new Date('2026-11-20T12:00:00.000Z')
  });
  return { service, sent, get stored() { return stored; }, get sessionEnded() { return sessionEnded; }, get sessionRevoked() { return sessionRevoked; }, get transactionCount() { return transactionCount; }, get passwordUpdate() { return passwordUpdate; } };
}

test('request always has a generic result and sends only a short-lived raw token to the mail adapter', async () => {
  const h = makeHarness();
  const result = await h.service.request('STUDENT@example.com');
  assert.deepEqual(result, { accepted: true });
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0].to, 'student@example.com');
  assert.equal(h.sent[0].expiresAt.getTime(), Date.parse('2026-11-20T12:00:00.000Z') + PASSWORD_RESET_TTL_MS);
  assert.equal(h.stored.passwordResetTokenHash, hashPasswordResetToken(h.sent[0].token));
  assert.notEqual(h.stored.passwordResetTokenHash, h.sent[0].token);
});

test('unknown and malformed email return the same generic response and send no email', async () => {
  const h = makeHarness({ user: null });
  assert.deepEqual(await h.service.request('nobody@example.com'), { accepted: true });
  assert.deepEqual(await h.service.request('invalid'), { accepted: true });
  assert.equal(h.sent.length, 0);
});

test('mail delivery failure clears the pending token and still avoids account enumeration', async () => {
  const h = makeHarness({ sendError: true });
  assert.deepEqual(await h.service.request('student@example.com'), { accepted: true });
  assert.equal(h.stored, null);
});

test('does not send a reset link when the token digest was not persisted', async () => {
  // Simulate a concurrent account removal between lookup and token persistence.
  const user = { _id: 'user-1', email: 'student@example.com', name: 'Student' };
  let sends = 0;
  const service = createPasswordResetService({
    mongoose: { startSession: async () => { throw new Error('unused'); } },
    User: {
      findOne() { return { select() { return { lean: async () => user }; } }; },
      async updateOne() { return { acknowledged: true, matchedCount: 0, modifiedCount: 0 }; }
    },
    Session: { updateMany: async () => ({}) },
    bcrypt: { hash: async value => value },
    sendResetEmail: async () => { sends += 1; }
  });
  assert.deepEqual(await service.request(user.email), { accepted: true });
  assert.equal(sends, 0);
});

test('reset consumes a valid token once, updates password and revokes all sessions transactionally', async () => {
  const h = makeHarness();
  await h.service.request('student@example.com');
  const token = h.sent[0].token;
  assert.deepEqual(await h.service.reset({ token, newPassword: 'new-password-123' }), { ok: true });
  assert.equal(h.sessionRevoked, true);
  assert.deepEqual(h.passwordUpdate.$inc, { authVersion: 1 });
  assert.ok(h.passwordUpdate.$set.passwordChangedAt instanceof Date);
  assert.ok(Object.hasOwn(h.passwordUpdate.$unset, 'passwordResetTokenHash'));
  assert.ok(Object.hasOwn(h.passwordUpdate.$unset, 'passwordResetExpiresAt'));
  assert.equal(h.transactionCount, 1);
  assert.equal(h.sessionEnded, true);
  assert.deepEqual(await h.service.reset({ token, newPassword: 'another-password-123' }), { ok: false });
});

test('rejects malformed tokens and passwords outside the existing account policy', async () => {
  const h = makeHarness();
  assert.deepEqual(await h.service.reset({ token: 'bad', newPassword: 'new-password' }), { ok: false });
  const { token } = createPasswordResetToken();
  assert.deepEqual(await h.service.reset({ token, newPassword: 'short' }), { ok: false });
});

test('requires explicit dependencies and bounded token lifetime', () => {
  assert.throws(() => createPasswordResetService({}), /Dependências/);
  assert.ok(PASSWORD_RESET_TTL_MS <= 60 * 60 * 1000);
});
