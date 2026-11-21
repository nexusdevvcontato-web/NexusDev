'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { completeLessonAtomically, REPLAY_CODE } = require('../src/modules/proofs/complete-lesson');
function setup({ replay = false, failAt = null } = {}) {
  const calls = [];
  const session = {
    async withTransaction(callback) { calls.push('transaction:start'); await callback(); calls.push('transaction:commit'); },
    async endSession() { calls.push('session:end'); }
  };
  const mongoose = { async startSession() { calls.push('session:start'); return session; } };
  const CompletionProof = { async create(records, options) {
    calls.push(['proof', records, options.session]);
    if (replay) { const error = new Error('duplicate'); error.code = 11000; throw error; }
    if (failAt === 'proof') throw new Error('proof storage unavailable');
  } };
  const User = {
    async updateOne(filter, update, options) { calls.push(['updateOne', filter, update, options.session]); if (failAt === 'saved-code') throw new Error('saved code write failed'); return { matchedCount: 1 }; },
    async findOneAndUpdate(filter, update, options) { calls.push(['xp', filter, update, options]); if (failAt === 'xp') throw new Error('xp write failed'); return {}; },
    findById(id) { return { session: async s => { calls.push(['read-user', id, s]); return { _id: id, xp: 50 }; } }; }
  };
  return { calls, mongoose, User, CompletionProof };
}
const input = deps => ({ ...deps, userId: 'user-1', proof: { jti: '123e4567-e89b-42d3-a456-426614174000', exp: 1800000120, challengeId: 'html-00-o-que-e-web', filesHash: 'a'.repeat(64) }, challengeId: 'html-00-o-que-e-web', files: { 'index.html': '<h1>OK</h1>' }, today: '2026-11-20' });
test('consumes proof and writes saved code, XP and streak inside one transaction', async () => {
  const deps = setup(); const user = await completeLessonAtomically(input(deps));
  assert.equal(user.xp, 50); assert.equal(deps.calls.at(-2), 'transaction:commit'); assert.equal(deps.calls.at(-1), 'session:end');
  assert.equal(deps.calls.filter(x => Array.isArray(x) && x[0] === 'proof').length, 1);
  assert.equal(deps.calls.filter(x => Array.isArray(x) && x[0] === 'xp').length, 1);
  const proofCall = deps.calls.find(x => Array.isArray(x) && x[0] === 'proof');
  assert.equal(typeof proofCall[2].withTransaction, 'function');
  const transactionSession = proofCall[2];
  for (const call of deps.calls.filter(x => Array.isArray(x))) {
    if (call[0] === 'updateOne') assert.equal(call[3], transactionSession);
    if (call[0] === 'xp') assert.equal(call[3].session, transactionSession);
    if (call[0] === 'read-user') assert.equal(call[2], transactionSession);
  }
});
test('duplicate proof is rejected and transaction is not committed', async () => {
  const deps = setup({ replay: true });
  await assert.rejects(() => completeLessonAtomically(input(deps)), error => error.code === REPLAY_CODE);
  assert.equal(deps.calls.includes('transaction:commit'), false); assert.equal(deps.calls.filter(x => Array.isArray(x) && x[0] === 'xp').length, 0); assert.equal(deps.calls.at(-1), 'session:end');
});
test('a later write failure aborts the transaction and releases the session', async () => {
  const deps = setup({ failAt: 'xp' });
  await assert.rejects(() => completeLessonAtomically(input(deps)), /xp write failed/);
  assert.equal(deps.calls.includes('transaction:commit'), false); assert.equal(deps.calls.at(-1), 'session:end');
});
test('XP increment is guarded by an atomic not-yet-completed condition', async () => {
  const deps = setup();
  await completeLessonAtomically(input(deps));
  const xpCall = deps.calls.find(x => Array.isArray(x) && x[0] === 'xp');
  assert.deepEqual(xpCall[1], { _id: 'user-1', completedIds: { $ne: 'html-00-o-que-e-web' } });
  assert.deepEqual(xpCall[2], { $addToSet: { completedIds: 'html-00-o-que-e-web' }, $inc: { xp: 50 } });
  assert.deepEqual(xpCall[3], { new: true, session: xpCall[3].session });
});

test('daily streak increment is guarded by the stored activity date', async () => {
  const deps = setup();
  await completeLessonAtomically(input(deps));
  const streakCall = deps.calls.find(x => Array.isArray(x) && x[0] === 'updateOne' && x[1].lastActiveDate);
  assert.deepEqual(streakCall[1], { _id: 'user-1', lastActiveDate: { $ne: '2026-11-20' } });
  assert.deepEqual(streakCall[2], [{
    $set: {
      streak: { $cond: [
        { $eq: ['$lastActiveDate', '2026-11-19'] },
        { $add: [{ $ifNull: ['$streak', 0] }, 1] },
        1
      ] },
      lastActiveDate: '2026-11-20'
    }
  }]);
});
