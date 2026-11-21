'use strict';

const { getChallengeSpec, validateChallengeFiles } = require('./challenge-registry');
const { evaluateChallenge: evaluateHtmlChallenge } = require('./html-evaluator');
const { evaluateChallenge: evaluateJavaScriptChallenge } = require('./js-evaluator');

function evaluateRegisteredChallenge(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    return { ok: false, reason: 'invalid-request' };
  }

  const { challengeId, files } = request;
  if (typeof challengeId !== 'string' || !files || typeof files !== 'object' || Array.isArray(files)) {
    return { ok: false, reason: 'invalid-request' };
  }

  const spec = getChallengeSpec(challengeId);
  if (!spec) return { ok: false, reason: 'unsupported-challenge' };

  // Each trusted lesson declares its exact editor file set. Only the registered
  // entrypoint is interpreted; explicitly declared supporting files are hashed
  // and saved but never executed by the evaluator.
  if (!validateChallengeFiles(challengeId, files)) {
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
