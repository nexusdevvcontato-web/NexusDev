const test = require('node:test');
const assert = require('node:assert/strict');
const { createSessionAuthService } = require('../src/modules/auth/session-auth-service');
const { SESSION_COOKIE_NAME, CSRF_COOKIE_NAME } = require('../src/modules/auth/session-http-policy');

test('session auth service sets HttpOnly refresh cookie and readable CSRF cookie without exposing refresh token', async () => {
  const now = new Date('2026-11-20T04:00:00.000Z');
  const cookies = [];
  const service = createSessionAuthService({
    mongoose: { startSession() { return {
      async withTransaction(fn) { await fn(); },
      async endSession() {}
    }; } },
    Session: {
      async create(docs) { return [{ ...docs[0], _id: '507f1f77bcf86cd799439012' }]; }
    },
    RefreshToken: {
      async create() {}
    },
    User: { async findById(id) { return { _id: id, name: 'Teste' }; } },
    accessTokenSecret: 'a'.repeat(48),
    now: () => now
  });
  const result = await service.createForUser({
    userId: '507f1f77bcf86cd799439011',
    res: { cookie(name, value, options) { cookies.push({ name, value, options }); } }
  });
  assert.equal(result.status, 'created');
  assert.equal(typeof result.accessToken, 'string');
  assert.equal(Object.hasOwn(result, 'refreshToken'), false);
  assert.equal(cookies.length, 2);
  assert.equal(cookies.find(c => c.name === SESSION_COOKIE_NAME).options.httpOnly, true);
  assert.equal(cookies.find(c => c.name === SESSION_COOKIE_NAME).options.secure, true);
  assert.equal(cookies.find(c => c.name === SESSION_COOKIE_NAME).options.path, '/');
  assert.equal(cookies.find(c => c.name === CSRF_COOKIE_NAME).options.httpOnly, false);
  assert.equal(cookies.every(c => !Object.hasOwn(c.options, 'domain')), true);
});

test('session auth service refuses a password login if the stored password changed after verification', async () => {
  let sessionStarted = false;
  const cookies = [];
  const service = createSessionAuthService({
    mongoose: { startSession() { sessionStarted = true; throw new Error('must not create a session'); } },
    Session: {}, RefreshToken: {},
    User: { async findById() { return { _id: 'user-1', passwordHash: 'new-hash', authVersion: 1 }; } },
    accessTokenSecret: 'a'.repeat(48)
  });
  const result = await service.createForUser({
    userId: 'user-1', expectedPasswordHash: 'old-hash',
    res: { cookie(name, value) { cookies.push(name); } }
  });
  assert.deepEqual(result, { status: 'credentials_changed' });
  assert.equal(sessionStarted, false);
  assert.deepEqual(cookies, []);
});

test('session auth service rejects missing user and invalid dependencies', async () => {
  const service = createSessionAuthService({
    mongoose: { startSession() { throw new Error('must not start'); } },
    Session: {}, RefreshToken: {},
    User: { async findById() { return null; } },
    accessTokenSecret: 'a'.repeat(48)
  });
  const result = await service.createForUser({ userId: 'missing', res: { cookie() {} } });
  assert.deepEqual(result, { status: 'user_not_found' });
  assert.throws(() => createSessionAuthService({}), /inválidas/);
});
