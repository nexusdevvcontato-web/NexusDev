'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { hashCompletionFiles } = require('../src/modules/proofs/completion-files-hash');

test('hash is deterministic regardless of object insertion order', () => {
  const first = { 'index.html': '<h1>Hello</h1>', 'style.css': 'h1 { color: red; }' };
  const second = { 'style.css': 'h1 { color: red; }', 'index.html': '<h1>Hello</h1>' };
  assert.equal(hashCompletionFiles(first), hashCompletionFiles(second));
});

test('hash changes when any evaluated source byte changes', () => {
  const original = { 'index.html': '<h1>Hello</h1>' };
  const changed = { 'index.html': '<h1>Goodbye</h1>' };
  assert.notEqual(hashCompletionFiles(original), hashCompletionFiles(changed));
});

test('rejects empty, malformed, unsafe, oversized and excessive file sets', () => {
  assert.throws(() => hashCompletionFiles({}));
  assert.throws(() => hashCompletionFiles(null));
  assert.throws(() => hashCompletionFiles(['index.html']));
  assert.throws(() => hashCompletionFiles({ '../index.html': 'x' }));
  assert.throws(() => hashCompletionFiles(JSON.parse('{"__proto__":"x"}')));
  assert.throws(() => hashCompletionFiles({ 'index.html': 'x'.repeat(50_001) }));
  assert.throws(() => hashCompletionFiles({ 'index.html': 'x'.repeat(50_000), 'style.css': 'y'.repeat(150_001) }));
  assert.throws(() => hashCompletionFiles({ 'index.html': 'bad\u0000source' }));
});
