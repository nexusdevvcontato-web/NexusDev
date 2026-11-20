'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateChallenge, LIMITS } = require('../src/html-evaluator');

test('evaluates the six authored HTML lessons using trusted specifications', () => {
  const cases = [
    ['html-00-o-que-e-web', '<h1>Olá, Mundo!</h1>'],
    ['html-01-subtitulo-h2', '<h1>Meu site</h1><h2>Sobre Mim</h2>'],
    ['html-02-paragrafo-p', '<p>Texto introdutório</p>'],
    ['html-03-negrito-strong', '<p>Aprenda <strong>HTML</strong> hoje</p>'],
    ['html-04-lista-ul-li', '<ul><li>Um</li><li>Dois</li><li>Três</li></ul>'],
    ['html-05-botao-clicavel', '<button type="button">Começar Agora</button>']
  ];
  for (const [challengeId, source] of cases) {
    assert.deepEqual(evaluateChallenge({ challengeId, source }), { ok: true }, challengeId);
  }
});

test('rejects incorrect markup for each trusted lesson', () => {
  const cases = [
    ['html-00-o-que-e-web', '<h1>Bem-vindo</h1>'],
    ['html-01-subtitulo-h2', '<h1>Sobre Mim</h1>'],
    ['html-02-paragrafo-p', '<p>Oi</p>'],
    ['html-03-negrito-strong', '<p>Texto sem destaque</p>'],
    ['html-04-lista-ul-li', '<ul><li>Um</li><li>Dois</li></ul>'],
    ['html-05-botao-clicavel', '<button>Enviar</button>']
  ];
  for (const [challengeId, source] of cases) {
    assert.deepEqual(evaluateChallenge({ challengeId, source }), { ok: false, reason: 'tests-failed' }, challengeId);
  }
});

test('parses HTML fragments and tolerates browser-style omitted closing tags', () => {
  assert.deepEqual(evaluateChallenge({
    challengeId: 'html-04-lista-ul-li',
    source: '<ul><li>Um<li>Dois<li>Três</ul>'
  }), { ok: true });
});

test('does not execute scripts, load resources or create a browser context', () => {
  const source = '<script>globalThis.comprometido = true</script><h1>Olá, Mundo!</h1><img src="https://invalid.example/track">';
  assert.deepEqual(evaluateChallenge({ challengeId: 'html-00-o-que-e-web', source }), { ok: true });
});

test('does not accept user-provided selectors or test definitions', () => {
  assert.deepEqual(evaluateChallenge({
    challengeId: 'html-00-o-que-e-web',
    source: '<h1>Olá, Mundo!</h1>',
    tests: [{ type: 'selector-exists', selector: '*' }]
  }), { ok: true });
  assert.deepEqual(evaluateChallenge({ challengeId: 'html-00-o-que-e-web', source: '<h1>Olá, Mundo!</h1>' }), { ok: true });
});

test('rejects unknown lessons and mismatched language specs', () => {
  assert.deepEqual(evaluateChallenge({ challengeId: 'mod-1-aula-7', source: '<h1>x</h1>' }), { ok: false, reason: 'unsupported-challenge' });
  assert.deepEqual(evaluateChallenge({ challengeId: 'js-01-variaveis-calculo', source: '<h1>x</h1>' }), { ok: false, reason: 'unsupported-challenge' });
});

test('bounds input bytes, parsed node count, nesting depth and extracted text', () => {
  assert.deepEqual(evaluateChallenge({ challengeId: 'html-00-o-que-e-web', source: ' '.repeat(LIMITS.sourceBytes + 1) }), { ok: false, reason: 'source-limit' });
  const deep = '<h1>' + '<span>'.repeat(LIMITS.depth + 2) + 'Olá, Mundo!' + '</span>'.repeat(LIMITS.depth + 2) + '</h1>';
  assert.deepEqual(evaluateChallenge({ challengeId: 'html-00-o-que-e-web', source: deep }), { ok: false, reason: 'depth-limit' });
  const longText = '<h1>' + 'x'.repeat(LIMITS.textLength + 1) + '</h1>';
  assert.deepEqual(evaluateChallenge({ challengeId: 'html-00-o-que-e-web', source: longText }), { ok: false, reason: 'text-limit' });
});

test('does not treat a button click handler as proof of behavior', () => {
  assert.deepEqual(evaluateChallenge({
    challengeId: 'html-05-botao-clicavel',
    source: `<button onclick="fetch('https://invalid.example')">Começar Agora</button>`
  }), { ok: true });
});
