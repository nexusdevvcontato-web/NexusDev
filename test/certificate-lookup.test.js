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

test('missing visibility preference defaults to private and returns only validity and opaque code', async () => {
  const User = modelWith([{ _id: 'u1', certificateCode: 'NXD-X', certificateIssuedAt: new Date() }]);
  const result = await lookupPublicCertificate(User, 'NXD-X');
  assert.deepEqual(result, { status: 200, body: { valid: true, code: 'NXD-X', publicDetails: false } });
  assert.equal(User.calls.length, 1);
  assert.doesNotMatch(User.calls[0].projection, /name|completedIds|xp|githubUrl/);
});

test('explicitly private certificate returns only validity and opaque code without loading profile details', async () => {
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
    { _id: 'u1', certificateCode: 'NXD-X', certificateIssuedAt: issuedAt, name: 'Current profile name', completedIds: ['js-03-arrays-soma', 'mod-5-aula-7', 'not-a-real-lesson'], xp: 900, githubUrl: 'https://github.com/current', liveUrl: 'https://current.example', certificateStudentName: 'Issued Student', certificateCompletedCount: 700, certificateXp: 850, certificateGithubUrl: 'https://github.com/issued', certificateLiveUrl: 'https://issued.example', email: 'private@example.test', passwordHash: 'secret' }
  ]);
  const result = await lookupPublicCertificate(User, 'NXD-X');
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    valid: true, publicDetails: true, code: 'NXD-X', studentName: 'Issued Student',
    completedCount: 700, xp: 850, issuedAt,
    githubUrl: 'https://github.com/issued', liveUrl: 'https://issued.example'
  });
  assert.equal(User.calls.length, 2);
  assert.equal(User.calls[1].filter['privacyPreferences.showCertificateDetails'], true);
  assert.doesNotMatch(User.calls[1].projection, /email|passwordHash/);
  assert.match(User.calls[1].projection, /certificateStudentName.*certificateCompletedCount.*certificateXp/);
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
