const EXPORT_FIELDS = Object.freeze([
  'id', 'name', 'email', 'avatar', 'role',
  'xp', 'streak', 'lastActiveDate', 'completedIds', 'savedCodeMap',
  'certificateCode', 'certificateIssuedAt', 'githubUrl', 'liveUrl',
  'createdAt', 'updatedAt'
]);

function buildUserDataExport(user) {
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
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    data: result
  };
}

module.exports = { buildUserDataExport };
