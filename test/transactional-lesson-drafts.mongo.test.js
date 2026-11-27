'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { createLearningArtifactModel } = require('../src/modules/drafts/learning-artifacts');
const { createTransactionalLessonDraftService } = require('../src/modules/drafts/transactional-lesson-drafts');

const sourceUri = process.env.MONGO_SESSION_TEST_URI;
const enabled = Boolean(sourceUri);

function isolatedUri(value) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error('MONGO_SESSION_TEST_URI precisa ser válida.'); }
  if (!['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname) ||
      !parsed.searchParams.has('replicaSet')) {
    throw new Error('Teste transacional exige MongoDB replica set local.');
  }
  parsed.pathname = '/nexusdev_artifacts_test';
  return parsed.toString();
}

test('MongoDB replica-set transactional drafts preserve legacy compatibility, atomicity and isolation', { skip: !enabled }, async () => {
  const connection = await mongoose.createConnection(isolatedUri(sourceUri), {
    serverSelectionTimeoutMS: 5000,
    autoIndex: true
  }).asPromise();

  const userSchema = new mongoose.Schema({
    savedDraftMap: { type: mongoose.Schema.Types.Mixed, default: {} }
  }, { versionKey: false });
  const User = connection.model('ArtifactTestUser', userSchema, 'users');
  const LearningArtifact = createLearningArtifactModel(mongoose, connection);
  const service = createTransactionalLessonDraftService({ mongoose: connection, User, LearningArtifact });

  try {
    await connection.dropDatabase();
    await Promise.all([User.init(), LearningArtifact.init()]);

    const legacyOwner = new mongoose.Types.ObjectId();
    await User.create({
      _id: legacyOwner,
      savedDraftMap: {
        'mod-1-aula-1': {
          files: { 'index.html': '<h1>legacy</h1>' },
          revision: 4,
          updatedAt: new Date('2026-11-20T10:00:00.000Z')
        }
      }
    });

    const legacyRead = await service.read(legacyOwner, 'mod-1-aula-1');
    assert.equal(legacyRead.revision, 4);
    assert.equal(legacyRead.files['index.html'], '<h1>legacy</h1>');

    const migrated = await service.save({
      userId: legacyOwner,
      challengeId: 'mod-1-aula-1',
      files: { 'index.html': '<h1>updated</h1>' },
      expectedRevision: 4
    });
    assert.equal(migrated.ok, true);
    assert.equal(migrated.draft.revision, 5);

    const legacyAfter = await User.findById(legacyOwner).lean();
    const artifactAfter = await LearningArtifact.findOne({
      userId: legacyOwner, lessonId: 'mod-1-aula-1', kind: 'draft'
    }).lean();
    assert.equal(legacyAfter.savedDraftMap['mod-1-aula-1'].revision, 5);
    assert.equal(artifactAfter.revision, 5);
    assert.equal(artifactAfter.files['index.html'], '<h1>updated</h1>');

    const concurrentOwner = new mongoose.Types.ObjectId();
    await User.create({ _id: concurrentOwner });
    const competing = await Promise.all([
      service.save({
        userId: concurrentOwner, challengeId: 'mod-1-aula-2',
        files: { 'index.html': '<h1>A</h1>' }, expectedRevision: 0
      }),
      service.save({
        userId: concurrentOwner, challengeId: 'mod-1-aula-2',
        files: { 'index.html': '<h1>B</h1>' }, expectedRevision: 0
      })
    ]);
    assert.equal(competing.filter(result => result.ok).length, 1);
    assert.equal(competing.filter(result => result.reason === 'conflict').length, 1);
    const concurrentRead = await service.read(concurrentOwner, 'mod-1-aula-2');
    assert.equal(concurrentRead.revision, 1);

    const isolatedOwner = new mongoose.Types.ObjectId();
    await User.create({ _id: isolatedOwner });
    const isolated = await service.save({
      userId: isolatedOwner, challengeId: 'mod-1-aula-2',
      files: { 'index.html': '<h1>private</h1>' }, expectedRevision: 0
    });
    assert.equal(isolated.ok, true);
    assert.equal((await service.read(isolatedOwner, 'mod-1-aula-2')).files['index.html'], '<h1>private</h1>');
    assert.notEqual(
      (await service.read(concurrentOwner, 'mod-1-aula-2')).files['index.html'],
      '<h1>private</h1>'
    );

    const rollbackOwner = new mongoose.Types.ObjectId();
    await User.create({ _id: rollbackOwner });
    const originalFindOneAndUpdate = LearningArtifact.findOneAndUpdate;
    LearningArtifact.findOneAndUpdate = async () => { throw new Error('synthetic artifact write failure'); };
    try {
      await assert.rejects(() => service.save({
        userId: rollbackOwner, challengeId: 'mod-1-aula-3',
        files: { 'index.html': '<h1>must rollback</h1>' }, expectedRevision: 0
      }), /synthetic artifact write failure/);
    } finally {
      LearningArtifact.findOneAndUpdate = originalFindOneAndUpdate;
    }
    const rolledBackUser = await User.findById(rollbackOwner).lean();
    assert.deepEqual(rolledBackUser.savedDraftMap, {});
    assert.equal(await LearningArtifact.exists({
      userId: rollbackOwner, lessonId: 'mod-1-aula-3', kind: 'draft'
    }), null);
  } finally {
    await connection.dropDatabase();
    await connection.close();
  }
});
