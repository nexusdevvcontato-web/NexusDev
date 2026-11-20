const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateDeletionReadiness, REQUIRED_GATES } = require('../src/modules/privacy/deletion-readiness');

const approved = Object.fromEntries(REQUIRED_GATES.map(([field]) => [field, true]));
Object.assign(approved, {
  certificateDecision: 'revoke',
  legacyCommentDecision: 'manual_review'
});

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
    'dependent_data_inventory',
    'session_revocation',
    'idempotent_execution',
    'external_provider_retention',
    'certificate_public_revocation',
    'reauth_proof_consumption',
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

test('each dependent-data safeguard independently blocks deletion', () => {
  for (const [field, blocker] of REQUIRED_GATES) {
    const input = { ...approved, [field]: false };
    const result = evaluateDeletionReadiness(input);
    assert.equal(result.ready, false, field);
    assert.deepEqual(result.blockers, [blocker], field);
  }
});

test('unknown and incomplete input never enables deletion', () => {
  assert.equal(evaluateDeletionReadiness({ ...approved, extraApproval: true }).ready, true);
  assert.equal(evaluateDeletionReadiness(null).ready, false);
});
