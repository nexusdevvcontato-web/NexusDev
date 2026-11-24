const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const sourceUri = process.env.MONGO_SESSION_TEST_URI;
const enabled = typeof sourceUri === 'string' && sourceUri.length > 0;

test('privacy preferences persist and control public leaderboard and certificate responses', {
  skip: !enabled
}, async () => {
  const uri = new URL(sourceUri);
  if (!['127.0.0.1', 'localhost', '::1'].includes(uri.hostname)) {
    throw new Error('Privacy public-preference integration tests require loopback MongoDB only.');
  }
  uri.pathname = '/nexusdev_privacy_public_preferences_test';

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

  const mongoose = require('mongoose');
  const { app } = require('../server');
  let server;

  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
    const User = mongoose.model('User');
    await User.init();

    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const origin = 'https://app.example.test';
    const password = 'A-strong-test-password-2026';

    const request = async (path, { method = 'GET', body, token } = {}) => {
      const headers = { Origin: origin };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(base + path, {
        method, headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'manual'
      });
      return { response, payload: await response.json().catch(() => ({})) };
    };

    const register = async (name, email) => {
      const result = await request('/api/auth/session/register', {
        method: 'POST',
        body: { name, email, password }
      });
      assert.equal(result.response.status, 201, JSON.stringify(result.payload));
      return result.payload.accessToken;
    };

    const ownerToken = await register('Synthetic Privacy Owner', 'public-pref-owner@example.test');
    const otherToken = await register('Synthetic Privacy Other', 'public-pref-other@example.test');
    const owner = await User.findOne({ email: 'public-pref-owner@example.test' });
    const other = await User.findOne({ email: 'public-pref-other@example.test' });
    const certificateCode = 'NXD-PRIVACY-HTTP-OWNER';

    await User.updateOne({ _id: owner._id }, {
      $set: {
        xp: 900, streak: 5, completedIds: [],
        certificateCode,
        certificateIssuedAt: new Date('2026-11-20T12:00:00.000Z'),
        certificateStudentName: 'Synthetic Certificate Owner',
        certificateCompletedCount: 42,
        certificateXp: 900,
        certificateGithubUrl: 'https://github.com/synthetic-owner',
        certificateLiveUrl: 'https://owner.example.test'
      }
    });
    await User.updateOne({ _id: other._id }, { $set: { xp: 500, streak: 2 } });

    const optOut = await request('/api/privacy/preferences', {
      method: 'PUT', token: ownerToken,
      body: { showInLeaderboard: false, showCertificateDetails: false }
    });
    assert.equal(optOut.response.status, 200, JSON.stringify(optOut.payload));
    assert.deepEqual(optOut.payload.preferences, {
      showInLeaderboard: false, showCertificateDetails: false
    });

    const persistedOptOut = await request('/api/privacy/preferences', { token: ownerToken });
    assert.equal(persistedOptOut.response.status, 200);
    assert.deepEqual(persistedOptOut.payload.preferences, {
      showInLeaderboard: false, showCertificateDetails: false
    });

    const hiddenLeaderboard = await request('/api/leaderboard');
    assert.equal(hiddenLeaderboard.response.status, 200, JSON.stringify(hiddenLeaderboard.payload));
    assert.match(hiddenLeaderboard.response.headers.get('cache-control') || '', /no-store/i);
    assert.equal(hiddenLeaderboard.payload.leaderboard.some(entry => entry.name === owner.name), false);
    assert.equal(hiddenLeaderboard.payload.leaderboard.some(entry => entry.name === other.name), true);

    const hiddenCertificate = await request(`/api/certificates/${certificateCode}`);
    assert.equal(hiddenCertificate.response.status, 200, JSON.stringify(hiddenCertificate.payload));
    assert.match(hiddenCertificate.response.headers.get('cache-control') || '', /no-store/i);
    assert.deepEqual(hiddenCertificate.payload, {
      valid: true, code: certificateCode, publicDetails: false
    });

    const optIn = await request('/api/privacy/preferences', {
      method: 'PUT', token: ownerToken,
      body: { showInLeaderboard: true, showCertificateDetails: true }
    });
    assert.equal(optIn.response.status, 200, JSON.stringify(optIn.payload));
    assert.deepEqual(optIn.payload.preferences, {
      showInLeaderboard: true, showCertificateDetails: true
    });

    const persistedOptIn = await request('/api/privacy/preferences', { token: ownerToken });
    assert.deepEqual(persistedOptIn.payload.preferences, {
      showInLeaderboard: true, showCertificateDetails: true
    });

    const visibleLeaderboard = await request('/api/leaderboard');
    assert.equal(visibleLeaderboard.response.status, 200);
    assert.equal(visibleLeaderboard.payload.leaderboard.some(entry => entry.name === owner.name), true);

    const visibleCertificate = await request(`/api/certificates/${certificateCode}`);
    assert.equal(visibleCertificate.response.status, 200, JSON.stringify(visibleCertificate.payload));
    assert.equal(visibleCertificate.payload.publicDetails, true);
    assert.equal(visibleCertificate.payload.studentName, 'Synthetic Certificate Owner');
    assert.equal(visibleCertificate.payload.completedCount, 42);
    assert.equal(visibleCertificate.payload.xp, 900);
    assert.equal(visibleCertificate.payload.githubUrl, 'https://github.com/synthetic-owner');
    assert.equal(visibleCertificate.payload.liveUrl, 'https://owner.example.test');
    for (const privateField of ['email', 'passwordHash', 'googleId']) {
      assert.equal(Object.hasOwn(visibleCertificate.payload, privateField), false);
    }

    const otherPreferences = await request('/api/privacy/preferences', { token: otherToken });
    assert.deepEqual(otherPreferences.payload.preferences, {
      showInLeaderboard: true, showCertificateDetails: true
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  }
});
