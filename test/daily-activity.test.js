const test = require('node:test');
const assert = require('node:assert/strict');
const { recordDailyActivity } = require('../src/modules/users/daily-activity');

test('increments once using a conditional atomic update', async () => {
  const expected = { _id: 'u1', streak: 4, lastActiveDate: '2026-11-20' };
  let query, update, options;
  const User = {
    async findOneAndUpdate(q, u, o) { query=q; update=u; options=o; return expected; },
    async findById() { assert.fail('should not reload after successful atomic update'); }
  };
  const result = await recordDailyActivity(User, 'u1', '2026-11-20');
  assert.equal(result, expected);
  assert.deepEqual(query, { _id: 'u1', lastActiveDate: { $ne: '2026-11-20' } });
  assert.deepEqual(update, { $inc: { streak: 1 }, $set: { lastActiveDate: '2026-11-20' } });
  assert.deepEqual(options, { new: true });
});

test('does not increment twice when the day was already recorded', async () => {
  const current = { _id: 'u1', streak: 4, lastActiveDate: '2026-11-20' };
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
