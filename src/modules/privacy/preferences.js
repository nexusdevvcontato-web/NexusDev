const DEFAULT_PRIVACY_PREFERENCES = Object.freeze({
  showInLeaderboard: true,
  showCertificateDetails: true
});

const ALLOWED_PREFERENCE_KEYS = new Set(Object.keys(DEFAULT_PRIVACY_PREFERENCES));

function normalizePrivacyPreferences(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    showInLeaderboard: source.showInLeaderboard !== false,
    showCertificateDetails: source.showCertificateDetails !== false
  };
}

function validatePrivacyPreferenceUpdate(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: 'Preferências inválidas.' };
  }
  const keys = Object.keys(value);
  if (keys.length === 0 || keys.some((key) => !ALLOWED_PREFERENCE_KEYS.has(key))) {
    return { ok: false, error: 'Informe somente preferências de privacidade reconhecidas.' };
  }
  if (keys.some((key) => typeof value[key] !== 'boolean')) {
    return { ok: false, error: 'As preferências devem ser valores booleanos.' };
  }
  return { ok: true, value: { ...value } };
}

module.exports = {
  DEFAULT_PRIVACY_PREFERENCES,
  normalizePrivacyPreferences,
  validatePrivacyPreferenceUpdate
};
