const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { createSessionModels } = require('../src/modules/auth/session-models');
const { createSessionStore } = require('../src/modules/auth/session-store');
const { hashRefreshToken } = require('../src/modules/auth/refresh-token');
const { verifySessionCsrfToken } = require('../src/modules/auth/session-csrf-token');

const uri = process.env.MONGO_SESSION_TEST_URI;
const enabled = Boolean(uri);

function validateIsolatedReplicaSetUri(value) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error('MONGO_SESSION_TEST_URI precisa ser uma URI MongoDB válida.'); }
  const dbName = parsed.pathname.replace(/^\//, '');
  if (!['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname) ||
      (dbName !== 'nexusdev_session_test' && !dbName.endsWith('_nexusdev_session_test')) ||
      !parsed.searchParams.has('replicaSet')) {
    throw new Error('Testes exigem MongoDB replica set local e banco *_nexusdev_session_test.');
  }
}

test('MongoDB replica-set session lifecycle integration', { skip: !enabled }, async t => {
  validateIsolatedReplicaSetUri(uri);
  const connection = await mongoose.createConnection(uri, {
    serverSelectionTimeoutMS: 5000,
    autoIndex: true
  }).asPromise();
  const { Session, RefreshToken } = createSessionModels(mongoose, connection);
  const store = createSessionStore({
    mongoose: { startSession: () => connection.startSession() },
    Session,
    RefreshToken
  });

  try {
    await connection.dropDatabase();
    await Promise.all([Session.init(), RefreshToken.init()]);
    const userId = new mongoose.Types.ObjectId();
    const created = await store.create({ userId, ttlMs: 60_000 });
    assert.ok(created.refreshToken);
    assert.match(created.csrfToken, /^[A-Za-z0-9_-]{43}$/);
    const createdRecord = await Session.findById(created.session._id).select('+csrfTokenHash').lean();
    assert.ok(verifySessionCsrfToken(created.csrfToken, createdRecord.csrfTokenHash));
    assert.equal(await RefreshToken.countDocuments({ sessionId: created.session._id, usedAt: null }), 1);

    const rotated = await store.rotate({ refreshToken: created.refreshToken });
    assert.equal(rotated.status, 'rotated');
    assert.match(rotated.csrfToken, /^[A-Za-z0-9_-]{43}$/);
    assert.notEqual(rotated.csrfToken, created.csrfToken);
    const rotatedRecord = await Session.findById(created.session._id).select('+csrfTokenHash').lean();
    assert.ok(verifySessionCsrfToken(rotated.csrfToken, rotatedRecord.csrfTokenHash));
    assert.equal(verifySessionCsrfToken(created.csrfToken, rotatedRecord.csrfTokenHash), false);
    assert.equal(await RefreshToken.countDocuments({ sessionId: created.session._id, usedAt: { $ne: null } }), 1);

    const replay = await store.rotate({ refreshToken: created.refreshToken });
    assert.equal(replay.status, 'replay');
    const revoked = await Session.findById(created.session._id).lean();
    assert.equal(revoked.revokeReason, 'refresh_replay');
    assert.ok(revoked.revokedAt);

    const second = await store.create({ userId, ttlMs: 60_000 });
    const concurrent = await Promise.all([
      store.rotate({ refreshToken: second.refreshToken }),
      store.rotate({ refreshToken: second.refreshToken })
    ]);
    assert.equal(concurrent.filter(result => result.status === 'rotated').length, 1);
    const concurrentSession = await Session.findById(second.session._id).lean();
    assert.ok(concurrentSession.revokedAt);
    assert.equal(concurrentSession.revokeReason, 'refresh_replay');

    const third = await store.create({ userId, ttlMs: 60_000 });
    assert.equal(await store.revoke({ sessionId: third.session._id, userId }), true);
    assert.equal((await store.rotate({ refreshToken: third.refreshToken })).status, 'invalid');

    const fourth = await store.create({ userId, ttlMs: 60_000 });
    assert.equal(await store.revokeAll({ userId }), 1);
    assert.equal((await store.rotate({ refreshToken: fourth.refreshToken })).status, 'invalid');

    // A global logout racing with refresh must leave the session revoked regardless
    // of which transaction commits first; a rotated successor must never survive it.
    const logoutRace = await store.create({ userId, ttlMs: 60_000 });
    const [raceRotation] = await Promise.all([
      store.rotate({ refreshToken: logoutRace.refreshToken }),
      store.revokeAll({ userId })
    ]);
    const logoutRaceSession = await Session.findById(logoutRace.session._id).lean();
    assert.ok(logoutRaceSession.revokedAt, 'logout-all must win over or follow a concurrent refresh');
    assert.ok(['invalid', 'rotated'].includes(raceRotation.status));
    if (raceRotation.status === 'rotated') {
      assert.equal((await store.rotate({ refreshToken: raceRotation.refreshToken })).status, 'invalid',
        'a successor token created during logout-all must not remain usable');
    }

    const fifth = await store.create({ userId, ttlMs: 60_000 });
    const originalCreate = RefreshToken.create;
    try {
      RefreshToken.create = async function (...args) {
        throw new Error('injected transaction failure');
      };
      await assert.rejects(
        store.rotate({ refreshToken: fifth.refreshToken }),
        /injected transaction failure/
      );
    } finally {
      RefreshToken.create = originalCreate;
    }
    const unconsumed = await RefreshToken.findOne({
      tokenHash: hashRefreshToken(fifth.refreshToken)
    }).lean();
    assert.equal(unconsumed.usedAt, null, 'transaction rollback must restore the consumed token');
    assert.equal((await store.rotate({ refreshToken: fifth.refreshToken })).status, 'rotated');

    const unrelatedUserId = new mongoose.Types.ObjectId();
    const unrelatedSession = await store.create({ userId: unrelatedUserId, ttlMs: 60_000 });
    const purged = await store.purgeUserRecords({ userId });
    assert.ok(purged.sessionsDeleted >= 5);
    assert.ok(purged.refreshTokensDeleted >= 5);
    assert.equal(await Session.countDocuments({ userId }), 0);
    assert.equal(await RefreshToken.countDocuments({ userId }), 0);
    assert.equal(await Session.countDocuments({ userId: unrelatedUserId }), 1);
    assert.equal(await RefreshToken.countDocuments({ userId: unrelatedUserId }), 1);
    assert.equal((await store.rotate({ refreshToken: unrelatedSession.refreshToken })).status, 'rotated');
  } finally {
    await connection.dropDatabase();
    await connection.close();
  }
});
