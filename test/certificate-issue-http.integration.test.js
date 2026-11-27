const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const sourceUri = process.env.MONGO_SESSION_TEST_URI;
const enabled = typeof sourceUri === 'string' && sourceUri.length > 0;

test('certificate HTTP issuance requires all official lessons and is immutable under retries and races', {
  skip: !enabled
}, async () => {
  const uri = new URL(sourceUri);
  if (!['127.0.0.1', 'localhost', '::1'].includes(uri.hostname)) {
    throw new Error('Certificate integration tests require loopback MongoDB only.');
  }
  uri.pathname = '/nexusdev_certificate_http_nexusdev_session_test';

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
  process.env.PORT = '43130';

  const mongoose = require('mongoose');
  const { isKnownChallengeId, EXPECTED_COURSE_COMPLETIONS } = require('../src/modules/curriculum/catalog');
  const { app } = require('../server');
  let server;

  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
    const User = mongoose.model('User');
    const { Session, RefreshToken } = {
      Session: mongoose.model('Session'),
      RefreshToken: mongoose.model('RefreshToken')
    };
    await Promise.all([User.init(), Session.init(), RefreshToken.init()]);

    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const origin = 'https://app.example.test';
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

    const registered = await request('/api/auth/session/register', {
      method: 'POST',
      body: { name: 'Certificate Integration', email: 'certificate-http@example.test', password: 'A-strong-test-password-2026' }
    });
    assert.equal(registered.response.status, 201, JSON.stringify(registered.payload));
    const token = registered.payload.accessToken;
    assert.equal(typeof token, 'string');

    const staticIds = [
      'html-00-o-que-e-web', 'html-01-subtitulo-h2', 'html-02-paragrafo-p',
      'html-03-negrito-strong', 'html-04-lista-ul-li', 'html-05-botao-clicavel',
      'js-01-variaveis-calculo', 'js-02-condicionais-frete', 'js-03-arrays-soma',
      'react-01-carrinho-imutavel', 'node-01-controller-produto', 'auth-01-middleware-admin'
    ];
    const generatedCandidates = [];
    for (let moduleNumber = 1; moduleNumber <= 5; moduleNumber += 1) {
      for (let lessonNumber = 1; lessonNumber <= 140; lessonNumber += 1) {
        generatedCandidates.push(`mod-${moduleNumber}-aula-${lessonNumber}`);
      }
    }
    const officialIds = [...new Set([...staticIds, ...generatedCandidates].filter(isKnownChallengeId))];
    assert.equal(officialIds.length, EXPECTED_COURSE_COMPLETIONS);

    const userId = registered.payload.user.id;
    await User.updateOne({ _id: userId }, {
      $set: { completedIds: [...officialIds.slice(0, -1), 'forged-lesson-id', officialIds[0], officialIds[0]] }
    });

    const incomplete = await request('/api/certificates/issue', {
      method: 'POST', token, body: { studentName: 'Should Not Issue', xp: 999999, completedCount: 999999 }
    });
    assert.equal(incomplete.response.status, 403);
    assert.equal(incomplete.payload.completedCount, EXPECTED_COURSE_COMPLETIONS - 1);
    assert.equal(incomplete.payload.requiredCount, EXPECTED_COURSE_COMPLETIONS);
    assert.equal(await User.countDocuments({ certificateIssuedAt: { $ne: null } }), 0);

    await User.updateOne({ _id: userId }, {
      $set: { completedIds: [...officialIds, 'forged-lesson-id', officialIds[0], officialIds[0]], xp: 275 }
    });

    const credentialBearingPortfolioUrl = await request('/api/certificates/issue', {
      method: 'POST', token,
      body: { githubUrl: 'https://student:secret@github.com/student' }
    });
    assert.equal(credentialBearingPortfolioUrl.response.status, 400);
    assert.equal(await User.countDocuments({ certificateIssuedAt: { $ne: null } }), 0);

    const [first, concurrent] = await Promise.all([
      request('/api/certificates/issue', {
        method: 'POST', token,
        body: { studentName: 'Nome Emitido', githubUrl: 'https://github.com/student', xp: 999999, completedCount: 1 }
      }),
      request('/api/certificates/issue', {
        method: 'POST', token,
        body: { studentName: 'Nome Concorrente', githubUrl: 'https://github.com/other', xp: 1 }
      })
    ]);
    assert.equal(first.response.status, 200, JSON.stringify(first.payload));
    assert.equal(concurrent.response.status, 200, JSON.stringify(concurrent.payload));
    assert.equal(first.payload.verified, true);
    assert.equal(concurrent.payload.verified, true);
    assert.equal(first.payload.code, concurrent.payload.code);
    assert.equal(first.payload.studentName, concurrent.payload.studentName);
    assert.equal(first.payload.completedCount, EXPECTED_COURSE_COMPLETIONS);
    assert.equal(first.payload.xp, 275);
    assert.equal(first.payload.githubUrl, concurrent.payload.githubUrl);
    assert.equal(await User.countDocuments({ certificateIssuedAt: { $ne: null } }), 1);

    const retry = await request('/api/certificates/issue', {
      method: 'POST', token,
      body: { studentName: 'Tentativa de Alteração', githubUrl: 'https://github.com/attacker', xp: 0 }
    });
    assert.equal(retry.response.status, 200);
    assert.equal(retry.payload.code, first.payload.code);
    assert.equal(retry.payload.studentName, first.payload.studentName);
    assert.equal(retry.payload.githubUrl, first.payload.githubUrl);
    assert.equal(retry.payload.xp, 275);

    const privateLookup = await request('/api/certificates/' + first.payload.code);
    assert.equal(privateLookup.response.status, 200);
    assert.deepEqual(privateLookup.payload, { valid: true, code: first.payload.code, publicDetails: false });

    const optIn = await request('/api/privacy/preferences', {
      method: 'PUT', token, body: { showCertificateDetails: true }
    });
    assert.equal(optIn.response.status, 200);
    assert.equal(optIn.payload.preferences.showCertificateDetails, true);

    const publicLookup = await request('/api/certificates/' + first.payload.code);
    assert.equal(publicLookup.response.status, 200);
    assert.equal(publicLookup.payload.valid, true);
    assert.equal(publicLookup.payload.studentName, first.payload.studentName);
    assert.equal(publicLookup.payload.completedCount, EXPECTED_COURSE_COMPLETIONS);
    assert.equal(publicLookup.payload.xp, 275);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  }
});
