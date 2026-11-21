'use strict';

const crypto = require('node:crypto');
const { evaluateRegisteredChallenge } = require('../../../runner/src/evaluator');
const { isRunnerSupportedChallenge, getChallengeSpec } = require('../../../runner/src/challenge-registry');
const { hashCompletionFiles } = require('./completion-files-hash');

// This is an in-process, server-owned evaluation result, not a runner JWT.
// It is created only after the trusted registry evaluator passes every server test.
function evaluateAndCreateCompletionProof({ userId, challengeId, files, nowSeconds = Math.floor(Date.now() / 1000) }) {
  if (typeof userId !== 'string' || !userId || userId.length > 128 ||
      typeof challengeId !== 'string' || !isRunnerSupportedChallenge(challengeId) ||
      !Number.isInteger(nowSeconds) || nowSeconds < 0) {
    return { ok: false, reason: 'invalid-request' };
  }

  const spec = getChallengeSpec(challengeId);
  if (!files || typeof files !== 'object' || Array.isArray(files)) {
    return { ok: false, reason: 'invalid-files' };
  }
  const names = Object.keys(files);
  if (names.length !== 1 || names[0] !== spec.entrypoint) {
    return { ok: false, reason: 'entrypoint-mismatch' };
  }

  let filesHash;
  try {
    filesHash = hashCompletionFiles(files);
  } catch {
    return { ok: false, reason: 'invalid-files' };
  }

  const evaluation = evaluateRegisteredChallenge({ challengeId, files });
  if (!evaluation.ok) return { ok: false, reason: evaluation.reason || 'tests-failed' };

  return {
    ok: true,
    proof: {
      jti: crypto.randomUUID(),
      exp: nowSeconds + 120,
      challengeId,
      filesHash
    }
  };
}

module.exports = { evaluateAndCreateCompletionProof };
