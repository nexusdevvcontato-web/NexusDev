const jwt = require('jsonwebtoken');

function extractBearerToken(header) {
  if (typeof header !== 'string') return null;
  const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(header);
  return match ? match[1] : null;
}

function verifyAccessToken(token, secret) {
  const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
  if (!decoded || typeof decoded !== 'object' ||
      typeof decoded.id !== 'string' || decoded.id.length === 0) {
    throw new Error('invalid-access-token-claims');
  }
  return decoded;
}

module.exports = { extractBearerToken, verifyAccessToken };
