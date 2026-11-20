async function recordDailyActivity(UserModel, userId, today) {
  const updated = await UserModel.findOneAndUpdate(
    { _id: userId, lastActiveDate: { $ne: today } },
    { $inc: { streak: 1 }, $set: { lastActiveDate: today } },
    { new: true }
  );
  return updated || UserModel.findById(userId);
}

module.exports = { recordDailyActivity };
