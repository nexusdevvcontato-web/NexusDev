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
    const LearningArtifact = mongoose.model('LearningArtifact');
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
      const raw = await response.text();
      let payload = {};
      try { payload = raw ? JSON.parse(raw) : {}; } catch {}
      return { response, payload, raw };
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
    const legacyDraftMap = Object.fromEntries(Array.from({ length: 1200 }, (_, index) => [
      `legacy-draft-${String(index).padStart(4, '0')}`,
      { files: { 'index.html': `<p>Legacy draft ${index}</p>` }, revision: 1 }
    ]));
    legacyDraftMap['html-00-o-que-e-web'] = {
      files: { 'index.html': '<p>Legacy draft must be overridden</p>' }, revision: 1
    };
    const legacyCodeMap = Object.fromEntries(Array.from({ length: 1200 }, (_, index) => [
      `legacy-code-${String(index).padStart(4, '0')}`,
      { 'index.html': `<p>Legacy code ${index}</p>` }
    ]));
    await User.updateOne({ _id: owner._id }, {
      $set: { savedDraftMap: legacyDraftMap, savedCodeMap: legacyCodeMap }
    });
    await LearningArtifact.create([
      {
        userId: owner._id, lessonId: 'html-00-o-que-e-web', kind: 'draft',
        files: { 'index.html': '<h1>Owner artifact</h1>' }, revision: 4
      },
      {
        userId: other._id, lessonId: 'html-00-o-que-e-web', kind: 'draft',
        files: { 'index.html': '<h1>Other artifact</h1>' }, revision: 2
      },
      {
        userId: owner._id, lessonId: 'css-01-seletores', kind: 'saved_code',
        files: { 'index.html': '<h1>Owner submitted code</h1>' }, revision: 1
      }
    ]);

    const ownerComment = await request('/api/lessons/html-00-o-que-e-web/comments', {
      method: 'POST', token: ownerToken, body: { text: 'Comentário sintético do titular A' }
    });
    const otherComment = await request('/api/lessons/html-00-o-que-e-web/comments', {
      method: 'POST', token: otherToken, body: { text: 'Comentário sintético do titular B' }
    });
    assert.equal(ownerComment.response.status, 201);
    assert.equal(otherComment.response.status, 201);

    const anonymousComment = await request('/api/lessons/html-00-o-que-e-web/comments', {
      method: 'POST', body: { text: 'Publicação anônima não permitida' }
    });
    assert.equal(anonymousComment.response.status, 401);
    assert.match(anonymousComment.response.headers.get('cache-control') || '', /no-store/i);

    const spoofedComment = await request('/api/lessons/html-00-o-que-e-web/comments', {
      method: 'POST',
      token: ownerToken,
      body: {
        text: 'Comentário com tentativa de falsificação',
        author: 'Autor falsificado',
        authorUserId: other._id.toString(),
        badge: 'Mentor NexusDev',
        xp: 999999
      }
    });
    assert.equal(spoofedComment.response.status, 201, JSON.stringify(spoofedComment.payload));
    assert.match(spoofedComment.response.headers.get('cache-control') || '', /no-store/i);
    assert.equal(spoofedComment.payload.comment.author, owner.name);
    assert.equal(spoofedComment.payload.comment.badge, 'Aluno NexusDev');
    assert.equal(spoofedComment.payload.comment.text, 'Comentário com tentativa de falsificação');
    assert.deepEqual(
      Object.keys(spoofedComment.payload.comment).sort(),
      ['badge', 'id', 'text', 'time', 'author'].sort()
    );
    const storedSpoofedComment = await Comment.findById(spoofedComment.payload.comment.id).lean();
    assert.equal(storedSpoofedComment.authorUserId.toString(), owner._id.toString());
    assert.equal(storedSpoofedComment.author, owner.name);
    assert.equal(storedSpoofedComment.badge, 'Aluno NexusDev');

    const publicComments = await request('/api/lessons/html-00-o-que-e-web/comments');
    assert.equal(publicComments.response.status, 200);
    assert.match(publicComments.response.headers.get('cache-control') || '', /no-store/i);
    assert.equal(publicComments.payload.comments.length, 3);
    for (const comment of publicComments.payload.comments) {
      assert.deepEqual(
        Object.keys(comment).sort(),
        ['id', 'author', 'badge', 'time', 'text'].sort()
      );
      assert.equal(Object.hasOwn(comment, 'authorUserId'), false);
      assert.equal(Object.hasOwn(comment, 'email'), false);
      assert.equal(Object.hasOwn(comment, 'xp'), false);
    }
    assert.equal(
      publicComments.payload.comments.some(comment => comment.author === 'Autor falsificado'),
      false
    );
    assert.equal(
      JSON.stringify(publicComments.payload).includes(owner.email),
      false
    );
    assert.equal(
      JSON.stringify(publicComments.payload).includes(owner._id.toString()),
      false
    );

    const invalidPublicComments = await request('/api/lessons/%2E%2E%2Fusers/comments');
    assert.equal(invalidPublicComments.response.status, 400);

    const ownerPreferences = await request('/api/privacy/preferences', { token: ownerToken });
    const otherPreferences = await request('/api/privacy/preferences', { token: otherToken });
    assert.equal(ownerPreferences.response.status, 200);
    assert.deepEqual(ownerPreferences.payload.preferences, {
      showInLeaderboard: true, showCertificateDetails: false
    });
    assert.deepEqual(otherPreferences.payload.preferences, {
      showInLeaderboard: true, showCertificateDetails: false
    });

    const updatedPreferences = await request('/api/privacy/preferences', {
      method: 'PUT', token: ownerToken,
      body: { showInLeaderboard: false, showCertificateDetails: false }
    });
    assert.equal(updatedPreferences.response.status, 200);
    assert.deepEqual(updatedPreferences.payload.preferences, {
      showInLeaderboard: false, showCertificateDetails: false
    });

    const privilegeInjection = await request('/api/privacy/preferences', {
      method: 'PUT', token: ownerToken,
      body: { showInLeaderboard: true, role: 'admin' }
    });
    assert.equal(privilegeInjection.response.status, 400);

    const otherPreferencesAfterOwnerUpdate = await request('/api/privacy/preferences', {
      token: otherToken
    });
    assert.deepEqual(otherPreferencesAfterOwnerUpdate.payload.preferences, {
      showInLeaderboard: true, showCertificateDetails: false
    });

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
    assert.equal(impact.payload.sessions.refreshTokens, 1);
    assert.equal(impact.payload.comments.linkedCount, 2);
    assert.equal(impact.payload.completionProofs.count, 0);
    assert.equal(impact.payload.learning.artifactCount, 2);
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
    assert.equal(exported.payload.comments.length, 2);
    assert.equal(Object.keys(exported.payload.data.savedDraftMap).length, 1201);
    assert.deepEqual(exported.payload.data.savedDraftMap['html-00-o-que-e-web'], {
      files: { 'index.html': '<h1>Owner artifact</h1>' },
      revision: 4,
      updatedAt: exported.payload.data.savedDraftMap['html-00-o-que-e-web'].updatedAt
    });
    assert.deepEqual(exported.payload.data.savedDraftMap['legacy-draft-0000'], {
      files: { 'index.html': '<p>Legacy draft 0</p>' }, revision: 1
    });
    assert.equal(Object.keys(exported.payload.data.savedCodeMap).length, 1201);
    assert.deepEqual(exported.payload.data.savedCodeMap['css-01-seletores'], {
      'index.html': '<h1>Owner submitted code</h1>'
    });
    assert.equal(exported.raw.match(/"html-00-o-que-e-web"\s*:/g)?.length, 1);
    assert.equal(exported.raw.includes('Legacy draft must be overridden'), false);
    assert.equal(exported.payload.comments.some(item => item.text === 'Comentário sintético do titular A'), true);
    assert.equal(exported.payload.comments.some(item => item.text === 'Comentário com tentativa de falsificação'), true);
    assert.equal(exported.payload.comments.some(item => item.text === 'Comentário sintético do titular B'), false);
    assert.equal(JSON.stringify(exported.payload).includes(other._id.toString()), false);
    assert.equal(JSON.stringify(exported.payload).includes('Other artifact'), false);
    for (const privateField of ['passwordHash', 'googleId', 'tokenHash', 'csrfTokenHash', 'reauthProofHash']) {
      assert.equal(JSON.stringify(exported.payload).includes(privateField), false, privateField);
    }

    const replayedProof = await request('/api/privacy/export', {
      token: ownerToken, reauthToken: reauthenticated.payload.reauthToken
    });
    assert.equal(replayedProof.response.status, 403);

    const secondReauthentication = await request('/api/auth/reauthenticate', {
      method: 'POST', token: ownerToken, body: { password }
    });
    assert.equal(secondReauthentication.response.status, 200);
    const concurrentExports = await Promise.all([
      request('/api/privacy/export', {
        token: ownerToken, reauthToken: secondReauthentication.payload.reauthToken
      }),
      request('/api/privacy/export', {
        token: ownerToken, reauthToken: secondReauthentication.payload.reauthToken
      })
    ]);
    assert.deepEqual(
      concurrentExports.map(result => result.response.status).sort((a, b) => a - b),
      [200, 403]
    );
    const successfulConcurrentExport = concurrentExports.find(result => result.response.status === 200);
    assert.equal(successfulConcurrentExport.payload.data.id, owner._id.toString());

    // Abort while the large legacy map cursor is actively streaming synthetic entries.
    await User.updateOne({ _id: other._id }, {
      $set: {
        savedDraftMap: Object.fromEntries(Array.from({ length: 1200 }, (_, index) => [
          `legacy-interrupt-${String(index).padStart(4, '0')}`,
          { files: { 'index.html': `<p>Interrupt fixture ${index}</p>` }, revision: 1 }
        ]))
      }
    });
    await Comment.insertMany(Array.from({ length: 1800 }, (_, index) => ({
      lessonId: 'html-00-o-que-e-web',
      authorUserId: other._id,
      author: other.name,
      badge: 'Aluno NexusDev',
      text: `Synthetic streaming interruption fixture ${index} ${'x'.repeat(850)}`
    })));
    const interruptionReauthentication = await request('/api/auth/reauthenticate', {
      method: 'POST', token: otherToken, body: { password }
    });
    assert.equal(interruptionReauthentication.response.status, 200);
    const abortController = new AbortController();
    const interruptedResponse = await fetch(base + '/api/privacy/export', {
      headers: {
        Origin: origin,
        Authorization: `Bearer ${otherToken}`,
        'X-Reauth-Token': interruptionReauthentication.payload.reauthToken
      },
      signal: abortController.signal
    });
    assert.equal(interruptedResponse.status, 200);
    const exportReader = interruptedResponse.body.getReader();
    const decoder = new TextDecoder();
    let streamedText = '';
    let sawLegacyMapEntry = false;
    while (!sawLegacyMapEntry) {
      const chunk = await exportReader.read();
      if (chunk.done) break;
      streamedText += decoder.decode(chunk.value, { stream: true });
      sawLegacyMapEntry = streamedText.includes('"legacy-interrupt-0000"');
    }
    assert.equal(sawLegacyMapEntry, true, 'export must reach a legacy map entry before interruption');
    abortController.abort();
    await exportReader.cancel().catch(() => {});

    // Deletion remains unavailable: the impact preview is read-only and no execution route exists.
    for (const [method, route] of [
      ['DELETE', '/api/privacy/deletion-impact'],
      ['POST', '/api/privacy/deletion-impact'],
      ['DELETE', '/api/privacy/delete'],
      ['DELETE', '/api/account/delete']
    ]) {
      const deletionAttempt = await request(route, { method, token: ownerToken });
      assert.equal(deletionAttempt.response.status, 404, `${method} ${route} must remain unavailable`);
    }

    const otherImpact = await request('/api/privacy/deletion-impact', { token: otherToken });
    assert.equal(otherImpact.response.status, 200);
    assert.equal(otherImpact.payload.comments.linkedCount, 1801);
    assert.equal(otherImpact.payload.sessions.count, 1);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  }
});
