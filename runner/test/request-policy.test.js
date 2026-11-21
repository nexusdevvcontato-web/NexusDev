'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateExecutionRequest } = require('../src/request-policy');

test('accepts a bounded request shape', () => {
  const result = validateExecutionRequest({ userId: 'user-123', challengeId: 'html-00-o-que-e-web', files: { 'index.html': '<h1>Oi</h1>' } });
  assert.equal(result.ok, true);
});

test('rejects arrays and malformed requests', () => {
  assert.equal(validateExecutionRequest([]).ok, false);
  assert.equal(validateExecutionRequest({ userId: 'u', challengeId: 'html-00-o-que-e-web', files: [] }).ok, false);
});

test('rejects path traversal and invalid filenames', () => {
  assert.equal(validateExecutionRequest({ userId: 'u', challengeId: 'html-00-o-que-e-web', files: { '../secret': 'x' } }).ok, false);
});

test('enforces per-file, aggregate and count limits', () => {
  assert.equal(validateExecutionRequest({ userId: 'u', challengeId: 'html-00-o-que-e-web', files: { 'a.js': 'x'.repeat(50_001) } }).reason, 'file-size-limit');
  assert.equal(validateExecutionRequest({ userId: 'u', challengeId: 'html-00-o-que-e-web', files: Object.fromEntries(Array.from({length: 5}, (_, i) => [i + '.js', 'x'.repeat(40_001)])) }).reason, 'total-size-limit');
  assert.equal(validateExecutionRequest({ userId: 'u', challengeId: 'html-00-o-que-e-web', files: Object.fromEntries(Array.from({length: 11}, (_, i) => [i + '.js', 'x'])) }).reason, 'file-count-limit');
});

test('requires the exact trusted file set for each lesson', () => {
  const valid = validateExecutionRequest({
    userId: 'student-1',
    challengeId: 'mod-4-aula-2',
    files: {
      'produtoController.js': 'function listarProdutosController(req, res) { return res.status(200).json([]); }',
      'server.js': '// registered route example'
    }
  });
  assert.equal(valid.ok, true);
  assert.equal(validateExecutionRequest({
    userId: 'student-1',
    challengeId: 'html-00-o-que-e-web',
    files: { 'unexpected.js': 'x' }
  }).reason, 'entrypoint-mismatch');
  assert.equal(validateExecutionRequest({
    userId: 'student-1',
    challengeId: 'mod-4-aula-2',
    files: { 'produtoController.js': 'x', 'server.js': 'x', 'extra.js': 'x' }
  }).reason, 'entrypoint-mismatch');
});

test('rejects null bytes and oversized identities', () => {
  assert.equal(validateExecutionRequest({ userId: 'u', challengeId: 'html-00-o-que-e-web', files: { 'a.js': 'x' + String.fromCharCode(0) + 'y' } }).ok, false);
  assert.equal(validateExecutionRequest({ userId: 'x'.repeat(129), challengeId: 'html-00-o-que-e-web', files: { 'a.js': 'x' } }).ok, false);
});


test('accepts exact editor file sets for generated module-one HTML lessons', () => {
  for (const [challengeId, html] of [
    ['mod-1-aula-8', '<article class="perfil"><h2>Ana</h2><p>Dev</p></article>'],
    ['mod-1-aula-9', '<header><h1>Portfólio Dev #9</h1></header>'],
    ['mod-1-aula-10', '<nav><a>Início</a><a>Projetos</a></nav>'],
    ['mod-1-aula-11', '<form><input><button>Enviar</button></form>']
  ]) {
    const result = validateExecutionRequest({
      userId: 'student-1',
      challengeId,
      files: { 'index.html': html, 'style.css': '' }
    });
    assert.equal(result.ok, true, challengeId);
  }
});


test('accepts exact script entrypoints for generated module-two JavaScript lessons', () => {
  for (const challengeId of ['mod-2-aula-8', 'mod-2-aula-9', 'mod-2-aula-10']) {
    const result = validateExecutionRequest({
      userId: 'student-1',
      challengeId,
      files: { 'script.js': 'function solution() { return true; }' }
    });
    assert.equal(result.ok, true, challengeId);
  }
});


test('accepts the exact entrypoints for generated React, Express and module-five lessons', () => {
  for (const [challengeId, filename] of [
    ['mod-3-aula-5', 'script.js'],
    ['mod-3-aula-9', 'script.js'],
    ['mod-4-aula-8', 'controller.js'],
    ['mod-5-aula-8', 'rbac.js'],
    ['mod-5-aula-11', 'relatorioPedidos.js']
  ]) {
    const result = validateExecutionRequest({
      userId: 'student-1',
      challengeId,
      files: { [filename]: 'function solution() { return true; }' }
    });
    assert.equal(result.ok, true, challengeId);
  }
});
