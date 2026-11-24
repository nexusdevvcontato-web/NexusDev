const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const { hashCompletionFiles } = require('../src/modules/proofs/completion-files-hash');
const { consumeReauthProof } = require('../src/modules/auth/reauthentication');

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

    const request = async (path, { method = 'GET', body, token, cookies = [], csrf, reauthToken } = {}) => {
      const headers = { Origin: origin };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (token) headers.Authorization = `Bearer ${token}`;
      if (cookies.length) headers.Cookie = cookies.join('; ');
      if (csrf) headers['X-CSRF-Token'] = csrf;
      if (reauthToken) headers['X-Reauth-Token'] = reauthToken;
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

    // The real HTTP endpoints must reflect the connected MongoDB state and remain non-cacheable.
    const health = await request('/api/health');
    assert.equal(health.response.status, 200);
    assert.equal(health.payload.status, 'online');
    assert.match(health.response.headers.get('cache-control') || '', /no-store/i);

    const readiness = await request('/api/ready');
    assert.equal(readiness.response.status, 200);
    assert.deepEqual(readiness.payload, { status: 'ready', database: 'connected' });
    assert.match(readiness.response.headers.get('cache-control') || '', /no-store/i);

    // Exercise the real Express CORS middleware, not only its configuration parser.
    const allowedPreflight = await fetch(base + '/api/me', {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization,content-type,x-csrf-token'
      }
    });
    assert.equal(allowedPreflight.status, 204);
    assert.equal(allowedPreflight.headers.get('access-control-allow-origin'), origin);
    assert.equal(allowedPreflight.headers.get('access-control-allow-credentials'), 'true');
    assert.notEqual(allowedPreflight.headers.get('access-control-allow-origin'), '*');
    assert.match(allowedPreflight.headers.get('access-control-allow-headers') || '', /authorization/i);

    const hostilePreflight = await fetch(base + '/api/me', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://attacker.example.test',
        'Access-Control-Request-Method': 'GET'
      }
    });
    assert.ok(hostilePreflight.status >= 400);
    assert.equal(hostilePreflight.headers.get('access-control-allow-origin'), null);

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
        body: {
          name: 'Integration Student', email, password: 'A-strong-test-password-2026',
          role: 'admin', xp: 999999, privacyPreferences: { showInLeaderboard: false }
        }
      });
      assert.equal(result.response.status, 201, JSON.stringify(result.payload));
      assert.equal(typeof result.payload.accessToken, 'string');
      assert.equal('refreshToken' in result.payload, false);
      assert.equal(Object.hasOwn(result.payload.user, 'role'), false);
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

    // Registration ignores client-supplied privilege, XP, and privacy fields.
    const credentialVersionOwner = await register('credential-version@example.test');
    const injectedRoleUser = await User.findOne({ email: 'credential-version@example.test' });
    assert.equal(injectedRoleUser.role, 'student');
    assert.equal(injectedRoleUser.xp, 0);
    assert.equal(injectedRoleUser.privacyPreferences.showInLeaderboard, true);

    // A credential-generation change invalidates existing access and refresh credentials.
    const credentialVersionUser = await mongoose.model('User').findOne({ email: 'credential-version@example.test' });
    await mongoose.model('User').updateOne({ _id: credentialVersionUser._id }, { $inc: { authVersion: 1 } });
    assert.equal((await request('/api/me', { token: credentialVersionOwner.accessToken })).response.status, 401);
    const staleRefresh = await request('/api/auth/session/refresh', {
      method: 'POST',
      cookies: [
        `__Host-nexusdev_refresh=${credentialVersionOwner.refresh}`,
        `__Host-nexusdev_csrf=${credentialVersionOwner.csrf}`
      ],
      csrf: credentialVersionOwner.csrf
    });
    assert.equal(staleRefresh.response.status, 401);

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

    // Public comment metadata is derived from the authenticated database user, not client fields.
    const spoofedComment = await request('/api/lessons/html-00-o-que-e-web/comments', {
      method: 'POST',
      token: a.accessToken,
      body: {
        text: 'Comentário de teste de integração',
        author: 'Administrador Falso',
        badge: 'Mentor NexusDev',
        authorUserId: '507f1f77bcf86cd799439099'
      }
    });
    assert.equal(spoofedComment.response.status, 201, JSON.stringify(spoofedComment.payload));
    assert.equal(spoofedComment.payload.comment.author, 'Integration Student');
    assert.equal(spoofedComment.payload.comment.badge, 'Aluno NexusDev');
    const persistedComment = await mongoose.model('Comment').findById(spoofedComment.payload.comment.id).lean();
    assert.equal(persistedComment.authorUserId.toString(), (await User.findOne({ email: 'session-a@example.test' }))._id.toString());

    // Device management must list only safe metadata and revoke another device without
    // terminating the authenticated current session or affecting a different account.
    const secondDeviceLogin = await request('/api/auth/session/login', {
      method: 'POST',
      body: { email: 'session-a@example.test', password: 'A-strong-test-password-2026' }
    });
    assert.equal(secondDeviceLogin.response.status, 200, JSON.stringify(secondDeviceLogin.payload));
    const secondDeviceToken = secondDeviceLogin.payload.accessToken;
    const sessionsBeforeRevoke = await request('/api/auth/session/sessions', { token: a.accessToken });
    assert.equal(sessionsBeforeRevoke.response.status, 200);
    assert.equal(sessionsBeforeRevoke.payload.sessions.length, 2);
    const safeSessionFields = ['id', 'createdAt', 'lastUsedAt', 'expiresAt', 'current'].sort();
    assert.ok(sessionsBeforeRevoke.payload.sessions.every(item => {
      assert.deepEqual(Object.keys(item).sort(), safeSessionFields);
      assert.equal(typeof item.id, 'string');
      assert.equal(typeof item.current, 'boolean');
      assert.ok(item.createdAt && item.lastUsedAt && item.expiresAt);
      return true;
    }));
    const serializedSessionList = JSON.stringify(sessionsBeforeRevoke.payload);
    for (const forbidden of [
      'refreshToken', 'accessToken', 'tokenHash', 'csrfTokenHash',
      'userId', 'email', 'ipAddress', 'userAgent', 'deviceFingerprint'
    ]) assert.equal(serializedSessionList.includes(forbidden), false, forbidden);

    // A different account must receive only its own session metadata.
    const sessionsForAccountB = await request('/api/auth/session/sessions', { token: b.accessToken });
    assert.equal(sessionsForAccountB.response.status, 200);
    assert.equal(sessionsForAccountB.payload.sessions.length, 1);
    assert.deepEqual(Object.keys(sessionsForAccountB.payload.sessions[0]).sort(), safeSessionFields);
    assert.equal(sessionsForAccountB.payload.sessions[0].current, true);
    assert.equal(
      sessionsBeforeRevoke.payload.sessions.some(item => item.id === sessionsForAccountB.payload.sessions[0].id),
      false
    );

    const otherDevice = sessionsBeforeRevoke.payload.sessions.find(item => !item.current);
    assert.ok(otherDevice);
    const revokeOtherDevice = await request('/api/auth/session/sessions/' + otherDevice.id, {
      method: 'DELETE',
      token: a.accessToken,
      cookies: [
        `__Host-nexusdev_refresh=${a.refresh}`,
        `__Host-nexusdev_csrf=${a.csrf}`
      ],
      csrf: a.csrf
    });
    assert.equal(revokeOtherDevice.response.status, 204);
    assert.equal((await request('/api/me', { token: a.accessToken })).response.status, 200);
    assert.equal((await request('/api/me', { token: secondDeviceToken })).response.status, 401);
    const revokedDeviceRefresh = await request('/api/auth/session/refresh', {
      method: 'POST',
      cookies: [
        `__Host-nexusdev_refresh=${secondDeviceLogin.cookieMap['__Host-nexusdev_refresh']}`,
        `__Host-nexusdev_csrf=${secondDeviceLogin.cookieMap['__Host-nexusdev_csrf']}`
      ],
      csrf: secondDeviceLogin.cookieMap['__Host-nexusdev_csrf']
    });
    assert.equal(revokedDeviceRefresh.response.status, 401);
    assert.equal((await request('/api/me', { token: b.accessToken })).response.status, 200);

    // Concurrent reuse of one refresh token must fail closed: one rotation may
    // complete, but replay detection revokes the session before it can be reused.
    const concurrentRefreshOwner = await register('concurrent-refresh@example.test');
    const concurrentRefreshCookies = [
      `__Host-nexusdev_refresh=${concurrentRefreshOwner.refresh}`,
      `__Host-nexusdev_csrf=${concurrentRefreshOwner.csrf}`
    ];
    const concurrentRefreshResults = await Promise.all([
      request('/api/auth/session/refresh', {
        method: 'POST', cookies: concurrentRefreshCookies, csrf: concurrentRefreshOwner.csrf
      }),
      request('/api/auth/session/refresh', {
        method: 'POST', cookies: concurrentRefreshCookies, csrf: concurrentRefreshOwner.csrf
      })
    ]);
    assert.deepEqual(
      concurrentRefreshResults.map(result => result.response.status).sort((left, right) => left - right),
      [200, 401]
    );
    const rotatedAccessToken = concurrentRefreshResults.find(result => result.response.status === 200).payload.accessToken;
    assert.equal((await request('/api/me', { token: rotatedAccessToken })).response.status, 401);


    // A signed runner proof is accepted once; concurrent/replayed submissions cannot mutate progress twice.
    const aProfile = await request('/api/me', { token: a.accessToken });
    assert.match(aProfile.response.headers.get('cache-control') || '', /no-store/i);

    // Reauthentication is exercised through the real HTTP route with a disposable integration account.
    const anonymousReauth = await request('/api/auth/reauthenticate', {
      method: 'POST', body: { password: 'A-strong-test-password-2026' }
    });
    assert.equal(anonymousReauth.response.status, 401);
    assert.match(anonymousReauth.response.headers.get('cache-control') || '', /no-store/i);

    const rejectedReauth = await request('/api/auth/reauthenticate', {
      method: 'POST', token: a.accessToken, body: { password: 'incorrect-test-password' }
    });
    assert.equal(rejectedReauth.response.status, 401);
    assert.match(rejectedReauth.response.headers.get('cache-control') || '', /no-store/i);

    const acceptedReauth = await request('/api/auth/reauthenticate', {
      method: 'POST', token: a.accessToken, body: { password: 'A-strong-test-password-2026' }
    });
    assert.equal(acceptedReauth.response.status, 200, JSON.stringify(acceptedReauth.payload));
    assert.match(acceptedReauth.response.headers.get('cache-control') || '', /no-store/i);
    assert.equal(acceptedReauth.payload.expiresIn, 300);
    assert.equal(typeof acceptedReauth.payload.reauthToken, 'string');
    const reauthClaims = jwt.verify(acceptedReauth.payload.reauthToken, process.env.REAUTH_TOKEN_SECRET, {
      algorithms: ['HS256']
    });
    assert.equal(reauthClaims.sub, aProfile.payload.id);
    assert.equal(reauthClaims.purpose, 'sensitive-action');
    assert.equal(reauthClaims.exp - reauthClaims.iat, 300);
    const reauthUser = await User.findById(aProfile.payload.id).lean();
    assert.equal(reauthUser.reauthProofHash,
      crypto.createHash('sha256').update(reauthClaims.jti).digest('hex'));
    assert.ok(reauthUser.reauthProofExpiresAt instanceof Date);
    assert.equal('reauthToken' in reauthUser, false);

    // The stored proof is bound to its owner and consumed atomically in real MongoDB.
    const bProfileIdForReauth = (await request('/api/me', { token: b.accessToken })).payload.id;
    assert.equal(await consumeReauthProof(User, {
      userId: bProfileIdForReauth,
      token: acceptedReauth.payload.reauthToken,
      secret: process.env.REAUTH_TOKEN_SECRET
    }), false);
    const consumedOnce = await consumeReauthProof(User, {
      userId: aProfile.payload.id,
      token: acceptedReauth.payload.reauthToken,
      secret: process.env.REAUTH_TOKEN_SECRET
    });
    assert.equal(consumedOnce, true);
    const consumedAgain = await consumeReauthProof(User, {
      userId: aProfile.payload.id,
      token: acceptedReauth.payload.reauthToken,
      secret: process.env.REAUTH_TOKEN_SECRET
    });
    assert.equal(consumedAgain, false);
    const afterConsumption = await User.findById(aProfile.payload.id).lean();
    assert.equal(Boolean(afterConsumption.reauthProofHash), false);
    assert.ok(!afterConsumption.reauthProofExpiresAt);

    // A second issued proof is consumed by concurrent MongoDB compare-and-set operations:
    // exactly one caller can remove the matching stored hash.
    const concurrentReauthIssue = await request('/api/auth/reauthenticate', {
      method: 'POST', token: a.accessToken,
      body: { password: 'A-strong-test-password-2026' }
    });
    assert.equal(concurrentReauthIssue.response.status, 200);
    const concurrentReauthResults = await Promise.all([
      consumeReauthProof(User, {
        userId: aProfile.payload.id,
        token: concurrentReauthIssue.payload.reauthToken,
        secret: process.env.REAUTH_TOKEN_SECRET
      }),
      consumeReauthProof(User, {
        userId: aProfile.payload.id,
        token: concurrentReauthIssue.payload.reauthToken,
        secret: process.env.REAUTH_TOKEN_SECRET
      })
    ]);
    assert.equal(concurrentReauthResults.filter(Boolean).length, 1);
    assert.equal(concurrentReauthResults.filter(value => value === false).length, 1);
    const afterConcurrentConsumption = await User.findById(aProfile.payload.id).lean();
    assert.equal(Boolean(afterConcurrentConsumption.reauthProofHash), false);
    assert.ok(!afterConcurrentConsumption.reauthProofExpiresAt);

    // Draft endpoints are tested through authenticated HTTP requests, including CAS conflicts and account isolation.
    const anonymousDraftRead = await request('/api/lessons/html-00-o-que-e-web/draft');
    assert.equal(anonymousDraftRead.response.status, 401);
    assert.match(anonymousDraftRead.response.headers.get('cache-control') || '', /no-store/i);

    const initialDraftA = await request('/api/lessons/html-00-o-que-e-web/draft', { token: a.accessToken });
    assert.equal(initialDraftA.response.status, 200);
    assert.deepEqual(initialDraftA.payload.draft, { revision: 0, files: null, updatedAt: null });

    const firstDraftSave = await request('/api/lessons/html-00-o-que-e-web/draft', {
      method: 'PUT', token: a.accessToken,
      body: { expectedRevision: 0, files: { 'index.html': '<h1>account A</h1>' }, userId: 'forged-user-id' }
    });
    assert.equal(firstDraftSave.response.status, 200, JSON.stringify(firstDraftSave.payload));
    assert.equal(firstDraftSave.payload.draft.revision, 1);

    const staleDraftSave = await request('/api/lessons/html-00-o-que-e-web/draft', {
      method: 'PUT', token: a.accessToken,
      body: { expectedRevision: 0, files: { 'index.html': '<h1>stale overwrite</h1>' } }
    });
    assert.equal(staleDraftSave.response.status, 409);
    assert.equal(staleDraftSave.payload.draft.revision, 1);
    assert.equal(staleDraftSave.payload.draft.files['index.html'], '<h1>account A</h1>');

    const concurrentDraftWrites = await Promise.all([
      request('/api/lessons/html-00-o-que-e-web/draft', {
        method: 'PUT', token: a.accessToken,
        body: { expectedRevision: 1, files: { 'index.html': '<h1>writer one</h1>' } }
      }),
      request('/api/lessons/html-00-o-que-e-web/draft', {
        method: 'PUT', token: a.accessToken,
        body: { expectedRevision: 1, files: { 'index.html': '<h1>writer two</h1>' } }
      })
    ]);
    assert.equal(concurrentDraftWrites.filter(result => result.response.status === 200).length, 1);
    assert.equal(concurrentDraftWrites.filter(result => result.response.status === 409).length, 1);

    const initialDraftB = await request('/api/lessons/html-00-o-que-e-web/draft', { token: b.accessToken });
    assert.equal(initialDraftB.response.status, 200);
    assert.deepEqual(initialDraftB.payload.draft, { revision: 0, files: null, updatedAt: null });
    const saveDraftB = await request('/api/lessons/html-00-o-que-e-web/draft', {
      method: 'PUT', token: b.accessToken,
      body: { expectedRevision: 0, files: { 'index.html': '<h1>account B</h1>' }, userId: aProfile.payload.id }
    });
    assert.equal(saveDraftB.response.status, 200);
    assert.equal(saveDraftB.payload.draft.revision, 1);

    const finalDraftA = await request('/api/lessons/html-00-o-que-e-web/draft', { token: a.accessToken });
    assert.equal(finalDraftA.response.status, 200);
    assert.equal(finalDraftA.payload.draft.revision, 2);
    assert.ok(['<h1>writer one</h1>', '<h1>writer two</h1>'].includes(finalDraftA.payload.draft.files['index.html']));
    const finalDraftB = await request('/api/lessons/html-00-o-que-e-web/draft', { token: b.accessToken });
    assert.equal(finalDraftB.response.status, 200);
    assert.equal(finalDraftB.payload.draft.files['index.html'], '<h1>account B</h1>');
    const preferences = await request('/api/privacy/preferences', { token: a.accessToken });
    assert.match(preferences.response.headers.get('cache-control') || '', /no-store/i);
    assert.deepEqual(preferences.payload.preferences, {
      showInLeaderboard: true,
      showCertificateDetails: true
    });
    const updatePreferences = await request('/api/privacy/preferences', {
      method: 'PUT', token: a.accessToken,
      body: { showInLeaderboard: false, showCertificateDetails: false }
    });
    assert.equal(updatePreferences.response.status, 200);
    assert.deepEqual(updatePreferences.payload.preferences, {
      showInLeaderboard: false,
      showCertificateDetails: false
    });
    const persistedPreferences = await request('/api/privacy/preferences', { token: a.accessToken });
    assert.deepEqual(persistedPreferences.payload.preferences, updatePreferences.payload.preferences);
    const invalidPreferences = await request('/api/privacy/preferences', {
      method: 'PUT', token: a.accessToken,
      body: { showInLeaderboard: 'false', isAdmin: true }
    });
    assert.equal(invalidPreferences.response.status, 400);
    assert.deepEqual(
      (await request('/api/privacy/preferences', { token: a.accessToken })).payload.preferences,
      updatePreferences.payload.preferences
    );
    const restorePreferences = await request('/api/privacy/preferences', {
      method: 'PUT', token: a.accessToken,
      body: { showInLeaderboard: true, showCertificateDetails: true }
    });
    assert.equal(restorePreferences.response.status, 200);
    const anonymousPreferences = await request('/api/privacy/preferences');
    assert.equal(anonymousPreferences.response.status, 401);
    assert.match(anonymousPreferences.response.headers.get('cache-control') || '', /no-store/i);
    const anonymousPreferenceUpdate = await request('/api/privacy/preferences', {
      method: 'PUT', body: { showInLeaderboard: false }
    });
    assert.equal(anonymousPreferenceUpdate.response.status, 401);
    assert.match(anonymousPreferenceUpdate.response.headers.get('cache-control') || '', /no-store/i);

    const anonymousProgress = await request('/api/progress/complete', {
      method: 'POST', body: {}
    });
    assert.equal(anonymousProgress.response.status, 401);
    assert.match(anonymousProgress.response.headers.get('cache-control') || '', /no-store/i);

    const tutorResponse = await request('/api/tutor/analyze', {
      method: 'POST',
      body: {
        challengeTitle: 'Exercício de teste',
        language: 'javascript',
        instructions: 'Crie uma função simples.',
        filesMap: { 'script.js': 'const answer = 42;' }
      }
    });
    assert.equal(tutorResponse.response.status, 200);
    assert.match(tutorResponse.response.headers.get('cache-control') || '', /no-store/i);
    const invalidTutorResponse = await request('/api/tutor/analyze', {
      method: 'POST', body: {}
    });
    assert.equal(invalidTutorResponse.response.status, 400);
    assert.match(invalidTutorResponse.response.headers.get('cache-control') || '', /no-store/i);
    // Tutor is intentionally usable by guests, but its per-IP budget must be enforced.
    for (let i = 0; i < 18; i++) {
      const withinBudget = await request('/api/tutor/analyze', {
        method: 'POST',
        body: { challengeTitle: 'Teste', language: 'javascript', filesMap: { 'script.js': 'return 1;' } }
      });
      assert.equal(withinBudget.response.status, 200);
      assert.match(withinBudget.response.headers.get('cache-control') || '', /no-store/i);
    }
    const rateLimitedTutor = await request('/api/tutor/analyze', {
      method: 'POST',
      body: { challengeTitle: 'Teste', language: 'javascript', filesMap: { 'script.js': 'return 1;' } }
    });
    assert.equal(rateLimitedTutor.response.status, 429);
    assert.match(rateLimitedTutor.response.headers.get('cache-control') || '', /no-store/i);

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
    assert.equal('issuedAt' in privateCertificate.payload, false);
    assert.equal('githubUrl' in privateCertificate.payload, false);
    assert.equal('liveUrl' in privateCertificate.payload, false);
    const anonymousCertificate = await request('/api/certificates/' + certificateCode);
    assert.equal(anonymousCertificate.response.status, 200);
    assert.match(anonymousCertificate.response.headers.get('cache-control') || '', /no-store/i);
    const certificateIssueDenied = await request('/api/certificates/issue', {
      method: 'POST', token: a.accessToken, body: {}
    });
    assert.equal(certificateIssueDenied.response.status, 403);
    assert.match(certificateIssueDenied.response.headers.get('cache-control') || '', /no-store/i);
    // Send sequentially so network scheduling cannot reorder which request crosses the limit.
    const repeatedCertificateIssues = [];
    for (let attempt = 0; attempt < 5; attempt++) {
      repeatedCertificateIssues.push(await request('/api/certificates/issue', {
        method: 'POST', token: a.accessToken, body: {}
      }));
    }
    assert.ok(repeatedCertificateIssues.slice(0, 4).every(result => result.response.status === 403));
    assert.equal(repeatedCertificateIssues[4].response.status, 429);
    assert.match(repeatedCertificateIssues[4].response.headers.get('cache-control') || '', /no-store/i);

    const leaderboard = await request('/api/leaderboard');
    assert.equal(leaderboard.response.status, 200);
    assert.ok(Array.isArray(leaderboard.payload.leaderboard));
    assert.match(leaderboard.response.headers.get('cache-control') || '', /no-store/i);
    const createdComment = await request('/api/lessons/' + challengeId + '/comments', {
      method: 'POST',
      token: a.accessToken,
      body: {
        text: 'Comentário de teste de privacidade.',
        author: 'Nome falsificado',
        badge: 'Administrador',
        authorUserId: b.profileId,
        xp: 999999
      }
    });
    assert.equal(createdComment.response.status, 201);
    assert.match(createdComment.response.headers.get('cache-control') || '', /no-store/i);
    assert.equal(createdComment.payload.comment.author, 'Integration Student');
    assert.equal(createdComment.payload.comment.badge, 'Aluno NexusDev');
    assert.equal(createdComment.payload.xp, 0);
    assert.deepEqual(Object.keys(createdComment.payload.comment).sort(), ['author', 'badge', 'id', 'text', 'time']);

    const anonymousCommentPost = await request('/api/lessons/' + challengeId + '/comments', {
      method: 'POST', body: { text: 'Não deve publicar anonimamente.' }
    });
    assert.equal(anonymousCommentPost.response.status, 401);
    assert.match(anonymousCommentPost.response.headers.get('cache-control') || '', /no-store/i);

    const publicComments = await request('/api/lessons/' + challengeId + '/comments');
    assert.equal(publicComments.response.status, 200);
    assert.match(publicComments.response.headers.get('cache-control') || '', /no-store/i);
    const visibleComment = publicComments.payload.comments.find(comment => comment.text === 'Comentário de teste de privacidade.');
    assert.ok(visibleComment);
    assert.deepEqual(Object.keys(visibleComment).sort(), ['author', 'badge', 'id', 'text', 'time']);

    // Deletion-impact preview is private, aggregate-only, and scoped to the authenticated owner.
    const anonymousExport = await request('/api/privacy/export');
    assert.equal(anonymousExport.response.status, 401);
    assert.match(anonymousExport.response.headers.get('cache-control') || '', /no-store/i);

    const anonymousImpact = await request('/api/privacy/deletion-impact');
    assert.equal(anonymousImpact.response.status, 401);
    assert.match(anonymousImpact.response.headers.get('cache-control') || '', /no-store/i);

    const impactA = await request('/api/privacy/deletion-impact', { token: a.accessToken });
    assert.equal(impactA.response.status, 200, JSON.stringify(impactA.payload));
    assert.match(impactA.response.headers.get('cache-control') || '', /no-store/i);
    assert.equal(impactA.payload.readOnly, true);
    assert.equal(impactA.payload.deletionEnabled, false);
    assert.equal(impactA.payload.sessions.count, 2);
    assert.equal(impactA.payload.comments.linkedCount, 2);
    assert.equal(impactA.payload.completionProofs.count, 0);
    assert.equal(impactA.payload.certificate.present, true);
    assert.equal(impactA.payload.learning.dataPresent, true);

    const exportWithoutReauth = await request('/api/privacy/export', { token: a.accessToken });
    assert.equal(exportWithoutReauth.response.status, 403);
    assert.match(exportWithoutReauth.response.headers.get('cache-control') || '', /no-store/i);

    const exportReauthA = await request('/api/auth/reauthenticate', {
      method: 'POST', token: a.accessToken,
      body: { password: 'A-strong-test-password-2026' }
    });
    assert.equal(exportReauthA.response.status, 200);
    const crossAccountExport = await request('/api/privacy/export', {
      token: b.accessToken,
      reauthToken: exportReauthA.payload.reauthToken
    });
    assert.equal(crossAccountExport.response.status, 403);
    assert.match(crossAccountExport.response.headers.get('cache-control') || '', /no-store/i);
    const exportA = await request('/api/privacy/export', {
      token: a.accessToken,
      reauthToken: exportReauthA.payload.reauthToken
    });
    assert.equal(exportA.response.status, 200, JSON.stringify(exportA.payload));
    const replayedExportA = await request('/api/privacy/export', {
      token: a.accessToken,
      reauthToken: exportReauthA.payload.reauthToken
    });
    assert.equal(replayedExportA.response.status, 403);
    assert.match(replayedExportA.response.headers.get('cache-control') || '', /no-store/i);
    assert.match(exportA.response.headers.get('cache-control') || '', /no-store/i);
    assert.equal(exportA.payload.schemaVersion, 2);
    assert.equal(exportA.payload.sessions.length, impactA.payload.sessions.count);
    assert.equal(exportA.payload.comments.length, impactA.payload.comments.linkedCount);
    assert.equal(exportA.payload.data.certificateIssuedAt != null, impactA.payload.certificate.present);
    assert.equal(exportA.payload.data.completedIds.length, 0);
    assert.equal(exportA.payload.data.savedDraftMap['html-00-o-que-e-web'].revision, 2);
    const exportSerialized = JSON.stringify(exportA.payload);
    for (const forbidden of [
      'passwordHash', 'googleId', 'reauthProofHash', 'csrfTokenHash',
      'tokenHash', 'authorUserId', 'internalSecret'
    ]) assert.equal(exportSerialized.includes(forbidden), false, forbidden);
    assert.ok(exportA.payload.comments.some(comment => comment.text === 'Comentário de teste de privacidade.'));
    const exportReauthB = await request('/api/auth/reauthenticate', {
      method: 'POST', token: b.accessToken,
      body: { password: 'A-strong-test-password-2026' }
    });
    assert.equal(exportReauthB.response.status, 200);
    const exportB = await request('/api/privacy/export', {
      token: b.accessToken,
      reauthToken: exportReauthB.payload.reauthToken
    });
    assert.equal(exportB.response.status, 200);
    assert.equal(exportB.payload.comments.length, 0);
    assert.equal(exportB.payload.sessions.length, 1);
    assert.equal(exportB.payload.data.savedDraftMap['html-00-o-que-e-web'].revision, 1);
    assert.equal(exportB.payload.data.savedDraftMap['html-00-o-que-e-web'].files['index.html'], '<h1>account B</h1>');
    assert.equal(JSON.stringify(exportB.payload).includes('Comentário de teste de privacidade.'), false);
    assert.equal(JSON.stringify(exportB.payload).includes('<h1>account A</h1>'), false);

    // Export attempts are throttled per authenticated account, without affecting another user.
    const remainingExportAttempts = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      remainingExportAttempts.push(await request('/api/privacy/export', { token: a.accessToken }));
    }
    assert.ok(remainingExportAttempts.every(result => result.response.status === 403));
    assert.ok(remainingExportAttempts.every(result => /no-store/i.test(result.response.headers.get('cache-control') || '')));
    const throttledExport = await request('/api/privacy/export', { token: a.accessToken });
    assert.equal(throttledExport.response.status, 429);
    assert.match(throttledExport.response.headers.get('cache-control') || '', /no-store/i);
    const exportBStillWithinItsOwnBudget = await request('/api/privacy/export', { token: b.accessToken });
    assert.equal(exportBStillWithinItsOwnBudget.response.status, 403);
    assert.match(exportBStillWithinItsOwnBudget.response.headers.get('cache-control') || '', /no-store/i);

    await User.updateOne({ _id: aProfile.payload.id }, {
      $set: { name: 'Leaderboard Optout A', xp: 999999, 'privacyPreferences.showInLeaderboard': false }
    });
    const optedOutLeaderboard = await request('/api/leaderboard');
    assert.equal(optedOutLeaderboard.payload.leaderboard.some(row => row.name === 'Leaderboard Optout A'), false);
    await User.updateOne({ _id: aProfile.payload.id }, {
      $set: { 'privacyPreferences.showInLeaderboard': true }
    });
    const optedInLeaderboard = await request('/api/leaderboard');
    assert.equal(optedInLeaderboard.payload.leaderboard.some(row => row.name === 'Leaderboard Optout A'), true);
    await User.updateOne({ _id: aProfile.payload.id }, { $set: { xp: 0 } });


    const impactB = await request('/api/privacy/deletion-impact', { token: b.accessToken });
    assert.equal(impactB.response.status, 200, JSON.stringify(impactB.payload));
    assert.equal(impactB.payload.sessions.count, 1);
    assert.equal(impactB.payload.comments.linkedCount, 0);
    assert.equal(impactB.payload.completionProofs.count, 0);
    assert.equal(impactB.payload.certificate.present, false);

    const bCertificateCode = 'NXD-2026-TEST-700-BBCDEF1234567890';
    await User.updateOne({ _id: (await request('/api/me', { token: b.accessToken })).payload.id }, {
      $set: { certificateCode: bCertificateCode, certificateIssuedAt: new Date() }
    });
    const publicCertificate = await request('/api/certificates/' + bCertificateCode);
    assert.equal(publicCertificate.payload.valid, true);
    assert.equal(publicCertificate.payload.publicDetails, true);
    assert.equal(publicCertificate.payload.studentName, 'Integration Student');
    const bId = (await request('/api/me', { token: b.accessToken })).payload.id;
    await User.updateOne({ _id: bId }, { $set: { 'privacyPreferences.showCertificateDetails': false } });
    const optedOutCertificate = await request('/api/certificates/' + bCertificateCode);
    assert.equal(optedOutCertificate.payload.valid, true);
    assert.equal(optedOutCertificate.payload.publicDetails, false);
    for (const field of ['studentName', 'completedCount', 'xp', 'issuedAt', 'githubUrl', 'liveUrl']) {
      assert.equal(Object.hasOwn(optedOutCertificate.payload, field), false, field);
    }


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

    // IDs beyond the published curriculum remain unsupported until a trusted evaluator is registered.
    const unsupportedChallengeId = 'mod-4-aula-141';
    const unsupportedCompletion = await request('/api/progress/complete', {
      method: 'POST',
      token: a.accessToken,
      body: {
        challengeId: unsupportedChallengeId,
        files: { 'script.js': 'function resposta() { return true; }' }
      }
    });
    assert.equal(unsupportedCompletion.response.status, 400);
    assert.match(unsupportedCompletion.payload.error, /aula inválida|currículo oficial/i);
    const userAfterUnsupported = await mongoose.model('User').findById(aProfile.payload.id).lean();
    assert.equal(userAfterUnsupported.xp, 0);
    assert.deepEqual(userAfterUnsupported.completedIds, []);
    assert.equal(await mongoose.model('CompletionProof').countDocuments({ userId: aProfile.payload.id }), 0);

    // The API evaluates the exact submitted source using server-owned tests; clients cannot mint proofs.
    const evaluatedFiles = { 'index.html': '<h1>Olá, Mundo!</h1>' };
    const completionBody = { challengeId, files: evaluatedFiles };

    const substituted = await request('/api/progress/complete', {
      method: 'POST',
      token: a.accessToken,
      body: { ...completionBody, files: { 'index.html': '<h1>Conteúdo não avaliado</h1>' } }
    });
    assert.equal(substituted.response.status, 422);
    assert.equal(await mongoose.model('CompletionProof').countDocuments({ userId: aProfile.payload.id }), 0);
    const userAfterSubstitution = await mongoose.model('User').findById(aProfile.payload.id).lean();
    assert.equal(userAfterSubstitution.xp, 0);
    assert.deepEqual(userAfterSubstitution.completedIds, []);

    const concurrentCompletions = await Promise.all([
      request('/api/progress/complete', { method: 'POST', token: a.accessToken, body: completionBody }),
      request('/api/progress/complete', { method: 'POST', token: a.accessToken, body: completionBody })
    ]);
    assert.deepEqual(
      concurrentCompletions.map(result => result.response.status).sort((a, b) => a - b),
      [200, 200],
      JSON.stringify(concurrentCompletions.map(result => ({ status: result.response.status, payload: result.payload })))
    );
    const completed = concurrentCompletions.find(result => result.response.status === 200);
    assert.match(completed.response.headers.get('cache-control') || '', /no-store/i);
    assert.equal(completed.payload.xp, 50);
    const concurrentFinalUser = await mongoose.model('User').findById(aProfile.payload.id).lean();
    assert.equal(concurrentFinalUser.xp, 50);
    assert.deepEqual(concurrentFinalUser.completedIds, [challengeId]);

    // A client retry after a lost response is idempotent and cannot grant XP twice.
    const completionRetry = await request('/api/progress/complete', {
      method: 'POST', token: a.accessToken, body: completionBody
    });
    assert.equal(completionRetry.response.status, 200);
    assert.equal(completionRetry.payload.xp, 50);
    const afterRetry = await mongoose.model('User').findById(aProfile.payload.id).lean();
    assert.equal(afterRetry.xp, 50);
    assert.deepEqual(afterRetry.completedIds, [challengeId]);
    const impactAfterLearning = await request('/api/privacy/deletion-impact', { token: a.accessToken });
    assert.equal(impactAfterLearning.response.status, 200);
    assert.equal(impactAfterLearning.payload.learning.dataPresent, true);
    const savedAfterFirst = await mongoose.model('User').findById(aProfile.payload.id).lean();
    const duplicateSubmission = await request('/api/progress/complete', {
      method: 'POST', token: a.accessToken, body: completionBody
    });
    assert.equal(duplicateSubmission.response.status, 200);
    assert.equal(duplicateSubmission.payload.xp, 50);
    const replayed = await request('/api/progress/complete', {
      method: 'POST', token: a.accessToken,
      body: { ...completionBody, files: { 'index.html': '<h1>Conteúdo alterado no replay</h1>' } }
    });
    assert.equal(replayed.response.status, 422);
    const savedAfterReplay = await mongoose.model('User').findById(aProfile.payload.id).lean();
    assert.equal(savedAfterReplay.xp, 50);
    assert.deepEqual(savedAfterReplay.savedCodeMap[challengeId], savedAfterFirst.savedCodeMap[challengeId]);

    // The two Express lessons have a trusted supporting server.js file; only
    // produtoController.js is interpreted, and undeclared extras are rejected.
    const multiFileCompletion = await request('/api/progress/complete', {
      method: 'POST',
      token: b.accessToken,
      body: {
        challengeId: 'mod-4-aula-2',
        files: {
          'produtoController.js': 'function listarProdutosController(req, res) { return res.status(200).json([{ id: 1, nome: "Teclado" }, { id: 2, nome: "Mouse" }]); }',
          'server.js': "// app.get('/api/produtos', listarProdutosController);"
        }
      }
    });
    assert.equal(multiFileCompletion.response.status, 200, JSON.stringify(multiFileCompletion.payload));
    assert.equal(multiFileCompletion.payload.xp, 50);
    assert.deepEqual(multiFileCompletion.payload.completedIds, ['mod-4-aula-2']);
    const extraFileCompletion = await request('/api/progress/complete', {
      method: 'POST',
      token: b.accessToken,
      body: {
        challengeId: 'mod-4-aula-2',
        files: {
          'produtoController.js': 'function listarProdutosController(req, res) { return res.status(200).json([{ id: 1, nome: "Teclado" }, { id: 2, nome: "Mouse" }]); }',
          'server.js': '// route',
          'unexpected.js': 'ignored'
        }
      }
    });
    assert.equal(extraFileCompletion.response.status, 400);
    const headerCompletion = await request('/api/progress/complete', {
      method: 'POST',
      token: b.accessToken,
      body: {
        challengeId: 'mod-1-aula-9',
        files: {
          'index.html': '<header><h1>Portfólio Dev #9</h1></header>',
          'style.css': 'header { padding: 16px; }'
        }
      }
    });
    assert.equal(headerCompletion.response.status, 200, JSON.stringify(headerCompletion.payload));
    assert.equal(headerCompletion.payload.xp, 100);
    assert.ok(headerCompletion.payload.completedIds.includes('mod-4-aula-2'));
    assert.ok(headerCompletion.payload.completedIds.includes('mod-1-aula-9'));
    const generatedJavaScriptCompletion = await request('/api/progress/complete', {
      method: 'POST',
      token: b.accessToken,
      body: {
        challengeId: 'mod-2-aula-8',
        files: {
          'script.js': "function contarVogais_8(texto) { return texto.toLowerCase().split('').filter(letra => 'aeiou'.includes(letra)).length; }"
        }
      }
    });
    assert.equal(generatedJavaScriptCompletion.response.status, 200, JSON.stringify(generatedJavaScriptCompletion.payload));
    assert.equal(generatedJavaScriptCompletion.payload.xp, 150);
    assert.ok(generatedJavaScriptCompletion.payload.completedIds.includes('mod-2-aula-8'));
    const reactCompletion = await request('/api/progress/complete', {
      method: 'POST', token: b.accessToken,
      body: {
        challengeId: 'mod-3-aula-5',
        files: {
          'script.js': 'function alternarFavoritoReact_5(itens, idAlvo) { return itens.map(item => item.id === idAlvo ? { ...item, favorito: !item.favorito } : item); }'
        }
      }
    });
    assert.equal(reactCompletion.response.status, 200, JSON.stringify(reactCompletion.payload));

    const expressCompletion = await request('/api/progress/complete', {
      method: 'POST', token: b.accessToken,
      body: {
        challengeId: 'mod-4-aula-8',
        files: {
          'controller.js': "function handlerExpress_8(req, res) { const nome = req.body.nome; if (!nome || nome.trim().length < 3) return res.status(400).json({ erro: 'Nome muito curto' }); return res.status(200).json({ ok: true, nome: nome.trim() }); }"
        }
      }
    });
    assert.equal(expressCompletion.response.status, 200, JSON.stringify(expressCompletion.payload));

    const databaseCompletion = await request('/api/progress/complete', {
      method: 'POST', token: b.accessToken,
      body: {
        challengeId: 'mod-5-aula-11',
        files: {
          'relatorioPedidos.js': "function somarPedidosPagos_11(pedidos) { return pedidos.filter(p => p.status === 'pago').reduce((acc, p) => acc + p.total, 0); }"
        }
      }
    });
    assert.equal(databaseCompletion.response.status, 200, JSON.stringify(databaseCompletion.payload));
    assert.equal(databaseCompletion.payload.xp, 300);
    const multiFileFinalUser = await mongoose.model('User').findById(bProfileIdForReauth).lean();
    assert.equal(multiFileFinalUser.xp, 300);
    assert.deepEqual(new Set(multiFileFinalUser.completedIds), new Set([
      'mod-4-aula-2', 'mod-1-aula-9', 'mod-2-aula-8',
      'mod-3-aula-5', 'mod-4-aula-8', 'mod-5-aula-11'
    ]));

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
