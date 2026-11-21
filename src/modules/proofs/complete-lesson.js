'use strict';

const { consumeCompletionProof, REPLAY_CODE } = require('./completion-proof-store');
const { buildDailyActivityUpdate } = require('../users/daily-activity');

async function completeLessonAtomically({ mongoose, User, CompletionProof, userId, proof, challengeId, files, today }) {
  if (!mongoose || typeof mongoose.startSession !== 'function' || !User || !CompletionProof) throw new TypeError('Dependências de conclusão inválidas.');
  const session = await mongoose.startSession();
  let updatedUser = null;
  try {
    await session.withTransaction(async () => {
      await consumeCompletionProof(CompletionProof, proof, userId, { session });
      const savedCodeField = 'savedCodeMap.' + challengeId;
      const saved = await User.updateOne({ _id: userId }, { $set: { [savedCodeField]: files } }, { session });
      if (saved.matchedCount === 0) throw new Error('Usuário não encontrado durante a conclusão.');
      await User.findOneAndUpdate(
        { _id: userId, completedIds: { $ne: challengeId } },
        { $addToSet: { completedIds: challengeId }, $inc: { xp: 50 } },
        { new: true, session }
      );
      await User.updateOne(
        { _id: userId, lastActiveDate: { $ne: today } },
        { $inc: { streak: 1 }, $set: { lastActiveDate: today } },
        { session }
      );
      updatedUser = await User.findById(userId).session(session);
      if (!updatedUser) throw new Error('Usuário não encontrado após salvar a conclusão.');
    });
    return updatedUser;
  } finally {
    await session.endSession();
  }
}
module.exports = { completeLessonAtomically, REPLAY_CODE };
