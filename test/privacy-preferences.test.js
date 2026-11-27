const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_PRIVACY_PREFERENCES,
  normalizePrivacyPreferences,
  validatePrivacyPreferenceUpdate
} = require('../src/modules/privacy/preferences');

test('missing preferences default to private certificate details', () => {
  assert.deepEqual(DEFAULT_PRIVACY_PREFERENCES, { showInLeaderboard: true, showCertificateDetails: false });
  assert.deepEqual(normalizePrivacyPreferences(undefined), DEFAULT_PRIVACY_PREFERENCES);
  assert.deepEqual(normalizePrivacyPreferences({}), DEFAULT_PRIVACY_PREFERENCES);
});

test('normalizes explicit privacy opt-outs', () => {
  assert.deepEqual(normalizePrivacyPreferences({
    showInLeaderboard: false,
    showCertificateDetails: false
  }), { showInLeaderboard: false, showCertificateDetails: false });
});

test('accepts only known boolean preference updates', () => {
  assert.deepEqual(validatePrivacyPreferenceUpdate({ showInLeaderboard: false }), {
    ok: true, value: { showInLeaderboard: false }
  });
  assert.equal(validatePrivacyPreferenceUpdate({ showCertificateDetails: 'false' }).ok, false);
  assert.equal(validatePrivacyPreferenceUpdate({ role: 'admin' }).ok, false);
  assert.equal(validatePrivacyPreferenceUpdate({}).ok, false);
  assert.equal(validatePrivacyPreferenceUpdate(null).ok, false);
  assert.equal(validatePrivacyPreferenceUpdate([]).ok, false);
});
