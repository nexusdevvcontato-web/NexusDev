'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { signCompletionProof } = require('../src/proof-signer');
const { hashCompletionFiles } = require('../../src/modules/proofs/completion-files-hash');

const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const files = { 'index.html': '<h1>Olá, Mundo!</h1>' };

test('signs RS256 completion claims with a maximum five-minute lifetime', () => {
  const token = signCompletionProof({ userId: 'student-1', challengeId: 'html-00-o-que-e-web', files, privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }), now: 1_800_000_000, ttlSeconds: 300 });
  const [header, payload, signature] = token.split('.');
  assert.equal(JSON.parse(Buffer.from(header, 'base64url')).alg, 'RS256');
  const claims = JSON.parse(Buffer.from(payload, 'base64url'));
  assert.equal(claims.iss, 'nexusdev-runner');
  assert.equal(claims.aud, 'nexusdev-progress');
  assert.equal(claims.purpose, 'lesson-completion');
  assert.equal(claims.sub, 'student-1');
  assert.equal(claims.challengeId, 'html-00-o-que-e-web');
  assert.equal(claims.filesHash, hashCompletionFiles(files));
  assert.match(claims.jti, /^[0-9a-f-]{36}$/i);
  assert.equal(claims.exp - claims.iat, 300);
  assert.equal(crypto.verify('RSA-SHA256', Buffer.from(header + '.' + payload), { key: privateKey, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(signature, 'base64url')), true);
});

test('rejects missing, malformed, weak and non-RSA keys and unsupported challenges', () => {
  const weak = crypto.generateKeyPairSync('rsa', { modulusLength: 1024 }).privateKey
    .export({ type: 'pkcs8', format: 'pem' });
  const ec = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey
    .export({ type: 'pkcs8', format: 'pem' });
  const supported = 'html-00-o-que-e-web';
  assert.throws(() => signCompletionProof({ userId: 'u', challengeId: supported, files, privateKey: 'bad' }));
  assert.throws(() => signCompletionProof({ userId: 'u', challengeId: supported, files, privateKey: '-----BEGIN PRIVATE KEY-----' }));
  assert.throws(() => signCompletionProof({ userId: 'u', challengeId: supported, files, privateKey: weak }));
  assert.throws(() => signCompletionProof({ userId: 'u', challengeId: supported, files, privateKey: ec }));
  assert.throws(() => signCompletionProof({ userId: 'u', challengeId: 'mod-1-aula-7', files, privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }) }));
  assert.throws(() => signCompletionProof({ userId: 'u', challengeId: supported, files: { 'other.html': '<h1>x</h1>' }, privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }) }));
  assert.throws(() => signCompletionProof({ userId: 'u', challengeId: supported, files: { ...files, 'extra.js': 'x' }, privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }) }));
  assert.throws(() => signCompletionProof({ userId: 'u', challengeId: supported, files, privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }), ttlSeconds: 301 }));
});
