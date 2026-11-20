'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { createPasswordResetService, hashPasswordResetToken } = require('../src/modules/auth/password-reset');

const sourceUri = process.env.MONGO_SESSION_TEST_URI;
const enabled = Boolean(sourceUri);

function isolatedPasswordResetUri(value) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error('MONGO_SESSION_TEST_URI precisa ser uma URI MongoDB válida.'); }
  if (!['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname) ||
      !parsed.searchParams.has('replicaSet')) {
    throw new Error('Testes de recuperação exigem MongoDB replica set local.');
  }
  parsed.pathname = '/nexusdev_password_reset_test';
  return parsed.toString();
}

test('MongoDB replica-set password reset is atomic, single-use, and revokes sessions', { skip: !enabled }, async () => {
  const connection = await mongoose.createConnection(isolatedPasswordResetUri(sourceUri), {
    serverSelectionTimeoutMS: 5000,
    autoIndex: true
  }).asPromise();

  const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    name: String,
    passwordHash: String,
    passwordResetTokenHash: String,
    passwordResetExpiresAt: Date,
    passwordChangedAt: Date
  }, { versionKey: false });
  const sessionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    revokedAt: { type: Date, default: null },
    revokeReason: String
  }, { versionKey: false });
  const User = connection.model('PasswordResetUser', userSchema, 'password_reset_users');
  const Session = connection.model('PasswordResetSession', sessionSchema, 'password_reset_sessions');
  const sent = [];
  const fixedNow = new Date('2026-11-20T12:00:00.000Z');
  const service = createPasswordResetService({
    mongoose: { startSession: () => connection.startSession() },
    User,
    Session,
    bcrypt: { hash: async (value, rounds) => {
      assert.equal(rounds, 10);
      return 'test-hash:' + value;
    } },
    sendResetEmail: async message => { sent.push(message); },
    now: () => fixedNow
  });

  try {
    await connection.dropDatabase();
    await Promise.all([User.init(), Session.init()]);

    const user = await User.create({
      email: 'student@example.test',
      name: 'Student',
      passwordHash: 'old-hash'
    });
    await Session.create([
      { userId: user._id },
      { userId: user._id }
    ]);

    await service.request(user.email);
    assert.equal(sent.length, 1);
    const token = sent[0].token;

    const concurrent = await Promise.all([
      service.reset({ token, newPassword: 'new-password-one' }),
      service.reset({ token, newPassword: 'new-password-two' })
    ]);
    assert.equal(concurrent.filter(result => result.ok).length, 1,
      'only one concurrent request may consume the reset token');
    assert.equal(concurrent.filter(result => !result.ok).length, 1);

    const changed = await User.findById(user._id).lean();
    assert.ok(['test-hash:new-password-one', 'test-hash:new-password-two'].includes(changed.passwordHash));
    assert.equal(changed.passwordResetTokenHash, undefined);
    assert.equal(changed.passwordResetExpiresAt, undefined);
    assert.equal(changed.passwordChangedAt.getTime(), fixedNow.getTime());
    const revoked = await Session.find({ userId: user._id }).lean();
    assert.equal(revoked.length, 2);
    assert.ok(revoked.every(item => item.revokedAt instanceof Date && item.revokeReason === 'security'));

    const rollbackUser = await User.create({
      email: 'rollback@example.test',
      name: 'Rollback',
      passwordHash: 'old-hash'
    });
    await Session.create({ userId: rollbackUser._id });
    await service.request(rollbackUser.email);
    const rollbackToken = sent[1].token;
    const originalUpdateMany = Session.updateMany;
    try {
      Session.updateMany = async () => { throw new Error('injected session revocation failure'); };
      await assert.rejects(
        service.reset({ token: rollbackToken, newPassword: 'rollback-password' }),
        /injected session revocation failure/
      );
    } finally {
      Session.updateMany = originalUpdateMany;
    }

    const afterRollback = await User.findById(rollbackUser._id).lean();
    assert.equal(afterRollback.passwordHash, 'old-hash',
      'password update must roll back when session revocation fails');
    assert.equal(afterRollback.passwordResetTokenHash, hashPasswordResetToken(rollbackToken),
      'reset token must remain usable after transaction rollback');

    assert.deepEqual(
      await service.reset({ token: rollbackToken, newPassword: 'rollback-password' }),
      { ok: true }
    );
  } finally {
    await connection.dropDatabase();
    await connection.close();
  }
});
