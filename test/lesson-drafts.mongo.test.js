const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { createLessonDraftService } = require('../src/modules/drafts/lesson-drafts');

const sourceUri = process.env.MONGO_SESSION_TEST_URI;
const enabled = Boolean(sourceUri);

function isolatedDraftTestUri(value) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error('MONGO_SESSION_TEST_URI precisa ser uma URI MongoDB válida.'); }
  if (!['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname) ||
      !parsed.searchParams.has('replicaSet')) {
    throw new Error('Testes de rascunho exigem MongoDB replica set local.');
  }
  parsed.pathname = '/nexusdev_drafts_test';
  return parsed.toString();
}

test('MongoDB replica-set lesson draft concurrency and account isolation', { skip: !enabled }, async () => {
  const uri = isolatedDraftTestUri(sourceUri);
  const connection = await mongoose.createConnection(uri, {
    serverSelectionTimeoutMS: 5000,
    autoIndex: true
  }).asPromise();

  const userSchema = new mongoose.Schema({
    savedDraftMap: { type: mongoose.Schema.Types.Mixed, default: {} }
  }, { versionKey: false });
  const User = connection.model('DraftUser', userSchema, 'draft_users');
  const service = createLessonDraftService({ User });

  try {
    await connection.dropDatabase();
    await User.init();
    const userA = new mongoose.Types.ObjectId();
    const userB = new mongoose.Types.ObjectId();
    await User.create([{ _id: userA }, { _id: userB }]);

    const competingWrites = await Promise.all([
      service.save({
        userId: userA, challengeId: 'mod-1-aula-1',
        files: { 'index.html': '<h1>writer A</h1>' }, expectedRevision: 0
      }),
      service.save({
        userId: userA, challengeId: 'mod-1-aula-1',
        files: { 'index.html': '<h1>writer B</h1>' }, expectedRevision: 0
      })
    ]);

    assert.equal(competingWrites.filter(result => result.ok).length, 1,
      'exactly one concurrent writer may claim revision zero');
    assert.equal(competingWrites.filter(result => result.reason === 'conflict').length, 1,
      'the stale writer must receive a conflict');
    const currentA = await service.read(userA, 'mod-1-aula-1');
    assert.equal(currentA.revision, 1);
    assert.ok(['<h1>writer A</h1>', '<h1>writer B</h1>'].includes(currentA.files['index.html']));

    const saveB = await service.save({
      userId: userB, challengeId: 'mod-1-aula-1',
      files: { 'index.html': '<h1>private user B</h1>' }, expectedRevision: 0
    });
    assert.equal(saveB.ok, true);
    const currentB = await service.read(userB, 'mod-1-aula-1');
    assert.equal(currentB.revision, 1);
    assert.equal(currentB.files['index.html'], '<h1>private user B</h1>');

    const rereadA = await service.read(userA, 'mod-1-aula-1');
    assert.deepEqual(rereadA, currentA,
      'saving the same lesson for another account must not change the first account draft');
    assert.notEqual(currentA.files['index.html'], currentB.files['index.html']);
  } finally {
    await connection.dropDatabase();
    await connection.close();
  }
});
