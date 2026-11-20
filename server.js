// ============================================================================
// NEXUSDEV BACK-END API v2.0 — AUTENTICAÇÃO CLOUD, CERTIFICADOS, RANKING & TUTOR
// ============================================================================

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const { generateCertificateCode } = require('./src/modules/certificates/code');
const { recordDailyActivity } = require('./src/modules/users/daily-activity');
const { issueCertificateOnce } = require('./src/modules/certificates/issue-once');
const { extractBearerToken, verifyAccessToken } = require('./src/modules/auth/access-token');
const { issueReauthProof, consumeReauthProof } = require('./src/modules/auth/reauthentication');
const { verifyReauthenticationCredential } = require('./src/modules/auth/reauthentication-credentials');
const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');
const { isKnownChallengeId, EXPECTED_COURSE_COMPLETIONS } = require('./src/modules/curriculum/catalog');
const { verifyCompletionProof } = require('./src/modules/proofs/verifyCompletionProof');
const { validateTutorRequest } = require('./src/modules/tutor/request-policy');
const { normalizeCertificateLookupCode, isPublicLessonLookupAllowed } = require('./src/modules/public-read/policy');
const { buildUserDataExport } = require('./src/modules/privacy/user-export');
const { normalizePrivacyPreferences, validatePrivacyPreferenceUpdate } = require('./src/modules/privacy/preferences');
const { createSessionModels } = require('./src/modules/auth/session-models');
const { createSessionAuthService } = require('./src/modules/auth/session-auth-service');
const { createSessionRefreshService } = require('./src/modules/auth/session-refresh-service');
const { createSessionManagementService } = require('./src/modules/auth/session-management-service');
const { createSessionCsrfMiddleware } = require('./src/modules/auth/session-csrf-middleware');
const { createSessionAccessMiddleware, verifySessionAccessToken } = require('./src/modules/auth/session-access-token');

const app = express();

const config = require('./src/config');
const { PORT, MONGO_URI, JWT_SECRET, REAUTH_TOKEN_SECRET, SESSION_ACCESS_TOKEN_SECRET, JWT_EXPIRES_IN, GOOGLE_CLIENT_ID, LESSON_PROOF_PUBLIC_KEY, ALLOWED_ORIGINS } = config;

const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    return callback(new Error('Origem não permitida pela política CORS.'));
  },
  credentials: true
}));
app.use(express.json({ limit: '100kb', strict: true }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Muitas requisições. Tente novamente mais tarde.' }
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de autenticação. Aguarde antes de tentar novamente.' }
});
const reauthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de reautenticação. Aguarde antes de tentar novamente.' }
});
const tutorLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Limite do Tutor IA atingido. Aguarde 15 minutos antes de tentar novamente.' }
});
const publicReadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Limite de consultas públicas atingido. Aguarde antes de tentar novamente.' }
});
const certificateLookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { valid: false, error: 'Muitas consultas de certificados. Aguarde antes de tentar novamente.' }
});
const commentLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Você publicou comentários muito rapidamente. Aguarde alguns minutos.' }
});
app.use('/api/', apiLimiter);

// ============================================================================
// SCHEMA DE USUÁRIOS, PROGRESSO, RANKING E CERTIFICADOS
// ============================================================================
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, default: '' },
    avatar: { type: String, default: '' },
    googleId: { type: String, default: '' },
    reauthProofHash: { type: String, default: '' },
    reauthProofExpiresAt: { type: Date, default: null },
    role: { type: String, enum: ['student', 'admin'], default: 'student' },
    xp: { type: Number, default: 0 },
    streak: { type: Number, default: 1 },
    lastActiveDate: { type: String, default: () => new Date().toISOString().slice(0, 10) },
    completedIds: { type: [String], default: [] },
    savedCodeMap: { type: mongoose.Schema.Types.Mixed, default: {} },
    certificateCode: { type: String, unique: true, sparse: true },
    certificateIssuedAt: { type: Date, default: null },
    githubUrl: { type: String, default: '' },
    liveUrl: { type: String, default: '' },
    privacyPreferences: {
      showInLeaderboard: { type: Boolean, default: true },
      showCertificateDetails: { type: Boolean, default: true }
    }
  },
  { timestamps: true }
);

const User = mongoose.model('User', userSchema);

const commentSchema = new mongoose.Schema(
  {
    lessonId: { type: String, required: true, index: true },
    // Stable ownership link for future privacy requests; legacy comments remain valid without it.
    authorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, default: null },
    author: { type: String, required: true, trim: true },
    badge: { type: String, default: 'Aluno NexusDev' },
    text: { type: String, required: true, trim: true, maxlength: 1000 }
  },
  { timestamps: true }
);

const Comment = mongoose.model('Comment', commentSchema);

// Session authentication v2 is opt-in until its dedicated secret is provisioned.
// Legacy auth endpoints remain available during the parallel migration.
const { Session, RefreshToken } = createSessionModels(mongoose);
const sessionAuthEnabled = Boolean(SESSION_ACCESS_TOKEN_SECRET);
const sessionAuthService = sessionAuthEnabled ? createSessionAuthService({
  mongoose, Session, RefreshToken, User,
  accessTokenSecret: SESSION_ACCESS_TOKEN_SECRET
}) : null;
const sessionRefreshService = sessionAuthEnabled ? createSessionRefreshService({
  mongoose, Session, RefreshToken, User,
  accessTokenSecret: SESSION_ACCESS_TOKEN_SECRET,
  allowedOrigins: ALLOWED_ORIGINS
}) : null;
const sessionManagementService = sessionAuthEnabled ? createSessionManagementService({
  mongoose, Session, RefreshToken, allowedOrigins: ALLOWED_ORIGINS
}) : null;
const requireSessionAccess = sessionAuthEnabled ? createSessionAccessMiddleware({
  User, Session, secret: SESSION_ACCESS_TOKEN_SECRET
}) : null;
const requireSessionCsrf = sessionAuthEnabled ? createSessionCsrfMiddleware({
  Session, RefreshToken, allowedOrigins: ALLOWED_ORIGINS
}) : null;
const sessionUnavailable = (req, res) => res.status(503).set('Cache-Control', 'no-store')
  .json({ error: 'Autenticação por sessão ainda não está configurada neste ambiente.' });

function signUserToken(user) {
  return jwt.sign(
    { id: user._id.toString() },
    JWT_SECRET,
    { algorithm: 'HS256', expiresIn: JWT_EXPIRES_IN }
  );
}

function formatUserResponse(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    avatar: user.avatar,
    provider: user.googleId ? 'google' : 'email',
    xp: user.xp,
    streak: user.streak,
    completedIds: user.completedIds,
    savedCodeMap: user.savedCodeMap,
    certificateCode: user.certificateCode,
    certificateIssuedAt: user.certificateIssuedAt,
    githubUrl: user.githubUrl,
    liveUrl: user.liveUrl,
    createdAt: user.createdAt,
    privacyPreferences: normalizePrivacyPreferences(user.privacyPreferences)
  };
}

async function requireAuth(req, res, next) {
  try {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      return res.status(401).json({ error: 'Token de autenticação ausente ou malformado.' });
    }

    if (sessionAuthEnabled) {
      const claims = verifySessionAccessToken(token, {
        secret: SESSION_ACCESS_TOKEN_SECRET,
        now: Math.floor(Date.now() / 1000)
      });
      if (claims) {
        const currentTime = new Date();
        const session = await Session.findOne({
          _id: claims.sessionId,
          userId: claims.userId,
          revokedAt: null,
          expiresAt: { $gt: currentTime }
        }).lean();
        if (!session) return res.status(401).json({ error: 'Sessão revogada ou expirada.' });
        const sessionUser = await User.findById(claims.userId);
        if (!sessionUser) return res.status(401).json({ error: 'Usuário não encontrado.' });
        req.user = sessionUser;
        req.session = { id: session._id, userId: session.userId };
        return next();
      }
    }

    const decoded = verifyAccessToken(token, JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) return res.status(401).json({ error: 'Usuário não encontrado.' });
    req.user = user;
    return next();
  } catch {
    return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
  }
}

// ============================================================================
// ROTAS DE SAÚDE E AUTENTICAÇÃO (E-MAIL/SENHA + GOOGLE OAUTH)
// ============================================================================
// Parallel session-auth API. The legacy /api/auth/* contract is intentionally unchanged.
app.post('/api/auth/session/register', authLimiter, async (req, res) => {
  if (!sessionAuthEnabled) return sessionUnavailable(req, res);
  res.set('Cache-Control', 'no-store');
  try {
    const { name, email, password } = req.body || {};
    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80 ||
        typeof email !== 'string' || email.length > 254 ||
        typeof password !== 'string' || password.length < 8 || password.length > 128 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ error: 'Informe nome, e-mail e senha válidos.' });
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (await User.findOne({ email: normalizedEmail })) {
      return res.status(409).json({ error: 'Este e-mail já está cadastrado. Faça login.' });
    }
    const user = await User.create({
      name: name.trim(), email: normalizedEmail,
      passwordHash: await bcrypt.hash(password, 10),
      certificateCode: generateCertificateCode(name, 0)
    });
    const result = await sessionAuthService.createForUser({ userId: user._id, res });
    return res.status(201).json({ accessToken: result.accessToken, expiresIn: result.expiresIn, user: formatUserResponse(result.user) });
  } catch {
    return res.status(500).json({ error: 'Não foi possível criar a conta.' });
  }
});

app.post('/api/auth/session/login', authLimiter, async (req, res) => {
  if (!sessionAuthEnabled) return sessionUnavailable(req, res);
  res.set('Cache-Control', 'no-store');
  try {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || email.length > 254 ||
        typeof password !== 'string' || password.length < 1 || password.length > 128 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ error: 'Informe e-mail e senha válidos.' });
    }
    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    }
    const activeUser = await recordDailyActivity(User, user._id, new Date().toISOString().slice(0, 10));
    if (!activeUser) return res.status(401).json({ error: 'Usuário não encontrado.' });
    const result = await sessionAuthService.createForUser({ userId: activeUser._id, res });
    return res.json({ accessToken: result.accessToken, expiresIn: result.expiresIn, user: formatUserResponse(result.user) });
  } catch {
    return res.status(500).json({ error: 'Não foi possível realizar o login.' });
  }
});

app.post('/api/auth/session/google', authLimiter, async (req, res) => {
  if (!sessionAuthEnabled) return sessionUnavailable(req, res);
  res.set('Cache-Control', 'no-store');
  try {
    const { credential } = req.body || {};
    if (typeof credential !== 'string' || !googleClient) {
      return res.status(400).json({ error: 'Credencial Google inválida ou não configurada.' });
    }
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    const { sub: googleId, email, email_verified: emailVerified, name, picture } = payload;
    if (!googleId || !email || emailVerified !== true) {
      return res.status(401).json({ error: 'A conta Google precisa ter e-mail verificado.' });
    }
    let user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      user = await User.create({
        name: name || 'Estudante NexusDev', email: email.toLowerCase(),
        avatar: picture || '', googleId,
        certificateCode: generateCertificateCode(name, 0)
      });
    } else {
      if (user.googleId !== googleId) return res.status(409).json({ error: 'Entre pelo método de autenticação original.' });
      if (picture && picture !== user.avatar) await User.updateOne({ _id: user._id }, { $set: { avatar: picture } });
      user = await recordDailyActivity(User, user._id, new Date().toISOString().slice(0, 10));
      if (!user) return res.status(401).json({ error: 'Usuário não encontrado.' });
    }
    const result = await sessionAuthService.createForUser({ userId: user._id, res });
    return res.json({ accessToken: result.accessToken, expiresIn: result.expiresIn, user: formatUserResponse(result.user) });
  } catch {
    return res.status(401).json({ error: 'Falha ao validar conta Google.' });
  }
});

app.post('/api/auth/session/refresh', (req, res) => {
  if (!sessionAuthEnabled) return sessionUnavailable(req, res);
  return sessionRefreshService.refresh(req, res);
});
app.post('/api/auth/session/logout', (req, res, next) => {
  if (!sessionAuthEnabled) return sessionUnavailable(req, res);
  return requireSessionCsrf(req, res, next);
}, requireSessionAccess, (req, res) => sessionManagementService.logoutCurrent(req, res));
app.post('/api/auth/session/logout-all', (req, res, next) => {
  if (!sessionAuthEnabled) return sessionUnavailable(req, res);
  return requireSessionCsrf(req, res, next);
}, requireSessionAccess, (req, res) => sessionManagementService.logoutAll(req, res));
app.get('/api/auth/session/sessions', (req, res, next) => {
  if (!sessionAuthEnabled) return sessionUnavailable(req, res);
  return requireSessionAccess(req, res, next);
}, (req, res) => sessionManagementService.listSessions(req, res));
app.delete('/api/auth/session/sessions/:sessionId', (req, res, next) => {
  if (!sessionAuthEnabled) return sessionUnavailable(req, res);
  return requireSessionCsrf(req, res, next);
}, requireSessionAccess, (req, res) => sessionManagementService.revokeOne(req, res));

app.get('/api/health', (req, res) => {
  res.json({ status: 'online', service: 'NexusDev API v2.0', timestamp: new Date().toISOString() });
});

app.post('/api/auth/register', authLimiter, async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios.' });
    }
    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80 ||
        typeof email !== 'string' || email.length > 254 ||
        typeof password !== 'string' || password.length < 8 || password.length > 128) {
      return res.status(400).json({ error: 'Informe nome válido, e-mail válido e senha entre 8 e 128 caracteres.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ error: 'Informe um endereço de e-mail válido.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({ error: 'Este e-mail já está cadastrado. Faça login.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      certificateCode: generateCertificateCode(name, 0)
    });

    const token = signUserToken(user);
    return res.status(201).json({ token, user: formatUserResponse(user) });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao criar conta no servidor.' });
  }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || email.length > 254 ||
        typeof password !== 'string' || password.length < 1 || password.length > 128 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ error: 'Informe e-mail e senha válidos.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    }

    const today = new Date().toISOString().slice(0, 10);
    const activeUser = await recordDailyActivity(User, user._id, today);
    if (!activeUser) return res.status(401).json({ error: 'Usuário não encontrado.' });

    const token = signUserToken(activeUser);
    return res.json({ token, user: formatUserResponse(activeUser) });
  } catch {
    return res.status(500).json({ error: 'Erro ao realizar login.' });
  }
});

app.post('/api/auth/google', authLimiter, async (req, res) => {
  try {
    const { credential } = req.body || {};
    if (!credential || !googleClient) {
      return res.status(400).json({ error: 'Credencial inválida ou Google Client ID não configurado.' });
    }

    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    const { sub: googleId, email, email_verified: emailVerified, name, picture } = payload;
    if (!email || emailVerified !== true || !googleId) {
      return res.status(401).json({ error: 'A conta Google precisa ter e-mail verificado.' });
    }

    let user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      user = await User.create({
        name: name || 'Estudante NexusDev',
        email: email.toLowerCase(),
        avatar: picture || '',
        googleId,
        certificateCode: generateCertificateCode(name, 0)
      });
    } else {
      if (user.googleId !== googleId) {
        return res.status(409).json({ error: 'Esta conta já está vinculada a outra identidade. Entre pelo método original.' });
      }
      if (picture && picture !== user.avatar) {
        await User.updateOne({ _id: user._id }, { $set: { avatar: picture } });
      }
      const today = new Date().toISOString().slice(0, 10);
      user = await recordDailyActivity(User, user._id, today);
      if (!user) return res.status(401).json({ error: 'Usuário não encontrado.' });
    }

    const token = signUserToken(user);
    return res.json({ token, user: formatUserResponse(user) });
  } catch {
    return res.status(401).json({ error: 'Falha ao validar conta Google.' });
  }
});

app.get('/api/me', requireAuth, async (req, res) => {
  res.json(formatUserResponse(req.user));
});

// Reauthenticate the account owner before a future sensitive action.
// The returned proof is short-lived, bound to this user, and single-use.
app.post('/api/auth/reauthenticate', requireAuth, reauthLimiter, async (req, res) => {
  if (!REAUTH_TOKEN_SECRET) {
    return res.status(503).json({ error: 'Reautenticação segura ainda não está configurada neste ambiente.' });
  }

  try {
    const verification = await verifyReauthenticationCredential({
      user: req.user,
      body: req.body,
      bcrypt,
      googleClient,
      googleClientId: GOOGLE_CLIENT_ID
    });
    if (!verification.ok) {
      return res.status(verification.status).json({ error: verification.error });
    }

    const proof = issueReauthProof({
      userId: req.user._id.toString(),
      secret: REAUTH_TOKEN_SECRET
    });
    const updated = await User.findByIdAndUpdate(
      req.user._id,
      {
        $set: {
          reauthProofHash: proof.proofHash,
          reauthProofExpiresAt: proof.expiresAt
        }
      },
      { new: true, projection: { _id: 1 } }
    );
    if (!updated) return res.status(401).json({ error: 'Conta não encontrada.' });

    res.set('Cache-Control', 'no-store');
    return res.json({ reauthToken: proof.token, expiresIn: proof.expiresIn });
  } catch {
    return res.status(401).json({ error: 'Não foi possível confirmar a identidade.' });
  }
});

// Authenticated portability endpoint: exports only an explicit allowlist of the user's own data.
app.get('/api/privacy/preferences', requireAuth, (req, res) => {
  return res.json({ preferences: normalizePrivacyPreferences(req.user.privacyPreferences) });
});

app.put('/api/privacy/preferences', requireAuth, async (req, res) => {
  const validation = validatePrivacyPreferenceUpdate(req.body);
  if (!validation.ok) return res.status(400).json({ error: validation.error });
  try {
    const update = {};
    for (const [key, value] of Object.entries(validation.value)) {
      update[`privacyPreferences.${key}`] = value;
    }
    const updated = await User.findByIdAndUpdate(
      req.user._id,
      { $set: update },
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ error: 'Conta não encontrada.' });
    return res.json({ preferences: normalizePrivacyPreferences(updated.privacyPreferences) });
  } catch {
    return res.status(500).json({ error: 'Não foi possível salvar as preferências de privacidade.' });
  }
});

app.get('/api/privacy/export', requireAuth, async (req, res) => {
  try {
    // Scope the query to the authenticated database identity; never accept an owner ID from the client.
    const comments = await Comment.find({ authorUserId: req.user._id })
      .sort({ createdAt: 1, _id: 1 })
      .select('_id lessonId author badge text createdAt updatedAt')
      .lean();
    res.set('Content-Disposition', 'attachment; filename="nexusdev-dados-pessoais.json"');
    res.set('Cache-Control', 'no-store');
    return res.json(buildUserDataExport(req.user, comments));
  } catch {
    return res.status(500).json({ error: 'Não foi possível exportar os dados da conta.' });
  }
});

// ============================================================================
// PROGRESSO, RANKING SEMANAL, CERTIFICADOS PÚBLICOS E TUTOR IA CONTEXTUAL
// ============================================================================
app.post('/api/progress/complete', requireAuth, async (req, res) => {
  try {
    const { challengeId, files, completionProof } = req.body || {};
    if (!isKnownChallengeId(challengeId)) {
      return res.status(400).json({ error: 'Aula inválida ou não encontrada no currículo oficial.' });
    }

    // Never trust a client-side "tests passed" flag. Only a separate runner can sign this proof.
    const proofResult = verifyCompletionProof(completionProof, {
      publicKey: LESSON_PROOF_PUBLIC_KEY,
      userId: req.user._id.toString(),
      challengeId
    });
    if (!proofResult.ok) {
      if (proofResult.reason === 'not-configured') {
        return res.status(503).json({ error: 'Validação segura de exercícios ainda não está configurada.' });
      }
      return res.status(403).json({ error: 'Comprovante de conclusão ausente ou inválido.' });
    }

    if (files !== undefined) {
      if (!files || typeof files !== 'object' || Array.isArray(files)) {
        return res.status(400).json({ error: 'Arquivos do editor inválidos.' });
      }
      const entries = Object.entries(files);
      if (entries.length > 10 || entries.some(([name, value]) =>
        typeof name !== 'string' || name.length > 80 ||
        !/^[a-zA-Z0-9._-]+$/.test(name) ||
        typeof value !== 'string' || value.length > 50000
      )) {
        return res.status(400).json({ error: 'Os arquivos excedem os limites permitidos.' });
      }
      await User.updateOne(
        { _id: req.user._id },
        { $set: { [`savedCodeMap.${challengeId}`]: files } }
      );
    }

    // The unique-index predicate prevents concurrent duplicate XP awards.
    await User.findOneAndUpdate(
      { _id: req.user._id, completedIds: { $ne: challengeId } },
      { $addToSet: { completedIds: challengeId }, $inc: { xp: 50 } },
      { new: true }
    );

    const today = new Date().toISOString().slice(0, 10);
    await User.updateOne(
      { _id: req.user._id, lastActiveDate: { $ne: today } },
      { $inc: { streak: 1 }, $set: { lastActiveDate: today } }
    );

    const user = await User.findById(req.user._id);
    if (!user) return res.status(401).json({ error: 'Usuário não encontrado.' });

    return res.json({
      xp: user.xp,
      streak: user.streak,
      completedIds: user.completedIds.filter(isKnownChallengeId),
      certificateCode: user.certificateCode
    });
  } catch {
    return res.status(500).json({ error: 'Erro ao salvar progresso.' });
  }
});

app.post('/api/certificates/issue', requireAuth, async (req, res) => {
  try {
    const { studentName, githubUrl, liveUrl } = req.body || {};
    const user = req.user;
    const completedCount = new Set(user.completedIds.filter(isKnownChallengeId)).size;

    if (completedCount < EXPECTED_COURSE_COMPLETIONS) {
      return res.status(403).json({
        verified: false,
        error: 'Conclua todas as aulas do currículo antes de emitir o certificado.',
        completedCount,
        requiredCount: EXPECTED_COURSE_COMPLETIONS
      });
    }

    if (studentName !== undefined &&
        (typeof studentName !== 'string' || studentName.trim().length < 2 || studentName.trim().length > 100)) {
      return res.status(400).json({ error: 'Nome para o certificado inválido.' });
    }
    const validatePortfolioUrl = (value) => {
      if (value === undefined || value === '') return true;
      if (typeof value !== 'string' || value.length > 2048) return false;
      try {
        const parsed = new URL(value);
        return parsed.protocol === 'https:';
      } catch {
        return false;
      }
    };
    if (!validatePortfolioUrl(githubUrl) || !validatePortfolioUrl(liveUrl)) {
      return res.status(400).json({ error: 'Os links do portfólio devem ser URLs HTTPS válidas.' });
    }

    // Apply only explicitly validated profile fields; never save the stale auth snapshot.
    const profileUpdate = {};
    if (studentName) profileUpdate.name = studentName.trim();
    if (githubUrl !== undefined) profileUpdate.githubUrl = githubUrl;
    if (liveUrl !== undefined) profileUpdate.liveUrl = liveUrl;
    if (Object.keys(profileUpdate).length) {
      await User.updateOne({ _id: user._id }, { $set: profileUpdate });
    }

    // Only one concurrent request can set the first issuance timestamp/code.
    const candidateCode = user.certificateCode || generateCertificateCode(
      studentName ? studentName.trim() : user.name,
      completedCount
    );
    const issuedUser = await issueCertificateOnce(User, user._id, candidateCode, new Date());
    if (!issuedUser || !issuedUser.certificateIssuedAt) {
      return res.status(409).json({ error: 'Não foi possível confirmar a emissão do certificado. Tente novamente.' });
    }

    return res.json({
      verified: true,
      code: issuedUser.certificateCode,
      studentName: issuedUser.name,
      completedCount: new Set(issuedUser.completedIds.filter(isKnownChallengeId)).size,
      xp: issuedUser.xp,
      issuedAt: issuedUser.certificateIssuedAt,
      githubUrl: issuedUser.githubUrl,
      liveUrl: issuedUser.liveUrl
    });
  } catch {
    return res.status(500).json({ error: 'Erro ao emitir certificado.' });
  }
});

// Rota pública para recrutadores validarem certificados via link ou QR Code
app.get('/api/certificates/:code', certificateLookupLimiter, async (req, res) => {
  try {
    const code = normalizeCertificateLookupCode(req.params.code);
    if (!code) return res.status(400).json({ valid: false, error: 'Código de certificado inválido.' });
    const user = await User.findOne({ certificateCode: code });
    if (!user || !user.certificateIssuedAt) {
      return res.status(404).json({ valid: false, error: 'Código de certificado não encontrado.' });
    }
    if (normalizePrivacyPreferences(user.privacyPreferences).showCertificateDetails === false) {
      return res.json({ valid: true, code: user.certificateCode, publicDetails: false });
    }
    return res.json({
      valid: true,
      publicDetails: true,
      code: user.certificateCode,
      studentName: user.name,
      completedCount: new Set(user.completedIds.filter(isKnownChallengeId)).size,
      xp: user.xp,
      issuedAt: user.certificateIssuedAt || user.updatedAt,
      githubUrl: user.githubUrl,
      liveUrl: user.liveUrl
    });
  } catch {
    return res.status(500).json({ valid: false, error: 'Erro ao consultar certificado.' });
  }
});

// Ranking Top 15 da Comunidade
app.get('/api/leaderboard', publicReadLimiter, async (req, res) => {
  try {
    const topUsers = await User.find({ 'privacyPreferences.showInLeaderboard': { $ne: false } })
      .sort({ xp: -1, streak: -1, _id: 1 })
      .limit(15)
      .select('name avatar xp streak completedIds')
      .lean();

    const leaderboard = topUsers.map((u, idx) => ({
      rank: idx + 1,
      name: u.name,
      avatar: u.avatar,
      xp: u.xp || 0,
      streak: u.streak || 1,
      completedCount: Array.isArray(u.completedIds) ? new Set(u.completedIds.filter(isKnownChallengeId)).size : 0
    }));

    return res.json({ leaderboard });
  } catch {
    return res.json({ leaderboard: [] });
  }
});

// Tutor IA Contextual (Analisa código e enunciado da aula sem entregar a resposta pronta)
app.post('/api/tutor/analyze', tutorLimiter, (req, res) => {
  const validation = validateTutorRequest(req.body);
  if (!validation.ok) return res.status(400).json({ error: validation.error });
  const { challengeTitle, language, targetFunction, instructions, filesMap, failedTests } = validation.value;
  const tips = [];
  const allCode = Object.values(filesMap).join('\n');
  if (!allCode.trim()) return res.json({ tips: ['O editor está vazio. Comece escrevendo a estrutura pedida nas instruções à esquerda.'] });
  const openBraces = (allCode.match(/\{/g) || []).length;
  const closeBraces = (allCode.match(/\}/g) || []).length;
  if (openBraces !== closeBraces) tips.push('Chaves desbalanceadas: você abriu ' + openBraces + ' "{" e fechou ' + closeBraces + ' "}".');
  if (language === 'html') {
    const html = filesMap['index.html'] || '';
    const css = filesMap['style.css'] || '';
    if (instructions.includes('<h1>') && !/<h1\b/i.test(html)) tips.push('Inclua uma tag de título principal <h1>...</h1> dentro do index.html.');
    if (instructions.includes('display: flex') && !/display\s*:\s*flex/i.test(css)) tips.push('Abra a aba "style.css" e adicione "display: flex;" no seletor solicitado.');
    if (instructions.includes('display: grid') && !/display\s*:\s*grid/i.test(css)) tips.push('Abra a aba "style.css" e ative "display: grid;" no contêiner.');
  } else {
    if (targetFunction && !allCode.includes(targetFunction)) tips.push('Mantenha o nome exato da função "' + targetFunction + '" definida no desafio.');
    if (!/\breturn\b/.test(allCode) && !allCode.includes('res.status')) tips.push('Sua função precisa retornar um resultado usando a palavra-chave "return".');
  }
  if (failedTests.length > 0 && tips.length === 0) tips.push('Foco no critério "' + failedTests[0].description + '": ' + failedTests[0].error);
  if (tips.length === 0) tips.push('Excelente progresso na aula "' + challengeTitle + '"! Clique em "Verificar Código" para validar todos os testes.');
  return res.json({ tips });
});

// ============================================================================
// FÓRUM DA COMUNIDADE POR AULA (PERSISTIDO NO MONGODB)
// ============================================================================
app.get('/api/lessons/:lessonId/comments', publicReadLimiter, async (req, res) => {
  try {
    const lessonId = typeof req.params.lessonId === 'string' ? req.params.lessonId.trim() : '';
    if (!isPublicLessonLookupAllowed(lessonId)) {
      return res.status(400).json({ error: 'Identificador de aula inválido.' });
    }
    const docs = await Comment.find({ lessonId }).sort({ createdAt: -1 }).limit(50).lean();
    const comments = docs.map((d) => ({
      id: d._id.toString(),
      author: d.author,
      badge: d.badge || 'Aluno NexusDev',
      time: new Date(d.createdAt).toLocaleDateString('pt-BR'),
      text: d.text
    }));
    return res.json({ comments });
  } catch {
    return res.json({ comments: [] });
  }
});

app.post('/api/lessons/:lessonId/comments', requireAuth, commentLimiter, async (req, res) => {
  try {
    const lessonId = String(req.params.lessonId || '').trim();
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (!isKnownChallengeId(lessonId) || !text || text.length > 1000) {
      return res.status(400).json({ error: 'Aula ou mensagem inválida.' });
    }

    const created = await Comment.create({
      lessonId,
      authorUserId: req.user._id,
      author: req.user.name,
      badge: req.user.role === 'admin' ? 'Mentor NexusDev' : 'Aluno NexusDev',
      text
    });

    // Comments no longer grant XP: otherwise users could farm rewards by spamming.
    return res.status(201).json({
      comment: {
        id: created._id.toString(),
        author: created.author,
        badge: created.badge,
        time: 'agora',
        text: created.text
      },
      xp: req.user.xp
    });
  } catch {
    return res.status(500).json({ error: 'Erro ao publicar comentário.' });
  }
});

async function startServer() {
  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 10000 });
    console.log('✅ Conectado ao MongoDB');
    return app.listen(PORT, () => {
      console.log(`🚀 Servidor NexusDev v2.0 rodando na porta ${PORT}`);
    });
  } catch (error) {
    console.error('❌ Inicialização cancelada: não foi possível conectar ao MongoDB.', error.message);
    process.exitCode = 1;
    throw error;
  }
}

if (require.main === module) {
  startServer().catch(() => process.exit(1));
}

module.exports = { app, startServer };