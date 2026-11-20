const test = require('node:test');
const assert = require('node:assert/strict');
const { createGmailPasswordResetMailer } = require('../src/modules/auth/gmail-mailer');

test('sends a one-time reset message through Gmail API using OAuth access token', async () => {
  let request;
  const oauthClient = { getAccessToken: async () => ({ token: 'oauth-access-token' }) };
  const send = createGmailPasswordResetMailer({
    clientId: 'client-id', clientSecret: 'client-secret', refreshToken: 'refresh-token',
    fromEmail: 'nexusdev.sender@gmail.com',
    frontendUrl: 'https://nexusdev-preview.example.test',
    oauthClient,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 200 };
    }
  });
  await send({ to: 'student@example.test', name: 'Student', token: 'A'.repeat(43) });
  assert.equal(request.url, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
  assert.equal(request.options.headers.Authorization, 'Bearer oauth-access-token');
  const payload = JSON.parse(request.options.body);
  const decoded = Buffer.from(payload.raw, 'base64url').toString('utf8');
  assert.match(decoded, /To: student@example\.test/);
  const textSection = decoded.split('Content-Type: text/plain; charset="UTF-8"')[1];
  assert.ok(textSection, 'text MIME part should be present');
  const textPart = textSection.split('\\r\\n\\r\\n')[1].split('\\r\\n--')[0].replace(/\\r\\n/g, '');
  const textBody = Buffer.from(textPart, 'base64').toString('utf8');
  assert.match(textBody, /passwordResetToken=A{43}/);
  assert.match(decoded, /multipart\/alternative/);
});

test('fails closed when Gmail API rejects the message', async () => {
  const send = createGmailPasswordResetMailer({
    clientId: 'client-id', clientSecret: 'client-secret', refreshToken: 'refresh-token',
    fromEmail: 'nexusdev.sender@gmail.com', frontendUrl: 'https://nexusdev.example.test',
    oauthClient: { getAccessToken: async () => ({ token: 'access-token' }) },
    fetchImpl: async () => ({ ok: false, status: 403 })
  });
  await assert.rejects(send({ to: 'student@example.test', name: 'Student', token: 'A'.repeat(43) }), /HTTP 403/);
});

test('rejects invalid Gmail configuration and recipient', async () => {
  assert.throws(() => createGmailPasswordResetMailer({}), /Configuração/);
  const send = createGmailPasswordResetMailer({
    clientId: 'client-id', clientSecret: 'client-secret', refreshToken: 'refresh-token',
    fromEmail: 'nexusdev.sender@gmail.com', frontendUrl: 'https://nexusdev.example.test',
    oauthClient: { getAccessToken: async () => ({ token: 'access-token' }) },
    fetchImpl: async () => ({ ok: true, status: 200 })
  });
  await assert.rejects(send({ to: 'invalid', token: 'A'.repeat(43) }), /Destinatário/);
});
