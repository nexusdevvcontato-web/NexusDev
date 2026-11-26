const test = require('node:test');
const assert = require('node:assert/strict');
const { buildUserDataExport, buildUserExportProfile } = require('../src/modules/privacy/user-export');

test('builds a privacy export profile without materializing legacy maps', () => {
  const result = buildUserExportProfile({
    _id: 'user-789',
    name: 'Caio',
    savedDraftMap: { lesson: { files: { 'index.html': '<p>legacy</p>' } } },
    savedCodeMap: { lesson: { 'index.html': '<h1>legacy</h1>' } }
  }, { includeLegacyMaps: false });
  assert.equal(result.data.id, 'user-789');
  assert.equal(result.data.name, 'Caio');
  assert.equal(Object.hasOwn(result.data, 'savedDraftMap'), false);
  assert.equal(Object.hasOwn(result.data, 'savedCodeMap'), false);
});

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
    certificateStudentName: 'Ana Silva',
    certificateCompletedCount: 26,
    certificateXp: 520,
    certificateGithubUrl: 'https://github.com/ana',
    certificateLiveUrl: 'https://ana.example.test',
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
  assert.equal(result.data.certificateStudentName, 'Ana Silva');
  assert.equal(result.data.certificateCompletedCount, 26);
  assert.equal(result.data.certificateXp, 520);
  assert.equal(result.data.certificateGithubUrl, 'https://github.com/ana');
  assert.equal(result.data.certificateLiveUrl, 'https://ana.example.test');
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


test('exports the complete user profile, learning, draft and certificate snapshot allowlist', () => {
  const result = buildUserDataExport({
    _id: 'user-complete',
    name: 'Synthetic Student',
    email: 'synthetic@example.test',
    avatar: 'https://cdn.example.test/avatar.png',
    role: 'student',
    xp: 700,
    streak: 12,
    lastActiveDate: '2026-11-22',
    completedIds: ['html-00-o-que-e-web'],
    savedCodeMap: { 'html-00-o-que-e-web': { 'index.html': '<h1>Test</h1>' } },
    savedDraftMap: { 'html-00-o-que-e-web': { files: { 'index.html': '<p>Draft</p>' }, revision: 3 } },
    certificateCode: 'NXD-SYNTHETIC-CERTIFICATE',
    certificateIssuedAt: '2026-11-22T00:00:00.000Z',
    certificateStudentName: 'Synthetic Student',
    certificateCompletedCount: 700,
    certificateXp: 7000,
    certificateGithubUrl: 'https://github.com/synthetic',
    certificateLiveUrl: 'https://synthetic.example.test',
    githubUrl: 'https://github.com/synthetic',
    liveUrl: 'https://synthetic.example.test',
    privacyPreferences: { showInLeaderboard: false, showCertificateDetails: false },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-11-22T00:00:00.000Z',
    passwordHash: 'not-exported',
    passwordResetTokenHash: 'not-exported',
    passwordResetExpiresAt: 'not-exported',
    passwordChangedAt: 'not-exported',
    authVersion: 99,
    googleId: 'not-exported',
    reauthProofHash: 'not-exported',
    reauthProofExpiresAt: 'not-exported',
    __v: 99,
    internalSecret: 'not-exported'
  });

  assert.deepEqual(Object.keys(result.data).sort(), [
    'id', 'name', 'email', 'avatar', 'role', 'xp', 'streak', 'lastActiveDate',
    'completedIds', 'savedCodeMap', 'savedDraftMap', 'certificateCode',
    'certificateIssuedAt', 'certificateStudentName', 'certificateCompletedCount',
    'certificateXp', 'certificateGithubUrl', 'certificateLiveUrl', 'githubUrl',
    'liveUrl', 'privacyPreferences', 'createdAt', 'updatedAt'
  ].sort());
  assert.deepEqual(result.data.savedDraftMap, {
    'html-00-o-que-e-web': { files: { 'index.html': '<p>Draft</p>' }, revision: 3 }
  });
  for (const field of [
    'passwordHash', 'passwordResetTokenHash', 'passwordResetExpiresAt',
    'passwordChangedAt', 'authVersion', 'googleId', 'reauthProofHash',
    'reauthProofExpiresAt', '__v', 'internalSecret'
  ]) {
    assert.equal(Object.hasOwn(result.data, field), false, field);
  }
});


test('exports owner-scoped learning artifacts in the established legacy-compatible shape', () => {
  const result = buildUserDataExport({
    _id: 'synthetic-owner',
    savedDraftMap: {
      'mod-1-aula-1': { files: { 'index.html': 'legacy draft' }, revision: 2 }
    },
    savedCodeMap: {
      'mod-1-aula-2': { 'index.html': 'legacy code' }
    }
  }, [], [], [
    {
      lessonId: 'mod-1-aula-1', kind: 'draft', revision: 5,
      files: { 'index.html': 'new-store draft' },
      updatedAt: '2026-11-22T00:00:00.000Z'
    },
    {
      lessonId: 'mod-1-aula-3', kind: 'saved_code', revision: 1,
      files: { 'index.html': 'new-store submitted code' }
    }
  ]);

  assert.deepEqual(result.data.savedDraftMap, {
    'mod-1-aula-1': {
      files: { 'index.html': 'new-store draft' },
      revision: 5,
      updatedAt: '2026-11-22T00:00:00.000Z'
    }
  });
  assert.deepEqual(result.data.savedCodeMap, {
    'mod-1-aula-2': { 'index.html': 'legacy code' },
    'mod-1-aula-3': { 'index.html': 'new-store submitted code' }
  });
});

test('rejects malformed learning artifact export input', () => {
  assert.throws(() => buildUserDataExport({ _id: 'owner' }, [], [], {}), /Artifacts must be an array/);
  assert.throws(() => buildUserDataExport({ _id: 'owner' }, [], [], [{
    lessonId: 'mod-1-aula-1', kind: 'draft', revision: 1, files: []
  }]), /Invalid learning artifact/);
});


test('preserves legacy drafts and code while new artifacts override only matching lessons', () => {
  const legacyDraft = {
    files: { 'index.html': '<p>legacy draft</p>' },
    revision: 2
  };
  const legacyCode = { 'index.html': '<p>legacy code</p>' };
  const result = buildUserDataExport({
    _id: 'synthetic-owner-a',
    savedDraftMap: {
      'html-00-o-que-e-web': legacyDraft,
      'css-01-seletores': { files: { 'index.html': '<p>keep draft</p>' }, revision: 1 }
    },
    savedCodeMap: {
      'html-00-o-que-e-web': legacyCode,
      'css-01-seletores': { 'index.html': '<p>keep code</p>' }
    }
  }, [], [], [
    {
      lessonId: 'html-00-o-que-e-web',
      kind: 'draft',
      revision: 7,
      files: { 'index.html': '<p>new draft</p>' },
      updatedAt: new Date('2026-11-23T12:00:00.000Z')
    },
    {
      lessonId: 'html-00-o-que-e-web',
      kind: 'saved_code',
      revision: 1,
      files: { 'index.html': '<p>new submitted code</p>' }
    }
  ]);

  assert.deepEqual(result.data.savedDraftMap, {
    'html-00-o-que-e-web': {
      files: { 'index.html': '<p>new draft</p>' },
      revision: 7,
      updatedAt: new Date('2026-11-23T12:00:00.000Z')
    },
    'css-01-seletores': { files: { 'index.html': '<p>keep draft</p>' }, revision: 1 }
  });
  assert.deepEqual(result.data.savedCodeMap, {
    'html-00-o-que-e-web': { 'index.html': '<p>new submitted code</p>' },
    'css-01-seletores': { 'index.html': '<p>keep code</p>' }
  });
});

test('serializes the version 2 export as valid JSON without losing legacy-compatible maps', () => {
  const result = buildUserDataExport({
    _id: 'synthetic-owner-json',
    savedDraftMap: {
      'html-00-o-que-e-web': {
        files: { 'index.html': '<h1>Rascunho</h1>' },
        revision: 3
      }
    },
    savedCodeMap: {
      'html-00-o-que-e-web': { 'index.html': '<h1>Enviado</h1>' }
    }
  }, [
    { _id: 'comment-json', lessonId: 'html-00-o-que-e-web', author: 'Synthetic', text: 'Comentário' }
  ], [
    { _id: 'session-json', revokeReason: null }
  ]);

  const serialized = JSON.stringify(result);
  const parsed = JSON.parse(serialized);
  assert.equal(parsed.schemaVersion, 2);
  assert.equal(parsed.data.id, 'synthetic-owner-json');
  assert.deepEqual(parsed.data.savedDraftMap, result.data.savedDraftMap);
  assert.deepEqual(parsed.data.savedCodeMap, result.data.savedCodeMap);
  assert.deepEqual(parsed.comments, [{ id: 'comment-json', lessonId: 'html-00-o-que-e-web', author: 'Synthetic', text: 'Comentário' }]);
  assert.deepEqual(parsed.sessions, [{ id: 'session-json', revokeReason: null }]);
  assert.equal(typeof parsed.exportedAt, 'string');
});
