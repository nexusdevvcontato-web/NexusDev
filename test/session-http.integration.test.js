const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');

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
  const completionKeys = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  process.env.LESSON_PROOF_PUBLIC_KEY = completionKeys.publicKey;
  process.env.PORT = '43129';

  const mongoose = require('mongoose');
  const { app } = require('../server');

  let server;
  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
    await mongoose.model('CompletionProof').init();
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

    // Password-reset requests are limited both by client IP and by normalized email.
    for (let attempt = 0; attempt < 3; attempt++) {
      const resetRequest = await request('/api/auth/password-reset/request', {
        method: 'POST', body: { email: 'target@example.test' }
      });
      assert.equal(resetRequest.response.status, 503);
    }
    const throttledResetRequest = await request('/api/auth/password-reset/request', {
      method: 'POST', body: { email: 'target@example.test' }
    });
    assert.equal(throttledResetRequest.response.status, 429);

    // Legacy bearer tokens are rejected immediately, independent of password-change state.
    const User = mongoose.model('User');
    const legacyUser = await User.create({
      name: 'Legacy Student', email: 'legacy-password@example.test', passwordHash: 'test-hash'
    });
    const legacyToken = require('jsonwebtoken').sign(
      { id: legacyUser._id.toString() }, process.env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '30d' }
    );
    assert.equal((await request('/api/me', { token: legacyToken })).response.status, 401);
    for (const [path, body] of [
      ['/api/auth/register', { name: 'Legacy', email: 'legacy-new@example.test', password: 'Password-2026!' }],
      ['/api/auth/login', { email: 'legacy-password@example.test', password: 'Password-2026!' }],
      ['/api/auth/google', { credential: 'legacy-google-token' }]
    ]) {
      const retired = await request(path, { method: 'POST', body });
      assert.equal(retired.response.status, 410, path);
      assert.match(retired.response.headers.get('cache-control') || '', /no-store/i);
    }


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

    // A signed runner proof is accepted once; concurrent/replayed submissions cannot mutate progress twice.
    const aProfile = await request('/api/me', { token: a.accessToken });
    assert.match(aProfile.response.headers.get('cache-control') || '', /no-store/i);
    const preferences = await request('/api/privacy/preferences', { token: a.accessToken });
    assert.match(preferences.response.headers.get('cache-control') || '', /no-store/i);

    const challengeId = 'html-00-o-que-e-web';
    const certificateCode = 'NXD-2026-TEST-700-ABCDEF1234567890';
    await mongoose.model('User').updateOne({ _id: aProfile.payload.id }, {
      $set: {
        certificateCode,
        certificateIssuedAt: new Date(),
        'privacyPreferences.showCertificateDetails': false
      }
    });
    const privateCertificate = await request('/api/certificates/' + certificateCode);
    assert.equal(privateCertificate.response.status, 200);
    assert.match(privateCertificate.response.headers.get('cache-control') || '', /no-store/i);
    assert.equal(privateCertificate.payload.valid, true);
    assert.equal(privateCertificate.payload.publicDetails, false);
    assert.equal('studentName' in privateCertificate.payload, false);
    assert.equal('xp' in privateCertificate.payload, false);
    const certificateIssueDenied = await request('/api/certificates/issue', {
      method: 'POST', token: a.accessToken, body: {}
    });
    assert.equal(certificateIssueDenied.response.status, 403);
    assert.match(certificateIssueDenied.response.headers.get('cache-control') || '', /no-store/i);

    const leaderboard = await request('/api/leaderboard');
    assert.equal(leaderboard.response.status, 200);
    assert.match(leaderboard.response.headers.get('cache-control') || '', /no-store/i);

    const createdComment = await request('/api/lessons/' + challengeId + '/comments', {
      method: 'POST', token: a.accessToken, body: { text: 'Comentário de teste de privacidade.' }
    });
    assert.equal(createdComment.response.status, 201);
    const publicComments = await request('/api/lessons/' + challengeId + '/comments');
    assert.equal(publicComments.response.status, 200);
    assert.match(publicComments.response.headers.get('cache-control') || '', /no-store/i);
    assert.ok(publicComments.payload.comments.some(comment => comment.text === 'Comentário de teste de privacidade.'));

    // Deletion-impact preview is private, aggregate-only, and scoped to the authenticated owner.
    const anonymousImpact = await request('/api/privacy/deletion-impact');
    assert.equal(anonymousImpact.response.status, 401);
    assert.match(anonymousImpact.response.headers.get('cache-control') || '', /no-store/i);

    const impactA = await request('/api/privacy/deletion-impact', { token: a.accessToken });
    assert.equal(impactA.response.status, 200, JSON.stringify(impactA.payload));
    assert.match(impactA.response.headers.get('cache-control') || '', /no-store/i);
    assert.equal(impactA.payload.readOnly, true);
    assert.equal(impactA.payload.deletionEnabled, false);
    assert.equal(impactA.payload.sessions.count, 1);
    assert.equal(impactA.payload.comments.linkedCount, 1);
    assert.equal(impactA.payload.completionProofs.count, 0);
    assert.equal(impactA.payload.certificate.present, true);

    const impactB = await request('/api/privacy/deletion-impact', { token: b.accessToken });
    assert.equal(impactB.response.status, 200, JSON.stringify(impactB.payload));
    assert.equal(impactB.payload.sessions.count, 1);
    assert.equal(impactB.payload.comments.linkedCount, 0);
    assert.equal(impactB.payload.completionProofs.count, 0);
    assert.equal(impactB.payload.certificate.present, false);

    const impactSerialized = JSON.stringify(impactA.payload);
    for (const forbidden of [
      'sessionId', 'tokenHash', 'csrfTokenHash', 'certificateCode',
      'studentName', 'email', 'Comentário de teste de privacidade.'
    ]) assert.equal(impactSerialized.includes(forbidden), false, forbidden);
    assert.equal(Object.hasOwn(impactA.payload.sessions, 'refreshToken'), false);
    assert.equal(Object.hasOwn(impactA.payload.sessions, 'tokenHash'), false);
    assert.equal(impactA.payload.comments.legacy.status, 'not_attributable');
    assert.equal(impactA.payload.comments.legacy.count, null);
    assert.equal(impactA.payload.externalSystems.status, 'not_inspected');

    const proofNow = Math.floor(Date.now() / 1000);
    const completionProof = jwt.sign({
      jti: crypto.randomUUID(),
      purpose: 'lesson-completion',
      challengeId,
      sub: aProfile.payload.id,
      iss: 'nexusdev-runner',
      aud: 'nexusdev-progress',
      iat: proofNow,
      exp: proofNow + 120
    }, completionKeys.privateKey, { algorithm: 'RS256' });
    const completionBody = {
      challengeId,
      files: { 'index.html': '<h1>Primeira versão</h1>' },
      completionProof
    };
    const completed = await request('/api/progress/complete', {
      method: 'POST', token: a.accessToken, body: completionBody
    });
    assert.equal(completed.response.status, 200, JSON.stringify(completed.payload));
    assert.equal(completed.payload.xp, 50);
    const savedAfterFirst = await mongoose.model('User').findById(aProfile.payload.id).lean();
    const replayed = await request('/api/progress/complete', {
      method: 'POST', token: a.accessToken,
      body: { ...completionBody, files: { 'index.html': '<h1>Conteúdo alterado no replay</h1>' } }
    });
    assert.equal(replayed.response.status, 403);
    const savedAfterReplay = await mongoose.model('User').findById(aProfile.payload.id).lean();
    assert.equal(savedAfterReplay.xp, 50);
    assert.deepEqual(savedAfterReplay.savedCodeMap[challengeId], savedAfterFirst.savedCodeMap[challengeId]);


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
