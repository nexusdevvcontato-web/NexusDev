// Authoritative lesson identifiers mirrored from the published curriculum.
// Keep this list synchronized with the curriculum release before adding lessons.
const STATIC_CHALLENGE_IDS = new Set([
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
]);

const GENERATED_MODULES = new Set([1, 2, 3, 4, 5]);
const LESSONS_PER_GENERATED_MODULE = 140;

function isKnownChallengeId(value) {
  if (typeof value !== 'string' || value.length > 100) return false;
  if (STATIC_CHALLENGE_IDS.has(value)) return true;

  const match = /^mod-([1-5])-aula-(\d{1,3})$/.exec(value);
  if (!match) return false;

  const moduleNumber = Number(match[1]);
  const lessonNumber = Number(match[2]);
  return GENERATED_MODULES.has(moduleNumber) &&
    Number.isInteger(lessonNumber) &&
    lessonNumber >= 1 &&
    lessonNumber <= LESSONS_PER_GENERATED_MODULE;
}

const EXPECTED_COURSE_COMPLETIONS = 700;

module.exports = {
  isKnownChallengeId,
  EXPECTED_COURSE_COMPLETIONS
};
