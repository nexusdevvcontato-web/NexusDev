const test = require('node:test');
const assert = require('node:assert/strict');
const { buildUserDataExport } = require('../src/modules/privacy/user-export');

test('exports the authenticated user data using an explicit allowlist', () => {
  const result = buildUserDataExport({
    _id: 'user-123',
    name: 'Ana',
    email: 'ana@example.com',
    role: 'student',
    xp: 100,
    completedIds: ['html-00-o-que-e-web'],
    savedCodeMap: { 'html-00-o-que-e-web': { 'index.html': '<h1>Oi</h1>' } },
    privacyPreferences: { showInLeaderboard: false, showCertificateDetails: true },
    certificateCode: 'NXD-2026-ANA-700-ABCDEF0123456789ABCD',
    passwordHash: 'never-export',
    googleId: 'private-google-sub',
    internalSecret: 'never-export',
    __v: 4
  }, [{ _id: 'comment-1', lessonId: 'html-00-o-que-e-web', author: 'Ana', badge: 'Aluno NexusDev', text: 'Meu comentário', createdAt: '2026-01-01', authorUserId: 'user-123', internalSecret: 'never-export' }]);

  assert.equal(result.schemaVersion, 2);
  assert.equal(result.data.id, 'user-123');
  assert.equal(result.data.email, 'ana@example.com');
  assert.deepEqual(result.data.completedIds, ['html-00-o-que-e-web']);
  assert.deepEqual(result.data.privacyPreferences, { showInLeaderboard: false, showCertificateDetails: true });
  assert.equal('passwordHash' in result.data, false);
  assert.equal('googleId' in result.data, false);
  assert.equal('internalSecret' in result.data, false);
  assert.equal('__v' in result.data, false);
  assert.deepEqual(result.comments, [{ id: 'comment-1', lessonId: 'html-00-o-que-e-web', author: 'Ana', badge: 'Aluno NexusDev', text: 'Meu comentário', createdAt: '2026-01-01' }]);
  assert.equal('authorUserId' in result.comments[0], false);
  assert.equal('internalSecret' in result.comments[0], false);
});

test('supports Mongoose-like documents without exporting private fields', () => {
  const result = buildUserDataExport({
    toObject() {
      return { _id: 'user-456', name: 'Bia', passwordHash: 'secret', googleId: 'sub' };
    }
  });
  assert.equal(result.data.id, 'user-456');
  assert.equal(result.data.name, 'Bia');
  assert.equal('passwordHash' in result.data, false);
  assert.equal('googleId' in result.data, false);
  assert.deepEqual(result.comments, []);
});

test('rejects missing user data', () => {
  assert.throws(() => buildUserDataExport(null), /User data is required/);
});

test('exports only the comments supplied by the authenticated owner query', () => {
  const ownComments = [
    { _id: 'own-1', lessonId: 'html-00-o-que-e-web', text: 'Meu', authorUserId: 'user-1' }
  ];
  const result = buildUserDataExport({ _id: 'user-1' }, ownComments);
  assert.equal(result.comments.length, 1);
  assert.equal(result.comments[0].id, 'own-1');
  assert.equal(result.comments[0].text, 'Meu');
  assert.equal('authorUserId' in result.comments[0], false);
});

test('rejects malformed comment export input', () => {
  assert.throws(() => buildUserDataExport({ _id: 'user-1' }, {}), /Comments must be an array/);
  assert.throws(() => buildUserDataExport({ _id: 'user-1' }, [null]), /Invalid comment/);
});


test('exports only safe session metadata and never exports token hashes or CSRF secrets', () => {
  const result = buildUserDataExport({ _id: 'user-1' }, [], [{
    _id: 'session-1', createdAt: '2026-11-01', lastUsedAt: '2026-11-20',
    expiresAt: '2026-12-01', revokedAt: null, revokeReason: null,
    csrfTokenHash: 'secret-hash', tokenHash: 'refresh-secret', internalSecret: 'no'
  }]);
  assert.deepEqual(result.sessions, [{
    id: 'session-1', createdAt: '2026-11-01', lastUsedAt: '2026-11-20',
    expiresAt: '2026-12-01', revokedAt: null, revokeReason: null
  }]);
});

test('rejects malformed session export input', () => {
  assert.throws(() => buildUserDataExport({ _id: 'user-1' }, [], {}), /Sessions must be an array/);
  assert.throws(() => buildUserDataExport({ _id: 'user-1' }, [], [null]), /Invalid session/);
});
