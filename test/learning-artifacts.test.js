'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const {
  ARTIFACT_KINDS,
  normalizeArtifactKind,
  createLearningArtifactModel,
  createLearningArtifactService
} = require('../src/modules/drafts/learning-artifacts');

test('learning artifact model declares owner-scoped uniqueness and validation', () => {
  const connection = mongoose.createConnection();
  try {
    const Model = createLearningArtifactModel(mongoose, connection);
    const indexes = Model.schema.indexes();
    assert.ok(indexes.some(([keys, options]) =>
      keys.userId === 1 && keys.lessonId === 1 && keys.kind === 1 && options.unique === true
    ));
    assert.ok(indexes.some(([keys]) => keys.userId === 1 && keys.updatedAt === -1));
    assert.deepEqual(ARTIFACT_KINDS, ['draft', 'saved_code']);
    assert.equal(normalizeArtifactKind('draft'), 'draft');
    assert.equal(normalizeArtifactKind('saved_code'), 'saved_code');
    assert.equal(normalizeArtifactKind('session'), null);
  } finally {
    void connection.close();
  }
});

function harness() {
  const records = new Map();
  const calls = [];
  const key = (userId, lessonId, kind) => [String(userId), lessonId, kind].join('|');
  const LearningArtifact = {
    findOneAndUpdate(filter, update, options) {
      calls.push({ filter, update, options });
      return (async () => {
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
        const next = { ...(current || {}), ...update.$set };
        records.set(id, next);
        return next;
      })();
    },
    findOne(filter) {
      return {
        select() { return this; },
        lean: async () => records.get(key(filter.userId, filter.lessonId, filter.kind)) || null
      };
    },
    find(filter) {
      let result = [...records.entries()]
        .filter(([id]) => id.startsWith(String(filter.userId) + '|'))
        .map(([, value]) => value);
      return {
        select() { return this; },
        sort() { return this; },
        lean: async () => result
      };
    }
  };
  return {
    service: createLearningArtifactService({
      LearningArtifact,
      now: () => new Date('2026-11-22T12:00:00.000Z')
    }),
    calls,
    records
  };
}

test('learning artifacts are isolated by owner, lesson and kind', async () => {
  const h = harness();
  const a = await h.service.save({
    userId: 'user-A', lessonId: 'mod-1-aula-1', kind: 'draft',
    files: { 'index.html': 'private A' }, expectedRevision: 0
  });
  const b = await h.service.save({
    userId: 'user-B', lessonId: 'mod-1-aula-1', kind: 'draft',
    files: { 'index.html': 'private B' }, expectedRevision: 0
  });
  const code = await h.service.save({
    userId: 'user-A', lessonId: 'mod-1-aula-1', kind: 'saved_code',
    files: { 'index.html': 'submitted A' }, expectedRevision: 0
  });
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.equal(code.ok, true);
  assert.equal((await h.service.read({ userId: 'user-A', lessonId: 'mod-1-aula-1' })).files['index.html'], 'private A');
  assert.equal((await h.service.read({ userId: 'user-B', lessonId: 'mod-1-aula-1' })).files['index.html'], 'private B');
  assert.equal((await h.service.read({ userId: 'user-A', lessonId: 'mod-1-aula-1', kind: 'saved_code' })).files['index.html'], 'submitted A');
  assert.equal(h.calls.every(call => call.filter.userId !== undefined), true);
});

test('learning artifact revision compare-and-swap rejects stale writes', async () => {
  const h = harness();
  await h.service.save({
    userId: 'user-A', lessonId: 'mod-1-aula-1',
    files: { 'index.html': 'v1' }, expectedRevision: 0
  });
  const current = await h.service.save({
    userId: 'user-A', lessonId: 'mod-1-aula-1',
    files: { 'index.html': 'v2' }, expectedRevision: 1
  });
  const stale = await h.service.save({
    userId: 'user-A', lessonId: 'mod-1-aula-1',
    files: { 'index.html': 'stale' }, expectedRevision: 1
  });
  assert.equal(current.ok, true);
  assert.equal(current.artifact.revision, 2);
  assert.equal(stale.ok, false);
  assert.equal(stale.reason, 'conflict');
  assert.equal(stale.artifact.revision, 2);
  assert.equal(stale.artifact.files['index.html'], 'v2');
});

test('learning artifact service rejects invalid identity, kind, revision and file payload', async () => {
  const h = harness();
  assert.equal((await h.service.save({
    userId: 'user-A', lessonId: 'bad.lesson.path', files: { 'index.html': 'x' }, expectedRevision: 0
  })).reason, 'invalid_identity');
  assert.equal((await h.service.save({
    userId: 'user-A', lessonId: 'mod-1-aula-1', kind: 'admin',
    files: { 'index.html': 'x' }, expectedRevision: 0
  })).reason, 'invalid_identity');
  assert.equal((await h.service.save({
    userId: 'user-A', lessonId: 'mod-1-aula-1',
    files: { '../secret': 'x' }, expectedRevision: 0
  })).reason, 'invalid_files');
  assert.equal((await h.service.save({
    userId: 'user-A', lessonId: 'mod-1-aula-1',
    files: { 'index.html': 'x' }, expectedRevision: Number.MAX_SAFE_INTEGER
  })).reason, 'invalid_revision');
});

test('listForUser returns only the requested owner records', async () => {
  const h = harness();
  await h.service.save({
    userId: 'user-A', lessonId: 'mod-1-aula-1', kind: 'draft',
    files: { 'index.html': 'A' }, expectedRevision: 0
  });
  await h.service.save({
    userId: 'user-B', lessonId: 'mod-1-aula-1', kind: 'draft',
    files: { 'index.html': 'B' }, expectedRevision: 0
  });
  const records = await h.service.listForUser('user-A');
  assert.equal(records.length, 1);
  assert.equal(records[0].files['index.html'], 'A');
});

test('stored malformed learning artifacts fail closed', async () => {
  const h = harness();
  h.records.set('user-A|mod-1-aula-1|draft', {
    revision: 1, files: { '../bad': 'x' }
  });
  await assert.rejects(
    h.service.read({ userId: 'user-A', lessonId: 'mod-1-aula-1' }),
    /malformed/
  );
});
