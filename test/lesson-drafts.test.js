'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateDraftFiles, normalizeRevision, createLessonDraftService } = require('../src/modules/drafts/lesson-drafts');

test('draft validator accepts bounded plain-text files and rejects unsafe shapes', () => {
  assert.deepEqual(validateDraftFiles({ 'index.html': '<h1>Olá</h1>', 'style.css': 'h1 { color: red; }' }).ok, true);
  assert.equal(validateDraftFiles([]).ok, false);
  assert.equal(validateDraftFiles({ '../secret': 'x' }).ok, false);
  assert.equal(validateDraftFiles({ 'index.html': 'x'.repeat(50 * 1024 + 1) }).ok, false);
  assert.equal(validateDraftFiles({ 'index.html': 'x'.repeat(20 * 1024), 'style.css': 'y'.repeat(20 * 1024), 'app.js': 'z'.repeat(20 * 1024), 'readme.md': 'a'.repeat(20 * 1024), 'extra.txt': 'b'.repeat(20 * 1024), 'six.txt': 'c'.repeat(1) }).ok, false);
  const withNull = { 'index.html': 'a\u0000b' };
  assert.equal(validateDraftFiles(withNull).ok, false);
  assert.equal(validateDraftFiles({ 'index.html': 'bad' + String.fromCharCode(1) + 'control' }).ok, false);
});

test('revision accepts only non-negative safe integers', () => {
  assert.equal(normalizeRevision(0), 0);
  assert.equal(normalizeRevision(12), 12);
  for (const value of [-1, 1.5, '1', Number.MAX_SAFE_INTEGER, NaN]) assert.equal(normalizeRevision(value), null);
});

function harness() {
  let stored = null;
  const calls = [];
  const User = {
    async findOneAndUpdate(filter, update, options) {
      calls.push({ filter, update, options });
      const revision = stored?.revision;
      const matches = filter.$or
        ? filter.$or.some(condition => condition['savedDraftMap.mod-1-aula-1.revision'] === revision ||
            (condition['savedDraftMap.mod-1-aula-1.revision']?.$exists === false && revision === undefined))
        : filter['savedDraftMap.mod-1-aula-1.revision'] === revision;
      if (!matches) return null;
      stored = update.$set['savedDraftMap.mod-1-aula-1'];
      return { _id: 'user-1' };
    },
    findById() { return { lean: async () => ({ savedDraftMap: stored ? { 'mod-1-aula-1': stored } : {} }) }; }
  };
  const service = createLessonDraftService({ User, now: () => new Date('2026-11-20T12:00:00.000Z') });
  return { service, calls, get stored() { return stored; } };
}

test('first draft save creates revision one using a compare-and-swap filter', async () => {
  const h = harness();
  const result = await h.service.save({ userId: 'user-1', challengeId: 'mod-1-aula-1', files: { 'index.html': '<p>v1</p>' }, expectedRevision: 0 });
  assert.equal(result.ok, true);
  assert.equal(result.draft.revision, 1);
  assert.ok(h.calls[0].filter.$or);
});

test('draft updates increment only the expected revision and stale writers receive latest data', async () => {
  const h = harness();
  await h.service.save({ userId: 'user-1', challengeId: 'mod-1-aula-1', files: { 'index.html': 'v1' }, expectedRevision: 0 });
  const second = await h.service.save({ userId: 'user-1', challengeId: 'mod-1-aula-1', files: { 'index.html': 'v2' }, expectedRevision: 1 });
  assert.equal(second.ok, true);
  assert.equal(second.draft.revision, 2);
  const stale = await h.service.save({ userId: 'user-1', challengeId: 'mod-1-aula-1', files: { 'index.html': 'stale' }, expectedRevision: 1 });
  assert.equal(stale.ok, false);
  assert.equal(stale.reason, 'conflict');
  assert.equal(stale.draft.revision, 2);
  assert.equal(stale.draft.files['index.html'], 'v2');
});

test('draft read returns an empty revision without leaking another user scope', async () => {
  const h = harness();
  assert.deepEqual(await h.service.read('user-1', 'mod-1-aula-1'), { revision: 0, files: null, updatedAt: null });
});

test('stored malformed drafts fail closed instead of appearing as an empty revision', async () => {
  const User = {
    async findOneAndUpdate() { return null; },
    findById() {
      return { lean: async () => ({
        savedDraftMap: {
          'mod-1-aula-1': { revision: 1, files: { '../unexpected': 'unsafe' } }
        }
      }) };
    }
  };
  const service = createLessonDraftService({ User });
  await assert.rejects(service.read('user-1', 'mod-1-aula-1'), /malformed/);
});

test('stored drafts use the same per-file and total byte limits as incoming drafts', () => {
  assert.equal(validateDraftFiles({ 'index.html': 'x'.repeat(50 * 1024 + 1) }).ok, false);
  assert.equal(validateDraftFiles({
    'a.txt': 'a'.repeat(40 * 1024),
    'b.txt': 'b'.repeat(20 * 1024),
    'c.txt': 'c'.repeat(1)
  }).ok, false);
});
