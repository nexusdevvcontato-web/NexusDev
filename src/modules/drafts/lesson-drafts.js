'use strict';

const MAX_FILES = 10;
const MAX_FILE_BYTES = 50 * 1024;
// Keep the full JSON body comfortably below the API-wide 100 KB parser limit.
const MAX_TOTAL_BYTES = 40 * 1024;
const MAX_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

function validateDraftFiles(files) {
  if (!files || typeof files !== 'object' || Array.isArray(files) ||
      Object.getPrototypeOf(files) !== Object.prototype) {
    return { ok: false, error: 'Os arquivos do rascunho são inválidos.' };
  }
  const names = Object.keys(files);
  if (names.length < 1 || names.length > MAX_FILES) {
    return { ok: false, error: 'Quantidade de arquivos fora do limite.' };
  }
  let totalBytes = 0;
  const normalized = {};
  for (const name of names) {
    const source = files[name];
    if (!MAX_FILE_NAME.test(name) || name.includes('..') ||
        typeof source !== 'string' || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(source)) {
      return { ok: false, error: 'Nome ou conteúdo de arquivo inválido.' };
    }
    const bytes = Buffer.byteLength(source, 'utf8');
    if (bytes > MAX_FILE_BYTES) return { ok: false, error: 'Um arquivo excede 50 KB.' };
    totalBytes += bytes;
    if (totalBytes > MAX_TOTAL_BYTES) return { ok: false, error: 'O rascunho excede 80 KB.' };
    normalized[name] = source;
  }
  return { ok: true, files: normalized };
}

function normalizeRevision(value) {
  return Number.isSafeInteger(value) && value >= 0 && value < Number.MAX_SAFE_INTEGER
    ? value : null;
}

function createLessonDraftService({ User, now = () => new Date() } = {}) {
  if (!User || typeof User.findOneAndUpdate !== 'function' || typeof User.findById !== 'function') {
    throw new TypeError('Dependências de rascunho inválidas.');
  }

  async function read(userId, challengeId) {
    const user = await User.findById(userId).lean();
    const draft = user?.savedDraftMap?.[challengeId];
    if (!draft) return { revision: 0, files: null, updatedAt: null };
    if (!Number.isSafeInteger(draft.revision) || draft.revision < 1 ||
        draft.revision >= Number.MAX_SAFE_INTEGER || !validateDraftFiles(draft.files).ok) {
      // Do not turn malformed persisted data into revision zero: that could
      // make a client repeatedly attempt an overwrite against an invalid record.
      throw new Error('Stored lesson draft is malformed.');
    }
    return { revision: draft.revision, files: draft.files, updatedAt: draft.updatedAt || null };
  }

  async function save({ userId, challengeId, files, expectedRevision }) {
    const revision = normalizeRevision(expectedRevision);
    if (revision === null) return { ok: false, reason: 'invalid_revision' };
    const path = `savedDraftMap.${challengeId}`;
    const nextDraft = { files, revision: revision + 1, updatedAt: now() };
    const revisionPath = `${path}.revision`;
    const filter = revision === 0
      ? { _id: userId, $or: [{ [revisionPath]: 0 }, { [revisionPath]: { $exists: false } }] }
      : { _id: userId, [revisionPath]: revision };
    const updated = await User.findOneAndUpdate(
      filter,
      { $set: { [path]: nextDraft } },
      { new: true, projection: { _id: 1 } }
    );
    if (updated) return { ok: true, draft: nextDraft };
    return { ok: false, reason: 'conflict', draft: await read(userId, challengeId) };
  }

  return { read, save };
}

module.exports = {
  MAX_FILES, MAX_FILE_BYTES, MAX_TOTAL_BYTES,
  validateDraftFiles, normalizeRevision, createLessonDraftService
};
