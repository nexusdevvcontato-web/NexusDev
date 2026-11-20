'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateRegisteredChallenge } = require('../src/evaluator');

test('routes registered HTML lessons to the HTML evaluator', () => {
  assert.deepEqual(evaluateRegisteredChallenge({
    challengeId: 'html-00-o-que-e-web',
    files: { 'index.html': '<h1>Olá, Mundo!</h1>' }
  }), { ok: true });
});

test('routes registered JavaScript lessons to the restricted JavaScript evaluator', () => {
  assert.deepEqual(evaluateRegisteredChallenge({
    challengeId: 'js-01-variaveis-calculo',
    files: { 'script.js': 'function calcularPrecoComDesconto(preco, desconto) { return preco - preco * desconto / 100; }' }
  }), { ok: true });
});

test('does not route unknown or unsupported lessons', () => {
  assert.deepEqual(evaluateRegisteredChallenge({
    challengeId: 'mod-1-aula-7',
    files: { 'index.html': '<h1>Olá, Mundo!</h1>' }
  }), { ok: false, reason: 'unsupported-challenge' });
  assert.deepEqual(evaluateRegisteredChallenge({
    challengeId: 'mod-4-aula-2',
    files: { 'produtoController.js': 'function listarProdutosController() { return []; }' }
  }), { ok: false, reason: 'unsupported-challenge' });
});

test('requires the exact trusted entrypoint and rejects extra files', () => {
  assert.deepEqual(evaluateRegisteredChallenge({
    challengeId: 'html-00-o-que-e-web',
    files: { 'script.js': '<h1>Olá, Mundo!</h1>' }
  }), { ok: false, reason: 'entrypoint-mismatch' });
  assert.deepEqual(evaluateRegisteredChallenge({
    challengeId: 'html-00-o-que-e-web',
    files: { 'index.html': '<h1>Olá, Mundo!</h1>', 'extra.js': 'alert(1)' }
  }), { ok: false, reason: 'entrypoint-mismatch' });
});

test('rejects malformed facade requests', () => {
  assert.deepEqual(evaluateRegisteredChallenge(null), { ok: false, reason: 'invalid-request' });
  assert.deepEqual(evaluateRegisteredChallenge({ challengeId: 'html-00-o-que-e-web', files: [] }), { ok: false, reason: 'invalid-request' });
  assert.deepEqual(evaluateRegisteredChallenge({ challengeId: 'html-00-o-que-e-web', files: { 'index.html': 42 } }), { ok: false, reason: 'entrypoint-mismatch' });
});
