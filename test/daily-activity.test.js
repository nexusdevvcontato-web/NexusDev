const test = require('node:test');
const assert = require('node:assert/strict');
const { recordDailyActivity, buildDailyActivityUpdate } = require('../src/modules/users/daily-activity');

test('increments once using an atomic UTC-consecutive-day pipeline', async () => {
  const expected = { _id: 'u1', streak: 5, lastActiveDate: '2026-11-20' };
  let query, update, options;
  const User = {
    async findOneAndUpdate(q, u, o) { query=q; update=u; options=o; return expected; },
    async findById() { assert.fail('should not reload after successful atomic update'); }
  };
  const result = await recordDailyActivity(User, 'u1', '2026-11-20');
  assert.equal(result, expected);
  assert.deepEqual(query, { _id: 'u1', lastActiveDate: { $ne: '2026-11-20' } });
  assert.deepEqual(update, buildDailyActivityUpdate('2026-11-20'));
  assert.deepEqual(options, { new: true });
});

test('a consecutive UTC day increments the existing streak', () => {
  assert.deepEqual(buildDailyActivityUpdate('2026-11-20'), [{
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

test('a missed day or missing legacy date resets the streak to one', () => {
  const pipeline = buildDailyActivityUpdate('2026-11-20');
  assert.deepEqual(pipeline[0].$set.streak.$cond[0], { $eq: ['$lastActiveDate', '2026-11-19'] });
  assert.equal(pipeline[0].$set.streak.$cond[2], 1);
});

test('does not increment twice when the day was already recorded', async () => {
  const current = { _id: 'u1', streak: 5, lastActiveDate: '2026-11-20' };
  let reloadId;
  const User = {
    async findOneAndUpdate() { return null; },
    async findById(id) { reloadId=id; return current; }
  };
  const result = await recordDailyActivity(User, 'u1', '2026-11-20');
  assert.equal(result, current);
  assert.equal(reloadId, 'u1');
});

test('returns null if the account disappeared during the operation', async () => {
  const User = {
    async findOneAndUpdate() { return null; },
    async findById() { return null; }
  };
  assert.equal(await recordDailyActivity(User, 'missing', '2026-11-20'), null);
});

test('rejects invalid activity dates', () => {
  assert.throws(() => buildDailyActivityUpdate('2026-02-30'), /Data de atividade inválida/);
  assert.throws(() => buildDailyActivityUpdate('not-a-date'), /Data de atividade inválida/);
});
