const test = require('node:test');
const assert = require('node:assert/strict');
const { createSessionCsrfMiddleware, readCookie, requireMatchingSession } = require('../src/modules/auth/session-csrf-middleware');
const { createSessionCsrfToken, hashSessionCsrfToken } = require('../src/modules/auth/session-csrf-token');
const { generateRefreshToken, hashRefreshToken } = require('../src/modules/auth/refresh-token');
const { issueSessionAccessToken, createSessionAccessMiddleware } = require('../src/modules/auth/session-access-token');

const origin = 'https://app.example.test';
const now = new Date('2026-11-20T00:00:00.000Z');

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

function makeMiddleware(overrides = {}) {
  const refreshToken = generateRefreshToken();
  const csrfToken = createSessionCsrfToken();
  const sessionId = 'session-123';
  const session = {
    _id: sessionId, userId: 'user-123',
    csrfTokenHash: hashSessionCsrfToken(csrfToken)
  };
  const calls = { refresh: null, session: null };
  const RefreshToken = {
    findOne(query) {
      calls.refresh = query;
      return { lean: async () => overrides.refreshRecord === null ? null : ({
        sessionId,
        ...(overrides.refreshRecord || {})
      }) };
    }
  };
  const Session = {
    findOne(query) {
      calls.session = query;
      return {
        select(selection) {
          assert.equal(selection, '+csrfTokenHash');
          return { lean: async () => overrides.sessionRecord === null ? null : ({
            ...session, ...(overrides.sessionRecord || {})
          }) };
        }
      };
    }
  };
  const middleware = createSessionCsrfMiddleware({
    Session, RefreshToken, allowedOrigins: [origin], now: () => now
  });
  return { middleware, refreshToken, csrfToken, session, calls };
}

function request(refreshToken, csrfToken, requestOrigin) {
  const resolvedOrigin = arguments.length < 3 ? origin : requestOrigin;
  return {
    headers: {
      origin: resolvedOrigin,
      cookie: [
        refreshToken ? `__Host-nexusdev_refresh=${encodeURIComponent(refreshToken)}` : '',
        csrfToken ? `__Host-nexusdev_csrf=${encodeURIComponent(csrfToken)}` : ''
      ].filter(Boolean).join('; '),
      'x-csrf-token': csrfToken
    },
    get(name) { return this.headers[name.toLowerCase()]; }
  };
}

test('reads only the requested cookie and safely decodes values', () => {
  assert.equal(readCookie('a=1; token=hello%20world', 'token'), 'hello world');
  assert.equal(readCookie('a=1', 'token'), null);
  assert.equal(readCookie('token=%E0%A4%A', 'token'), null);
});

test('accepts exact allowed Origin and CSRF token bound to active refresh session', async () => {
  const setup = makeMiddleware();
  const req = request(setup.refreshToken, setup.csrfToken);
  const res = responseRecorder();
  let called = false;
  await setup.middleware(req, res, () => { called = true; });
  assert.equal(called, true);
  assert.deepEqual(req.csrfSession, { id: setup.session._id, userId: setup.session.userId });
  assert.equal(setup.calls.refresh.tokenHash, hashRefreshToken(setup.refreshToken));
  assert.equal(setup.calls.refresh.usedAt, null);
  assert.equal(setup.calls.session.revokedAt, null);
  assert.equal(res.statusCode, 200);
});

test('rejects missing, untrusted or malformed Origin before database lookup', async () => {
  for (const badOrigin of [undefined, 'https://evil.example.test', 'null']) {
    const setup = makeMiddleware();
    const req = request(setup.refreshToken, setup.csrfToken, badOrigin);
    const res = responseRecorder();
    let called = false;
    await setup.middleware(req, res, () => { called = true; });
    assert.equal(called, false);
    assert.equal(res.statusCode, 403);
    assert.equal(setup.calls.refresh, null);
  }
});

test('rejects missing cookie, missing header, invalid CSRF, expired refresh and revoked session', async () => {
  const cases = [
    { refreshToken: null, csrfToken: createSessionCsrfToken() },
    { refreshToken: generateRefreshToken(), csrfToken: createSessionCsrfToken(), csrfCookie: 'different-token' },
    { refreshToken: generateRefreshToken(), csrfToken: undefined },
    { refreshToken: generateRefreshToken(), csrfToken: 'bad' }
  ];
  for (const item of cases) {
    const setup = makeMiddleware();
    const res = responseRecorder();
    const req = request(item.refreshToken, item.csrfToken);
    if (item.csrfCookie) req.headers.cookie = `__Host-nexusdev_refresh=${item.refreshToken}; __Host-nexusdev_csrf=${item.csrfCookie}`;
    await setup.middleware(req, res, () => assert.fail('next não deveria ser chamado'));
    assert.equal(res.statusCode, 403);
  }

  const invalidRefresh = makeMiddleware({ refreshRecord: null });
  const refreshRes = responseRecorder();
  await invalidRefresh.middleware(request(invalidRefresh.refreshToken, invalidRefresh.csrfToken), refreshRes, () => assert.fail());
  assert.equal(refreshRes.statusCode, 403);

  const invalidSession = makeMiddleware({ sessionRecord: null });
  const sessionRes = responseRecorder();
  await invalidSession.middleware(request(invalidSession.refreshToken, invalidSession.csrfToken), sessionRes, () => assert.fail());
  assert.equal(sessionRes.statusCode, 403);
});

test('fails closed with service unavailable when persistence throws', async () => {
  const setup = makeMiddleware();
  setup.middleware = createSessionCsrfMiddleware({
    Session: { findOne() { throw new Error('database unavailable'); } },
    RefreshToken: { findOne() { return { lean: async () => ({ sessionId: 'session-123' }) }; } },
    allowedOrigins: [origin], now: () => now
  });
  const res = responseRecorder();
  await setup.middleware(request(setup.refreshToken, setup.csrfToken), res, () => assert.fail());
  assert.equal(res.statusCode, 503);
});

test('binds cookie CSRF session to the bearer-authenticated session', () => {
  const req = {
    csrfSession: { id: 'session-a', userId: 'user-1' },
    session: { id: 'session-a', userId: 'user-1' },
    user: { _id: 'user-1' }
  };
  const res = responseRecorder();
  let called = false;
  requireMatchingSession(req, res, () => { called = true; });
  assert.equal(called, true);
  assert.equal(res.statusCode, 200);
});

test('rejects valid cookie and bearer credentials belonging to different sessions', () => {
  const req = {
    csrfSession: { id: 'session-a', userId: 'user-1' },
    session: { id: 'session-b', userId: 'user-1' },
    user: { _id: 'user-1' }
  };
  const res = responseRecorder();
  let called = false;
  requireMatchingSession(req, res, () => { called = true; });
  assert.equal(called, false);
  assert.equal(res.statusCode, 403);
});

test('rejects session credentials belonging to different users', () => {
  const req = {
    csrfSession: { id: 'session-a', userId: 'user-1' },
    session: { id: 'session-a', userId: 'user-2' },
    user: { _id: 'user-2' }
  };
  const res = responseRecorder();
  let called = false;
  requireMatchingSession(req, res, () => { called = true; });
  assert.equal(called, false);
  assert.equal(res.statusCode, 403);
});

async function runCombinedSessionGuards(cookieSessionId, bearerSessionId) {
  const refreshToken = generateRefreshToken();
  const csrfToken = createSessionCsrfToken();
  const secret = 's'.repeat(48);
  const userId = 'user-123';
  const currentTime = now;
  const RefreshToken = {
    findOne() {
      return { lean: async () => ({
        sessionId: cookieSessionId,
        tokenHash: hashRefreshToken(refreshToken),
        usedAt: null
      }) };
    }
  };
  const Session = {
    findOne(query) {
      const record = {
        _id: query._id,
        userId,
        revokedAt: null,
        expiresAt: new Date('2026-12-01T00:00:00Z'),
        csrfTokenHash: hashSessionCsrfToken(csrfToken)
      };
      if (query.userId) {
        const matches = query.userId === userId && query._id === bearerSessionId;
        return { lean: async () => matches ? record : null };
      }
      const matches = query._id === cookieSessionId;
      return {
        select() { return { lean: async () => matches ? record : null }; }
      };
    }
  };
  const csrf = createSessionCsrfMiddleware({
    Session, RefreshToken, allowedOrigins: [origin], now: () => currentTime
  });
  const access = createSessionAccessMiddleware({
    User: { findById: async () => ({ _id: userId }) },
    Session,
    secret,
    now: () => currentTime
  });
  const token = issueSessionAccessToken({
    userId, sessionId: bearerSessionId, secret,
    now: Math.floor(currentTime.getTime() / 1000)
  });
  const req = request(refreshToken, csrfToken);
  req.headers.authorization = `Bearer ${token}`;
  const res = responseRecorder();
  await new Promise((resolve) => csrf(req, res, () => access(req, res, () => {
    requireMatchingSession(req, res, () => {});
    resolve();
  })));
  return res;
}

test('combined CSRF and access guards accept credentials for the same session', async () => {
  const res = await runCombinedSessionGuards('session-a', 'session-a');
  assert.equal(res.statusCode, 200);
});

test('combined CSRF and access guards reject credentials for different sessions', async () => {
  const res = await runCombinedSessionGuards('session-a', 'session-b');
  assert.equal(res.statusCode, 403);
});
