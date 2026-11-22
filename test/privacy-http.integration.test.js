const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const sourceUri = process.env.MONGO_SESSION_TEST_URI;
const enabled = typeof sourceUri === 'string' && sourceUri.length > 0;

test('privacy HTTP routes enforce reauthentication and isolate each synthetic account', {
  skip: !enabled
}, async () => {
  const uri = new URL(sourceUri);
  if (!['127.0.0.1', 'localhost', '::1'].includes(uri.hostname)) {
    throw new Error('Privacy HTTP integration tests require loopback MongoDB only.');
  }
  uri.pathname = '/nexusdev_privacy_http_test';

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
  process.env.PORT = '43131';

  const mongoose = require('mongoose');
  const { app } = require('../server');
  let server;

  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
    const User = mongoose.model('User');
    const Session = mongoose.model('Session');
    const RefreshToken = mongoose.model('RefreshToken');
    const Comment = mongoose.model('Comment');
    const CompletionProof = mongoose.model('CompletionProof');
    await Promise.all([
      User.init(), Session.init(), RefreshToken.init(),
      Comment.init(), CompletionProof.init()
    ]);

    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const origin = 'https://app.example.test';
    const password = 'A-strong-test-password-2026';

    const request = async (path, { method = 'GET', body, token, reauthToken } = {}) => {
      const headers = { Origin: origin };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (token) headers.Authorization = `Bearer ${token}`;
      if (reauthToken) headers['X-Reauth-Token'] = reauthToken;
      const response = await fetch(base + path, {
        method, headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'manual'
      });
      return { response, payload: await response.json().catch(() => ({})) };
    };

    const register = async (email) => {
      const result = await request('/api/auth/session/register', {
        method: 'POST',
        body: { name: 'Synthetic Privacy Student', email, password }
      });
      assert.equal(result.response.status, 201, JSON.stringify(result.payload));
      return result.payload.accessToken;
    };

    const ownerToken = await register('privacy-owner@example.test');
    const otherToken = await register('privacy-other@example.test');
    const owner = await User.findOne({ email: 'privacy-owner@example.test' });
    const other = await User.findOne({ email: 'privacy-other@example.test' });

    const ownerComment = await request('/api/lessons/html-00-o-que-e-web/comments', {
      method: 'POST', token: ownerToken, body: { text: 'Comentário sintético do titular A' }
    });
    const otherComment = await request('/api/lessons/html-00-o-que-e-web/comments', {
      method: 'POST', token: otherToken, body: { text: 'Comentário sintético do titular B' }
    });
    assert.equal(ownerComment.response.status, 201);
    assert.equal(otherComment.response.status, 201);

    const unauthenticatedExport = await request('/api/privacy/export');
    assert.equal(unauthenticatedExport.response.status, 401);
    assert.match(unauthenticatedExport.response.headers.get('cache-control') || '', /no-store/i);

    const missingProof = await request('/api/privacy/export', { token: ownerToken });
    assert.equal(missingProof.response.status, 403);

    const wrongPassword = await request('/api/auth/reauthenticate', {
      method: 'POST', token: ownerToken, body: { password: 'incorrect-password' }
    });
    assert.equal(wrongPassword.response.status, 401);

    const impact = await request('/api/privacy/deletion-impact?ownerId=' + other._id, {
      token: ownerToken
    });
    assert.equal(impact.response.status, 200, JSON.stringify(impact.payload));
    assert.equal(impact.payload.readOnly, true);
    assert.equal(impact.payload.deletionEnabled, false);
    assert.equal(impact.payload.sessions.count, 1);
    assert.equal(impact.payload.refreshTokens.count, 1);
    assert.equal(impact.payload.comments.linkedCount, 1);
    assert.equal(impact.payload.completionProofs.count, 0);
    assert.equal(JSON.stringify(impact.payload).includes(other._id.toString()), false);

    const reauthenticated = await request('/api/auth/reauthenticate', {
      method: 'POST', token: ownerToken, body: { password }
    });
    assert.equal(reauthenticated.response.status, 200, JSON.stringify(reauthenticated.payload));
    assert.equal(typeof reauthenticated.payload.reauthToken, 'string');
    assert.match(reauthenticated.response.headers.get('cache-control') || '', /no-store/i);

    const exported = await request('/api/privacy/export?ownerId=' + other._id, {
      token: ownerToken, reauthToken: reauthenticated.payload.reauthToken
    });
    assert.equal(exported.response.status, 200, JSON.stringify(exported.payload));
    assert.match(exported.response.headers.get('cache-control') || '', /no-store/i);
    assert.match(exported.response.headers.get('content-disposition') || '', /attachment/i);
    assert.equal(exported.payload.data.id, owner._id.toString());
    assert.equal(exported.payload.data.email, owner.email);
    assert.equal(exported.payload.comments.length, 1);
    assert.equal(exported.payload.comments[0].text, 'Comentário sintético do titular A');
    assert.equal(exported.payload.comments.some(item => item.text === 'Comentário sintético do titular B'), false);
    assert.equal(JSON.stringify(exported.payload).includes(other._id.toString()), false);
    for (const privateField of ['passwordHash', 'googleId', 'tokenHash', 'csrfTokenHash', 'reauthProofHash']) {
      assert.equal(JSON.stringify(exported.payload).includes(privateField), false, privateField);
    }

    const replayedProof = await request('/api/privacy/export', {
      token: ownerToken, reauthToken: reauthenticated.payload.reauthToken
    });
    assert.equal(replayedProof.response.status, 403);

    const otherImpact = await request('/api/privacy/deletion-impact', { token: otherToken });
    assert.equal(otherImpact.response.status, 200);
    assert.equal(otherImpact.payload.comments.linkedCount, 1);
    assert.equal(otherImpact.payload.sessions.count, 1);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  }
});
