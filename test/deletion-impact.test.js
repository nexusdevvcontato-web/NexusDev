'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildDeletionImpact } = require('../src/modules/privacy/deletion-impact');

test('returns only aggregate impact and remains explicitly read-only', () => {
  const result = buildDeletionImpact({
    sessions: 2, refreshTokens: 3, completionProofs: 4, linkedComments: 5, learningArtifacts: 6,
    hasCertificate: true, hasLearningData: true, hasProfileData: true
  });
  assert.equal(result.readOnly, true);
  assert.equal(result.deletionEnabled, false);
  assert.deepEqual(result.sessions, { count: 2, refreshTokens: 3 });
  assert.deepEqual(result.completionProofs, { count: 4 });
  assert.equal(result.comments.linkedCount, 5);
  assert.equal(result.learning.artifactCount, 6);
  assert.deepEqual(result.comments.legacy, { status: 'not_attributable', count: null });
  assert.deepEqual(result.certificate, { present: true, decision: 'pending' });
  assert.equal(result.externalSystems.status, 'not_inspected');
  assert.ok(result.blockers.includes('deletion_execution_not_enabled'));
  assert.equal(JSON.stringify(result).includes('tokenHash'), false);
});

test('does not infer optional records or decisions', () => {
  const result = buildDeletionImpact({
    sessions: 0, refreshTokens: 0, completionProofs: 0, linkedComments: 0, learningArtifacts: 0
  });
  assert.equal(result.certificate.present, false);
  assert.equal(result.certificate.decision, 'pending');
  assert.equal(result.deletionEnabled, false);
});

test('rejects missing, negative, fractional, and unsafe counts', () => {
  for (const value of [undefined, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '2']) {
    assert.throws(() => buildDeletionImpact({
      sessions: value, refreshTokens: 0, completionProofs: 0, linkedComments: 0, learningArtifacts: 0
    }), TypeError);
  }
});

test('rejects malformed inventory input', () => {
  assert.throws(() => buildDeletionImpact(null), TypeError);
  assert.throws(() => buildDeletionImpact([]), TypeError);
});
