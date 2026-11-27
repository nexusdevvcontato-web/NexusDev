'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createLessonDraftService } = require('../src/modules/drafts/lesson-drafts');

function harness(legacyDraft = null) {
  const records = new Map();
  const key = (userId, lessonId, kind) => [String(userId), lessonId, kind].join('|');
  const LearningArtifact = {
    findOne(filter) {
      return {
        select() { return this; },
        lean: async () => records.get(key(filter.userId, filter.lessonId, filter.kind)) || null
      };
    },
    async findOneAndUpdate(filter, update, options = {}) {
      const id = key(filter.userId, filter.lessonId, filter.kind);
      const current = records.get(id);
      const matches = filter.revision?.$exists === false
        ? !current
        : filter.revision === undefined || current?.revision === filter.revision;
      if (!matches) {
        if (options.upsert && current) {
          const error = new Error('duplicate key');
          error.code = 11000;
          throw error;
        }
        return null;
      }
      const next = {
        ...(current || {}),
        ...(update.$setOnInsert && !current ? update.$setOnInsert : {}),
        ...(update.$set || {})
      };
      if (update.$inc) {
        for (const [field, amount] of Object.entries(update.$inc)) next[field] = (next[field] || 0) + amount;
      }
      records.set(id, next);
      return next;
    }
  };
  const User = {
    findOneAndUpdate: async () => { throw new Error('legacy writes must not be used after artifact rollout'); },
    findById(userId) {
      assert.equal(String(userId), 'user-1');
      return {
        lean: async () => ({
          savedDraftMap: legacyDraft ? { 'mod-1-aula-1': legacyDraft } : {}
        })
      };
    }
  };
  return {
    service: createLessonDraftService({
      User,
      LearningArtifact,
      now: () => new Date('2026-11-26T12:00:00.000Z')
    }),
    records
  };
}

test('artifact-backed draft reads fall back to legacy data without losing its revision', async () => {
  const h = harness({
    files: { 'index.html': '<h1>legacy</h1>' },
    revision: 4,
    updatedAt: new Date('2026-11-20T10:00:00.000Z')
  });
  const result = await h.service.read('user-1', 'mod-1-aula-1');
  assert.equal(result.revision, 4);
  assert.equal(result.files['index.html'], '<h1>legacy</h1>');
});

test('first save from a legacy draft seeds its revision then performs compare-and-swap', async () => {
  const h = harness({
    files: { 'index.html': '<h1>legacy</h1>' },
    revision: 4,
    updatedAt: new Date('2026-11-20T10:00:00.000Z')
  });
  const result = await h.service.save({
    userId: 'user-1',
    challengeId: 'mod-1-aula-1',
    files: { 'index.html': '<h1>updated</h1>' },
    expectedRevision: 4
  });
  assert.equal(result.ok, true);
  assert.equal(result.draft.revision, 5);
  assert.equal(result.draft.files['index.html'], '<h1>updated</h1>');
  assert.equal(
    h.records.get('user-1|mod-1-aula-1|draft').revision,
    5
  );
});

test('artifact data takes precedence over an older legacy map copy', async () => {
  const h = harness({
    files: { 'index.html': 'legacy copy' },
    revision: 2,
    updatedAt: new Date('2026-11-20T10:00:00.000Z')
  });
  h.records.set('user-1|mod-1-aula-1|draft', {
    files: { 'index.html': 'artifact copy' },
    revision: 3,
    updatedAt: new Date('2026-11-26T10:00:00.000Z')
  });
  const result = await h.service.read('user-1', 'mod-1-aula-1');
  assert.equal(result.revision, 3);
  assert.equal(result.files['index.html'], 'artifact copy');
});

test('new artifact-backed draft starts at revision one without writing legacy maps', async () => {
  const h = harness();
  const result = await h.service.save({
    userId: 'user-1',
    challengeId: 'mod-1-aula-1',
    files: { 'index.html': '<h1>new</h1>' },
    expectedRevision: 0
  });
  assert.equal(result.ok, true);
  assert.equal(result.draft.revision, 1);
});

test('server gates artifact writes behind the rollout flag and checks the unique index first', async () => {
  const { readFile } = require('node:fs/promises');
  const server = await readFile(require.resolve('../server'), 'utf8');
  assert.match(server, /LearningArtifact: LEARNING_ARTIFACTS_ENABLED \? LearningArtifact : null/);
  assert.match(server, /if \(LEARNING_ARTIFACTS_ENABLED\) await assertLearningArtifactIndexes\(\)/);
  assert.match(server, /uniqueOwnerLessonKind/);
  assert.match(server, /completeLessonAtomically\(\{[\s\S]*?LearningArtifact: LEARNING_ARTIFACTS_ENABLED \? LearningArtifact : null/);
});
