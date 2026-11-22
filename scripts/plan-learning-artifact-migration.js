'use strict';

// Read-only migration inventory. This script intentionally has no write mode.
const mongoose = require('mongoose');
const { isKnownChallengeId } = require('../src/modules/curriculum/catalog');
const {
  createLearningArtifactModel,
  planLegacyLearningArtifactMigration
} = require('../src/modules/drafts/learning-artifacts');

function validateLocalTestUri(value) {
  if (!value) throw new Error('MONGO_SESSION_TEST_URI é obrigatório.');
  const parsed = new URL(value);
  const database = parsed.pathname.replace(/^\//, '');
  if (!['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname) ||
      database !== 'nexusdev_session_test' ||
      parsed.searchParams.get('replicaSet') !== 'rs0') {
    throw new Error('Dry-run permitido somente no banco local nexusdev_session_test com replica set rs0.');
  }
  return parsed.toString();
}

async function main() {
  if (process.argv.includes('--apply')) {
    throw new Error('Este utilitário é somente dry-run; nenhuma opção de gravação existe.');
  }
  const uri = validateLocalTestUri(process.env.MONGO_SESSION_TEST_URI);
  const connection = await mongoose.createConnection(uri, {
    serverSelectionTimeoutMS: 5000,
    readPreference: 'primary'
  }).asPromise();

  let ownersScanned = 0;
  let artifactsPlanned = 0;
  let artifactsRejected = 0;
  let estimatedPayloadBytes = 0;
  const rejectionReasons = Object.create(null);

  try {
    const userSchema = new mongoose.Schema({
      savedDraftMap: { type: mongoose.Schema.Types.Mixed },
      savedCodeMap: { type: mongoose.Schema.Types.Mixed }
    }, { versionKey: false, strict: true });
    const User = connection.model('MigrationUser', userSchema, 'users');
    // Model creation defines metadata only; this dry-run never calls init(), save(), or writes.
    createLearningArtifactModel(mongoose, connection);

    const cursor = User.find({
      $or: [
        { savedDraftMap: { $exists: true, $ne: {} } },
        { savedCodeMap: { $exists: true, $ne: {} } }
      ]
    }).select('_id savedDraftMap savedCodeMap').lean().cursor();

    try {
      for await (const user of cursor) {
        ownersScanned += 1;
        const plan = planLegacyLearningArtifactMigration({
          userId: user._id,
          savedDraftMap: user.savedDraftMap || {},
          savedCodeMap: user.savedCodeMap || {},
          isKnownLessonId: isKnownChallengeId
        });
        artifactsPlanned += plan.summary.planned;
        artifactsRejected += plan.summary.rejected;
        for (const record of plan.records) {
          estimatedPayloadBytes += Buffer.byteLength(JSON.stringify(record.files), 'utf8');
        }
        for (const item of plan.rejected) {
          rejectionReasons[item.reason] = (rejectionReasons[item.reason] || 0) + 1;
        }
      }
    } finally {
      await cursor.close();
    }

    process.stdout.write(JSON.stringify({
      mode: 'dry-run-read-only',
      ownersScanned,
      artifactsPlanned,
      artifactsRejected,
      estimatedPayloadBytes,
      rejectionReasons
    }, null, 2) + '\n');
  } finally {
    await connection.close();
  }
}

main().catch(error => {
  process.stderr.write(`Dry-run interrompido: ${error.message}\n`);
  process.exitCode = 1;
});

module.exports = { validateLocalTestUri };
