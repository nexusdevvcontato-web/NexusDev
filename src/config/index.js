const NODE_ENV = process.env.NODE_ENV || 'development';
const PORT = Number(process.env.PORT || 5000);
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET;
const REAUTH_TOKEN_SECRET = process.env.REAUTH_TOKEN_SECRET || '';
const SESSION_ACCESS_TOKEN_SECRET = process.env.SESSION_ACCESS_TOKEN_SECRET || '';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '30d';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID || '';
const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET || '';
const GMAIL_REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN || '';
const GMAIL_FROM_EMAIL = process.env.GMAIL_FROM_EMAIL || '';
if (GMAIL_FROM_EMAIL && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(GMAIL_FROM_EMAIL)) throw new Error('GMAIL_FROM_EMAIL inválido.');
const FRONTEND_URL = process.env.FRONTEND_URL || '';
if (FRONTEND_URL) { try { const url = new URL(FRONTEND_URL); if (url.protocol !== 'https:') throw new Error(); } catch { throw new Error('FRONTEND_URL deve ser uma URL HTTPS válida.'); } }
const LESSON_PROOF_PUBLIC_KEY = process.env.LESSON_PROOF_PUBLIC_KEY || '';
const configuredOrigins = (process.env.CORS_ORIGINS || process.env.FRONTEND_URL || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const jwtDuration = /^(?:[1-9]\d{0,5})(s|m|h|d)$/.exec(JWT_EXPIRES_IN);
const jwtUnitsInSeconds = { s: 1, m: 60, h: 3600, d: 86400 };
const jwtLifetimeSeconds = jwtDuration
  ? Number(JWT_EXPIRES_IN.slice(0, -1)) * jwtUnitsInSeconds[jwtDuration[1]]
  : 0;

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error('PORT deve ser um número inteiro entre 1 e 65535.');
}
if (!MONGO_URI) {
  throw new Error('MONGO_URI (ou MONGODB_URI) é obrigatória. Inicialização cancelada.');
}
if (typeof JWT_SECRET !== 'string' || JWT_SECRET.length < 32 ||
    JWT_SECRET === 'nexusdev-super-secret-key-2026' || JWT_SECRET.includes('REPLACE_WITH')) {
  throw new Error('JWT_SECRET deve conter pelo menos 32 caracteres aleatórios e não pode usar segredo padrão.');
}
if (REAUTH_TOKEN_SECRET && (REAUTH_TOKEN_SECRET.length < 32 || REAUTH_TOKEN_SECRET === JWT_SECRET || REAUTH_TOKEN_SECRET.includes('REPLACE_WITH'))) {
  throw new Error('REAUTH_TOKEN_SECRET deve ser distinto, aleatório e conter pelo menos 32 caracteres.');
}
if (SESSION_ACCESS_TOKEN_SECRET && (SESSION_ACCESS_TOKEN_SECRET.length < 32 || SESSION_ACCESS_TOKEN_SECRET === JWT_SECRET || SESSION_ACCESS_TOKEN_SECRET === REAUTH_TOKEN_SECRET || SESSION_ACCESS_TOKEN_SECRET.includes('REPLACE_WITH'))) {
  throw new Error('SESSION_ACCESS_TOKEN_SECRET deve ser distinto, aleatório e conter pelo menos 32 caracteres.');
}
if (NODE_ENV === 'production' && !SESSION_ACCESS_TOKEN_SECRET) {
  throw new Error('SESSION_ACCESS_TOKEN_SECRET é obrigatória em produção. Inicialização cancelada para impedir autenticação legada.');
}
if (!jwtDuration || jwtLifetimeSeconds > 365 * 24 * 60 * 60) {
  throw new Error('JWT_EXPIRES_IN deve usar s, m, h ou d e não pode exceder 365 dias.');
}
if (NODE_ENV === 'production' && configuredOrigins.length === 0) {
  throw new Error('CORS_ORIGINS é obrigatória em produção e deve listar as origens autorizadas.');
}
const ALLOWED_ORIGINS = configuredOrigins.length
  ? configuredOrigins
  : ['http://localhost:5173'];

module.exports = Object.freeze({
  NODE_ENV,
  PORT,
  MONGO_URI,
  JWT_SECRET,
  REAUTH_TOKEN_SECRET,
  SESSION_ACCESS_TOKEN_SECRET,
  JWT_EXPIRES_IN,
  GOOGLE_CLIENT_ID,
  GMAIL_CLIENT_ID,
  GMAIL_CLIENT_SECRET,
  GMAIL_REFRESH_TOKEN,
  GMAIL_FROM_EMAIL,
  FRONTEND_URL,
  LESSON_PROOF_PUBLIC_KEY,
  ALLOWED_ORIGINS,
  isProduction: NODE_ENV === 'production'
});
