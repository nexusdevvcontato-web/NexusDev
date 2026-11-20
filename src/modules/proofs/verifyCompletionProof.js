const jwt = require('jsonwebtoken');

const MAX_PROOF_TTL_SECONDS = 300;
const CLOCK_SKEW_SECONDS = 30;

function verifyCompletionProof(token, { publicKey, userId, challengeId, nowSeconds = Math.floor(Date.now() / 1000) }) {
  if (!publicKey) {
    return { ok: false, reason: 'not-configured' };
  }
  if (typeof token !== 'string' || token.length === 0 || token.length > 8192) {
    return { ok: false, reason: 'invalid-token' };
  }

  let proof;
  try {
    proof = jwt.verify(token, publicKey, {
      algorithms: ['RS256'],
      issuer: 'nexusdev-runner',
      audience: 'nexusdev-progress'
    });
  } catch {
    return { ok: false, reason: 'invalid-signature-or-claims' };
  }

  if (!proof || typeof proof !== 'object' ||
      !Number.isInteger(proof.iat) ||
      !Number.isInteger(proof.exp) ||
      proof.iat > nowSeconds + CLOCK_SKEW_SECONDS ||
      proof.exp <= nowSeconds ||
      proof.exp <= proof.iat ||
      proof.exp - proof.iat > MAX_PROOF_TTL_SECONDS ||
      proof.purpose !== 'lesson-completion' ||
      proof.sub !== userId ||
      proof.challengeId !== challengeId) {
    return { ok: false, reason: 'claims-mismatch' };
  }

  return { ok: true, proof };
}

module.exports = {
  verifyCompletionProof,
  MAX_PROOF_TTL_SECONDS,
  CLOCK_SKEW_SECONDS
};
