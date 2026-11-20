const test = require('node:test');
const assert = require('node:assert/strict');
const { createSessionCsrfMiddleware, readCookie } = require('../src/modules/auth/session-csrf-middleware');
const { createSessionCsrfToken, hashSessionCsrfToken } = require('../src/modules/auth/session-csrf-token');
const { generateRefreshToken, hashRefreshToken } = require('../src/modules/auth/refresh-token');

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

function request(refreshToken, csrfToken, requestOrigin = origin) {
  return {
    headers: {
      origin: requestOrigin,
      cookie: refreshToken ? `__Host-nexusdev_refresh=${encodeURIComponent(refreshToken)}` : '',
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
  assert.deepEqual(req.session, { id: setup.session._id, userId: setup.session.userId });
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
    { refreshToken: generateRefreshToken(), csrfToken: undefined },
    { refreshToken: generateRefreshToken(), csrfToken: 'bad' }
  ];
  for (const item of cases) {
    const setup = makeMiddleware();
    const res = responseRecorder();
    await setup.middleware(request(item.refreshToken, item.csrfToken), res, () => assert.fail('next não deveria ser chamado'));
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
