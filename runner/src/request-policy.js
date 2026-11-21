'use strict';

const { isRunnerSupportedChallenge, validateChallengeFiles } = require('./challenge-registry');

const MAX_FILES = 10;
const MAX_FILE_BYTES = 50_000;
const MAX_TOTAL_BYTES = 200_000;
const MAX_SOURCE_NAME = /^[a-zA-Z0-9._-]{1,80}$/;

function validateExecutionRequest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, reason: 'invalid-request' };
  }
  const { userId, challengeId, files } = input;
  if (typeof userId !== 'string' || userId.length < 1 || userId.length > 128 ||
      typeof challengeId !== 'string' || !/^([a-z0-9]+-)*[a-z0-9]+$/.test(challengeId) ||
      !files || typeof files !== 'object' || Array.isArray(files)) {
    return { ok: false, reason: 'invalid-request' };
  }
  if (!isRunnerSupportedChallenge(challengeId)) {
    return { ok: false, reason: 'challenge-not-authored' };
  }
  const entries = Object.entries(files);
  if (entries.length < 1 || entries.length > MAX_FILES) {
    return { ok: false, reason: 'file-count-limit' };
  }
  if (!validateChallengeFiles(challengeId, files)) {
    return { ok: false, reason: 'entrypoint-mismatch' };
  }
  let totalBytes = 0;
  for (const [name, content] of entries) {
    if (!MAX_SOURCE_NAME.test(name) || name === '.' || name === '..' ||
        typeof content !== 'string' || content.includes(String.fromCharCode(0))) {
      return { ok: false, reason: 'invalid-file' };
    }
    const bytes = Buffer.byteLength(content, 'utf8');
    if (bytes > MAX_FILE_BYTES) return { ok: false, reason: 'file-size-limit' };
    totalBytes += bytes;
    if (totalBytes > MAX_TOTAL_BYTES) return { ok: false, reason: 'total-size-limit' };
  }
  return { ok: true, value: { userId, challengeId, files: Object.fromEntries(entries) } };
}

module.exports = { validateExecutionRequest, MAX_FILES, MAX_FILE_BYTES, MAX_TOTAL_BYTES };
