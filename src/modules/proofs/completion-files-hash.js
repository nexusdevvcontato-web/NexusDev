'use strict';

const crypto = require('node:crypto');

const MAX_FILES = 10;
const MAX_FILE_BYTES = 50_000;
const MAX_TOTAL_BYTES = 200_000;
const FILE_NAME_PATTERN = /^[a-zA-Z0-9._-]{1,80}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;

function hashCompletionFiles(files) {
  if (!files || typeof files !== 'object' || Array.isArray(files)) {
    throw new TypeError('Completion files must be a plain object.');
  }
  const prototype = Object.getPrototypeOf(files);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('Completion files must be a plain object.');
  }

  const names = Object.keys(files).sort();
  if (names.length < 1 || names.length > MAX_FILES) {
    throw new RangeError('Completion file count is outside the allowed range.');
  }

  let totalBytes = 0;
  const canonicalEntries = [];
  for (const name of names) {
    const source = files[name];
    if (!FILE_NAME_PATTERN.test(name) || ['__proto__', 'prototype', 'constructor'].includes(name) ||
        typeof source !== 'string' || source.includes(String.fromCharCode(0))) {
      throw new TypeError('Completion file name or content is invalid.');
    }
    const bytes = Buffer.byteLength(source, 'utf8');
    if (bytes > MAX_FILE_BYTES) throw new RangeError('Completion file exceeds the per-file limit.');
    totalBytes += bytes;
    if (totalBytes > MAX_TOTAL_BYTES) throw new RangeError('Completion files exceed the aggregate limit.');
    canonicalEntries.push([name, source]);
  }

  return crypto.createHash('sha256')
    .update(JSON.stringify(canonicalEntries), 'utf8')
    .digest('hex');
}

module.exports = {
  hashCompletionFiles,
  MAX_FILES,
  MAX_FILE_BYTES,
  MAX_TOTAL_BYTES,
  HASH_PATTERN
};
