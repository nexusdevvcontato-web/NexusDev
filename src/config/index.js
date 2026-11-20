const NODE_ENV = process.env.NODE_ENV || 'development';
const PORT = Number(process.env.PORT || 5000);
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const configuredOrigins = (process.env.CORS_ORIGINS || process.env.FRONTEND_URL || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error('PORT deve ser um número inteiro entre 1 e 65535.');
}
if (!MONGO_URI) {
  throw new Error('MONGO_URI (ou MONGODB_URI) é obrigatória. Inicialização cancelada.');
}
if (typeof JWT_SECRET !== 'string' || JWT_SECRET.length < 32 ||
    JWT_SECRET === 'nexusdev-super-secret-key-2026') {
  throw new Error('JWT_SECRET deve conter pelo menos 32 caracteres aleatórios e não pode usar segredo padrão.');
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
  GOOGLE_CLIENT_ID,
  ALLOWED_ORIGINS,
  isProduction: NODE_ENV === 'production'
});
