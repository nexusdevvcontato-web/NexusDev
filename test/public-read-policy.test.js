const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeCertificateLookupCode,
  isPublicLessonLookupAllowed
} = require('../src/modules/public-read/policy');

test('normalizes opaque certificate codes and preserves legacy code compatibility', () => {
  assert.equal(normalizeCertificateLookupCode('  nxd-0123456789abcdef0123456789abcdef  '),
    'NXD-0123456789ABCDEF0123456789ABCDEF');
  assert.equal(normalizeCertificateLookupCode(' nxd-2026-dev-700-ABCDEF0123456789ABCD '),
    'NXD-2026-DEV-700-ABCDEF0123456789ABCD');
});

test('rejects malformed, oversized, and non-string certificate codes', () => {
  for (const value of [null, 123, '', 'short', 'NXD/2026/DEV/700', 'A'.repeat(101)]) {
    assert.equal(normalizeCertificateLookupCode(value), null);
  }
});

test('allows only registered curriculum lesson identifiers for public comments', () => {
  assert.equal(isPublicLessonLookupAllowed('js-03-arrays-soma'), true);
  assert.equal(isPublicLessonLookupAllowed(' mod-5-aula-7 '), true);
  assert.equal(isPublicLessonLookupAllowed('admin'), false);
  assert.equal(isPublicLessonLookupAllowed('../users'), false);
  assert.equal(isPublicLessonLookupAllowed(null), false);
});
