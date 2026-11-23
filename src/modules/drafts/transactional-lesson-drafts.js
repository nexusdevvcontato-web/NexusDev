'use strict';

const {
  validateDraftFiles,
  normalizeRevision
} = require('./lesson-drafts');

function emptyDraft() {
  return { revision: 0, files: null, updatedAt: null };
}

function shapeStoredDraft(draft) {
  if (!draft) return emptyDraft();
  const validation = validateDraftFiles(draft.files);
  if (!Number.isSafeInteger(draft.revision) || draft.revision < 1 ||
      draft.revision >= Number.MAX_SAFE_INTEGER || !validation.ok) {
    throw new Error('Stored lesson draft is malformed.');
  }
  return {
    revision: draft.revision,
    files: validation.files,
    updatedAt: draft.updatedAt || null
  };
}

function createTransactionalLessonDraftService({
  mongoose,
  User,
  LearningArtifact,
  now = () => new Date()
} = {}) {
  if (!mongoose || typeof mongoose.startSession !== 'function' ||
      !User || typeof User.findById !== 'function' ||
      typeof User.findOneAndUpdate !== 'function' ||
      !LearningArtifact || typeof LearningArtifact.findOne !== 'function' ||
      typeof LearningArtifact.findOneAndUpdate !== 'function') {
    throw new TypeError('Dependências transacionais de rascunho inválidas.');
  }

  function legacyQuery(userId, lessonId, session) {
    const path = `savedDraftMap.${lessonId}`;
    return User.findById(userId, { [path]: 1 })
      .session(session)
      .lean();
  }

  async function readLegacy(userId, lessonId) {
    const path = `savedDraftMap.${lessonId}`;
    const user = await User.findById(userId, { [path]: 1 }).lean();
    return shapeStoredDraft(user?.savedDraftMap?.[lessonId]);
  }

  async function readArtifact(userId, lessonId, session) {
    let query = LearningArtifact.findOne({ userId, lessonId, kind: 'draft' })
      .select('files revision updatedAt');
    if (session) query = query.session(session);
    return query.lean();
  }

  async function read(userId, lessonId) {
    const artifact = await readArtifact(userId, lessonId);
    if (artifact) return shapeStoredDraft(artifact);
    return readLegacy(userId, lessonId);
  }

  async function save({ userId, challengeId, files, expectedRevision }) {
    const revision = normalizeRevision(expectedRevision);
    if (revision === null) return { ok: false, reason: 'invalid_revision' };
    const validation = validateDraftFiles(files);
    if (!validation.ok) return { ok: false, reason: 'invalid_files', error: validation.error };
    if (typeof challengeId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,119}$/.test(challengeId) ||
        userId === undefined || userId === null || userId === '') {
      return { ok: false, reason: 'invalid_identity' };
    }

    const session = await mongoose.startSession();
    let outcome = null;
    try {
      await session.withTransaction(async () => {
        // MongoDB transactions serialize the legacy CAS and new-store write.
        // The legacy document remains mirrored for old application versions.
        const legacyUser = await legacyQuery(userId, challengeId, session);
        const legacyDraft = legacyUser?.savedDraftMap?.[challengeId];
        const legacy = shapeStoredDraft(legacyDraft);
        const artifact = await readArtifact(userId, challengeId, session);
        const current = artifact ? shapeStoredDraft(artifact) : legacy;

        if (current.revision !== revision) {
          outcome = { ok: false, reason: 'conflict' };
          return;
        }

        const timestamp = now();
        const nextDraft = {
          files: validation.files,
          revision: revision + 1,
          updatedAt: timestamp
        };
        const legacyPath = `savedDraftMap.${challengeId}`;
        const legacyRevisionPath = `${legacyPath}.revision`;
        const legacyFilter = legacy.revision === 0
          ? { _id: userId, $or: [
              { [legacyRevisionPath]: 0 },
              { [legacyRevisionPath]: { $exists: false } }
            ] }
          : { _id: userId, [legacyRevisionPath]: legacy.revision };

        const legacyUpdated = await User.findOneAndUpdate(
          legacyFilter,
          { $set: { [legacyPath]: nextDraft } },
          { new: true, projection: { _id: 1 }, session }
        );
        if (!legacyUpdated) {
          outcome = { ok: false, reason: 'conflict' };
          return;
        }

        const artifactFilter = {
          userId,
          lessonId: challengeId,
          kind: 'draft',
          ...(artifact ? { revision } : { revision: { $exists: false } })
        };
        const artifactUpdated = await LearningArtifact.findOneAndUpdate(
          artifactFilter,
          {
            $set: nextDraft,
            $setOnInsert: { createdAt: timestamp }
          },
          {
            upsert: !artifact,
            new: true,
            runValidators: true,
            setDefaultsOnInsert: true,
            session
          }
        );
        if (!artifactUpdated) {
          // Abort the transaction so the legacy mirror cannot commit alone.
          const conflict = new Error('Learning artifact revision conflict.');
          conflict.code = 'DRAFT_CONFLICT';
          throw conflict;
        }

        outcome = { ok: true, draft: nextDraft };
      });
    } catch (error) {
      // A simultaneous first insert can race on the required unique key.
      // Never hide other transaction failures.
      if (error?.code !== 11000 && error?.code !== 'DRAFT_CONFLICT') throw error;
      outcome = { ok: false, reason: 'conflict' };
    } finally {
      await session.endSession();
    }

    if (outcome?.ok) return outcome;
    return {
      ok: false,
      reason: 'conflict',
      draft: await read(userId, challengeId)
    };
  }

  return { read, save };
}

module.exports = { createTransactionalLessonDraftService };
