'use strict';

const crypto = require('node:crypto');

const ISSUER = 'nexusdev-runner';
const AUDIENCE = 'nexusdev-progress';
const PURPOSE = 'lesson-completion';
const MAX_TTL_SECONDS = 300;

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function signCompletionProof({ userId, challengeId, privateKey, now = Math.floor(Date.now() / 1000), ttlSeconds = 120 }) {
  if (typeof privateKey !== 'string' || !privateKey.includes('PRIVATE KEY')) {
    throw new Error('RUNNER_PRIVATE_KEY must contain a PEM private key.');
  }
  if (typeof userId !== 'string' || !userId || typeof challengeId !== 'string' || !challengeId) {
    throw new Error('A user and challenge are required to sign a completion proof.');
  }
  if (!Number.isInteger(now) || !Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > MAX_TTL_SECONDS) {
    throw new Error('Proof lifetime must be between 1 and 300 seconds.');
  }

  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss: ISSUER,
    aud: AUDIENCE,
    purpose: PURPOSE,
    sub: userId,
    challengeId,
    iat: now,
    exp: now + ttlSeconds
  }));
  const signingInput = header + '.' + payload;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput), {
    key: privateKey,
    padding: crypto.constants.RSA_PKCS1_PADDING
  });
  return signingInput + '.' + signature.toString('base64url');
}

module.exports = { signCompletionProof, MAX_TTL_SECONDS, ISSUER, AUDIENCE, PURPOSE };
