const test = require('node:test');
const assert = require('node:assert/strict');
const { lookupPublicCertificate } = require('../src/modules/certificates/lookup');

function modelWith(results) {
  const calls = [];
  return {
    calls,
    findOne(filter) {
      calls.push({ filter, projection: null });
      const call = calls[calls.length - 1];
      return {
        select(projection) { call.projection = projection; return this; },
        async lean() { return results.shift() ?? null; }
      };
    }
  };
}

test('unknown or not-yet-issued codes are never reported as valid', async () => {
  for (const first of [null, { _id: 'u1', certificateCode: 'NXD-X', certificateIssuedAt: null }]) {
    const User = modelWith([first]);
    const result = await lookupPublicCertificate(User, 'NXD-X');
    assert.equal(result.status, 404);
    assert.equal(result.body.valid, false);
    assert.equal(User.calls.length, 1);
    assert.match(User.calls[0].projection, /certificateIssuedAt/);
    assert.doesNotMatch(User.calls[0].projection, /name|completedIds|xp|githubUrl/);
  }
});

test('private certificate returns only validity and opaque code without loading profile details', async () => {
  const User = modelWith([{ _id: 'u1', certificateCode: 'NXD-X', certificateIssuedAt: new Date(), privacyPreferences: { showCertificateDetails: false } }]);
  const result = await lookupPublicCertificate(User, 'NXD-X');
  assert.deepEqual(result, { status: 200, body: { valid: true, code: 'NXD-X', publicDetails: false } });
  assert.equal(User.calls.length, 1);
  assert.doesNotMatch(User.calls[0].projection, /name|completedIds|xp|githubUrl/);
});

test('public certificate returns the allowlisted public details only', async () => {
  const issuedAt = new Date('2026-11-20T00:00:00Z');
  const User = modelWith([
    { _id: 'u1', certificateCode: 'NXD-X', certificateIssuedAt: issuedAt, privacyPreferences: { showCertificateDetails: true } },
    { _id: 'u1', certificateCode: 'NXD-X', certificateIssuedAt: issuedAt, name: 'Student', completedIds: ['js-03-arrays-soma', 'mod-5-aula-7', 'not-a-real-lesson'], xp: 700, githubUrl: 'https://github.com/student', liveUrl: 'https://student.example', email: 'private@example.test', passwordHash: 'secret' }
  ]);
  const result = await lookupPublicCertificate(User, 'NXD-X');
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    valid: true, publicDetails: true, code: 'NXD-X', studentName: 'Student',
    completedCount: 2, xp: 700, issuedAt,
    githubUrl: 'https://github.com/student', liveUrl: 'https://student.example'
  });
  assert.equal(User.calls.length, 2);
  assert.equal(User.calls[1].filter['privacyPreferences.showCertificateDetails'].$ne, false);
  assert.doesNotMatch(User.calls[1].projection, /email|passwordHash/);
});

test('rechecks privacy and suppresses details if visibility changes during lookup', async () => {
  const issuedAt = new Date();
  const User = modelWith([
    { _id: 'u1', certificateCode: 'NXD-X', certificateIssuedAt: issuedAt, privacyPreferences: { showCertificateDetails: true } },
    null,
    { _id: 'u1', certificateCode: 'NXD-X', certificateIssuedAt: issuedAt, privacyPreferences: { showCertificateDetails: false } }
  ]);
  const result = await lookupPublicCertificate(User, 'NXD-X');
  assert.deepEqual(result, { status: 200, body: { valid: true, code: 'NXD-X', publicDetails: false } });
  assert.equal(User.calls.length, 3);
});

test('returns not found if certificate disappears during the privacy recheck', async () => {
  const User = modelWith([
    { _id: 'u1', certificateCode: 'NXD-X', certificateIssuedAt: new Date(), privacyPreferences: { showCertificateDetails: true } },
    null,
    null
  ]);
  const result = await lookupPublicCertificate(User, 'NXD-X');
  assert.equal(result.status, 404);
  assert.equal(result.body.valid, false);
});
