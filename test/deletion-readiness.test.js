const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateDeletionReadiness } = require('../src/modules/privacy/deletion-readiness');

const approved = {
  identityReverified: true,
  cancellationWindowConfigured: true,
  retentionPolicyApproved: true,
  backupLifecycleDocumented: true,
  auditTrailReady: true,
  transactionalExecutionTested: true,
  certificateDecision: 'revoke',
  legacyCommentDecision: 'manual_review'
};

test('deletion remains blocked when no decisions or safeguards are configured', () => {
  const result = evaluateDeletionReadiness();
  assert.equal(result.ready, false);
  assert.deepEqual(result.blockers, [
    'identity_reverification',
    'cancellation_window',
    'retention_policy',
    'backup_lifecycle',
    'audit_trail',
    'transactional_execution',
    'certificate_decision',
    'legacy_comment_decision'
  ]);
});

test('readiness passes only when every safeguard and policy decision is explicit', () => {
  assert.deepEqual(evaluateDeletionReadiness(approved), { ready: true, blockers: [] });
});

test('unknown certificate and legacy comment decisions fail closed', () => {
  const result = evaluateDeletionReadiness({
    ...approved,
    certificateDecision: 'keep_everything',
    legacyCommentDecision: 'guess_by_name'
  });
  assert.equal(result.ready, false);
  assert.deepEqual(result.blockers, ['certificate_decision', 'legacy_comment_decision']);
});

test('truthy non-boolean safeguards do not satisfy deletion gates', () => {
  const result = evaluateDeletionReadiness({
    ...approved,
    identityReverified: 'yes',
    retentionPolicyApproved: 1
  });
  assert.equal(result.ready, false);
  assert.deepEqual(result.blockers, ['identity_reverification', 'retention_policy']);
});
