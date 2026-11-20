const test = require('node:test');
const assert = require('node:assert/strict');
const { createUserWithCertificateCode, isCertificateCodeDuplicateKey } = require('../src/modules/certificates/create-user');

test('retries only duplicate certificate-code key collisions during registration', async () => {
  const attempted = [];
  const created = { _id: 'u1' };
  const User = { async create(data) {
    attempted.push(data.certificateCode);
    if (attempted.length === 1) {
      const error = new Error('duplicate certificate code');
      error.code = 11000;
      error.keyPattern = { certificateCode: 1 };
      throw error;
    }
    return created;
  } };
  const result = await createUserWithCertificateCode(User, { email: 'person@example.test' }, (() => {
    let n = 0;
    return () => ['NXD-COLLISION', 'NXD-UNIQUE'][n++];
  })());
  assert.equal(result, created);
  assert.deepEqual(attempted, ['NXD-COLLISION', 'NXD-UNIQUE']);
});

test('does not retry duplicate email or unrelated database errors', async () => {
  for (const error of [
    Object.assign(new Error('duplicate email'), { code: 11000, keyPattern: { email: 1 } }),
    new Error('database unavailable')
  ]) {
    let calls = 0;
    const User = { async create() { calls += 1; throw error; } };
    await assert.rejects(() => createUserWithCertificateCode(User, {}, () => 'NXD-X'));
    assert.equal(calls, 1);
  }
});

test('detects only certificateCode unique index collisions', () => {
  assert.equal(isCertificateCodeDuplicateKey({ code: 11000, keyPattern: { certificateCode: 1 } }), true);
  assert.equal(isCertificateCodeDuplicateKey({ code: 11000, keyPattern: { email: 1 } }), false);
  assert.equal(isCertificateCodeDuplicateKey(new Error('duplicate')), false);
});
