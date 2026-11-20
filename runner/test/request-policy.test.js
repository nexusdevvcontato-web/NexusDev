'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateExecutionRequest } = require('../src/request-policy');

test('accepts a bounded request shape', () => {
  const result = validateExecutionRequest({ userId: 'user-123', challengeId: 'html-01-test', files: { 'index.html': '<h1>Oi</h1>' } });
  assert.equal(result.ok, true);
});

test('rejects arrays and malformed requests', () => {
  assert.equal(validateExecutionRequest([]).ok, false);
  assert.equal(validateExecutionRequest({ userId: 'u', challengeId: 'a', files: [] }).ok, false);
});

test('rejects path traversal and invalid filenames', () => {
  assert.equal(validateExecutionRequest({ userId: 'u', challengeId: 'a', files: { '../secret': 'x' } }).ok, false);
});

test('enforces per-file, aggregate and count limits', () => {
  assert.equal(validateExecutionRequest({ userId: 'u', challengeId: 'a', files: { 'a.js': 'x'.repeat(50_001) } }).reason, 'file-size-limit');
  assert.equal(validateExecutionRequest({ userId: 'u', challengeId: 'a', files: Object.fromEntries(Array.from({length: 5}, (_, i) => [i + '.js', 'x'.repeat(40_001)])) }).reason, 'total-size-limit');
  assert.equal(validateExecutionRequest({ userId: 'u', challengeId: 'a', files: Object.fromEntries(Array.from({length: 11}, (_, i) => [i + '.js', 'x'])) }).reason, 'file-count-limit');
});

test('rejects null bytes and oversized identities', () => {
  assert.equal(validateExecutionRequest({ userId: 'u', challengeId: 'a', files: { 'a.js': 'x\\0y' } }).ok, false);
  assert.equal(validateExecutionRequest({ userId: 'x'.repeat(129), challengeId: 'a', files: { 'a.js': 'x' } }).ok, false);
});
