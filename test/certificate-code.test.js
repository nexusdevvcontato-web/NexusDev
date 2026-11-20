const test = require('node:test');
const assert = require('node:assert/strict');
const { generateCertificateCode } = require('../src/modules/certificates/code');

test('generates opaque certificate codes with 128 bits of cryptographic randomness', () => {
  const code = generateCertificateCode('Ana Silva', 700);
  assert.match(code, /^NXD-[A-F0-9]{32}$/);
  assert.equal(code.includes('ANASIL'), false);
});

test('does not encode names or completion counts in generated codes', () => {
  const first = generateCertificateCode('Ana Silva', 700);
  const second = generateCertificateCode('Pessoa Diferente', 1);
  assert.match(first, /^NXD-[A-F0-9]{32}$/);
  assert.match(second, /^NXD-[A-F0-9]{32}$/);
});

test('does not repeat certificate codes across a batch of generated values', () => {
  const codes = new Set(Array.from({ length: 1000 }, () => generateCertificateCode()));
  assert.equal(codes.size, 1000);
});
