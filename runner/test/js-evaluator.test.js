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

test('supports immutable object spread inside a trusted map callback', () => {
  const source = 'function atualizarPrecoProduto(produtos, id, novoPreco) { return produtos.map(produto => produto.id === id ? { ...produto, preco: novoPreco } : produto); }';
  assert.deepEqual(evaluateChallenge({ challengeId: 'mod-3-aula-3', source }), { ok: true });
});

test('supports bounded array spread and preserves reduction results', () => {
  const source = 'function somarArray(numeros) { const copia = [...numeros]; return copia.reduce((soma, numero) => soma + numero, 0); }';
  assert.deepEqual(evaluateChallenge({ challengeId: 'js-03-arrays-soma', source }), { ok: true });
});

test('supports object shorthand properties in trusted object construction', () => {
  const source = 'function criarModeloCartaoProduto(produto) { const titulo = produto.nome; return { tipo: "article", titulo, preco: produto.preco }; }';
  assert.deepEqual(evaluateChallenge({ challengeId: 'mod-3-aula-2', source }), { ok: true });
});

test('rejects unsafe spread sources and prototype-related object keys', () => {
  const source = 'function criarModeloCartaoProduto(produto) { return { ...produto, constructor: 1 }; }';
  assert.equal(evaluateChallenge({ challengeId: 'mod-3-aula-2', source }).ok, false);
});

test('supports bounded filter callbacks with lexical parameters', () => {
  const source = 'function filtrarProdutosPorPreco(produtos, limite) { return produtos.filter(produto => produto.preco < limite); }';
  assert.deepEqual(evaluateChallenge({ challengeId: 'mod-3-aula-4', source }), { ok: true });
});

test('supports bounded map callbacks with index and lexical parameters', () => {
  const source = 'function somarArray(numeros) { return numeros.map((numero, indice) => numero + indice - indice).reduce((total, numero) => total + numero, 0); }';
  assert.deepEqual(evaluateChallenge({ challengeId: 'js-03-arrays-soma', source }), { ok: true });
});

test('rejects arbitrary callback methods and oversized array inputs', () => {
  const source = 'function filtrarProdutosPorPreco(produtos, limite) { return produtos.filter(produto => produto.preco < limite); }';
  assert.deepEqual(evaluateChallenge({ challengeId: 'mod-3-aula-4', source }), { ok: true });
  const unsafe = 'function filtrarProdutosPorPreco(produtos, limite) { return produtos.filter(produto => produto.constructor); }';
  assert.equal(evaluateChallenge({ challengeId: 'mod-3-aula-4', source: unsafe }).ok, false);
});

test('supports bounded some callbacks with lexical parameters for immutable cart updates', () => {
  const source = 'function adicionarAoCarrinho(carrinho, produto) { const existe = carrinho.some(item => item.id === produto.id); if (existe) return carrinho.map(item => item.id === produto.id ? { ...item, qtd: item.qtd + 1 } : item); return [...carrinho, { ...produto, qtd: 1 }]; }';
  assert.deepEqual(evaluateChallenge({ challengeId: 'react-01-carrinho-imutavel', source }), { ok: true });
});

test('supports only the fixed whitespace regular expression in split', () => {
  const source = 'function contarPalavras(texto) { const limpo = texto.trim(); if (!limpo) return 0; return limpo.split(/\\s+/).length; }';
  assert.deepEqual(evaluateChallenge({ challengeId: 'mod-2-aula-6', source }), { ok: true });
  const unsafe = 'function contarPalavras(texto) { return texto.split(/(a+)+$/).length; }';
  assert.equal(evaluateChallenge({ challengeId: 'mod-2-aula-6', source: unsafe }).ok, false);
});


  const findSource = 'function somarArray(numeros) { return numeros.find(numero => numero > 2); }';
  const someSource = 'function somarArray(numeros) { return numeros.some(numero => numero > 2); }';
  assert.equal(evaluateChallenge({ challengeId: 'js-03-arrays-soma', source: findSource }).ok, false);
  assert.equal(evaluateChallenge({ challengeId: 'js-03-arrays-soma', source: someSource }).ok, false);
});

test('supports bounded string normalization methods in trusted email cases', () => {
  const source = 'function normalizarEmail(email) { return email.trim().toLowerCase(); }';
  assert.deepEqual(evaluateChallenge({ challengeId: 'mod-2-aula-5', source }), { ok: true });
});

test('supports typeof for values in trusted role checks without exposing globals', () => {
  const source = 'function podeAcessarPerfil(usuario, perfilRequerido) { if (!usuario || typeof usuario !== "object" || typeof perfilRequerido !== "string" || !perfilRequerido) { return false; } return usuario.role === perfilRequerido; }';
  assert.deepEqual(evaluateChallenge({ challengeId: 'mod-5-aula-7', source }), { ok: true });
});

test('typeof does not make unresolved identifiers readable outside typeof', () => {
  const source = 'function calcularPrecoComDesconto(preco, desconto) { if (typeof preco !== "number") { return 0; } return preco - (preco * desconto / 100); }';
  assert.deepEqual(evaluateChallenge({ challengeId: 'js-01-variaveis-calculo', source }), { ok: true });
  const unsafe = 'function calcularPrecoComDesconto(preco, desconto) { return process; }';
  assert.equal(evaluateChallenge({ challengeId: 'js-01-variaveis-calculo', source: unsafe }).ok, false);
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
