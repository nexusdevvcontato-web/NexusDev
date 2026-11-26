const jwt = require('jsonwebtoken');

const DEFAULT_ACCESS_TTL_SECONDS = 10 * 60;
const ACCESS_TOKEN_ISSUER = 'nexusdev-api';
const ACCESS_TOKEN_AUDIENCE = 'nexusdev-web';

function issueSessionAccessToken({ userId, sessionId, secret, now = Math.floor(Date.now() / 1000), ttlSeconds = DEFAULT_ACCESS_TTL_SECONDS } = {}) {
  if (typeof userId !== 'string' || !userId ||
      typeof sessionId !== 'string' || !sessionId ||
      typeof secret !== 'string' || secret.length < 32 ||
      !Number.isSafeInteger(now) || !Number.isInteger(ttlSeconds) ||
      ttlSeconds < 60 || ttlSeconds > 15 * 60) {
    throw new TypeError('Parâmetros do access token de sessão inválidos.');
  }
  return jwt.sign(
    { sub: userId, sid: sessionId, purpose: 'session-access', iat: now },
    secret,
    {
      algorithm: 'HS256',
      issuer: ACCESS_TOKEN_ISSUER,
      audience: ACCESS_TOKEN_AUDIENCE,
      expiresIn: ttlSeconds,
      notBefore: 0,
      header: { typ: 'JWT' },
      mutatePayload: false,
      noTimestamp: false
    }
  );
}

function verifySessionAccessToken(token, { secret, now = Math.floor(Date.now() / 1000) } = {}) {
  if (typeof token !== 'string' || typeof secret !== 'string' || secret.length < 32 ||
      !Number.isSafeInteger(now)) return null;
  try {
    const payload = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      issuer: ACCESS_TOKEN_ISSUER,
      audience: ACCESS_TOKEN_AUDIENCE,
      clockTimestamp: now
    });
    if (!payload || typeof payload !== 'object' ||
        payload.purpose !== 'session-access' ||
        typeof payload.sub !== 'string' || !payload.sub ||
        typeof payload.sid !== 'string' || !payload.sid ||
        !Number.isSafeInteger(payload.iat) ||
        !Number.isSafeInteger(payload.exp) ||
        payload.exp <= payload.iat ||
        payload.exp - payload.iat > 15 * 60) return null;
    return { userId: payload.sub, sessionId: payload.sid, expiresAt: payload.exp };
  } catch {
    return null;
  }
}

function createSessionAccessMiddleware({ User, Session, secret, now = () => new Date() } = {}) {
  if (!User || typeof User.findById !== 'function' ||
      !Session || typeof Session.findOne !== 'function' ||
      typeof secret !== 'string' || secret.length < 32) {
    throw new TypeError('Dependências do middleware de access token inválidas.');
  }

  return async function requireSessionAccess(req, res, next) {
    const header = req.headers?.authorization;
    if (typeof header !== 'string') {
      return res.status(401).json({ error: 'Token de sessão ausente.' });
    }
    const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(header);
    if (!match) return res.status(401).json({ error: 'Token de sessão inválido.' });
    const claims = verifySessionAccessToken(match[1], {
      secret,
      now: Math.floor(now().getTime() / 1000)
    });
    if (!claims) return res.status(401).json({ error: 'Sessão inválida ou expirada.' });

    try {
      const currentTime = now();
      const session = await Session.findOne({
        _id: claims.sessionId,
        userId: claims.userId,
        revokedAt: null,
        expiresAt: { $gt: currentTime }
      }).lean();
      if (!session) return res.status(401).json({ error: 'Sessão revogada ou expirada.' });
      let userQuery = User.findById(claims.userId);
      // Privacy export does not need the legacy maps during authentication.
      // Excluding them here avoids loading a second copy with the full profile.
      if (req.method === 'GET' && req.path === '/api/privacy/export' &&
          userQuery && typeof userQuery.select === 'function') {
        userQuery = userQuery.select('-savedDraftMap -savedCodeMap');
      }
      const user = await userQuery;
      if (!user) return res.status(401).json({ error: 'Usuário não encontrado.' });
      const sessionAuthVersion = session.authVersion ?? 0;
      const userAuthVersion = user.authVersion ?? 0;
      if (!Number.isSafeInteger(sessionAuthVersion) || sessionAuthVersion < 0 ||
          !Number.isSafeInteger(userAuthVersion) || userAuthVersion < 0 ||
          sessionAuthVersion !== userAuthVersion) {
        return res.status(401).json({ error: 'Sessão invalidada por alteração de credenciais.' });
      }
      req.user = user;
      req.session = { id: session._id, userId: session.userId, authVersion: sessionAuthVersion };
      return next();
    } catch {
      return res.status(503).json({ error: 'Não foi possível validar a sessão.' });
    }
  };
}

module.exports = {
  DEFAULT_ACCESS_TTL_SECONDS,
  ACCESS_TOKEN_ISSUER,
  ACCESS_TOKEN_AUDIENCE,
  issueSessionAccessToken,
  verifySessionAccessToken,
  createSessionAccessMiddleware
};
