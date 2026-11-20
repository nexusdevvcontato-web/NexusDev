const EXPORT_FIELDS = Object.freeze([
  'id', 'name', 'email', 'avatar', 'role',
  'xp', 'streak', 'lastActiveDate', 'completedIds', 'savedCodeMap',
  'certificateCode', 'certificateIssuedAt', 'githubUrl', 'liveUrl', 'privacyPreferences',
  'createdAt', 'updatedAt'
]);

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

function buildUserDataExport(user, comments = []) {
  if (!user || typeof user !== 'object') throw new TypeError('User data is required');
  const source = typeof user.toObject === 'function' ? user.toObject() : user;
  const result = {};
  for (const field of EXPORT_FIELDS) {
    if (field === 'id') {
      const id = source._id ?? source.id;
      if (id !== undefined && id !== null) result.id = String(id);
    } else if (source[field] !== undefined) {
      result[field] = source[field];
    }
  }
  return {
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    data: result,
    comments: buildCommentExport(comments)
  };
}

module.exports = { buildUserDataExport, buildCommentExport };
