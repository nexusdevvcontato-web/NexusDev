'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateChallenge, LIMITS } = require('../src/js-evaluator');

test('interprets variable declarations and arithmetic without evaluating JavaScript source', () => {
  const result = evaluateChallenge({
    challengeId: 'js-01-variaveis-calculo',
    source: 'function calcularPrecoComDesconto(preco, desconto) { const valorDesconto = preco * desconto / 100; const resultado = preco - valorDesconto; return resultado; }',
    argsList: [[100, 20], [250, 10], [100, 0]]
  });
  assert.deepEqual(result, { ok: true, results: [80, 225, 100] });
});

test('interprets if/else and logical conditions for shipping', () => {
  const source = 'function calcularFrete(valor, freteGratis) { if (freteGratis || valor >= 200) { return 0; } else { return 25; } }';
  const result = evaluateChallenge({ challengeId: 'js-02-condicionais-frete', source, argsList: [[200, false], [80, true], [150, false], [0, false]] });
  assert.deepEqual(result, { ok: true, results: [0, 0, 0, 25] });
});

test('supports bounded Array.prototype.reduce for the array-sum lesson', () => {
  const source = 'function somarArray(numeros) { return numeros.reduce((total, numero) => total + numero, 0); }';
  const result = evaluateChallenge({ challengeId: 'js-03-arrays-soma', source, argsList: [[[1, 2, 3, 4]], [[]], [[-2, 5]]] });
  assert.deepEqual(result, { ok: true, results: [10, 0, 3] });
});

test('accepts a function assigned to a const', () => {
  const result = evaluateChallenge({ challengeId: 'js-01-variaveis-calculo', source: 'const calcularPrecoComDesconto = (preco, desconto) => preco - (preco * desconto / 100);', argsList: [[100, 20]] });
  assert.deepEqual(result, { ok: true, results: [80] });
});

test('rejects globals, property traversal, constructors and arbitrary calls', () => {
  for (const source of [
    'function calcularPrecoComDesconto(a,b) { return process.exit(1); }',
    'function calcularPrecoComDesconto(a,b) { return globalThis; }',
    'function calcularPrecoComDesconto(a,b) { return a.constructor; }',
    'function calcularPrecoComDesconto(a,b) { return require("fs"); }',
    'function calcularPrecoComDesconto(a,b) { return a.map(x => x); }'
  ]) {
    const result = evaluateChallenge({ challengeId: 'js-01-variaveis-calculo', source, argsList: [[1, 2]] });
    assert.equal(result.ok, false);
  }
});

test('rejects loops, recursion, multiple top-level statements and unsupported syntax', () => {
  const sources = [
    'function calcularPrecoComDesconto(a,b) { while (true) {} return 1; }',
    'function calcularPrecoComDesconto(a,b) { return calcularPrecoComDesconto(a,b); }',
    'function calcularPrecoComDesconto(a,b) { return 1; } process.exit(0);',
    'function calcularPrecoComDesconto(a,b) { try { return 1; } catch(e) {} }',
    'async function calcularPrecoComDesconto(a,b) { return 1; }',
    'function* calcularPrecoComDesconto(a,b) { return 1; }'
  ];
  for (const source of sources) assert.equal(evaluateChallenge({ challengeId: 'js-01-variaveis-calculo', source, argsList: [[1, 2]] }).ok, false);
});

test('bounds source and AST complexity', () => {
  const huge = 'function calcularPrecoComDesconto(a,b) { return ' + '1+'.repeat(LIMITS.astNodes) + '1; }';
  assert.equal(evaluateChallenge({ challengeId: 'js-01-variaveis-calculo', source: huge, argsList: [[1, 2]] }).ok, false);
});

test('rejects unknown challenges and mismatched lesson specs', () => {
  assert.deepEqual(evaluateChallenge({ challengeId: 'mod-1-aula-7', source: '', argsList: [] }), { ok: false, reason: 'unsupported-challenge' });
  assert.deepEqual(evaluateChallenge({ challengeId: 'html-00-o-que-e-web', source: '', argsList: [] }), { ok: false, reason: 'unsupported-challenge' });
});
