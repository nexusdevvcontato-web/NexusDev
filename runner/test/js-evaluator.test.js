'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateChallenge, LIMITS } = require('../src/js-evaluator');

test('passes the trusted variable and arithmetic cases', () => {
  const source = 'function calcularPrecoComDesconto(preco, desconto) { const valorDesconto = preco * desconto / 100; const resultado = preco - valorDesconto; return resultado; }';
  assert.deepEqual(evaluateChallenge({ challengeId: 'js-01-variaveis-calculo', source }), { ok: true });
});

test('passes trusted if/else and logical shipping cases', () => {
  const source = 'function calcularFrete(valor, freteGratis) { if (freteGratis || valor >= 200) { return 0; } else { return 25; } }';
  assert.deepEqual(evaluateChallenge({ challengeId: 'js-02-condicionais-frete', source }), { ok: true });
});

test('passes trusted bounded array-reduction cases', () => {
  const source = 'function somarArray(numeros) { return numeros.reduce((total, numero) => total + numero, 0); }';
  assert.deepEqual(evaluateChallenge({ challengeId: 'js-03-arrays-soma', source }), { ok: true });
});

test('supports trusted deep-equality checks for plain objects and arrays', () => {
  const source = 'function criarModeloCartaoProduto(produto) { return { tipo: "article", titulo: produto.nome, preco: produto.preco }; }';
  assert.deepEqual(evaluateChallenge({ challengeId: 'mod-3-aula-2', source }), { ok: true });
});

test('supports deep-equality checks for nested objects and empty arrays', () => {
  const source = 'function formatarErroApi(erro) { if (erro.code) { return { mensagem: erro.message, codigo: erro.code }; } else { return { mensagem: "Erro interno", codigo: "INTERNAL_ERROR" }; } }';
  assert.deepEqual(evaluateChallenge({ challengeId: 'mod-4-aula-4', source }), { ok: true });
});

test('runs trusted no-mutation checks alongside deep-equality cases', () => {
  const source = 'function criarModeloCartaoProduto(produto) { return { tipo: "article", titulo: produto.nome, preco: produto.preco }; }';
  assert.deepEqual(evaluateChallenge({ challengeId: 'mod-3-aula-2', source }), { ok: true });
});

test('does not accept caller-supplied deep-equality or immutability test definitions', () => {
  const source = 'function formatarErroApi(erro) { return {}; }';
  assert.deepEqual(evaluateChallenge({
    challengeId: 'mod-4-aula-4',
    source,
    tests: [{ type: 'function-deep-equals', args: [{}], expected: {} }]
  }), { ok: false, reason: 'tests-failed' });
});

test('accepts a function assigned to a const', () => {
  const source = 'const calcularPrecoComDesconto = (preco, desconto) => preco - (preco * desconto / 100);';
  assert.deepEqual(evaluateChallenge({ challengeId: 'js-01-variaveis-calculo', source }), { ok: true });
});

test('does not allow the caller to replace trusted test inputs or expected outputs', () => {
  const source = 'function calcularPrecoComDesconto(a,b) { return 999; }';
  assert.deepEqual(evaluateChallenge({
    challengeId: 'js-01-variaveis-calculo',
    source,
    argsList: [[1, 1]],
    expected: 999
  }), { ok: false, reason: 'tests-failed' });
});

test('rejects globals, property traversal, constructors and arbitrary calls', () => {
  for (const source of [
    'function calcularPrecoComDesconto(a,b) { return process.exit(1); }',
    'function calcularPrecoComDesconto(a,b) { return globalThis; }',
    'function calcularPrecoComDesconto(a,b) { return a.constructor; }',
    'function calcularPrecoComDesconto(a,b) { return require("fs"); }',
    'function calcularPrecoComDesconto(a,b) { return a.map(x => x); }'
  ]) {
    assert.equal(evaluateChallenge({ challengeId: 'js-01-variaveis-calculo', source }).ok, false);
  }
});

test('rejects loops, recursion, multiple top-level statements and unsupported syntax even in dead branches', () => {
  const sources = [
    'function calcularPrecoComDesconto(a,b) { while (true) {} return 1; }',
    'function calcularPrecoComDesconto(a,b) { return calcularPrecoComDesconto(a,b); }',
    'function calcularPrecoComDesconto(a,b) { return 1; } process.exit(0);',
    'function calcularPrecoComDesconto(a,b) { try { return 1; } catch(e) {} }',
    'async function calcularPrecoComDesconto(a,b) { return 1; }',
    'function* calcularPrecoComDesconto(a,b) { return 1; }',
    'function calcularPrecoComDesconto(a,b) { if (false) { while (true) {} } return 80; }'
  ];
  for (const source of sources) assert.equal(evaluateChallenge({ challengeId: 'js-01-variaveis-calculo', source }).ok, false);
});

test('bounds intermediate strings and rejects non-finite arithmetic', () => {
  const amplified = 'function calcularPrecoComDesconto(a,b) { let x = "1234567890"; x = x + x; x = x + x; x = x + x; x = x + x; x = x + x; x = x + x; x = x + x; x = x + x; x = x + x; x = x + x; x = x + x; x = x + x; return 80; }';
  assert.equal(evaluateChallenge({ challengeId: 'js-01-variaveis-calculo', source: amplified }).ok, false);
  const infinite = 'function calcularPrecoComDesconto(a,b) { return a / 0; }';
  assert.equal(evaluateChallenge({ challengeId: 'js-01-variaveis-calculo', source: infinite }).ok, false);
});

test('bounds source and AST complexity', () => {
  const huge = 'function calcularPrecoComDesconto(a,b) { return ' + '1+'.repeat(LIMITS.astNodes) + '1; }';
  assert.equal(evaluateChallenge({ challengeId: 'js-01-variaveis-calculo', source: huge }).ok, false);
});

test('rejects unknown challenges and lesson specs without function-case tests', () => {
  assert.deepEqual(evaluateChallenge({ challengeId: 'mod-1-aula-7', source: '' }), { ok: false, reason: 'unsupported-challenge' });
  assert.deepEqual(evaluateChallenge({ challengeId: 'html-00-o-que-e-web', source: '' }), { ok: false, reason: 'unsupported-challenge' });
});
