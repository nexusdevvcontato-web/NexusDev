const { OAuth2Client } = require('google-auth-library');
const crypto = require('node:crypto');

function encodeHeader(value) {
  return '=?UTF-8?B?' + Buffer.from(String(value), 'utf8').toString('base64') + '?=';
}

function encodeMimeBody(value) {
  return Buffer.from(String(value), 'utf8').toString('base64').replace(/.{1,76}/g, '$&\r\n').trim();
}

function createGmailPasswordResetMailer({
  clientId, clientSecret, refreshToken, fromEmail, frontendUrl,
  oauthClient, fetchImpl = globalThis.fetch
} = {}) {
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (![clientId, clientSecret, refreshToken, fromEmail].every((v) => typeof v === 'string' && v.trim()) ||
      !emailPattern.test(fromEmail) || typeof fetchImpl !== 'function') {
    throw new TypeError('Configuração do Gmail API inválida.');
  }
  const base = new URL(frontendUrl);
  if (base.protocol !== 'https:') throw new TypeError('A URL do frontend deve usar HTTPS.');
  const client = oauthClient || new OAuth2Client(clientId, clientSecret);
  if (!oauthClient) client.setCredentials({ refresh_token: refreshToken });

  return async function sendResetEmail({ to, name, token }) {
    if (typeof to !== 'string' || !emailPattern.test(to) || /[\r\n]/.test(to)) {
      throw new TypeError('Destinatário inválido.');
    }
    const link = new URL('/', base);
    link.hash = new URLSearchParams({ passwordResetToken: token }).toString();
    const safeName = String(name || 'estudante').replace(/[\r\n]/g, ' ').slice(0, 120);
    const boundary = 'nexusdev_' + crypto.randomBytes(12).toString('hex');
    const subject = encodeHeader('Redefinição de senha — NexusDev');
    const textBody = 'Olá, ' + safeName + '. Para redefinir sua senha do NexusDev, acesse: ' + link.toString() +
      '\nEste link expira em 20 minutos e só pode ser usado uma vez. Se você não solicitou, ignore este e-mail.';
    const htmlBody = '<p>Olá, ' + safeName.replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])) +
      '.</p><p>Recebemos uma solicitação para redefinir a senha da sua conta NexusDev.</p><p><a href="' +
      link.toString().replace(/&/g, '&amp;').replace(/"/g, '&quot;') +
      '">Criar uma nova senha</a></p><p>Este link expira em 20 minutos e só pode ser usado uma vez. Se você não solicitou, ignore este e-mail.</p>';
    const mime = [
      'To: ' + to,
      'From: NexusDev <' + fromEmail + '>',
      'Subject: ' + subject,
      'MIME-Version: 1.0',
      'Content-Type: multipart/alternative; boundary="' + boundary + '"',
      '',
      '--' + boundary,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      encodeMimeBody(textBody),
      '--' + boundary,
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      encodeMimeBody(htmlBody),
      '--' + boundary + '--',
      ''
    ].join('\r\n');
    const raw = Buffer.from(mime, 'utf8').toString('base64url');
    const credentials = await client.getAccessToken();
    const accessToken = typeof credentials === 'string' ? credentials : credentials?.token;
    if (!accessToken) throw new Error('Não foi possível obter token de acesso do Gmail.');
    const response = await fetchImpl('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw }),
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error('Falha na API do Gmail: HTTP ' + response.status);
  };
}

module.exports = { createGmailPasswordResetMailer };
