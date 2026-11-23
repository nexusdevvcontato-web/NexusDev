'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const {
  createLearningArtifactModel,
  createLearningArtifactService
} = require('../src/modules/drafts/learning-artifacts');
const { createTransactionalLessonDraftService } = require('../src/modules/drafts/transactional-lesson-drafts');
const { completeLessonAtomically, REPLAY_CODE } = require('../src/modules/proofs/complete-lesson');

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
    await LearningArtifact.createIndexes();
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

    const draftUserSchema = new mongoose.Schema({
      savedDraftMap: { type: mongoose.Schema.Types.Mixed, default: {} }
    }, { versionKey: false });
    const DraftUser = connection.model('ArtifactDraftUser', draftUserSchema, 'artifact_draft_users');
    const ownerLegacy = new mongoose.Types.ObjectId();
    const ownerNew = new mongoose.Types.ObjectId();
    await DraftUser.create([
      {
        _id: ownerLegacy,
        savedDraftMap: {
          'mod-1-aula-2': {
            files: { 'index.html': 'legacy-v3' },
            revision: 3,
            updatedAt: new Date('2026-11-21T10:00:00.000Z')
          }
        }
      },
      { _id: ownerNew }
    ]);
    const transactionalDrafts = createTransactionalLessonDraftService({
      mongoose: connection,
      User: DraftUser,
      LearningArtifact
    });

    assert.equal((await transactionalDrafts.read(ownerLegacy, 'mod-1-aula-2')).revision, 3);
    const migratedWrite = await transactionalDrafts.save({
      userId: ownerLegacy,
      challengeId: 'mod-1-aula-2',
      files: { 'index.html': 'new-v4' },
      expectedRevision: 3
    });
    assert.equal(migratedWrite.ok, true);
    assert.equal(migratedWrite.draft.revision, 4);
    const legacyMirror = await DraftUser.findById(ownerLegacy).lean();
    assert.equal(legacyMirror.savedDraftMap['mod-1-aula-2'].revision, 4);
    assert.equal(legacyMirror.savedDraftMap['mod-1-aula-2'].files['index.html'], 'new-v4');
    const newStore = await LearningArtifact.findOne({
      userId: ownerLegacy, lessonId: 'mod-1-aula-2', kind: 'draft'
    }).lean();
    assert.equal(newStore.revision, 4);
    assert.equal(newStore.files['index.html'], 'new-v4');

    const staleWrite = await transactionalDrafts.save({
      userId: ownerLegacy,
      challengeId: 'mod-1-aula-2',
      files: { 'index.html': 'stale' },
      expectedRevision: 3
    });
    assert.equal(staleWrite.ok, false);
    assert.equal(staleWrite.reason, 'conflict');
    assert.equal(staleWrite.draft.revision, 4);

    const originalArtifactUpdate = LearningArtifact.findOneAndUpdate;
    LearningArtifact.findOneAndUpdate = async () => null;
    try {
      const failedMirror = await transactionalDrafts.save({
        userId: ownerLegacy,
        challengeId: 'mod-1-aula-2',
        files: { 'index.html': 'must-rollback' },
        expectedRevision: 4
      });
      assert.equal(failedMirror.ok, false);
      assert.equal(failedMirror.reason, 'conflict');
    } finally {
      LearningArtifact.findOneAndUpdate = originalArtifactUpdate;
    }
    const afterAbortedMirror = await DraftUser.findById(ownerLegacy).lean();
    assert.equal(afterAbortedMirror.savedDraftMap['mod-1-aula-2'].revision, 4);
    assert.equal(afterAbortedMirror.savedDraftMap['mod-1-aula-2'].files['index.html'], 'new-v4');

    const firstWrites = await Promise.all([
      transactionalDrafts.save({
        userId: ownerNew, challengeId: 'mod-1-aula-1',
        files: { 'index.html': 'writer-one' }, expectedRevision: 0
      }),
      transactionalDrafts.save({
        userId: ownerNew, challengeId: 'mod-1-aula-1',
        files: { 'index.html': 'writer-two' }, expectedRevision: 0
      })
    ]);
    assert.equal(firstWrites.filter(result => result.ok).length, 1);
    assert.equal(firstWrites.filter(result => result.reason === 'conflict').length, 1);
    const ownerNewDraft = await transactionalDrafts.read(ownerNew, 'mod-1-aula-1');
    assert.equal(ownerNewDraft.revision, 1);
    assert.ok(['writer-one', 'writer-two'].includes(ownerNewDraft.files['index.html']));
    assert.equal((await transactionalDrafts.read(ownerLegacy, 'mod-1-aula-2')).files['index.html'], 'new-v4');


    const completionUserSchema = new mongoose.Schema({
      savedCodeMap: { type: mongoose.Schema.Types.Mixed, default: {} },
      completedIds: { type: [String], default: [] },
      xp: { type: Number, default: 0 },
      lastActiveDate: { type: String, default: '2026-11-22' },
      streak: { type: Number, default: 1 }
    }, { versionKey: false });
    const CompletionUser = connection.model('ArtifactCompletionUser', completionUserSchema, 'artifact_completion_users');
    const completionProofSchema = new mongoose.Schema({
      jti: { type: String, required: true, unique: true },
      userId: { type: mongoose.Schema.Types.ObjectId, required: true },
      challengeId: { type: String, required: true },
      filesHash: { type: String, required: true },
      expiresAt: { type: Date, required: true }
    }, { versionKey: false });
    const TestCompletionProof = connection.model('ArtifactTestCompletionProof', completionProofSchema, 'artifact_test_completion_proofs');
    await TestCompletionProof.createIndexes();

    const completionOwner = new mongoose.Types.ObjectId();
    await CompletionUser.create({ _id: completionOwner });
    const completionInput = {
      mongoose: connection,
      User: CompletionUser,
      CompletionProof: TestCompletionProof,
      LearningArtifact,
      userId: completionOwner,
      proof: {
        jti: '123e4567-e89b-42d3-a456-426614174000',
        exp: 1900000000,
        challengeId: 'mod-1-aula-3',
        filesHash: 'a'.repeat(64)
      },
      challengeId: 'mod-1-aula-3',
      files: { 'index.html': '<h1>submitted</h1>' },
      today: '2026-11-23'
    };
    await completeLessonAtomically(completionInput);
    const completedOwner = await CompletionUser.findById(completionOwner).lean();
    const completedArtifact = await LearningArtifact.findOne({
      userId: completionOwner, lessonId: 'mod-1-aula-3', kind: 'saved_code'
    }).lean();
    assert.equal(completedOwner.xp, 50);
    assert.deepEqual(completedOwner.savedCodeMap['mod-1-aula-3'], { 'index.html': '<h1>submitted</h1>' });
    assert.equal(completedArtifact.revision, 1);
    assert.equal(completedArtifact.files['index.html'], '<h1>submitted</h1>');

    const replayResult = await completeLessonAtomically(completionInput);
    assert.equal(String(replayResult._id), String(completionOwner));
    const afterReplay = await CompletionUser.findById(completionOwner).lean();
    const artifactAfterReplay = await LearningArtifact.findById(completedArtifact._id).lean();
    assert.equal(afterReplay.xp, 50);
    assert.equal(artifactAfterReplay.revision, 1);

    const rollbackOwner = new mongoose.Types.ObjectId();
    await CompletionUser.create({ _id: rollbackOwner });
    const originalCompletionArtifactUpdate = LearningArtifact.findOneAndUpdate;
    LearningArtifact.findOneAndUpdate = async () => { throw new Error('synthetic artifact write failure'); };
    try {
      await assert.rejects(
        () => completeLessonAtomically({
          ...completionInput,
          userId: rollbackOwner,
          proof: { ...completionInput.proof, jti: '123e4567-e89b-42d3-a456-426614174001' }
        }),
        /synthetic artifact write failure/
      );
    } finally {
      LearningArtifact.findOneAndUpdate = originalCompletionArtifactUpdate;
    }
    const rolledBackUser = await CompletionUser.findById(rollbackOwner).lean();
    const rolledBackProof = await TestCompletionProof.findOne({
      jti: '123e4567-e89b-42d3-a456-426614174001'
    }).lean();
    assert.equal(rolledBackUser.xp, 0);
    assert.equal(rolledBackUser.savedCodeMap?.['mod-1-aula-3'], undefined);
    assert.equal(await LearningArtifact.countDocuments({
      userId: rollbackOwner, lessonId: 'mod-1-aula-3', kind: 'saved_code'
    }), 0);
    assert.equal(rolledBackProof, null);

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
