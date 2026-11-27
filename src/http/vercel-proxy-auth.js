const crypto = require('node:crypto');

function createVercelProxyAuthMiddleware({ enabled = false, secret = '' } = {}) {
  if (!enabled) return (req, res, next) => next();
  if (typeof secret !== 'string' || secret.length < 32) {
    throw new Error('VERCEL_PROXY_SECRET must contain at least 32 characters when proxy enforcement is enabled.');
  }
  const expected = Buffer.from(secret, 'utf8');
  return (req, res, next) => {
    // Render's configured liveness probe remains reachable without the proxy secret.
    if (req.method === 'GET' && req.path === '/health') return next();
    const suppliedValue = req.get('x-nexus-proxy-key');
    if (typeof suppliedValue !== 'string') {
      return res.status(403).set('Cache-Control', 'no-store').json({ error: 'Origem de API não autorizada.' });
    }
    const supplied = Buffer.from(suppliedValue, 'utf8');
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
      return res.status(403).set('Cache-Control', 'no-store').json({ error: 'Origem de API não autorizada.' });
    }
    return next();
  };
}
module.exports = { createVercelProxyAuthMiddleware };
