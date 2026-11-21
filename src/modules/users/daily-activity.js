'use strict';

function previousUtcDate(today) {
  if (typeof today !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(today)) {
    throw new TypeError('Data de atividade inválida.');
  }
  const date = new Date(`${today}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== today) {
    throw new TypeError('Data de atividade inválida.');
  }
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

// MongoDB applies this pipeline atomically: consecutive UTC days increment;
// a gap (or missing legacy date) starts a new streak at one.
function buildDailyActivityUpdate(today) {
  const yesterday = previousUtcDate(today);
  return [{
    $set: {
      streak: {
        $cond: [
          { $eq: ['$lastActiveDate', yesterday] },
          { $add: [{ $ifNull: ['$streak', 0] }, 1] },
          1
        ]
      },
      lastActiveDate: today
    }
  }];
}

async function recordDailyActivity(UserModel, userId, today) {
  const updated = await UserModel.findOneAndUpdate(
    { _id: userId, lastActiveDate: { $ne: today } },
    buildDailyActivityUpdate(today),
    { new: true }
  );
  return updated || UserModel.findById(userId);
}

module.exports = { recordDailyActivity, buildDailyActivityUpdate };
