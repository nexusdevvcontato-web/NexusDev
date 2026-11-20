const test = require('node:test');
const assert = require('node:assert/strict');
const { issueCertificateOnce } = require('../src/modules/certificates/issue-once');

test('first concurrent issuance atomically sets code and timestamp', async () => {
  const expected = { _id: 'u1', certificateCode: 'NXD-ONE', certificateIssuedAt: new Date('2026-11-20T00:00:00Z') };
  let query, update, options;
  const User = {
    async findOneAndUpdate(q, u, o) { query=q; update=u; options=o; return expected; },
    async findById() { assert.fail('must not reload after winning issuance'); }
  };
  const result = await issueCertificateOnce(User, 'u1', 'NXD-ONE', expected.certificateIssuedAt);
  assert.equal(result, expected);
  assert.deepEqual(query, { _id: 'u1', certificateIssuedAt: null });
  assert.deepEqual(update, { $set: { certificateCode: 'NXD-ONE', certificateIssuedAt: expected.certificateIssuedAt } });
  assert.deepEqual(options, { new: true });
});

test('concurrent later issuance returns the already-issued certificate', async () => {
  const existing = { _id: 'u1', certificateCode: 'NXD-FIRST', certificateIssuedAt: new Date() };
  let reloadId;
  const User = {
    async findOneAndUpdate() { return null; },
    async findById(id) { reloadId=id; return existing; }
  };
  assert.equal(await issueCertificateOnce(User, 'u1', 'NXD-SECOND', new Date()), existing);
  assert.equal(reloadId, 'u1');
});

test('returns null when account is missing', async () => {
  const User = { async findOneAndUpdate() { return null; }, async findById() { return null; } };
  assert.equal(await issueCertificateOnce(User, 'missing', 'NXD-X', new Date()), null);
});


test('retries a duplicate certificate-code index collision with a fresh code', async () => {
  const issued = { _id: 'u1', certificateCode: 'NXD-FRESH', certificateIssuedAt: new Date() };
  const attempted = [];
  const User = {
    async findOneAndUpdate(query, update) {
      attempted.push(update.$set.certificateCode);
      if (attempted.length === 1) { const error = new Error('duplicate'); error.code = 11000; throw error; }
      return issued;
    },
    async findById() { assert.fail('successful retry should return issued document'); }
  };
  const result = await issueCertificateOnce(User, 'u1', 'NXD-COLLISION', issued.certificateIssuedAt, () => 'NXD-FRESH');
  assert.equal(result, issued);
  assert.deepEqual(attempted, ['NXD-COLLISION', 'NXD-FRESH']);
});

test('does not retry non-duplicate database errors', async () => {
  let calls = 0;
  const User = { async findOneAndUpdate() { calls += 1; throw new Error('database unavailable'); } };
  await assert.rejects(() => issueCertificateOnce(User, 'u1', 'NXD-X', new Date(), () => 'NXD-Y'), /database unavailable/);
  assert.equal(calls, 1);
});


test('first issuance freezes a supplied certificate snapshot atomically', async () => {
  const snapshot = {
    certificateStudentName: 'Student',
    certificateCompletedCount: 700,
    certificateXp: 850,
    certificateGithubUrl: 'https://github.com/student',
    certificateLiveUrl: 'https://student.example'
  };
  let update;
  const issued = { _id: 'u1', certificateCode: 'NXD-X', certificateIssuedAt: new Date(), ...snapshot };
  const User = {
    async findOneAndUpdate(_query, value) { update = value; return issued; },
    async findById() { assert.fail('first issuance should return updated record'); }
  };
  const result = await issueCertificateOnce(User, 'u1', 'NXD-X', issued.certificateIssuedAt, undefined, snapshot);
  assert.equal(result, issued);
  assert.deepEqual(update.$set, { ...snapshot, certificateCode: 'NXD-X', certificateIssuedAt: issued.certificateIssuedAt });
});
