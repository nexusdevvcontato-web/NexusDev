'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { CHALLENGE_SPECS, getChallengeSpec, isRunnerSupportedChallenge } = require('../src/challenge-registry');
const { validateExecutionRequest } = require('../src/request-policy');

test('registers only lessons with explicit server-owned test specifications', () => {
  assert.equal(Object.keys(CHALLENGE_SPECS).length, 464);
  for (const [id, spec] of Object.entries(CHALLENGE_SPECS)) {
    assert.equal(isRunnerSupportedChallenge(id), true);
    assert.ok(['html', 'javascript'].includes(spec.language));
    assert.ok(typeof spec.entrypoint === 'string');
    assert.ok(Array.isArray(spec.tests) && spec.tests.length > 0);
    for (const check of spec.tests) assert.equal(typeof check.type, 'string');
  }
});

test('does not treat generated placeholder curriculum IDs as executable lessons', () => {
  assert.equal(getChallengeSpec('mod-1-aula-7'), null);
  assert.equal(getChallengeSpec('mod-5-aula-141'), null);
  assert.equal(isRunnerSupportedChallenge('unknown-lesson'), false);
});

test('registers the three new JavaScript foundation lessons', () => {
  for (const id of ['mod-2-aula-4', 'mod-2-aula-5', 'mod-2-aula-6']) {
    const spec = getChallengeSpec(id);
    assert.ok(spec);
    assert.equal(spec.language, 'javascript');
    assert.equal(spec.entrypoint, 'script.js');
    assert.ok(spec.exportName);
    assert.ok(spec.tests.some((check) => check.type === 'function-cases'));
  }
  assert.equal(getChallengeSpec('mod-2-aula-7'), null);
});

test('request boundary accepts the new authored JavaScript lessons', () => {
  for (const challengeId of ['mod-2-aula-4', 'mod-2-aula-5', 'mod-2-aula-6']) {
    const result = validateExecutionRequest({
      userId: 'student-1',
      challengeId,
      files: { 'script.js': 'function solution() { return 1; }' }
    });
    assert.equal(result.ok, true, challengeId);
  }
});


test('registers three authored React foundation lessons', () => {
  for (const id of ['mod-3-aula-2', 'mod-3-aula-3', 'mod-3-aula-4']) {
    const spec = getChallengeSpec(id);
    assert.ok(spec);
    assert.equal(spec.language, 'javascript');
    assert.equal(spec.entrypoint, 'script.js');
    assert.ok(spec.exportName);
    assert.ok(spec.tests.length > 0);
  }
  assert.equal(getChallengeSpec('mod-3-aula-141'), null);
});

test('request boundary accepts the new authored React lessons', () => {
  for (const challengeId of ['mod-3-aula-2', 'mod-3-aula-3', 'mod-3-aula-4']) {
    const result = validateExecutionRequest({
      userId: 'student-1',
      challengeId,
      files: { 'script.js': 'function solution() { return []; }' }
    });
    assert.equal(result.ok, true, challengeId);
  }
});


test('registers three authored Node and Express lessons', () => {
  const list = getChallengeSpec('mod-4-aula-2');
  assert.equal(list.exportName, 'listarProdutosController');
  assert.ok(list.tests.some((check) => check.type === 'http-controller-case'));
  const validation = getChallengeSpec('mod-4-aula-3');
  assert.equal(validation.exportName, 'validarProduto');
  assert.ok(validation.tests.some((check) => check.type === 'function-cases'));
  const errors = getChallengeSpec('mod-4-aula-4');
  assert.equal(errors.exportName, 'formatarErroApi');
  assert.ok(errors.tests.some((check) => check.type === 'function-deep-equals'));
  assert.equal(getChallengeSpec('mod-4-aula-5'), null);
});

test('request boundary accepts the authored Node and Express lesson file sets', () => {
  for (const [challengeId, files] of [
    ['mod-4-aula-2', { 'produtoController.js': 'function listarProdutosController(req, res) { return res.status(200).json([]); }', 'server.js': '// registered route example' }],
    ['mod-4-aula-3', { 'validacao.js': 'function validarProduto(dados) { return true; }' }],
    ['mod-4-aula-4', { 'errorHandler.js': 'function formatarErroApi(erro) { return {}; }' }],
    ['node-01-controller-produto', { 'produtoController.js': 'function criarProdutoController(req, res) { return res.status(201).json({ id: 101 }); }', 'server.js': '// registered route example' }]
  ]) {
    const result = validateExecutionRequest({ userId: 'student-1', challengeId, files });
    assert.equal(result.ok, true, challengeId);
  }
});

test('request boundary rejects undeclared supporting and arbitrary files', () => {
  assert.equal(validateExecutionRequest({
    userId: 'student-1',
    challengeId: 'mod-4-aula-2',
    files: { 'produtoController.js': 'function listarProdutosController() { return 1; }' }
  }).ok, false);
  assert.equal(validateExecutionRequest({
    userId: 'student-1',
    challengeId: 'mod-4-aula-2',
    files: { 'produtoController.js': 'x', 'server.js': 'x', 'extra.js': 'x' }
  }).ok, false);
});


test('registers three authored MongoDB and secure signup lessons', () => {
  const document = getChallengeSpec('mod-5-aula-2');
  assert.equal(document.exportName, 'criarDocumentoProduto');
  assert.ok(document.tests.some((check) => check.type === 'does-not-mutate-input'));
  const update = getChallengeSpec('mod-5-aula-3');
  assert.equal(update.exportName, 'criarAtualizacaoProduto');
  assert.ok(update.tests.some((check) => check.type === 'function-deep-equals'));
  const signup = getChallengeSpec('mod-5-aula-4');
  assert.equal(signup.exportName, 'validarCadastroUsuario');
  assert.ok(signup.tests.some((check) => check.type === 'function-cases'));
  assert.equal(getChallengeSpec('mod-5-aula-141'), null);
});

test('request boundary accepts the new MongoDB and signup lessons', () => {
  for (const [challengeId, filename] of [
    ['mod-5-aula-2', 'documento.js'],
    ['mod-5-aula-3', 'atualizacao.js'],
    ['mod-5-aula-4', 'cadastro.js']
  ]) {
    const result = validateExecutionRequest({
      userId: 'student-1',
      challengeId,
      files: { [filename]: 'function solution() { return true; }' }
    });
    assert.equal(result.ok, true, challengeId);
  }
});


test('registers password policy, Bearer parsing and RBAC lessons', () => {
  const password = getChallengeSpec('mod-5-aula-5');
  assert.equal(password.exportName, 'validarPoliticaSenha');
  const bearer = getChallengeSpec('mod-5-aula-6');
  assert.equal(bearer.exportName, 'extrairTokenBearer');
  const rbac = getChallengeSpec('mod-5-aula-7');
  assert.equal(rbac.exportName, 'podeAcessarPerfil');
  for (const spec of [password, bearer, rbac]) {
    assert.equal(spec.language, 'javascript');
    assert.equal(spec.tests[0].type, 'function-cases');
  }
  assert.equal(getChallengeSpec('mod-5-aula-8'), null);
});

test('request boundary accepts the new authentication and RBAC lessons', () => {
  for (const [challengeId, filename] of [
    ['mod-5-aula-5', 'senha.js'],
    ['mod-5-aula-6', 'token.js'],
    ['mod-5-aula-7', 'rbac.js']
  ]) {
    const result = validateExecutionRequest({
      userId: 'student-1',
      challengeId,
      files: { [filename]: 'function solution() { return true; }' }
    });
    assert.equal(result.ok, true, challengeId);
  }
});

test('request boundary rejects a valid-looking but unauthored challenge', () => {
  const result = validateExecutionRequest({
    userId: 'student-1',
    challengeId: 'mod-1-aula-7',
    files: { 'index.html': '<h1>Oi</h1>' }
  });
  assert.deepEqual(result, { ok: false, reason: 'challenge-not-authored' });
});

test('request boundary accepts a registered challenge', () => {
  const result = validateExecutionRequest({
    userId: 'student-1',
    challengeId: 'html-00-o-que-e-web',
    files: { 'index.html': '<h1>Olá, Mundo!</h1>' }
  });
  assert.equal(result.ok, true);
});


test('registers only the 68 generated module-one HTML lessons with server-supported checks', () => {
  const ids = Object.keys(CHALLENGE_SPECS).filter((id) => /^mod-1-aula-\d+$/.test(id));
  assert.equal(ids.length, 68);
  for (const id of ids) {
    const spec = getChallengeSpec(id);
    assert.equal(spec.language, 'html', id);
    assert.equal(spec.entrypoint, 'index.html', id);
    assert.deepEqual(spec.supportingFiles, ['style.css'], id);
    assert.ok(spec.tests.length > 0, id);
  }
  for (const id of ['mod-1-aula-7', 'mod-1-aula-12', 'mod-1-aula-15', 'mod-1-aula-140']) {
    assert.equal(getChallengeSpec(id), null, id);
  }
});


test('registers 67 generated module-two JavaScript lessons supported by the AST interpreter', () => {
  const ids = Object.keys(CHALLENGE_SPECS).filter((id) => /^mod-2-aula-\d+$/.test(id) && Number(id.slice('mod-2-aula-'.length)) >= 7);
  assert.equal(ids.length, 67);
  for (const id of ids) {
    const spec = getChallengeSpec(id);
    assert.equal(spec.language, 'javascript', id);
    assert.equal(spec.entrypoint, 'script.js', id);
    assert.ok(spec.exportName, id);
    assert.ok(spec.tests.length > 0, id);
  }
  for (const id of ['mod-2-aula-7', 'mod-2-aula-11', 'mod-2-aula-12', 'mod-2-aula-13']) {
    assert.equal(getChallengeSpec(id), null, id);
  }
});


test('registers all 136 generated module-three React state lessons', () => {
  const ids = Object.keys(CHALLENGE_SPECS).filter((id) =>
    /^mod-3-aula-\d+$/.test(id) && Number(id.slice('mod-3-aula-'.length)) >= 5);
  assert.equal(ids.length, 136);
  for (const id of ids) {
    const spec = getChallengeSpec(id);
    assert.equal(spec.language, 'javascript', id);
    assert.equal(spec.entrypoint, 'script.js', id);
    assert.ok(spec.exportName, id);
    assert.ok(spec.tests.length > 0, id);
  }
});

test('registers 34 generated Express controller lessons with trusted HTTP response tests', () => {
  const ids = Object.keys(CHALLENGE_SPECS).filter((id) =>
    /^mod-4-aula-\d+$/.test(id) && Number(id.slice('mod-4-aula-'.length)) >= 5);
  assert.equal(ids.length, 34);
  for (const id of ids) {
    const spec = getChallengeSpec(id);
    assert.equal(spec.entrypoint, 'controller.js', id);
    assert.ok(spec.tests.every((check) => check.type === 'http-controller-case'), id);
  }
});

test('registers all 133 generated module-five security and data lessons', () => {
  const ids = Object.keys(CHALLENGE_SPECS).filter((id) =>
    /^mod-5-aula-\d+$/.test(id) && Number(id.slice('mod-5-aula-'.length)) >= 8);
  assert.equal(ids.length, 133);
  for (const id of ids) {
    const spec = getChallengeSpec(id);
    assert.equal(spec.language, 'javascript', id);
    assert.ok(spec.exportName, id);
    assert.ok(spec.tests.length > 0, id);
  }
});
