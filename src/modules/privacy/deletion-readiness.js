const CERTIFICATE_DECISIONS = new Set(['revoke', 'preserve_anonymized']);
const LEGACY_COMMENT_DECISIONS = new Set(['manual_review', 'leave_unlinked']);

function evaluateDeletionReadiness(input = {}) {
  const blockers = [];
  if (input.identityReverified !== true) blockers.push('identity_reverification');
  if (input.cancellationWindowConfigured !== true) blockers.push('cancellation_window');
  if (input.retentionPolicyApproved !== true) blockers.push('retention_policy');
  if (input.backupLifecycleDocumented !== true) blockers.push('backup_lifecycle');
  if (input.auditTrailReady !== true) blockers.push('audit_trail');
  if (input.transactionalExecutionTested !== true) blockers.push('transactional_execution');
  if (!CERTIFICATE_DECISIONS.has(input.certificateDecision)) blockers.push('certificate_decision');
  if (!LEGACY_COMMENT_DECISIONS.has(input.legacyCommentDecision)) blockers.push('legacy_comment_decision');

  return {
    ready: blockers.length === 0,
    blockers
  };
}

module.exports = {
  evaluateDeletionReadiness
};
