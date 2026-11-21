'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateAndCreateCompletionProof } = require('../src/modules/proofs/evaluate-completion');

test('creates a one-time server proof only after trusted HTML checks pass', () => {
  const result = evaluateAndCreateCompletionProof({
    userId: 'synthetic-user',
    challengeId: 'html-00-o-que-e-web',
    files: { 'index.html': '<h1>Olá, Mundo!</h1>' },
    nowSeconds: 1000
  });
  assert.equal(result.ok, true);
  assert.match(result.proof.jti, /^[0-9a-f-]{36}$/i);
  assert.equal(result.proof.exp, 1120);
  assert.equal(result.proof.challengeId, 'html-00-o-que-e-web');
  assert.match(result.proof.filesHash, /^[a-f0-9]{64}$/);
});

test('creates proof for supported JavaScript only when server-owned cases pass', () => {
  const result = evaluateAndCreateCompletionProof({
    userId: 'synthetic-user',
    challengeId: 'js-01-variaveis-calculo',
    files: { 'script.js': 'function calcularPrecoComDesconto(preco, desconto) { return preco - preco * desconto / 100; }' }
  });
  assert.equal(result.ok, true);
});

test('creates proofs for registered multi-file Express lessons while evaluating only the entrypoint', () => {
  const list = evaluateAndCreateCompletionProof({
    userId: 'synthetic-user',
    challengeId: 'mod-4-aula-2',
    files: {
      'produtoController.js': 'function listarProdutosController(req, res) { return res.status(200).json([{ id: 1, nome: "Teclado" }, { id: 2, nome: "Mouse" }]); }',
      'server.js': "// app.get('/api/produtos', listarProdutosController);"
    },
    nowSeconds: 3000
  });
  assert.equal(list.ok, true);
  assert.match(list.proof.filesHash, /^[a-f0-9]{64}$/);

  const create = evaluateAndCreateCompletionProof({
    userId: 'synthetic-user',
    challengeId: 'node-01-controller-produto',
    files: {
      'produtoController.js': 'function criarProdutoController(req, res) { const titulo = req.body.titulo; const preco = req.body.preco; if (!titulo || typeof preco !== "number" || preco <= 0) return res.status(400).json({ erro: "Dados inválidos" }); return res.status(201).json({ id: 101, titulo, preco }); }',
      'server.js': "// app.post('/api/produtos', criarProdutoController);"
    },
    nowSeconds: 3000
  });
  assert.equal(create.ok, true);
});

test('does not create proof for failed, unknown or unsupported lessons', () => {
  for (const input of [
    { userId: 'u', challengeId: 'html-00-o-que-e-web', files: { 'index.html': '<h1>não confere</h1>' } },
    { userId: 'u', challengeId: 'mod-1-aula-141', files: { 'index.html': '<h1>Olá, Mundo!</h1>' } },
    { userId: 'u', challengeId: 'js-01-variaveis-calculo', files: { 'script.js': 'function calcularPrecoComDesconto(a,b) { return process; }' } },
    { userId: 'u', challengeId: 'html-00-o-que-e-web', files: { 'index.html': '<h1>Olá, Mundo!</h1>', 'extra.js': 'x' } }
  ]) assert.equal(evaluateAndCreateCompletionProof(input).ok, false);
});

test('does not accept caller-provided tests or expected outputs', () => {
  const result = evaluateAndCreateCompletionProof({
    userId: 'synthetic-user',
    challengeId: 'js-01-variaveis-calculo',
    files: { 'script.js': 'function calcularPrecoComDesconto(a,b) { return 999; }' },
    tests: [{ type: 'function-cases', cases: [{ args: [1, 1], expected: 999 }] }]
  });
  assert.deepEqual(result, { ok: false, reason: 'tests-failed' });
});

test('uses a deterministic one-time identifier for identical user, lesson and source', () => {
  const input = {
    userId: 'synthetic-user',
    challengeId: 'html-00-o-que-e-web',
    files: { 'index.html': '<h1>Olá, Mundo!</h1>' },
    nowSeconds: 2000
  };
  const first = evaluateAndCreateCompletionProof(input);
  const repeated = evaluateAndCreateCompletionProof(input);
  const changed = evaluateAndCreateCompletionProof({
    ...input,
    files: { 'index.html': '<h1>Olá, Mundo!</h1><p>Outro texto</p>' }
  });
  assert.equal(first.ok, true);
  assert.equal(repeated.ok, true);
  assert.equal(first.proof.jti, repeated.proof.jti);
  assert.notEqual(first.proof.jti, changed.proof.jti);
});
