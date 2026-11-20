const test = require('node:test');
const assert = require('node:assert/strict');
const { generateCertificateCode } = require('../src/modules/certificates/code');

test('generates certificate codes with an 80-bit cryptographic random suffix', () => {
  const code = generateCertificateCode('Ana Silva', 700);
  assert.match(code, /^NXD-2026-ANASIL-700-[A-F0-9]{20}$/);
});

test('normalizes missing or unsafe names and invalid completion counts', () => {
  assert.match(generateCertificateCode('!!!', -1), /^NXD-2026-DEV-000-[A-F0-9]{20}$/);
  assert.match(generateCertificateCode(null, 1.5), /^NXD-2026-ALUNO-000-[A-F0-9]{20}$/);
});

test('does not repeat certificate codes across a batch of generated values', () => {
  const codes = new Set(Array.from({ length: 1000 }, () => generateCertificateCode('Teste', 700)));
  assert.equal(codes.size, 1000);
});
