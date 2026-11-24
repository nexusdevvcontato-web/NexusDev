const { validateDraftFiles } = require('../drafts/lesson-drafts');

const EXPORT_FIELDS = Object.freeze([
  'id', 'name', 'email', 'avatar', 'role',
  'xp', 'streak', 'lastActiveDate', 'completedIds', 'savedCodeMap', 'savedDraftMap',
  'certificateCode', 'certificateIssuedAt', 'certificateStudentName', 'certificateCompletedCount', 'certificateXp', 'certificateGithubUrl', 'certificateLiveUrl', 'githubUrl', 'liveUrl', 'privacyPreferences',
  'createdAt', 'updatedAt'
]);

function cloneLegacyMap(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
}

function buildUserExportProfile(user) {
  if (!user || typeof user !== 'object') throw new TypeError('User data is required');
  const source = typeof user.toObject === 'function' ? user.toObject() : user;
  const result = {};
  for (const field of EXPORT_FIELDS) {
    if (field === 'id') {
      const id = source._id ?? source.id;
      if (id !== undefined && id !== null) result.id = String(id);
    } else if (field === 'savedDraftMap' || field === 'savedCodeMap') {
      if (source[field] !== undefined) result[field] = cloneLegacyMap(source[field]);
    } else if (source[field] !== undefined) {
      result[field] = source[field];
    }
  }
  return { schemaVersion: 2, exportedAt: new Date().toISOString(), data: result };
}

function buildLearningArtifactExport(artifact) {
  if (!artifact || typeof artifact !== 'object' ||
      typeof artifact.lessonId !== 'string' ||
      !['draft', 'saved_code'].includes(artifact.kind) ||
      !Number.isSafeInteger(artifact.revision) || artifact.revision < 1 ||
      !validateDraftFiles(artifact.files).ok) {
    throw new TypeError('Invalid learning artifact export');
  }
  return {
    lessonId: artifact.lessonId,
    kind: artifact.kind,
    value: artifact.kind === 'draft'
      ? {
          files: artifact.files,
          revision: artifact.revision,
          ...(artifact.updatedAt !== undefined ? { updatedAt: artifact.updatedAt } : {})
        }
      : artifact.files
  };
}

function buildCommentExport(comments) {
  if (!Array.isArray(comments)) throw new TypeError('Comments must be an array');
  return comments.map((comment) => {
    if (!comment || typeof comment !== 'object') throw new TypeError('Invalid comment');
    const id = comment._id ?? comment.id;
    const result = {};
    if (id !== undefined && id !== null) result.id = String(id);
    for (const field of ['lessonId', 'author', 'badge', 'text', 'createdAt', 'updatedAt']) {
      if (comment[field] !== undefined) result[field] = comment[field];
    }
    return result;
  });
}

function buildSessionExport(sessions) {
  if (!Array.isArray(sessions)) throw new TypeError('Sessions must be an array');
  return sessions.map((session) => {
    if (!session || typeof session !== 'object') throw new TypeError('Invalid session');
    const result = {};
    const id = session._id ?? session.id;
    if (id !== undefined && id !== null) result.id = String(id);
    for (const field of ['createdAt', 'lastUsedAt', 'expiresAt', 'revokedAt', 'revokeReason']) {
      if (session[field] !== undefined) result[field] = session[field];
    }
    return result;
  });
}

function buildUserDataExport(user, comments = [], sessions = [], artifacts = []) {
  if (!Array.isArray(artifacts)) throw new TypeError('Artifacts must be an array');
  const snapshot = buildUserExportProfile(user);
  const savedDraftMap = cloneLegacyMap(snapshot.data.savedDraftMap);
  const savedCodeMap = cloneLegacyMap(snapshot.data.savedCodeMap);
  for (const artifact of artifacts) {
    const safeArtifact = buildLearningArtifactExport(artifact);
    if (safeArtifact.kind === 'draft') savedDraftMap[safeArtifact.lessonId] = safeArtifact.value;
    else savedCodeMap[safeArtifact.lessonId] = safeArtifact.value;
  }
  if (Object.keys(savedDraftMap).length || Object.hasOwn(snapshot.data, 'savedDraftMap')) {
    snapshot.data.savedDraftMap = savedDraftMap;
  }
  if (Object.keys(savedCodeMap).length || Object.hasOwn(snapshot.data, 'savedCodeMap')) {
    snapshot.data.savedCodeMap = savedCodeMap;
  }
  return {
    ...snapshot,
    data: snapshot.data,
    comments: buildCommentExport(comments),
    sessions: buildSessionExport(sessions)
  };
}

module.exports = {
  buildUserDataExport,
  buildUserExportProfile,
  buildLearningArtifactExport,
  buildCommentExport,
  buildSessionExport
};
