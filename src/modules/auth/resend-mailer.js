const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function createResendPasswordResetMailer({ apiKey, from, frontendUrl, fetchImpl = globalThis.fetch } = {}) {
  if (typeof apiKey !== 'string' || !apiKey.trim() || typeof from !== 'string' || !from.includes('@') ||
      typeof frontendUrl !== 'string' || typeof fetchImpl !== 'function') {
    throw new TypeError('Configuração do Resend inválida.');
  }
  const base = new URL(frontendUrl);
  if (base.protocol !== 'https:') throw new TypeError('A URL do frontend deve usar HTTPS.');
  return async function sendResetEmail({ to, name, token, expiresAt }) {
    const link = new URL('/', base);
    link.searchParams.set('passwordResetToken', token);
    const safeName = escapeHtml(name || 'estudante');
    const safeLink = escapeHtml(link.toString());
    const response = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from, to: [to], subject: 'Redefinição de senha — NexusDev',
        html: '<p>Olá, ' + safeName + '.</p><p>Recebemos uma solicitação para redefinir a senha da sua conta NexusDev.</p><p><a href="' + safeLink + '">Criar uma nova senha</a></p><p>Este link expira em 20 minutos e só pode ser usado uma vez. Se você não solicitou, ignore este e-mail.</p>',
        text: 'Olá, ' + (name || 'estudante') + '. Para redefinir sua senha do NexusDev, acesse: ' + link.toString() + '\nO link expira em 20 minutos e só pode ser usado uma vez. Se você não solicitou, ignore este e-mail.'
      }),
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error('Falha no provedor de e-mail: HTTP ' + response.status);
  };
}

module.exports = { createResendPasswordResetMailer };
