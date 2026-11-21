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
    challengeId: 'mod-1-aula-7',
    files: { 'script.js': 'function exemplo() { return true; }' }
  }), { ok: false, reason: 'unsupported-challenge' });
});

test('routes registered Express controller lessons to the isolated controller evaluator', () => {
  const source = 'function listarProdutosController(req, res) { return res.status(200).json([{ id: 1, nome: "Teclado" }, { id: 2, nome: "Mouse" }]); }';
  assert.deepEqual(evaluateRegisteredChallenge({
    challengeId: 'mod-4-aula-2',
    files: { 'produtoController.js': source, 'server.js': "// app.get('/api/produtos', listarProdutosController);" }
  }), { ok: true });
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


test('evaluates generated module-one profile, header, navigation and form lessons', () => {
  const cases = [
    ['mod-1-aula-8', '<article class="perfil"><h2>Ana</h2><p>Full-Stack Developer</p></article>'],
    ['mod-1-aula-9', '<header><h1>Portfólio Dev #9</h1></header>'],
    ['mod-1-aula-10', '<nav><a href="#inicio">Início</a><a href="#projetos">Projetos</a></nav>'],
    ['mod-1-aula-11', '<form><input type="email" placeholder="Seu e-mail"><button>Enviar</button></form>']
  ];
  for (const [challengeId, html] of cases) {
    assert.deepEqual(evaluateRegisteredChallenge({
      challengeId,
      files: { 'index.html': html, 'style.css': '/* optional starter stylesheet */' }
    }), { ok: true }, challengeId);
  }
});

test('generated HTML lessons reject missing or undeclared supporting files', () => {
  assert.deepEqual(evaluateRegisteredChallenge({
    challengeId: 'mod-1-aula-9',
    files: { 'index.html': '<header><h1>Portfólio Dev #9</h1></header>' }
  }), { ok: false, reason: 'entrypoint-mismatch' });
  assert.deepEqual(evaluateRegisteredChallenge({
    challengeId: 'mod-1-aula-9',
    files: { 'index.html': '<header><h1>Portfólio Dev #9</h1></header>', 'style.css': '', 'extra.js': 'x' }
  }), { ok: false, reason: 'entrypoint-mismatch' });
});
