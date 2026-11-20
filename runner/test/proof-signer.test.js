'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { signCompletionProof } = require('../src/proof-signer');

const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });

test('signs RS256 completion claims with a maximum five-minute lifetime', () => {
  const token = signCompletionProof({ userId: 'student-1', challengeId: 'html-01-test', privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }), now: 1_800_000_000, ttlSeconds: 300 });
  const [header, payload, signature] = token.split('.');
  assert.equal(JSON.parse(Buffer.from(header, 'base64url')).alg, 'RS256');
  const claims = JSON.parse(Buffer.from(payload, 'base64url'));
  assert.equal(claims.iss, 'nexusdev-runner');
  assert.equal(claims.aud, 'nexusdev-progress');
  assert.equal(claims.purpose, 'lesson-completion');
  assert.equal(claims.sub, 'student-1');
  assert.equal(claims.challengeId, 'html-01-test');
  assert.match(claims.jti, /^[0-9a-f-]{36}$/i);
  assert.equal(claims.exp - claims.iat, 300);
  assert.equal(crypto.verify('RSA-SHA256', Buffer.from(header + '.' + payload), { key: privateKey, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(signature, 'base64url')), true);
});

test('rejects a lifetime over five minutes and missing key', () => {
  assert.throws(() => signCompletionProof({ userId: 'u', challengeId: 'c', privateKey: 'bad', ttlSeconds: 30 }));
  assert.throws(() => signCompletionProof({ userId: 'u', challengeId: 'c', privateKey: '-----BEGIN PRIVATE KEY-----', ttlSeconds: 301 }));
});
