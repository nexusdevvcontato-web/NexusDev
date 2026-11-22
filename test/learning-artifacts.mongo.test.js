'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const {
  createLearningArtifactModel,
  createLearningArtifactService
} = require('../src/modules/drafts/learning-artifacts');

const sourceUri = process.env.MONGO_SESSION_TEST_URI;
const enabled = Boolean(sourceUri);

function isolatedArtifactTestUri(value) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error('MONGO_SESSION_TEST_URI precisa ser uma URI MongoDB válida.'); }
  if (!['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname) ||
      !parsed.searchParams.has('replicaSet')) {
    throw new Error('Testes de artefatos exigem MongoDB replica set local.');
  }
  parsed.pathname = '/nexusdev_artifacts_test';
  return parsed.toString();
}

test('MongoDB replica-set learning artifact uniqueness, concurrency and owner isolation', { skip: !enabled }, async () => {
  const connection = await mongoose.createConnection(isolatedArtifactTestUri(sourceUri), {
    serverSelectionTimeoutMS: 5000,
    autoIndex: true
  }).asPromise();
  const LearningArtifact = createLearningArtifactModel(mongoose, connection);
  const service = createLearningArtifactService({ LearningArtifact });

  try {
    await connection.dropDatabase();
    await LearningArtifact.init();
    const userA = new mongoose.Types.ObjectId();
    const userB = new mongoose.Types.ObjectId();

    const simultaneous = await Promise.all([
      service.save({
        userId: userA, lessonId: 'mod-1-aula-1', kind: 'draft',
        files: { 'index.html': 'A1' }, expectedRevision: 0
      }),
      service.save({
        userId: userA, lessonId: 'mod-1-aula-1', kind: 'draft',
        files: { 'index.html': 'A2' }, expectedRevision: 0
      })
    ]);
    assert.equal(simultaneous.filter(result => result.ok).length, 1);
    assert.equal(simultaneous.filter(result => result.reason === 'conflict').length, 1);

    const ownerB = await service.save({
      userId: userB, lessonId: 'mod-1-aula-1', kind: 'draft',
      files: { 'index.html': 'B-private' }, expectedRevision: 0
    });
    assert.equal(ownerB.ok, true);

    const savedCode = await service.save({
      userId: userA, lessonId: 'mod-1-aula-1', kind: 'saved_code',
      files: { 'index.html': 'A-submitted' }, expectedRevision: 0
    });
    assert.equal(savedCode.ok, true);

    const readA = await service.read({ userId: userA, lessonId: 'mod-1-aula-1' });
    const readB = await service.read({ userId: userB, lessonId: 'mod-1-aula-1' });
    const readCode = await service.read({ userId: userA, lessonId: 'mod-1-aula-1', kind: 'saved_code' });
    assert.equal(readA.revision, 1);
    assert.equal(readB.files['index.html'], 'B-private');
    assert.equal(readCode.files['index.html'], 'A-submitted');

    const listedA = await service.listForUser(userA);
    assert.equal(listedA.length, 2);
    assert.ok(listedA.every(item => item.files['index.html'] !== 'B-private'));
    const listedB = await service.listForUser(userB);
    assert.equal(listedB.length, 1);
    assert.equal(listedB[0].files['index.html'], 'B-private');

    await assert.rejects(
      LearningArtifact.create({
        userId: userA, lessonId: 'mod-1-aula-1', kind: 'draft',
        files: { 'index.html': 'duplicate' }, revision: 1
      }),
      error => error?.code === 11000
    );
  } finally {
    await connection.dropDatabase();
    await connection.close();
  }
});
