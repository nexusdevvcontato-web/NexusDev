'use strict';

const { consumeCompletionProof, REPLAY_CODE } = require('./completion-proof-store');
const { buildDailyActivityUpdate } = require('../users/daily-activity');

async function completeLessonAtomically({
  mongoose, User, CompletionProof, LearningArtifact = null,
  userId, proof, challengeId, files, today
}) {
  if (!mongoose || typeof mongoose.startSession !== 'function' || !User || !CompletionProof ||
      (LearningArtifact && typeof LearningArtifact.findOneAndUpdate !== 'function')) {
    throw new TypeError('Dependências de conclusão inválidas.');
  }
  const session = await mongoose.startSession();
  let updatedUser = null;
  try {
    try {
      await session.withTransaction(async () => {
        await consumeCompletionProof(CompletionProof, proof, userId, { session });
        const savedCodeField = 'savedCodeMap.' + challengeId;
        const saved = await User.updateOne({ _id: userId }, { $set: { [savedCodeField]: files } }, { session });
        if (saved.matchedCount === 0) throw new Error('Usuário não encontrado durante a conclusão.');

        // Optional staged dual-write. Keep it disabled at the route until the
        // unique (userId, lessonId, kind) index is verified in staging.
        if (LearningArtifact) {
          const artifact = await LearningArtifact.findOneAndUpdate(
            { userId, lessonId: challengeId, kind: 'saved_code' },
            {
              $set: { files, updatedAt: new Date() },
              $inc: { revision: 1 },
              $setOnInsert: { createdAt: new Date() }
            },
            {
              upsert: true,
              new: true,
              runValidators: true,
              setDefaultsOnInsert: true,
              session
            }
          );
          if (!artifact) throw new Error('Não foi possível persistir o código enviado.');
        }

        await User.findOneAndUpdate(
          { _id: userId, completedIds: { $ne: challengeId } },
          { $addToSet: { completedIds: challengeId }, $inc: { xp: 50 } },
          { new: true, session }
        );
        await User.updateOne(
          { _id: userId, lastActiveDate: { $ne: today } },
          buildDailyActivityUpdate(today),
          { session }
        );
        updatedUser = await User.findById(userId).session(session);
        if (!updatedUser) throw new Error('Usuário não encontrado após salvar a conclusão.');
      });
    } catch (error) {
      // A proof is deterministic for the same user, lesson, and files. If the
      // first transaction committed but its HTTP response was lost, the retry
      // must return the already-persisted result instead of looking like failure.
      if (error?.code !== REPLAY_CODE) throw error;
      const existingUser = await User.findById(userId);
      if (!existingUser || !Array.isArray(existingUser.completedIds) ||
          !existingUser.completedIds.includes(challengeId)) throw error;
      updatedUser = existingUser;
    }
    return updatedUser;
  } finally {
    await session.endSession();
  }
}
module.exports = { completeLessonAtomically, REPLAY_CODE };
