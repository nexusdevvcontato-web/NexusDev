'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { validateDraftFiles, normalizeRevision, createLessonDraftService } = require('../src/modules/drafts/lesson-drafts');

test('draft validator accepts bounded plain-text files and rejects unsafe shapes', () => {
  assert.deepEqual(validateDraftFiles({ 'index.html': '<h1>Olá</h1>', 'style.css': 'h1 { color: red; }' }).ok, true);
  assert.equal(validateDraftFiles([]).ok, false);
  assert.equal(validateDraftFiles({ '../secret': 'x' }).ok, false);
  assert.equal(validateDraftFiles(Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`file${i}.js`, 'x']))).ok, false);
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
  const reads = [];
  const projections = [];
  const User = {
    async findOneAndUpdate(filter, update, options) {
      calls.push({ filter, update, options });
      assert.equal(filter._id, 'user-1', 'draft writes must be scoped to the authenticated user');
      const revision = stored?.revision;
      const matches = filter.$or
        ? filter.$or.some(condition => condition['savedDraftMap.mod-1-aula-1.revision'] === revision ||
            (condition['savedDraftMap.mod-1-aula-1.revision']?.$exists === false && revision === undefined))
        : filter['savedDraftMap.mod-1-aula-1.revision'] === revision;
      if (!matches) return null;
      stored = update.$set['savedDraftMap.mod-1-aula-1'];
      return { _id: 'user-1' };
    },
    findById(userId, projection) {
      reads.push(userId);
      projections.push(projection);
      return { lean: async () => ({ savedDraftMap: stored ? { 'mod-1-aula-1': stored } : {} }) };
    }
  };
  const service = createLessonDraftService({ User, now: () => new Date('2026-11-20T12:00:00.000Z') });
  return { service, calls, reads, projections, get stored() { return stored; } };
}

test('first draft save creates revision one using a compare-and-swap filter', async () => {
  const h = harness();
  const result = await h.service.save({ userId: 'user-1', challengeId: 'mod-1-aula-1', files: { 'index.html': '<p>v1</p>' }, expectedRevision: 0 });
  assert.equal(result.ok, true);
  assert.equal(result.draft.revision, 1);
  assert.ok(h.calls[0].filter.$or);
  assert.equal(h.calls[0].filter._id, 'user-1');
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


test('simultaneous writers using the same revision cannot overwrite each other', async () => {
  let stored = null;
  let arrivals = 0;
  let release;
  const barrier = new Promise(resolve => { release = resolve; });
  const User = {
    async findOneAndUpdate(filter, update) {
      arrivals += 1;
      if (arrivals === 2) release();
      await barrier;
      const revisionPath = 'savedDraftMap.mod-1-aula-1.revision';
      const matches = filter.$or
        ? filter.$or.some(condition => condition[revisionPath] === stored?.revision ||
            (condition[revisionPath]?.$exists === false && stored === null))
        : filter[revisionPath] === stored?.revision;
      if (!matches) return null;
      stored = update.$set['savedDraftMap.mod-1-aula-1'];
      return { _id: 'user-1' };
    },
    findById() {
      return { lean: async () => ({ savedDraftMap: stored ? { 'mod-1-aula-1': stored } : {} }) };
    }
  };
  const service = createLessonDraftService({ User });
  const results = await Promise.all([
    service.save({ userId: 'user-1', challengeId: 'mod-1-aula-1', files: { 'index.html': 'writer-a' }, expectedRevision: 0 }),
    service.save({ userId: 'user-1', challengeId: 'mod-1-aula-1', files: { 'index.html': 'writer-b' }, expectedRevision: 0 })
  ]);
  assert.equal(arrivals, 2, 'both writers must reach the atomic compare-and-swap together');
  assert.equal(results.filter(result => result.ok).length, 1);
  assert.equal(results.filter(result => result.reason === 'conflict').length, 1);
  assert.equal(stored.revision, 1);
  assert.ok(['writer-a', 'writer-b'].includes(stored.files['index.html']));
});

test('draft read returns an empty revision without leaking another user scope', async () => {
  const h = harness();
  assert.deepEqual(await h.service.read('user-1', 'mod-1-aula-1'), { revision: 0, files: null, updatedAt: null });
  assert.deepEqual(h.reads, ['user-1']);
  assert.deepEqual(h.projections, [{ 'savedDraftMap.mod-1-aula-1': 1 }]);
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
  const oversized = validateDraftFiles({
    'a.txt': 'a'.repeat(40 * 1024),
    'b.txt': 'b'.repeat(20 * 1024),
    'c.txt': 'c'.repeat(1)
  });
  assert.equal(oversized.ok, false);
  assert.equal(oversized.error, 'O rascunho excede 40 KB.');
});

test('both authenticated draft reads and writes share the dedicated draft rate limiter', async () => {
  const server = await readFile(require.resolve('../server'), 'utf8');
  assert.match(server, /app\.get\('\/api\/lessons\/:lessonId\/draft'[\s\S]*?requireAuth, lessonDraftLimiter/);
  assert.match(server, /app\.put\('\/api\/lessons\/:lessonId\/draft'[\s\S]*?requireAuth, lessonDraftLimiter/);
});


test('draft validator rejects prototype-sensitive file names', () => {
  for (const name of ['__proto__', 'prototype', 'constructor']) {
    assert.equal(validateDraftFiles({ [name]: 'x' }).ok, false, `${name} must not be accepted as a file name`);
  }
});


test('draft HTTP contract scopes reads and writes to the authenticated identity and disables caching', async () => {
  const server = await readFile(require.resolve('../server'), 'utf8');
  assert.match(server, /app\.get\('\/api\/lessons\/:lessonId\/draft',[\s\S]*?res\.set\('Cache-Control', 'no-store'\)[\s\S]*?requireAuth[\s\S]*?lessonDraftService\.read\(req\.user\._id, lessonId\)/);
  assert.match(server, /app\.put\('\/api\/lessons\/:lessonId\/draft',[\s\S]*?res\.set\('Cache-Control', 'no-store'\)[\s\S]*?requireAuth[\s\S]*?lessonDraftService\.save\(\{[\s\S]*?userId: req\.user\._id[\s\S]*?challengeId: lessonId/);
  assert.doesNotMatch(server, /lessonDraftService\.(?:read|save)\([^\n]*req\.body\?*\.userId/);
});


test('draft storage is isolated by user id even when lesson and revision match', async () => {
  const records = new Map();
  const User = {
    async findOneAndUpdate(filter, update) {
      const current = records.get(String(filter._id));
      const revision = current?.revision;
      const revisionPath = 'savedDraftMap.mod-1-aula-1.revision';
      const matches = filter.$or
        ? filter.$or.some(condition => condition[revisionPath] === revision ||
            (condition[revisionPath]?.$exists === false && revision === undefined))
        : filter[revisionPath] === revision;
      if (!matches) return null;
      records.set(String(filter._id), update.$set['savedDraftMap.mod-1-aula-1']);
      return { _id: filter._id };
    },
    findById(userId) {
      return { lean: async () => ({
        savedDraftMap: records.has(String(userId))
          ? { 'mod-1-aula-1': records.get(String(userId)) }
          : {}
      }) };
    }
  };
  const service = createLessonDraftService({ User });
  await service.save({
    userId: 'user-A', challengeId: 'mod-1-aula-1',
    files: { 'index.html': 'private A' }, expectedRevision: 0
  });
  await service.save({
    userId: 'user-B', challengeId: 'mod-1-aula-1',
    files: { 'index.html': 'private B' }, expectedRevision: 0
  });
  const a = await service.read('user-A', 'mod-1-aula-1');
  const b = await service.read('user-B', 'mod-1-aula-1');
  assert.equal(a.revision, 1);
  assert.equal(b.revision, 1);
  assert.equal(a.files['index.html'], 'private A');
  assert.equal(b.files['index.html'], 'private B');
});
