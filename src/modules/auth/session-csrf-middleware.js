const { hashRefreshToken } = require('./refresh-token');
const { verifySessionCsrfToken } = require('./session-csrf-token');
const { isTrustedOrigin, CSRF_HEADER_NAME, SESSION_COOKIE_NAME } = require('./session-http-policy');

function readCookie(header, name) {
  if (typeof header !== 'string' || typeof name !== 'string') return null;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 1) continue;
    const key = part.slice(0, separator).trim();
    if (key !== name) continue;
    const value = part.slice(separator + 1).trim();
    try { return decodeURIComponent(value); } catch { return null; }
  }
  return null;
}

function createSessionCsrfMiddleware({
  Session,
  RefreshToken,
  allowedOrigins,
  cookieName = SESSION_COOKIE_NAME,
  now = () => new Date()
} = {}) {
  if (!Session || typeof Session.findOne !== 'function' ||
      !RefreshToken || typeof RefreshToken.findOne !== 'function' ||
      !Array.isArray(allowedOrigins) ||
      allowedOrigins.some(origin => typeof origin !== 'string' || !/^https:\/\//.test(origin))) {
    throw new TypeError('Dependências ou origens da proteção CSRF inválidas.');
  }

  return async function sessionCsrfMiddleware(req, res, next) {
    const origin = req.get ? req.get('origin') : req.headers?.origin;
    if (!isTrustedOrigin(origin, allowedOrigins)) {
      return res.status(403).json({ error: 'Origem não permitida.' });
    }

    const rawRefreshToken = readCookie(req.headers?.cookie, cookieName);
    const csrfToken = req.get ? req.get(CSRF_HEADER_NAME) : req.headers?.[CSRF_HEADER_NAME];
    if (!rawRefreshToken || typeof csrfToken !== 'string') {
      return res.status(403).json({ error: 'Validação CSRF obrigatória.' });
    }

    try {
      const currentTime = now();
      if (!(currentTime instanceof Date) || !Number.isFinite(currentTime.getTime())) {
        throw new TypeError('Relógio inválido.');
      }
      const refreshRecord = await RefreshToken.findOne({
        tokenHash: hashRefreshToken(rawRefreshToken),
        usedAt: null,
        expiresAt: { $gt: currentTime }
      }).lean();
      if (!refreshRecord) {
        return res.status(403).json({ error: 'Sessão inválida ou expirada.' });
      }

      const session = await Session.findOne({
        _id: refreshRecord.sessionId,
        revokedAt: null,
        expiresAt: { $gt: currentTime }
      }).select('+csrfTokenHash').lean();
      if (!session || !verifySessionCsrfToken(csrfToken, session.csrfTokenHash)) {
        return res.status(403).json({ error: 'Token CSRF inválido.' });
      }

      req.csrfSession = { id: session._id, userId: session.userId };
      return next();
    } catch {
      return res.status(503).json({ error: 'Não foi possível validar a sessão com segurança.' });
    }
  };
}

function requireMatchingSession(req, res, next) {
  const csrfSession = req.csrfSession;
  const accessSession = req.session;
  const userId = req.user?._id;
  const same = (a, b) => a !== undefined && a !== null && b !== undefined && b !== null &&
    a.toString() === b.toString();

  if (!csrfSession || !accessSession ||
      !same(csrfSession.id, accessSession.id) ||
      !same(csrfSession.userId, accessSession.userId) ||
      !same(userId, accessSession.userId)) {
    return res.status(403).json({ error: 'A sessão do cookie não corresponde à sessão autenticada.' });
  }
  return next();
}

module.exports = { createSessionCsrfMiddleware, readCookie, requireMatchingSession };
