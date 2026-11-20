function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

async function verifyReauthenticationCredential({ user, body, bcrypt, googleClient, googleClientId } = {}) {
  if (!user || !user._id || !isPlainObject(body)) {
    return { ok: false, status: 400, error: 'Solicitação de reautenticação inválida.' };
  }

  const keys = Object.keys(body);
  const hasPassword = typeof body.password === 'string';
  const hasGoogleCredential = typeof body.credential === 'string';
  if (keys.length !== 1 || hasPassword === hasGoogleCredential) {
    return { ok: false, status: 400, error: 'Informe somente a credencial do método de autenticação original.' };
  }

  if (user.googleId) {
    if (!hasGoogleCredential || !googleClient || !googleClientId ||
        body.credential.length < 20 || body.credential.length > 10000) {
      return { ok: false, status: 401, error: 'Use a verificação Google da conta vinculada.' };
    }
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: body.credential,
        audience: googleClientId
      });
      const payload = ticket.getPayload();
      if (!payload || payload.sub !== user.googleId ||
          typeof user.email !== 'string' ||
          payload.email?.toLowerCase() !== user.email.toLowerCase() ||
          payload.email_verified !== true) {
        return { ok: false, status: 401, error: 'A identidade Google não corresponde à conta autenticada.' };
      }
      return { ok: true, method: 'google' };
    } catch {
      return { ok: false, status: 401, error: 'Credencial Google inválida ou expirada.' };
    }
  }

  if (!hasPassword || typeof user.passwordHash !== 'string' || !user.passwordHash ||
      body.password.length < 1 || body.password.length > 128 ||
      !bcrypt || typeof bcrypt.compare !== 'function') {
    return { ok: false, status: 401, error: 'Informe a senha da conta para reautenticar.' };
  }

  try {
    const validPassword = await bcrypt.compare(body.password, user.passwordHash);
    return validPassword
      ? { ok: true, method: 'password' }
      : { ok: false, status: 401, error: 'Credencial inválida.' };
  } catch {
    return { ok: false, status: 401, error: 'Não foi possível confirmar a senha.' };
  }
}

module.exports = { verifyReauthenticationCredential };
