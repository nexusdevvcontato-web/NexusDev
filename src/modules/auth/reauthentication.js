const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');

const REAUTH_TTL_SECONDS = 5 * 60;

function hashProofId(proofId) {
  return crypto.createHash('sha256').update(proofId).digest('hex');
}

function issueReauthProof({ userId, secret, now = Math.floor(Date.now() / 1000) } = {}) {
  if (typeof userId !== 'string' || !userId || typeof secret !== 'string' || secret.length < 32) {
    throw new Error('invalid-reauth-proof-input');
  }
  const proofId = crypto.randomUUID();
  const token = jwt.sign(
    { sub: userId, purpose: 'sensitive-action', jti: proofId, iat: now },
    secret,
    { algorithm: 'HS256', expiresIn: REAUTH_TTL_SECONDS }
  );
  return {
    token,
    proofHash: hashProofId(proofId),
    expiresAt: new Date((now + REAUTH_TTL_SECONDS) * 1000),
    expiresIn: REAUTH_TTL_SECONDS
  };
}

function verifyReauthProof(token, { userId, secret, now = Math.floor(Date.now() / 1000) } = {}) {
  if (typeof token !== 'string' || typeof userId !== 'string' ||
      typeof secret !== 'string' || secret.length < 32) return null;
  try {
    const payload = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      clockTimestamp: now
    });
    if (!payload || payload.sub !== userId ||
        payload.purpose !== 'sensitive-action' ||
        typeof payload.jti !== 'string' || !payload.jti ||
        typeof payload.iat !== 'number' ||
        payload.exp - payload.iat !== REAUTH_TTL_SECONDS) return null;
    return { proofHash: hashProofId(payload.jti), expiresAt: new Date(payload.exp * 1000) };
  } catch {
    return null;
  }
}

async function consumeReauthProof(UserModel, { userId, token, secret, now = new Date() } = {}) {
  const timestamp = now instanceof Date ? now : new Date(now);
  const verified = verifyReauthProof(token, {
    userId,
    secret,
    now: Math.floor(timestamp.getTime() / 1000)
  });
  if (!verified || !UserModel || typeof UserModel.findOneAndUpdate !== 'function') return false;
  const consumed = await UserModel.findOneAndUpdate(
    {
      _id: userId,
      reauthProofHash: verified.proofHash,
      reauthProofExpiresAt: { $gt: timestamp }
    },
    {
      $unset: { reauthProofHash: 1, reauthProofExpiresAt: 1 }
    },
    { new: true, projection: { _id: 1 } }
  );
  return Boolean(consumed);
}

module.exports = {
  REAUTH_TTL_SECONDS,
  issueReauthProof,
  verifyReauthProof,
  consumeReauthProof
};
