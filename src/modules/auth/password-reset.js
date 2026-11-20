const crypto = require('node:crypto');

const PASSWORD_RESET_TTL_MS = 20 * 60 * 1000;
const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function normalizeEmail(value) {
  if (typeof value !== 'string' || value.length > 254) return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function createPasswordResetToken() {
  const token = crypto.randomBytes(TOKEN_BYTES).toString('base64url');
  return { token, tokenHash: hashPasswordResetToken(token) };
}

function hashPasswordResetToken(token) {
  if (typeof token !== 'string') throw new TypeError('Token inválido.');
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

function isValidPasswordResetToken(token) {
  return typeof token === 'string' && TOKEN_PATTERN.test(token);
}

function createPasswordResetService({
  mongoose,
  User,
  Session,
  bcrypt,
  sendResetEmail,
  now = () => new Date(),
  ttlMs = PASSWORD_RESET_TTL_MS
} = {}) {
  if (!mongoose || typeof mongoose.startSession !== 'function' ||
      !User || typeof User.findOne !== 'function' ||
      typeof User.findOneAndUpdate !== 'function' ||
      !Session || typeof Session.updateMany !== 'function' ||
      !bcrypt || typeof bcrypt.hash !== 'function' ||
      typeof sendResetEmail !== 'function' ||
      !Number.isSafeInteger(ttlMs) || ttlMs < 60_000 || ttlMs > 60 * 60 * 1000) {
    throw new TypeError('Dependências da recuperação de senha inválidas.');
  }

  async function request(emailInput) {
    const email = normalizeEmail(emailInput);
    if (!email) return { accepted: true };
    const user = await User.findOne({ email, passwordHash: { $type: 'string', $ne: '' } })
      .select('_id email name').lean();
    if (!user) return { accepted: true };

    const { token, tokenHash } = createPasswordResetToken();
    const currentTime = now();
    const expiresAt = new Date(currentTime.getTime() + ttlMs);
    await User.updateOne(
      { _id: user._id },
      { $set: { passwordResetTokenHash: tokenHash, passwordResetExpiresAt: expiresAt } }
    );

    try {
      await sendResetEmail({
        to: user.email,
        name: user.name,
        token,
        expiresAt
      });
    } catch {
      await User.updateOne(
        { _id: user._id, passwordResetTokenHash: tokenHash },
        { $unset: { passwordResetTokenHash: 1, passwordResetExpiresAt: 1 } }
      );
    }
    return { accepted: true };
  }

  async function reset({ token, newPassword } = {}) {
    if (!isValidPasswordResetToken(token) ||
        typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 128) {
      return { ok: false };
    }

    const currentTime = now();
    const tokenHash = hashPasswordResetToken(token);
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const dbSession = await mongoose.startSession();
    let changed = false;
    try {
      await dbSession.withTransaction(async () => {
        const user = await User.findOneAndUpdate(
          {
            passwordResetTokenHash: tokenHash,
            passwordResetExpiresAt: { $gt: currentTime },
            passwordHash: { $type: 'string', $ne: '' }
          },
          {
            $set: { passwordHash, passwordChangedAt: currentTime },
            $inc: { authVersion: 1 },
            $unset: { passwordResetTokenHash: 1, passwordResetExpiresAt: 1 }
          },
          { new: true, session: dbSession, projection: { _id: 1 } }
        );
        if (!user) return;
        await Session.updateMany(
          { userId: user._id, revokedAt: null },
          { $set: { revokedAt: currentTime, revokeReason: 'security' } },
          { session: dbSession }
        );
        changed = true;
      });
    } finally {
      await dbSession.endSession();
    }
    return { ok: changed };
  }

  return Object.freeze({ request, reset });
}

module.exports = {
  PASSWORD_RESET_TTL_MS,
  normalizeEmail,
  createPasswordResetToken,
  hashPasswordResetToken,
  isValidPasswordResetToken,
  createPasswordResetService
};
