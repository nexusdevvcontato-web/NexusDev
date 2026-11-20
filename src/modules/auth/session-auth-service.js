const {
  SESSION_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  getRefreshCookieOptions,
  getCsrfCookieOptions
} = require('./session-http-policy');
const { createSessionStore, DEFAULT_SESSION_TTL_MS } = require('./session-store');
const { issueSessionAccessToken, DEFAULT_ACCESS_TTL_SECONDS } = require('./session-access-token');

function createSessionAuthService({
  mongoose,
  Session,
  RefreshToken,
  User,
  accessTokenSecret,
  sessionTtlMs = DEFAULT_SESSION_TTL_MS,
  accessTokenTtlSeconds = DEFAULT_ACCESS_TTL_SECONDS,
  sameSite = 'lax',
  now = () => new Date()
} = {}) {
  if (!User || typeof User.findById !== 'function' ||
      typeof accessTokenSecret !== 'string' || accessTokenSecret.length < 32 ||
      !Number.isSafeInteger(sessionTtlMs) || sessionTtlMs <= 0) {
    throw new TypeError('Dependências do serviço de autenticação por sessão inválidas.');
  }
  const store = createSessionStore({ mongoose, Session, RefreshToken });

  function setSessionCookies(res, result) {
    const maxAgeMs = result.expiresAt.getTime() - now().getTime();
    if (!Number.isSafeInteger(maxAgeMs) || maxAgeMs <= 0) {
      throw new Error('A sessão não possui validade restante.');
    }
    res.cookie(SESSION_COOKIE_NAME, result.refreshToken, getRefreshCookieOptions({ maxAgeMs, sameSite }));
    res.cookie(CSRF_COOKIE_NAME, result.csrfToken, getCsrfCookieOptions({ maxAgeMs, sameSite }));
  }

  async function createForUser({ userId, res }) {
    if (!res || typeof res.cookie !== 'function') throw new TypeError('Resposta HTTP inválida.');
    const currentTime = now();
    const user = await User.findById(userId);
    if (!user) return { status: 'user_not_found' };

    const created = await store.create({ userId: user._id, now: currentTime, ttlMs: sessionTtlMs });
    const accessToken = issueSessionAccessToken({
      userId: user._id.toString(),
      sessionId: created.session._id.toString(),
      secret: accessTokenSecret,
      now: Math.floor(currentTime.getTime() / 1000),
      ttlSeconds: accessTokenTtlSeconds
    });
    setSessionCookies(res, created);
    return {
      status: 'created',
      accessToken,
      expiresIn: accessTokenTtlSeconds,
      user
    };
  }

  return Object.freeze({ createForUser });
}

module.exports = { createSessionAuthService };
