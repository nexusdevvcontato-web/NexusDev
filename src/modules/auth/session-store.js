const crypto = require('node:crypto');
const { generateRefreshToken, hashRefreshToken } = require('./refresh-token');
const { createSessionCsrfToken, hashSessionCsrfToken } = require('./session-csrf-token');

const DEFAULT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function createSessionStore({ mongoose, Session, RefreshToken }) {
  if (!mongoose || !Session || !RefreshToken) throw new TypeError('Dependências de sessão obrigatórias.');
  if (typeof mongoose.startSession !== 'function') throw new TypeError('Mongoose precisa suportar transações.');

  async function create({ userId, authVersion = 0, now = new Date(), ttlMs = DEFAULT_SESSION_TTL_MS }) {
    if (!userId || !Number.isSafeInteger(authVersion) || authVersion < 0 || !(now instanceof Date) || !Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new TypeError('Parâmetros de sessão inválidos.');
    }
    const rawToken = generateRefreshToken();
    const csrfToken = createSessionCsrfToken();
    const expiresAt = new Date(now.getTime() + ttlMs);
    const dbSession = await mongoose.startSession();
    let created;
    try {
      await dbSession.withTransaction(async () => {
        const [session] = await Session.create([{
          userId, authVersion, familyId: crypto.randomUUID(),
          csrfTokenHash: hashSessionCsrfToken(csrfToken),
          createdAt: now, lastUsedAt: now, expiresAt
        }], { session: dbSession });
        await RefreshToken.create([{
          userId,
          sessionId: session._id, tokenHash: hashRefreshToken(rawToken),
          csrfTokenHash: hashSessionCsrfToken(csrfToken),
          createdAt: now, expiresAt
        }], { session: dbSession });
        created = { session, refreshToken: rawToken, csrfToken, expiresAt };
      });
    } finally {
      await dbSession.endSession();
    }
    return created;
  }

  async function rotate({ refreshToken, now = new Date() }) {
    const tokenHash = hashRefreshToken(refreshToken);
    if (!(now instanceof Date)) throw new TypeError('Data inválida.');
    const nextRawToken = generateRefreshToken();
    const nextCsrfToken = createSessionCsrfToken();
    const dbSession = await mongoose.startSession();
    let outcome = { status: 'invalid' };
    try {
      await dbSession.withTransaction(async () => {
        const consumed = await RefreshToken.findOneAndUpdate(
          { tokenHash, usedAt: null, expiresAt: { $gt: now } },
          { $set: { usedAt: now } },
          { new: true, session: dbSession }
        );
        if (!consumed) {
          const prior = await RefreshToken.findOne({ tokenHash }).session(dbSession);
          if (prior && prior.usedAt) {
            await Session.updateOne(
              { _id: prior.sessionId, revokedAt: null },
              { $set: { revokedAt: now, revokeReason: 'refresh_replay' } },
              { session: dbSession }
            );
            outcome = { status: 'replay' };
          } else {
            outcome = { status: 'invalid' };
          }
          return;
        }
        const active = await Session.findOneAndUpdate(
          { _id: consumed.sessionId, revokedAt: null, expiresAt: { $gt: now } },
          {
            $set: {
              lastUsedAt: now,
              csrfTokenHash: hashSessionCsrfToken(nextCsrfToken)
            }
          },
          { new: true, session: dbSession }
        );
        if (!active) {
          outcome = { status: 'invalid' };
          return;
        }
        const nextExpiresAt = active.expiresAt;
        await RefreshToken.create([{
          userId: active.userId,
          sessionId: active._id, tokenHash: hashRefreshToken(nextRawToken),
          csrfTokenHash: hashSessionCsrfToken(nextCsrfToken),
          createdAt: now, expiresAt: nextExpiresAt
        }], { session: dbSession });
        outcome = {
          status: 'rotated',
          refreshToken: nextRawToken,
          csrfToken: nextCsrfToken,
          session: active,
          expiresAt: nextExpiresAt
        };
      });
    } finally {
      await dbSession.endSession();
    }
    return outcome;
  }

  async function purgeUserRecords({ userId }) {
    if (!userId) throw new TypeError('Identificador de usuário obrigatório.');
    const dbSession = await mongoose.startSession();
    let result = { sessionsDeleted: 0, refreshTokensDeleted: 0 };
    try {
      await dbSession.withTransaction(async () => {
        const sessions = await Session.find({ userId })
          .select('_id')
          .session(dbSession)
          .lean();
        const sessionIds = sessions.map(item => item._id);
        const tokenFilter = sessionIds.length
          ? { $or: [{ userId }, { sessionId: { $in: sessionIds } }] }
          : { userId };
        const tokenResult = await RefreshToken.deleteMany(tokenFilter, { session: dbSession });
        const sessionResult = await Session.deleteMany({ userId }, { session: dbSession });
        result = {
          sessionsDeleted: sessionResult.deletedCount || 0,
          refreshTokensDeleted: tokenResult.deletedCount || 0
        };
      });
    } finally {
      await dbSession.endSession();
    }
    return result;
  }

  async function revoke({ sessionId, userId, reason = 'logout', now = new Date() }) {
    if (!['logout', 'logout_all', 'security'].includes(reason)) throw new TypeError('Motivo de revogação inválido.');
    const result = await Session.updateOne(
      { _id: sessionId, userId, revokedAt: null },
      { $set: { revokedAt: now, revokeReason: reason } }
    );
    return result.modifiedCount === 1;
  }

  async function revokeAll({ userId, now = new Date() }) {
    const result = await Session.updateMany(
      { userId, revokedAt: null },
      { $set: { revokedAt: now, revokeReason: 'logout_all' } }
    );
    return result.modifiedCount;
  }

  return { create, rotate, revoke, revokeAll, purgeUserRecords };
}

module.exports = { createSessionStore, DEFAULT_SESSION_TTL_MS };
