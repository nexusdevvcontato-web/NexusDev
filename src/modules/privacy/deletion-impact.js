'use strict';

const COUNT_FIELDS = Object.freeze([
  'sessions', 'refreshTokens', 'completionProofs', 'linkedComments', 'learningArtifacts'
]);

function nonNegativeCount(value, field) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`Contagem inválida: ${field}`);
  }
  return value;
}

function buildDeletionImpact(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Inventário de impacto inválido.');
  }

  const counts = {};
  for (const field of COUNT_FIELDS) counts[field] = nonNegativeCount(input[field], field);

  const hasCertificate = input.hasCertificate === true;
  const hasLearningData = input.hasLearningData === true;
  const hasProfileData = input.hasProfileData === true;

  return {
    schemaVersion: 1,
    readOnly: true,
    deletionEnabled: false,
    account: { profilePresent: hasProfileData },
    learning: { dataPresent: hasLearningData, artifactCount: counts.learningArtifacts },
    sessions: { count: counts.sessions, refreshTokens: counts.refreshTokens },
    completionProofs: { count: counts.completionProofs },
    comments: {
      linkedCount: counts.linkedComments,
      legacy: { status: 'not_attributable', count: null }
    },
    certificate: {
      present: hasCertificate,
      decision: 'pending'
    },
    externalSystems: { status: 'not_inspected' },
    blockers: [
      'certificate_policy_pending',
      'legacy_comment_policy_pending',
      'retention_and_backup_policy_pending',
      'external_provider_retention_not_reviewed',
      'deletion_execution_not_enabled'
    ]
  };
}

module.exports = { buildDeletionImpact, COUNT_FIELDS };
