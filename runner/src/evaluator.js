'use strict';

const { getChallengeSpec } = require('./challenge-registry');
const { evaluateChallenge: evaluateHtmlChallenge } = require('./html-evaluator');
const { evaluateChallenge: evaluateJavaScriptChallenge } = require('./js-evaluator');

function evaluateRegisteredChallenge({ challengeId, files } = {}) {
  if (typeof challengeId !== 'string' || !files || typeof files !== 'object' || Array.isArray(files)) {
    return { ok: false, reason: 'invalid-request' };
  }

  const spec = getChallengeSpec(challengeId);
  if (!spec) return { ok: false, reason: 'unsupported-challenge' };

  // Every currently authored challenge is a single-file exercise. Reject extras
  // instead of silently ignoring attacker-controlled or ambiguous file content.
  const names = Object.keys(files);
  if (names.length !== 1 || names[0] !== spec.entrypoint || typeof files[spec.entrypoint] !== 'string') {
    return { ok: false, reason: 'entrypoint-mismatch' };
  }

  const source = files[spec.entrypoint];
  switch (spec.language) {
    case 'html':
      return evaluateHtmlChallenge({ challengeId, source });
    case 'javascript':
      return evaluateJavaScriptChallenge({ challengeId, source });
    default:
      return { ok: false, reason: 'unsupported-language' };
  }
}

module.exports = { evaluateRegisteredChallenge };
