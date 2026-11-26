const test = require('node:test');
const assert = require('node:assert/strict');
const {
  issueSessionAccessToken,
  verifySessionAccessToken,
  createSessionAccessMiddleware,
  DEFAULT_ACCESS_TTL_SECONDS
} = require('../src/modules/auth/session-access-token');

const secret = 'a'.repeat(48);
const userId = '507f1f77bcf86cd799439011';
const sessionId = '507f1f77bcf86cd799439012';

test('session access token binds user and device session with short expiry', () => {
  const now = 1_800_000_000;
  const token = issueSessionAccessToken({ userId, sessionId, secret, now });
  assert.deepEqual(
    verifySessionAccessToken(token, { secret, now: now + 1 }),
    { userId, sessionId, expiresAt: now + DEFAULT_ACCESS_TTL_SECONDS }
  );
});

test('session access token rejects wrong secret, expiry, and legacy bearer claims', () => {
  const now = 1_800_000_000;
  const token = issueSessionAccessToken({ userId, sessionId, secret, now });
  assert.equal(verifySessionAccessToken(token, { secret: 'b'.repeat(48), now }), null);
  assert.equal(verifySessionAccessToken(token, { secret, now: now + DEFAULT_ACCESS_TTL_SECONDS }), null);
  const jwt = require('jsonwebtoken');
  const legacy = jwt.sign({ id: userId }, secret, { algorithm: 'HS256', expiresIn: '10m' });
  assert.equal(verifySessionAccessToken(legacy, { secret, now }), null);
});

test('session access token refuses excessive TTL and malformed inputs', () => {
  assert.throws(() => issueSessionAccessToken({ userId, sessionId, secret, ttlSeconds: 3600 }), /inválidos/);
  assert.throws(() => issueSessionAccessToken({ userId, sessionId, secret: 'short' }), /inválidos/);
});

test('session access middleware checks active session and reloads user', async () => {
  const now = new Date('2026-11-20T04:00:00.000Z');
  const token = issueSessionAccessToken({
    userId, sessionId, secret, now: Math.floor(now.getTime() / 1000)
  });
  let nextCalled = false;
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  const middleware = createSessionAccessMiddleware({
    User: { async findById(id) { assert.equal(id, userId); return { _id: userId, name: 'Teste', authVersion: 2 }; } },
    Session: { findOne(query) { assert.equal(query._id, sessionId); return { lean: async () => ({ _id: sessionId, userId, authVersion: 2, expiresAt: new Date(now.getTime() + 60_000) }) }; } },
    secret,
    now: () => now
  });
  await middleware(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(req.user.name, 'Teste');
  assert.equal(req.session.id, sessionId);
  assert.equal(req.session.authVersion, 2);
});

test('privacy export authentication excludes legacy maps from the loaded user profile', async () => {
  const now = new Date('2026-11-20T04:00:00.000Z');
  const token = issueSessionAccessToken({ userId, sessionId, secret, now: Math.floor(now.getTime() / 1000) });
  let selected = null;
  const user = { _id: userId, name: 'Teste', authVersion: 2 };
  const query = {
    select(fields) { selected = fields; return this; },
    then(resolve, reject) { return Promise.resolve(user).then(resolve, reject); }
  };
  const req = {
    method: 'GET',
    path: '/api/privacy/export',
    headers: { authorization: `Bearer ${token}` }
  };
  const res = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  const middleware = createSessionAccessMiddleware({
    User: { findById(id) { assert.equal(id, userId); return query; } },
    Session: { findOne() { return { lean: async () => ({ _id: sessionId, userId, authVersion: 2, expiresAt: new Date(now.getTime() + 60_000) }) }; } },
    secret, now: () => now
  });
  await middleware(req, res, () => {});
  assert.equal(selected, '-savedDraftMap -savedCodeMap');
  assert.equal(req.user, user);
});

test('session access middleware rejects sessions issued before a password reset', async () => {
  const now = new Date('2026-11-20T04:00:00.000Z');
  const token = issueSessionAccessToken({ userId, sessionId, secret, now: Math.floor(now.getTime() / 1000) });
  const res = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  const middleware = createSessionAccessMiddleware({
    User: { async findById() { return { _id: userId, authVersion: 4 }; } },
    Session: { findOne() { return { lean: async () => ({ _id: sessionId, userId, authVersion: 3, expiresAt: new Date(now.getTime() + 60_000) }) }; } },
    secret, now: () => now
  });
  await middleware({ headers: { authorization: `Bearer ${token}` } }, res, () => assert.fail('stale session must not authenticate'));
  assert.equal(res.statusCode, 401);
  assert.match(res.body.error, /alteração de credenciais/);
});

test('session access middleware denies revoked sessions and database errors fail closed', async () => {
  const now = new Date('2026-11-20T04:00:00.000Z');
  const token = issueSessionAccessToken({ userId, sessionId, secret, now: Math.floor(now.getTime() / 1000) });
  const response = () => ({ statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
  const revokedRes = response();
  const revoked = createSessionAccessMiddleware({
    User: { async findById() { throw new Error('must not load user'); } },
    Session: { findOne() { return { lean: async () => null }; } },
    secret, now: () => now
  });
  await revoked({ headers: { authorization: `Bearer ${token}` } }, revokedRes, () => assert.fail('next must not run'));
  assert.equal(revokedRes.statusCode, 401);

  const errorRes = response();
  const unavailable = createSessionAccessMiddleware({
    User: { async findById() { return null; } },
    Session: { findOne() { return { lean: async () => { throw new Error('db down'); } }; } },
    secret, now: () => now
  });
  await unavailable({ headers: { authorization: `Bearer ${token}` } }, errorRes, () => assert.fail('next must not run'));
  assert.equal(errorRes.statusCode, 503);
});
