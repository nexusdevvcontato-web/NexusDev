'use strict';

const { validateDraftFiles, normalizeRevision } = require('./lesson-drafts');

const ARTIFACT_KINDS = Object.freeze(['draft', 'saved_code']);
const LESSON_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,119}$/;

function normalizeArtifactKind(value) {
  return ARTIFACT_KINDS.includes(value) ? value : null;
}


function planLegacyLearningArtifactMigration({
  userId,
  savedDraftMap = {},
  savedCodeMap = {},
  isKnownLessonId
} = {}) {
  if (userId === undefined || userId === null || userId === '' ||
      typeof isKnownLessonId !== 'function') {
    throw new TypeError('Proprietário e validador de currículo são obrigatórios.');
  }

  const records = [];
  const rejected = [];
  const isPlainRecord = value => value && typeof value === 'object' &&
    !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

  function accept(lessonId, kind, files, revision, updatedAt = null) {
    if (typeof lessonId !== 'string' || !LESSON_ID_PATTERN.test(lessonId) ||
        !isKnownLessonId(lessonId)) {
      rejected.push({ lessonId: String(lessonId), kind, reason: 'unknown_lesson' });
      return;
    }
    const validation = validateDraftFiles(files);
    if (!validation.ok) {
      rejected.push({ lessonId, kind, reason: 'invalid_files' });
      return;
    }
    if (!Number.isSafeInteger(revision) || revision < 1 ||
        revision >= Number.MAX_SAFE_INTEGER) {
      rejected.push({ lessonId, kind, reason: 'invalid_revision' });
      return;
    }
    records.push({
      userId,
      lessonId,
      kind,
      files: validation.files,
      revision,
      updatedAt: updatedAt instanceof Date && Number.isFinite(updatedAt.getTime())
        ? updatedAt : null
    });
  }

  if (!isPlainRecord(savedDraftMap)) {
    rejected.push({ lessonId: '*', kind: 'draft', reason: 'invalid_legacy_map' });
  } else {
    for (const [lessonId, draft] of Object.entries(savedDraftMap)) {
      if (!isPlainRecord(draft)) {
        rejected.push({ lessonId, kind: 'draft', reason: 'invalid_legacy_record' });
        continue;
      }
      accept(lessonId, 'draft', draft.files, draft.revision, draft.updatedAt);
    }
  }

  if (!isPlainRecord(savedCodeMap)) {
    rejected.push({ lessonId: '*', kind: 'saved_code', reason: 'invalid_legacy_map' });
  } else {
    for (const [lessonId, files] of Object.entries(savedCodeMap)) {
      // Legacy completion stores only the submitted file map, with no revision.
      accept(lessonId, 'saved_code', files, 1, null);
    }
  }

  return {
    records,
    rejected,
    summary: {
      planned: records.length,
      rejected: rejected.length,
      drafts: records.filter(item => item.kind === 'draft').length,
      savedCode: records.filter(item => item.kind === 'saved_code').length
    }
  };
}

function createLearningArtifactModel(mongoose, connection = mongoose && (mongoose.connection || mongoose)) {
  if (!mongoose || !mongoose.Schema || !connection || typeof connection.model !== 'function') {
    throw new TypeError('Dependências Mongoose inválidas.');
  }
  const { Schema } = mongoose;
  const schema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    lessonId: { type: String, required: true, match: LESSON_ID_PATTERN },
    kind: { type: String, required: true, enum: ARTIFACT_KINDS },
    files: {
      type: Schema.Types.Mixed,
      required: true,
      validate: {
        validator(value) { return validateDraftFiles(value).ok; },
        message: 'Arquivos de artefato inválidos.'
      }
    },
    revision: {
      type: Number, required: true, min: 1,
      validate: Number.isSafeInteger
    }
  }, { timestamps: true, versionKey: false, strict: 'throw' });

  schema.index({ userId: 1, lessonId: 1, kind: 1 }, { unique: true, name: 'uniq_user_lesson_artifact_kind' });
  schema.index({ userId: 1, updatedAt: -1 }, { name: 'user_artifacts_updated' });

  return connection.models.LearningArtifact ||
    connection.model('LearningArtifact', schema, 'learning_artifacts');
}

function createLearningArtifactService({ LearningArtifact, now = () => new Date() } = {}) {
  if (!LearningArtifact ||
      typeof LearningArtifact.findOne !== 'function' ||
      typeof LearningArtifact.find !== 'function' ||
      typeof LearningArtifact.findOneAndUpdate !== 'function') {
    throw new TypeError('Modelo de artefatos inválido.');
  }

  function validateIdentity(userId, lessonId, kind) {
    if (userId === undefined || userId === null || userId === '' ||
        typeof lessonId !== 'string' || !LESSON_ID_PATTERN.test(lessonId) ||
        !normalizeArtifactKind(kind)) {
      return false;
    }
    return true;
  }

  function shape(record) {
    if (!record) return { revision: 0, files: null, updatedAt: null };
    const files = record.files instanceof Map
      ? Object.fromEntries(record.files.entries())
      : record.files;
    if (!Number.isSafeInteger(record.revision) || record.revision < 1 ||
        !validateDraftFiles(files).ok) {
      throw new Error('Stored learning artifact is malformed.');
    }
    return { revision: record.revision, files, updatedAt: record.updatedAt || null };
  }

  async function read({ userId, lessonId, kind = 'draft' }) {
    if (!validateIdentity(userId, lessonId, kind)) throw new TypeError('Identidade do artefato inválida.');
    const record = await LearningArtifact.findOne({ userId, lessonId, kind })
      .select('files revision updatedAt')
      .lean();
    return shape(record);
  }

  async function save({ userId, lessonId, kind = 'draft', files, expectedRevision }) {
    if (!validateIdentity(userId, lessonId, kind)) return { ok: false, reason: 'invalid_identity' };
    const revision = normalizeRevision(expectedRevision);
    if (revision === null) return { ok: false, reason: 'invalid_revision' };
    const validation = validateDraftFiles(files);
    if (!validation.ok) return { ok: false, reason: 'invalid_files', error: validation.error };

    const filter = { userId, lessonId, kind };
    const next = { files: validation.files, revision: revision + 1, updatedAt: now() };
    try {
      let updated;
      if (revision === 0) {
        updated = await LearningArtifact.findOneAndUpdate(
          { ...filter, revision: { $exists: false } },
          { $set: next, $setOnInsert: { createdAt: now() } },
          { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
        );
      } else {
        updated = await LearningArtifact.findOneAndUpdate(
          { ...filter, revision },
          { $set: next },
          { new: true, runValidators: true }
        );
      }
      if (updated) return { ok: true, artifact: next };
    } catch (error) {
      // Two first writers may race on the unique owner/lesson/kind key.
      // The loser observes the committed record as a conflict, not as a 500.
      if (error?.code !== 11000) throw error;
    }
    return {
      ok: false,
      reason: 'conflict',
      artifact: await read({ userId, lessonId, kind })
    };
  }

  async function listForUser(userId) {
    if (userId === undefined || userId === null || userId === '') {
      throw new TypeError('Proprietário do artefato inválido.');
    }
    const records = await LearningArtifact.find({ userId })
      .select('lessonId kind files revision createdAt updatedAt')
      .sort({ updatedAt: -1, _id: 1 })
      .lean();
    return records.map(record => ({
      lessonId: record.lessonId,
      kind: record.kind,
      ...shape(record),
      createdAt: record.createdAt || null
    }));
  }

  return { read, save, listForUser };
}

module.exports = {
  ARTIFACT_KINDS,
  LESSON_ID_PATTERN,
  normalizeArtifactKind,
  createLearningArtifactModel,
  createLearningArtifactService,
  planLegacyLearningArtifactMigration
};
