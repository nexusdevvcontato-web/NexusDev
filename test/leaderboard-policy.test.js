'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildLeaderboard, normalizePublicAvatar } = require('../src/modules/public-read/leaderboard-policy');

test('leaderboard only exposes safe, normalized public fields', () => {
  const result = buildLeaderboard([{
    name: '  Ana  ', avatar: 'https://cdn.example/avatar.png', xp: 120, streak: 4,
    completedIds: ['html-00-o-que-e-web', 'html-00-o-que-e-web', 'invented-id', 'mod-1-aula-07']
  }]);
  assert.deepEqual(result, [{ rank: 1, name: 'Ana', avatar: 'https://cdn.example/avatar.png', xp: 120, streak: 4, completedCount: 1 }]);
});

test('leaderboard rejects invalid XP and normalizes unsafe optional fields', () => {
  const result = buildLeaderboard([
    { name: 'Bad negative', xp: -1, streak: 2 },
    { name: 'Bad fractional', xp: 2.5, streak: 1 },
    { name: 'Bad string', xp: '900', streak: 1 },
    { name: '', avatar: 'javascript:alert(1)', xp: 0, streak: -5, completedIds: ['not-a-lesson'] }
  ]);
  assert.deepEqual(result, [{ rank: 1, name: 'Aluno NexusDev', avatar: '', xp: 0, streak: 0, completedCount: 0 }]);
});

test('avatar URLs must be HTTPS', () => {
  assert.equal(normalizePublicAvatar('http://example.com/a.png'), '');
  assert.equal(normalizePublicAvatar('javascript:alert(1)'), '');
  assert.equal(normalizePublicAvatar('https://example.com/a.png'), 'https://example.com/a.png');
  assert.equal(normalizePublicAvatar('https://user:secret@example.com/a.png'), '');
});

test('ranking is capped at 15 visible entries and ranks are contiguous', () => {
  const users = Array.from({ length: 20 }, (_, index) => ({ name: 'Aluno ' + index, xp: 100 - index, streak: 0 }));
  const result = buildLeaderboard(users);
  assert.equal(result.length, 15);
  assert.deepEqual(result.map(entry => entry.rank), Array.from({ length: 15 }, (_, index) => index + 1));
});

test('opted-out users are filtered even when the builder receives unfiltered data', () => {
  const result = buildLeaderboard([
    { name: 'Oculto', xp: 1000, privacyPreferences: { showInLeaderboard: false } },
    { name: 'Visível', xp: 100, privacyPreferences: { showInLeaderboard: true } },
    { name: 'Legado', xp: 50 }
  ]);
  assert.deepEqual(result.map(entry => entry.name), ['Visível', 'Legado']);
  assert.deepEqual(result.map(entry => entry.rank), [1, 2]);
});
 
test('safe HTTPS URL policy rejects credentials and non-HTTPS schemes', () => {
  const { normalizeSafeHttpsUrl, isSafeHttpsUrl } = require('../src/modules/public-read/safe-https-url');
  assert.equal(normalizeSafeHttpsUrl('https://example.com/profile'), 'https://example.com/profile');
  assert.equal(normalizeSafeHttpsUrl('https://user:secret@example.com/profile'), '');
  assert.equal(normalizeSafeHttpsUrl('http://example.com/profile'), '');
  assert.equal(normalizeSafeHttpsUrl('javascript:alert(1)'), '');
  assert.equal(isSafeHttpsUrl('https://user:secret@example.com/profile'), false);
  assert.equal(isSafeHttpsUrl('https://example.com/profile'), true);
});
