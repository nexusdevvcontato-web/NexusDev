const test = require('node:test');
const assert = require('node:assert/strict');
const { createSessionRefreshService } = require('../src/modules/auth/session-refresh-service');
const { SESSION_COOKIE_NAME, CSRF_COOKIE_NAME, createCsrfToken } = require('../src/modules/auth/session-http-policy');\nconst { hashSessionCsrfToken } = require('../src/modules/auth/session-csrf-token');\nconst { hashRefreshToken } = require('../src/modules/auth/refresh-token');

function makeRes() {
  return {
    statusCode: 200, body: null, headers: {}, cookies: [], cleared: [],
    set(k,v) { this.headers[k]=v; return this; },
    status(v) { this.statusCode=v; return this; },
    json(v) { this.body=v; return this; },
    cookie(name,value,options) { this.cookies.push({name,value,options}); return this; },
    clearCookie(name,options) { this.cleared.push({name,options}); return this; }
  };
}
function setup() {
  const csrf = createCsrfToken();
  const now = new Date('2026-11-20T04:00:00.000Z');
  const mongoose = { startSession() { return {
    async withTransaction(fn) { await fn(); },
    async endSession() {}
  }; } };
  const Session = {
    async updateOne() { return {modifiedCount:1}; },
    async findOneAndUpdate() { return null; }
  };
  const RefreshToken = {
    async findOneAndUpdate() { return null; },
    findOne() { return { session: async () => null }; }
  };
  const service = createSessionRefreshService({
    mongoose, Session, RefreshToken,
    User: { async findById() { return {_id:'507f1f77bcf86cd799439011'}; } },
    accessTokenSecret: 's'.repeat(48),
    allowedOrigins: ['https://nexusdev-frontend.vercel.app'],
    now: () => now
  });
  const token = 'A'.repeat(43);
  const req = {
    headers: {
      origin: 'https://nexusdev-frontend.vercel.app',
      cookie: `${SESSION_COOKIE_NAME}=${token}; ${CSRF_COOKIE_NAME}=${csrf}`,
      'x-csrf-token': csrf
    },
    get(name) { return this.headers[name.toLowerCase()]; }
  };
  return {service,req,res:makeRes()};
}

test('refresh rejects an untrusted Origin before session storage access', async () => {
  const c=setup();
  c.req.headers.origin='https://attacker.example';
  await c.service.refresh(c.req,c.res);
  assert.equal(c.res.statusCode,403);
  assert.equal(c.res.headers['Cache-Control'],'no-store');
});

test('refresh rejects an invalid or already consumed token and clears cookies', async () => {
  const c=setup();
  await c.service.refresh(c.req,c.res);
  assert.equal(c.res.statusCode,401);
  assert.equal(c.res.cleared.length,2);
  assert.ok(c.res.cleared.some(x=>x.name===SESSION_COOKIE_NAME));
  assert.ok(c.res.cleared.some(x=>x.name===CSRF_COOKIE_NAME));
});

test('refresh rejects mismatched CSRF tokens', async () => {
  const c=setup();
  c.req.headers['x-csrf-token']=createCsrfToken();
  await c.service.refresh(c.req,c.res);
  assert.equal(c.res.statusCode,403);
});
