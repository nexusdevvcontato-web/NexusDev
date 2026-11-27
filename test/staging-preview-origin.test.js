const test = require('node:test');
const assert = require('node:assert/strict');
const { parseStagingPreviewOrigin } = require('../src/config/staging-preview-origin');

test('staging preview origin is optional when unset', () => {
  assert.equal(parseStagingPreviewOrigin('', 'development'), null);
});

test('accepts only an exact HTTPS Vercel preview origin outside production', () => {
  assert.equal(
    parseStagingPreviewOrigin('https://nexusdev-frontend-abc.vercel.app', 'development'),
    'https://nexusdev-frontend-abc.vercel.app'
  );
});

test('rejects non-Vercel origins and URL paths or credentials', () => {
  for (const value of [
    'http://nexusdev-frontend-abc.vercel.app',
    'https://example.com',
    'https://nexusdev-frontend-abc.vercel.app/path',
    'https://user:pass@nexusdev-frontend-abc.vercel.app',
    'https://nexusdev-frontend-abc.vercel.app?x=1'
  ]) {
    assert.throws(() => parseStagingPreviewOrigin(value, 'development'));
  }
});

test('rejects staging preview origin in production', () => {
  assert.throws(
    () => parseStagingPreviewOrigin('https://nexusdev-frontend-abc.vercel.app', 'production'),
    /não pode ser configurada em produção/
  );
});
