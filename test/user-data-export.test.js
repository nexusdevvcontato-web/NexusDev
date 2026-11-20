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
    certificateCode: 'NXD-2026-ANA-700-ABCDEF0123456789ABCD',
    passwordHash: 'never-export',
    googleId: 'private-google-sub',
    internalSecret: 'never-export',
    __v: 4
  });

  assert.equal(result.schemaVersion, 1);
  assert.equal(result.data.id, 'user-123');
  assert.equal(result.data.email, 'ana@example.com');
  assert.deepEqual(result.data.completedIds, ['html-00-o-que-e-web']);
  assert.equal('passwordHash' in result.data, false);
  assert.equal('googleId' in result.data, false);
  assert.equal('internalSecret' in result.data, false);
  assert.equal('__v' in result.data, false);
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
});

test('rejects missing user data', () => {
  assert.throws(() => buildUserDataExport(null), /User data is required/);
});
