const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isKnownChallengeId,
  EXPECTED_COURSE_COMPLETIONS
} = require('../src/modules/curriculum/catalog');

test('accepts the curriculum static lesson IDs', () => {
  for (const id of [
    'html-00-o-que-e-web',
    'html-05-botao-clicavel',
    'js-01-variaveis-calculo',
    'react-01-carrinho-imutavel',
    'node-01-controller-produto'
  ]) {
    assert.equal(isKnownChallengeId(id), true, id);
  }
});

test('accepts generated lesson ranges that exist in each module', () => {
  for (const id of [
    'mod-1-aula-7', 'mod-1-aula-140',
    'mod-2-aula-4', 'mod-2-aula-140',
    'mod-3-aula-2', 'mod-3-aula-140',
    'mod-4-aula-2', 'mod-4-aula-140',
    'mod-5-aula-1', 'mod-5-aula-140'
  ]) {
    assert.equal(isKnownChallengeId(id), true, id);
  }
});

test('rejects IDs outside the published curriculum', () => {
  for (const id of [
    'mod-1-aula-1',
    'mod-2-aula-3',
    'mod-3-aula-1',
    'mod-4-aula-1',
    'mod-6-aula-1',
    'mod-1-aula-141',
    'mod-1-aula-07',
    'mod-2-aula-004',
    'mod-5-aula-01',
    'mod-5-aula-0001',
    'mod-5-aula-0',
    'made-up-lesson',
    '',
    null,
    123
  ]) {
    assert.equal(isKnownChallengeId(id), false, String(id));
  }
});

test('curriculum allowlist contains exactly 700 valid lesson IDs', () => {
  const ids = [
    'html-00-o-que-e-web',
    'html-01-subtitulo-h2',
    'html-02-paragrafo-p',
    'html-03-negrito-strong',
    'html-04-lista-ul-li',
    'html-05-botao-clicavel',
    'js-01-variaveis-calculo',
    'js-02-condicionais-frete',
    'js-03-arrays-soma',
    'react-01-carrinho-imutavel',
    'node-01-controller-produto'
  ];
  const starts = { 1: 7, 2: 4, 3: 2, 4: 2, 5: 1 };
  for (const [moduleNumber, first] of Object.entries(starts)) {
    for (let lesson = first; lesson <= 140; lesson += 1) {
      ids.push(`mod-${moduleNumber}-aula-${lesson}`);
    }
  }
  assert.equal(new Set(ids).size, EXPECTED_COURSE_COMPLETIONS);
  assert.ok(ids.every(isKnownChallengeId));
});
