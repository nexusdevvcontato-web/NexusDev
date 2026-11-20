const test = require('node:test');
const assert = require('node:assert/strict');

const sourceUri = process.env.MONGO_SESSION_TEST_URI;
const enabled = typeof sourceUri === 'string' && sourceUri.length > 0;

test('session HTTP flow: register, authenticate, bind cookie to bearer, logout and detect refresh replay', {
  skip: !enabled
}, async () => {
  const uri = new URL(sourceUri);
  uri.pathname = '/nexusdev_http_nexusdev_session_test';

  process.env.NODE_ENV = 'test';
  process.env.MONGO_URI = uri.toString();
  process.env.JWT_SECRET = 'legacy-test-secret-'.padEnd(48, 'x');
  process.env.SESSION_ACCESS_TOKEN_SECRET = 'session-test-secret-'.padEnd(48, 's');
  process.env.REAUTH_TOKEN_SECRET = 'reauth-test-secret-'.padEnd(48, 'r');
  process.env.CORS_ORIGINS = 'https://app.example.test';
  process.env.PORT = '43129';

  const mongoose = require('mongoose');
  const { app } = require('../server');

  let server;
  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const origin = 'https://app.example.test';

    const request = async (path, { method = 'GET', body, token, cookies = [], csrf } = {}) => {
      const headers = { Origin: origin };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (token) headers.Authorization = `Bearer ${token}`;
      if (cookies.length) headers.Cookie = cookies.join('; ');
      if (csrf) headers['X-CSRF-Token'] = csrf;
      const response = await fetch(base + path, {
        method, headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'manual'
      });
      const payload = await response.json().catch(() => ({}));
      const setCookieHeader = response.headers.get('set-cookie') || '';
      const setCookies = setCookieHeader.split(/,(?=[^;,]+=)/).map(value => value.trim());
      const cookieMap = {};
      for (const item of setCookies) {
        const pair = item.split(';', 1)[0];
        const separator = pair.indexOf('=');
        if (separator > 0) cookieMap[pair.slice(0, separator)] = pair.slice(separator + 1);
      }
      return { response, payload, setCookies, cookieMap };
    };

    const register = async (email) => {
      const result = await request('/api/auth/session/register', {
        method: 'POST',
        body: { name: 'Integration Student', email, password: 'A-strong-test-password-2026' }
      });
      assert.equal(result.response.status, 201, JSON.stringify(result.payload));
      assert.equal(typeof result.payload.accessToken, 'string');
      assert.equal('refreshToken' in result.payload, false);
      const refresh = result.cookieMap['__Host-nexusdev_refresh'];
      const csrf = result.cookieMap['__Host-nexusdev_csrf'];
      assert.ok(refresh);
      assert.ok(csrf);
      assert.ok(result.setCookies.some(value => /__Host-nexusdev_refresh=.*HttpOnly/i.test(value)));
      assert.ok(result.setCookies.every(value => /Secure/i.test(value) && /Path=\//i.test(value)));
      assert.ok(result.setCookies.every(value => !/Domain=/i.test(value)));
      assert.match(result.response.headers.get('cache-control') || '', /no-store/i);
      return { accessToken: result.payload.accessToken, refresh, csrf };
    };

    const allSessionsOwner = await register('session-all@example.test');
    const secondLogin = await request('/api/auth/session/login', {
      method: 'POST',
      body: { email: 'session-all@example.test', password: 'A-strong-test-password-2026' }
    });
    assert.equal(secondLogin.response.status, 200, JSON.stringify(secondLogin.payload));
    const secondAccessToken = secondLogin.payload.accessToken;
    const secondRefresh = secondLogin.cookieMap['__Host-nexusdev_refresh'];
    const secondCsrf = secondLogin.cookieMap['__Host-nexusdev_csrf'];
    assert.ok(secondAccessToken && secondRefresh && secondCsrf);
    assert.equal((await request('/api/me', { token: allSessionsOwner.accessToken })).response.status, 200);
    assert.equal((await request('/api/me', { token: secondAccessToken })).response.status, 200);

    const logoutAll = await request('/api/auth/session/logout-all', {
      method: 'POST',
      token: allSessionsOwner.accessToken,
      cookies: [
        `__Host-nexusdev_refresh=${allSessionsOwner.refresh}`,
        `__Host-nexusdev_csrf=${allSessionsOwner.csrf}`
      ],
      csrf: allSessionsOwner.csrf
    });
    assert.equal(logoutAll.response.status, 204);
    assert.equal((await request('/api/me', { token: allSessionsOwner.accessToken })).response.status, 401);
    assert.equal((await request('/api/me', { token: secondAccessToken })).response.status, 401);
    const revokedRefresh = await request('/api/auth/session/refresh', {
      method: 'POST',
      cookies: [
        `__Host-nexusdev_refresh=${secondRefresh}`,
        `__Host-nexusdev_csrf=${secondCsrf}`
      ],
      csrf: secondCsrf
    });
    assert.equal(revokedRefresh.response.status, 401);

    const a = await register('session-a@example.test');
    const b = await register('session-b@example.test');

    for (const token of [a.accessToken, b.accessToken]) {
      const me = await request('/api/me', { token });
      assert.equal(me.response.status, 200);
    }

    const mismatch = await request('/api/auth/session/logout', {
      method: 'POST',
      token: b.accessToken,
      cookies: [
        `__Host-nexusdev_refresh=${a.refresh}`,
        `__Host-nexusdev_csrf=${a.csrf}`
      ],
      csrf: a.csrf
    });
    assert.equal(mismatch.response.status, 403);
    assert.equal((await request('/api/me', { token: a.accessToken })).response.status, 200);
    assert.equal((await request('/api/me', { token: b.accessToken })).response.status, 200);

    const logoutA = await request('/api/auth/session/logout', {
      method: 'POST', token: a.accessToken,
      cookies: [
        `__Host-nexusdev_refresh=${a.refresh}`,
        `__Host-nexusdev_csrf=${a.csrf}`
      ],
      csrf: a.csrf
    });
    assert.equal(logoutA.response.status, 204);
    assert.equal((await request('/api/me', { token: a.accessToken })).response.status, 401);

    const rotated = await request('/api/auth/session/refresh', {
      method: 'POST',
      cookies: [
        `__Host-nexusdev_refresh=${b.refresh}`,
        `__Host-nexusdev_csrf=${b.csrf}`
      ],
      csrf: b.csrf
    });
    assert.equal(rotated.response.status, 200, JSON.stringify(rotated.payload));
    assert.equal(typeof rotated.payload.accessToken, 'string');
    const nextRefresh = rotated.cookieMap['__Host-nexusdev_refresh'];
    const nextCsrf = rotated.cookieMap['__Host-nexusdev_csrf'];
    assert.ok(nextRefresh && nextCsrf);
    assert.notEqual(nextRefresh, b.refresh);

    const replay = await request('/api/auth/session/refresh', {
      method: 'POST',
      cookies: [
        `__Host-nexusdev_refresh=${b.refresh}`,
        `__Host-nexusdev_csrf=${b.csrf}`
      ],
      csrf: b.csrf
    });
    assert.equal(replay.response.status, 401);
    assert.match(replay.payload.error || '', /reutilização|replay/i);
    assert.equal((await request('/api/me', { token: rotated.payload.accessToken })).response.status, 401);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  }
});
