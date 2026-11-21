'use strict';

const crypto = require('node:crypto');
const { evaluateRegisteredChallenge } = require('../../../runner/src/evaluator');
const { isRunnerSupportedChallenge, validateChallengeFiles } = require('../../../runner/src/challenge-registry');
const { hashCompletionFiles } = require('./completion-files-hash');

// This is an in-process, server-owned evaluation result, not a runner JWT.
// It is created only after the trusted registry evaluator passes every server test.
function evaluateAndCreateCompletionProof({ userId, challengeId, files, nowSeconds = Math.floor(Date.now() / 1000) }) {
  if (typeof userId !== 'string' || !userId || userId.length > 128 ||
      typeof challengeId !== 'string' || !isRunnerSupportedChallenge(challengeId) ||
      !Number.isInteger(nowSeconds) || nowSeconds < 0) {
    return { ok: false, reason: 'invalid-request' };
  }

  if (!files || typeof files !== 'object' || Array.isArray(files)) {
    return { ok: false, reason: 'invalid-files' };
  }
  if (!validateChallengeFiles(challengeId, files)) {
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

  const jtiBytes = crypto.createHash('sha256')
    .update(userId + String.fromCharCode(0) + challengeId + String.fromCharCode(0) + filesHash)
    .digest().subarray(0, 16);
  jtiBytes[6] = (jtiBytes[6] & 0x0f) | 0x50;
  jtiBytes[8] = (jtiBytes[8] & 0x3f) | 0x80;
  const jti = [jtiBytes.subarray(0, 4).toString('hex'), jtiBytes.subarray(4, 6).toString('hex'),
    jtiBytes.subarray(6, 8).toString('hex'), jtiBytes.subarray(8, 10).toString('hex'),
    jtiBytes.subarray(10, 16).toString('hex')].join('-');

  return {
    ok: true,
    proof: {
      jti,
      exp: nowSeconds + 120,
      challengeId,
      filesHash
    }
  };
}

module.exports = { evaluateAndCreateCompletionProof };
