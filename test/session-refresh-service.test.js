const {
  SESSION_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  getRefreshCookieOptions,
  getCsrfCookieOptions,
  getClearCookieOptions,
  validateCsrfRequest
} = require('./session-http-policy');
const { readCookie } = require('./session-csrf-middleware');
const { createSessionStore } = require('./session-store');
const { issueSessionAccessToken, DEFAULT_ACCESS_TTL_SECONDS } = require('./session-access-token');

function createSessionRefreshService({
  mongoose,
  Session,
  RefreshToken,
  User,
  accessTokenSecret,
  allowedOrigins,
  sameSite = 'lax',
  accessTokenTtlSeconds = DEFAULT_ACCESS_TTL_SECONDS,
  now = () => new Date()
} = {}) {
  if (!User || typeof User.findById !== 'function' ||
      typeof accessTokenSecret !== 'string' || accessTokenSecret.length < 32 ||
      !Array.isArray(allowedOrigins) ||
      allowedOrigins.some(origin => typeof origin !== 'string' || !/^https:\/\//.test(origin))) {
    throw new TypeError('Dependências do serviço de renovação inválidas.');
  }
  const store = createSessionStore({ mongoose, Session, RefreshToken });

  function clearCookies(res) {
    const options = getClearCookieOptions({ sameSite });
    res.clearCookie(SESSION_COOKIE_NAME, options);
    res.clearCookie(CSRF_COOKIE_NAME, options);
  }

  async function refresh(req, res) {
    res.set('Cache-Control', 'no-store');
    const origin = req.get ? req.get('origin') : req.headers?.origin;
    const rawRefreshToken = readCookie(req.headers?.cookie, SESSION_COOKIE_NAME);
    const csrfCookie = readCookie(req.headers?.cookie, CSRF_COOKIE_NAME);
    const csrfHeader = req.get ? req.get(CSRF_HEADER_NAME) : req.headers?.[CSRF_HEADER_NAME];

    if (!validateCsrfRequest({
      origin,
      allowedOrigins,
      cookieToken: csrfCookie,
      headerToken: csrfHeader
    })) {
      return res.status(403).json({ error: 'Origem ou validação CSRF inválida.' });
    }
    if (!rawRefreshToken) {
      clearCookies(res);
      return res.status(401).json({ error: 'Sessão ausente ou expirada.' });
    }

    try {
      const currentTime = now();
      const outcome = await store.rotate({ refreshToken: rawRefreshToken, now: currentTime });
      if (outcome.status === 'replay') {
        clearCookies(res);
        return res.status(401).json({ error: 'Reutilização de refresh token detectada. Entre novamente.' });
      }
      if (outcome.status !== 'rotated') {
        clearCookies(res);
        return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
      }

      const user = await User.findById(outcome.session.userId);
      if (!user) {
        await store.revoke({
          sessionId: outcome.session._id,
          userId: outcome.session.userId,
          reason: 'security',
          now: currentTime
        });
        clearCookies(res);
        return res.status(401).json({ error: 'Conta não encontrada.' });
      }

      const maxAgeMs = outcome.expiresAt.getTime() - currentTime.getTime();
      if (!Number.isSafeInteger(maxAgeMs) || maxAgeMs <= 0) {
        clearCookies(res);
        return res.status(401).json({ error: 'Sessão expirada.' });
      }
      res.cookie(SESSION_COOKIE_NAME, outcome.refreshToken, getRefreshCookieOptions({ maxAgeMs, sameSite }));
      res.cookie(CSRF_COOKIE_NAME, outcome.csrfToken, getCsrfCookieOptions({ maxAgeMs, sameSite }));
      const accessToken = issueSessionAccessToken({
        userId: user._id.toString(),
        sessionId: outcome.session._id.toString(),
        secret: accessTokenSecret,
        now: Math.floor(currentTime.getTime() / 1000),
        ttlSeconds: accessTokenTtlSeconds
      });
      return res.json({
        accessToken,
        expiresIn: accessTokenTtlSeconds,
        user
      });
    } catch {
      return res.status(503).json({ error: 'Não foi possível renovar a sessão com segurança.' });
    }
  }

  return Object.freeze({ refresh });
}

module.exports = { createSessionRefreshService };
