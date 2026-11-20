function createSessionModels(mongoose, connection = mongoose && (mongoose.connection || mongoose)) {
  if (!mongoose || !mongoose.Schema || typeof mongoose.model !== 'function') {
    throw new TypeError('Instância Mongoose inválida.');
  }
  const { Schema } = mongoose;
  const sessionSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    familyId: { type: String, required: true, unique: true, index: true },
    createdAt: { type: Date, required: true, default: Date.now },
    lastUsedAt: { type: Date, required: true, default: Date.now },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null, index: true },
    revokeReason: { type: String, enum: ['logout', 'logout_all', 'refresh_replay', 'expired', 'security'], default: null }
  }, { versionKey: false });
  sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

  const refreshTokenSchema = new Schema({
    sessionId: { type: Schema.Types.ObjectId, ref: 'Session', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    createdAt: { type: Date, required: true, default: Date.now },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null, index: true }
  }, { versionKey: false });
  refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  refreshTokenSchema.index({ sessionId: 1, usedAt: 1 });

  if (!connection || typeof connection.model !== 'function') throw new TypeError('Conexão Mongoose inválida.');
  const Session = connection.models.Session || connection.model('Session', sessionSchema);
  const RefreshToken = connection.models.RefreshToken || connection.model('RefreshToken', refreshTokenSchema);
  return { Session, RefreshToken };
}

module.exports = { createSessionModels };
