'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateRegisteredChallenge } = require('../src/evaluator');

function evaluate(source, challengeId = 'mod-5-aula-8', filename = 'rbac.js') {
  return evaluateRegisteredChallenge({ challengeId, files: { [filename]: source } });
}

test('rejects access to runtime globals instead of exposing the Node process', () => {
  assert.deepEqual(
    evaluate('function validarPermissaoJWT_8(usuario) { return process.exit(1); }'),
    { ok: false, reason: 'unknown-identifier' }
  );
  assert.deepEqual(
    evaluate('function validarPermissaoJWT_8(usuario) { return globalThis.process; }'),
    { ok: false, reason: 'unknown-identifier' }
  );
});

test('blocks object prototype and constructor traversal', () => {
  assert.deepEqual(
    evaluate('function validarPermissaoJWT_8(usuario) { return usuario.constructor; }'),
    { ok: false, reason: 'unsupported-member' }
  );
  assert.deepEqual(
    evaluate('function validarPermissaoJWT_8(usuario) { return usuario.__proto__; }'),
    { ok: false, reason: 'unsupported-member' }
  );
  assert.deepEqual(
    evaluate('function validarPermissaoJWT_8(usuario) { return usuario["role"]; }'),
    { ok: false, reason: 'unsupported-member' }
  );
});

test('rejects loops and unsupported syntax before interpretation', () => {
  assert.deepEqual(
    evaluate('function validarPermissaoJWT_8(usuario) { while (true) {} return true; }'),
    { ok: false, reason: 'unsupported-syntax' }
  );
  assert.deepEqual(
    evaluate('function validarPermissaoJWT_8(usuario) { try { return true; } catch (e) { return false; } }'),
    { ok: false, reason: 'unsupported-syntax' }
  );
});

test('rejects oversized student source before parsing or evaluation', () => {
  const source = 'function validarPermissaoJWT_8(usuario) { return true; }' + ' '.repeat(50_001);
  assert.deepEqual(evaluate(source), { ok: false, reason: 'source-limit' });
});

test('keeps unknown challenge identifiers ineligible for official evaluation', () => {
  assert.deepEqual(evaluate(
    'function exemplo(usuario) { return true; }',
    'mod-5-aula-999',
    'rbac.js'
  ), { ok: false, reason: 'unsupported-challenge' });
});

test('resolves typeof against callback parent scopes without exposing globals', () => {
  assert.deepEqual(
    evaluate(
      "function filtrarBuscaProdutos_7(produtos, termoBusca) { return produtos.filter(p => typeof termoBusca === 'string' && p.nome.toLowerCase().includes(termoBusca.trim().toLowerCase())); }",
      'mod-3-aula-7',
      'script.js'
    ),
    { ok: true }
  );
  assert.deepEqual(
    evaluate('function validarPermissaoJWT_8(usuario) { return typeof process === "undefined" && usuario.role === "admin"; }'),
    { ok: true }
  );
});
