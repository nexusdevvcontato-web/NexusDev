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

test('validates Box Model CSS declarations from the exact supporting stylesheet', () => {
  assert.deepEqual(evaluateChallenge({
    challengeId: 'mod-1-aula-12',
    source: '<div class="caixa-destaque">Card</div>',
    cssSource: '.caixa-destaque { padding: 16px; border-radius: 12px; }'
  }), { ok: true });
  assert.deepEqual(evaluateChallenge({
    challengeId: 'mod-1-aula-12',
    source: '<div class="caixa-destaque">Card</div>',
    cssSource: '.caixa-destaque { padding: 8px; border-radius: 12px; }'
  }), { ok: false, reason: 'tests-failed' });
});

test('validates Flexbox and Grid declarations without running a browser', () => {
  assert.deepEqual(evaluateChallenge({
    challengeId: 'mod-1-aula-13',
    source: '<div class="centro"><span>Badge</span></div>',
    cssSource: '.centro { display: flex; justify-content: center; align-items: center; }'
  }), { ok: true });
  assert.deepEqual(evaluateChallenge({
    challengeId: 'mod-1-aula-14',
    source: '<div class="vitrine"><div>A</div><div>B</div></div>',
    cssSource: '.vitrine { display: grid; grid-template-columns: repeat(2, 1fr); }'
  }), { ok: true });
});

test('validates debug source correction and required alert color', () => {
  assert.deepEqual(evaluateChallenge({
    challengeId: 'mod-1-aula-15',
    source: '<div class="alerta"><p>Atenção</p></div>',
    cssSource: '.alerta { color: #f8fafc; }'
  }), { ok: true });
  assert.deepEqual(evaluateChallenge({
    challengeId: 'mod-1-aula-15',
    source: '<div class="alerta"><p>Atenção</p></div>',
    cssSource: '.alerta { color: red; }'
  }), { ok: false, reason: 'tests-failed' });
});

test('rejects unsupported CSS selectors and malformed CSS safely', () => {
  assert.deepEqual(evaluateChallenge({
    challengeId: 'mod-1-aula-13',
    source: '<div class="centro"></div>',
    cssSource: '* { display: flex; } .centro { justify-content: center; align-items: center; }'
  }), { ok: false, reason: 'unsupported-css-selector' });
  assert.deepEqual(evaluateChallenge({
    challengeId: 'mod-1-aula-13',
    source: '<div class="centro"></div>',
    cssSource: '.centro { display flex; }'
  }), { ok: false, reason: 'invalid-css-declaration' });
});
