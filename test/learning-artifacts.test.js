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
    assert.equal(Model.schema.options.autoIndex, false,
      'registering the model must not create live database indexes implicitly');
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


test('legacy artifact migration planner is dry-run, validates curriculum and preserves revisions', () => {
  const { planLegacyLearningArtifactMigration } = require('../src/modules/drafts/learning-artifacts');
  const owner = 'synthetic-user';
  const allowed = new Set(['mod-1-aula-1', 'mod-1-aula-2']);
  const plan = planLegacyLearningArtifactMigration({
    userId: owner,
    isKnownLessonId: lessonId => allowed.has(lessonId),
    savedDraftMap: {
      'mod-1-aula-1': {
        files: { 'index.html': '<h1>draft</h1>' },
        revision: 7,
        updatedAt: new Date('2026-11-20T10:00:00.000Z')
      },
      'unknown-lesson': {
        files: { 'index.html': 'should not migrate' },
        revision: 1
      },
      'mod-1-aula-2': {
        files: { '../unsafe': 'bad' },
        revision: 1
      }
    },
    savedCodeMap: {
      'mod-1-aula-2': { 'index.html': '<h1>submitted</h1>' }
    }
  });

  assert.deepEqual(plan.summary, { planned: 2, rejected: 2, drafts: 1, savedCode: 1 });
  assert.equal(plan.records[0].userId, owner);
  assert.equal(plan.records[0].lessonId, 'mod-1-aula-1');
  assert.equal(plan.records[0].kind, 'draft');
  assert.equal(plan.records[0].revision, 7);
  assert.equal(plan.records[0].files['index.html'], '<h1>draft</h1>');
  assert.equal(plan.records[1].kind, 'saved_code');
  assert.equal(plan.records[1].revision, 1);
  assert.deepEqual(plan.rejected.map(item => item.reason), ['unknown_lesson', 'invalid_files']);
  assert.ok(plan.rejected.every(item => !Object.hasOwn(item, 'files')),
    'rejection diagnostics must not contain source code');
});

test('legacy artifact migration planner rejects missing owner or curriculum validator', () => {
  const { planLegacyLearningArtifactMigration } = require('../src/modules/drafts/learning-artifacts');
  assert.throws(() => planLegacyLearningArtifactMigration({}), /obrigatórios/);
  assert.throws(() => planLegacyLearningArtifactMigration({ userId: 'synthetic-user' }), /obrigatórios/);
});


test('migration dry-run is restricted to local disposable replica-set database and has no apply mode', async () => {
  const { readFile } = require('node:fs/promises');
  const script = await readFile(require.resolve('../scripts/plan-learning-artifact-migration'), 'utf8');
  const { validateLocalTestUri } = require('../scripts/plan-learning-artifact-migration');

  assert.throws(() => validateLocalTestUri('mongodb://example.com/prod?replicaSet=rs0'), /local/);
  assert.throws(() => validateLocalTestUri('mongodb://127.0.0.1:27017/production?replicaSet=rs0'), /local/);
  assert.throws(() => validateLocalTestUri('mongodb://127.0.0.1:27017/nexusdev_session_test'), /replica set/);
  assert.equal(
    validateLocalTestUri('mongodb://127.0.0.1:27017/nexusdev_session_test?replicaSet=rs0'),
    'mongodb://127.0.0.1:27017/nexusdev_session_test?replicaSet=rs0'
  );
  assert.match(script, /mode: 'dry-run-read-only'/);
  assert.match(script, /if \(process\.argv\.includes\('--apply'\)\)/);
  assert.doesNotMatch(script, /\.insertMany\(|\.bulkWrite\(|\.save\(|\.deleteMany\(|\.updateMany\(/);
});
