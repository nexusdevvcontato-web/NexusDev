const CERTIFICATE_DECISIONS = new Set(['revoke', 'preserve_anonymized']);
const LEGACY_COMMENT_DECISIONS = new Set(['manual_review', 'leave_unlinked']);

const REQUIRED_GATES = Object.freeze([
  ['identityReverified', 'identity_reverification'],
  ['cancellationWindowConfigured', 'cancellation_window'],
  ['retentionPolicyApproved', 'retention_policy'],
  ['backupLifecycleDocumented', 'backup_lifecycle'],
  ['auditTrailReady', 'audit_trail'],
  ['transactionalExecutionTested', 'transactional_execution'],
  ['dependentDataInventoryApproved', 'dependent_data_inventory'],
  ['sessionRevocationTested', 'session_revocation'],
  ['idempotencyTested', 'idempotent_execution'],
  ['externalProviderRetentionReviewed', 'external_provider_retention'],
  ['certificatePublicRevocationTested', 'certificate_public_revocation'],
  ['reauthProofConsumptionTested', 'reauth_proof_consumption']
]);

function evaluateDeletionReadiness(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const blockers = REQUIRED_GATES
    .filter(([field]) => source[field] !== true)
    .map(([, blocker]) => blocker);

  if (!CERTIFICATE_DECISIONS.has(source.certificateDecision)) blockers.push('certificate_decision');
  if (!LEGACY_COMMENT_DECISIONS.has(source.legacyCommentDecision)) blockers.push('legacy_comment_decision');

  return { ready: blockers.length === 0, blockers };
}

module.exports = { evaluateDeletionReadiness, REQUIRED_GATES };
