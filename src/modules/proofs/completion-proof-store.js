'use strict';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createCompletionProofModel(mongoose) {
  if (!mongoose?.Schema || typeof mongoose.model !== 'function') {
    throw new TypeError('Instância Mongoose inválida.');
  }
  const schema = new mongoose.Schema({
    jti: { type: String, required: true, unique: true, match: UUID_PATTERN },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    challengeId: { type: String, required: true },
    expiresAt: { type: Date, required: true }
  }, { versionKey: false });
  schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  return mongoose.models?.CompletionProof || mongoose.model('CompletionProof', schema);
}

async function consumeCompletionProof(CompletionProof, proof, userId) {
  if (!CompletionProof || typeof CompletionProof.create !== 'function' ||
      !proof || typeof proof.jti !== 'string' || !UUID_PATTERN.test(proof.jti) ||
      !Number.isInteger(proof.exp) || typeof proof.challengeId !== 'string' ||
      !userId) {
    throw new TypeError('Comprovante de conclusão inválido.');
  }
  try {
    await CompletionProof.create({
      jti: proof.jti,
      userId,
      challengeId: proof.challengeId,
      expiresAt: new Date(proof.exp * 1000)
    });
    return true;
  } catch (error) {
    if (error?.code === 11000) return false;
    throw error;
  }
}

module.exports = { createCompletionProofModel, consumeCompletionProof, UUID_PATTERN };
