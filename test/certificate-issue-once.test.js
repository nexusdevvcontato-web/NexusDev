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
