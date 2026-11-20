'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { CHALLENGE_SPECS, getChallengeSpec, isRunnerSupportedChallenge } = require('../src/challenge-registry');
const { validateExecutionRequest } = require('../src/request-policy');

test('registers only lessons with explicit server-owned test specifications', () => {
  assert.equal(Object.keys(CHALLENGE_SPECS).length, 14);
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
  assert.equal(getChallengeSpec('mod-5-aula-140'), null);
  assert.equal(isRunnerSupportedChallenge('unknown-lesson'), false);
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
