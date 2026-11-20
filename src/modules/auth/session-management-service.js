const {
  SESSION_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  getClearCookieOptions,
  isTrustedOrigin
} = require('./session-http-policy');
const { createSessionStore } = require('./session-store');

function createSessionManagementService({
  mongoose,
  Session,
  RefreshToken,
  allowedOrigins,
  sameSite = 'lax',
  now = () => new Date()
} = {}) {
  if (!Array.isArray(allowedOrigins) ||
      allowedOrigins.some(origin => typeof origin !== 'string' || !/^https:\/\//.test(origin)) ||
      !Session || typeof Session.find !== 'function' ||
      typeof Session.findOne !== 'function') {
    throw new TypeError('Dependências do gerenciamento de sessões inválidas.');
  }
  const store = createSessionStore({ mongoose, Session, RefreshToken });

  function assertOrigin(req) {
    const origin = req.get ? req.get('origin') : req.headers?.origin;
    return isTrustedOrigin(origin, allowedOrigins);
  }

  function clearCookies(res) {
    const options = getClearCookieOptions({ sameSite });
    res.clearCookie(SESSION_COOKIE_NAME, options);
    res.clearCookie(CSRF_COOKIE_NAME, options);
  }

  async function logoutCurrent(req, res) {
    res.set('Cache-Control', 'no-store');
    if (!assertOrigin(req)) return res.status(403).json({ error: 'Origem não permitida.' });
    if (!req.session?.id || !req.user?._id) return res.status(401).json({ error: 'Sessão não autenticada.' });
    try {
      await store.revoke({
        sessionId: req.session.id,
        userId: req.user._id,
        reason: 'logout',
        now: now()
      });
      clearCookies(res);
      return res.status(204).end();
    } catch {
      return res.status(503).json({ error: 'Não foi possível encerrar a sessão.' });
    }
  }

  async function logoutAll(req, res) {
    res.set('Cache-Control', 'no-store');
    if (!assertOrigin(req)) return res.status(403).json({ error: 'Origem não permitida.' });
    if (!req.user?._id) return res.status(401).json({ error: 'Autenticação obrigatória.' });
    try {
      await store.revokeAll({ userId: req.user._id, now: now() });
      clearCookies(res);
      return res.status(204).end();
    } catch {
      return res.status(503).json({ error: 'Não foi possível encerrar as sessões.' });
    }
  }

  async function listSessions(req, res) {
    res.set('Cache-Control', 'no-store');
    if (!assertOrigin(req)) return res.status(403).json({ error: 'Origem não permitida.' });
    if (!req.user?._id || !req.session?.id) return res.status(401).json({ error: 'Autenticação obrigatória.' });
    try {
      const sessions = await Session.find({
        userId: req.user._id,
        revokedAt: null,
        expiresAt: { $gt: now() }
      }).select('_id createdAt lastUsedAt expiresAt').sort({ lastUsedAt: -1 }).lean();
      return res.json({
        sessions: sessions.map(session => ({
          id: session._id.toString(),
          createdAt: session.createdAt,
          lastUsedAt: session.lastUsedAt,
          expiresAt: session.expiresAt,
          current: session._id.toString() === req.session.id.toString()
        }))
      });
    } catch {
      return res.status(503).json({ error: 'Não foi possível consultar as sessões.' });
    }
  }

  async function revokeOne(req, res) {
    res.set('Cache-Control', 'no-store');
    if (!assertOrigin(req)) return res.status(403).json({ error: 'Origem não permitida.' });
    if (!req.user?._id || !req.params?.sessionId) return res.status(401).json({ error: 'Autenticação obrigatória.' });
    try {
      const result = await Session.updateOne({
        _id: req.params.sessionId,
        userId: req.user._id,
        revokedAt: null
      }, {
        $set: { revokedAt: now(), revokeReason: 'security' }
      });
      if (result.modifiedCount !== 1) return res.status(404).json({ error: 'Sessão não encontrada.' });
      if (req.params.sessionId === req.session?.id?.toString()) clearCookies(res);
      return res.status(204).end();
    } catch {
      return res.status(503).json({ error: 'Não foi possível revogar a sessão.' });
    }
  }

  return Object.freeze({ logoutCurrent, logoutAll, listSessions, revokeOne });
}

module.exports = { createSessionManagementService };
