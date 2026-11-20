const test = require('node:test');
const assert = require('node:assert/strict');
const { createResendPasswordResetMailer } = require('../src/modules/auth/resend-mailer');

test('builds a one-time reset link and sends it only through the server-side Resend API', async () => {
  let request;
  const send = createResendPasswordResetMailer({
    apiKey: 're_test_secret', from: 'NexusDev <security@example.test>',
    frontendUrl: 'https://nexusdev-preview.example.test',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 200 };
    }
  });
  await send({ to: 'student@example.test', name: 'Student <script>', token: 'A'.repeat(43), expiresAt: new Date() });
  assert.equal(request.url, 'https://api.resend.com/emails');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers.Authorization, 'Bearer re_test_secret');
  const payload = JSON.parse(request.options.body);
  assert.deepEqual(payload.to, ['student@example.test']);
  assert.match(payload.html, /passwordResetToken=A{43}/);
  assert.match(payload.html, /&lt;script&gt;/);
  assert.match(payload.text, /passwordResetToken=A{43}/);
});

test('fails closed when Resend rejects the email', async () => {
  const send = createResendPasswordResetMailer({
    apiKey: 're_test_secret', from: 'security@example.test',
    frontendUrl: 'https://nexusdev.example.test',
    fetchImpl: async () => ({ ok: false, status: 403 })
  });
  await assert.rejects(send({ to: 'student@example.test', name: 'Student', token: 'A'.repeat(43) }), /HTTP 403/);
});

test('rejects missing credentials and non-HTTPS frontend origins', () => {
  assert.throws(() => createResendPasswordResetMailer({}), /Configuração/);
  assert.throws(() => createResendPasswordResetMailer({ apiKey: 'x', from: 'a@b.test', frontendUrl: 'http://localhost' }), /HTTPS/);
});
