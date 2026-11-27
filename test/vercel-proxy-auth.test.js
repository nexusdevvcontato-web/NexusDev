const test = require('node:test');
const assert = require('node:assert/strict');
const { createVercelProxyAuthMiddleware } = require('../src/http/vercel-proxy-auth');

function invoke(middleware, { method = 'GET', path = '/private', header } = {}) {
  let nextCalled = false;
  let statusCode = 200;
  const req = { method, path, get: (name) => name.toLowerCase() === 'x-nexus-proxy-key' ? header : undefined };
  const res = { status(code) { statusCode = code; return this; }, set() { return this; }, json() { return this; } };
  middleware(req, res, () => { nextCalled = true; });
  return { nextCalled, statusCode };
}

test('enforcement remains opt-in until coordinated staging activation', () => {
  assert.equal(invoke(createVercelProxyAuthMiddleware()).nextCalled, true);
});
test('enabled enforcement rejects missing and incorrect secrets', () => {
  const middleware = createVercelProxyAuthMiddleware({ enabled: true, secret: 'a'.repeat(48) });
  assert.equal(invoke(middleware).statusCode, 403);
  assert.equal(invoke(middleware, { header: 'b'.repeat(48) }).statusCode, 403);
});
test('enabled enforcement accepts the shared secret', () => {
  const secret = 'a'.repeat(48);
  assert.equal(invoke(createVercelProxyAuthMiddleware({ enabled: true, secret }), { header: secret }).nextCalled, true);
});
test('only GET /api/health bypasses proxy enforcement for Render liveness', () => {
  const middleware = createVercelProxyAuthMiddleware({ enabled: true, secret: 'a'.repeat(48) });
  assert.equal(invoke(middleware, { method: 'GET', path: '/health' }).nextCalled, true);
  assert.equal(invoke(middleware, { method: 'POST', path: '/health' }).statusCode, 403);
});
test('enabled enforcement rejects a weak secret at startup', () => {
  assert.throws(() => createVercelProxyAuthMiddleware({ enabled: true, secret: 'short' }));
});
