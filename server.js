// ============================================================================
// NEXUSDEV BACK-END API v2.0 — AUTENTICAÇÃO CLOUD, CERTIFICADOS, RANKING & TUTOR
// ============================================================================

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const crypto = require('node:crypto');
const { generateCertificateCode } = require('./src/modules/certificates/code');
const { recordDailyActivity } = require('./src/modules/users/daily-activity');
const { issueCertificateOnce } = require('./src/modules/certificates/issue-once');
const { createUserWithCertificateCode } = require('./src/modules/certificates/create-user');
const { lookupPublicCertificate } = require('./src/modules/certificates/lookup');
const { issueReauthProof, consumeReauthProof } = require('./src/modules/auth/reauthentication');
const { verifyReauthenticationCredential } = require('./src/modules/auth/reauthentication-credentials');
const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');
const { isKnownChallengeId, EXPECTED_COURSE_COMPLETIONS } = require('./src/modules/curriculum/catalog');
const { isRunnerSupportedChallenge, getChallengeSpec } = require('./runner/src/challenge-registry');
const { hashCompletionFiles } = require('./src/modules/proofs/completion-files-hash');
const { verifyCompletionProof } = require('./src/modules/proofs/verifyCompletionProof');
const { createCompletionProofModel, consumeCompletionProof } = require('./src/modules/proofs/completion-proof-store');
const { completeLessonAtomically, REPLAY_CODE } = require('./src/modules/proofs/complete-lesson');
const { validateTutorRequest } = require('./src/modules/tutor/request-policy');
const { normalizeCertificateLookupCode, isPublicLessonLookupAllowed } = require('./src/modules/public-read/policy');
const { buildLeaderboard } = require('./src/modules/public-read/leaderboard-policy');
const { buildUserDataExport } = require('./src/modules/privacy/user-export');
const { buildDeletionImpact } = require('./src/modules/privacy/deletion-impact');
const { normalizePrivacyPreferences, validatePrivacyPreferenceUpdate } = require('./src/modules/privacy/preferences');
const { createSessionModels } = require('./src/modules/auth/session-models');
const { createSessionAuthService } = require('./src/modules/auth/session-auth-service');
const { createSessionRefreshService } = require('./src/modules/auth/session-refresh-service');
const { createSessionManagementService } = require('./src/modules/auth/session-management-service');
const { createSessionCsrfMiddleware, requireMatchingSession } = require('./src/modules/auth/session-csrf-middleware');
const { createSessionAccessMiddleware } = require('./src/modules/auth/session-access-token');
const { createPasswordResetService, normalizeEmail } = require('./src/modules/auth/password-reset');
const { createGmailPasswordResetMailer } = require('./src/modules/auth/gmail-mailer');
const { validateDraftFiles, createLessonDraftService } = require('./src/modules/drafts/lesson-drafts');

const app = express();
// Render terminates the public connection at one trusted proxy hop.
// This lets rate-limit middleware use the forwarded client IP safely.
app.set('trust proxy', 1);

const config = require('./src/config');
const { PORT, MONGO_URI, JWT_SECRET, REAUTH_TOKEN_SECRET, SESSION_ACCESS_TOKEN_SECRET, JWT_EXPIRES_IN, GOOGLE_CLIENT_ID, LESSON_PROOF_PUBLIC_KEY, ALLOWED_ORIGINS, GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_FROM_EMAIL, FRONTEND_URL } = config;

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

const passwordResetRequestLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Muitas solicitações. Tente novamente mais tarde.' } });
const passwordResetEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 3,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator(req) {
    const email = normalizeEmail(req.body?.email);
    return email ? crypto.createHash('sha256').update(email).digest('hex') : ipKeyGenerator(req.ip);
  },
  message: { error: 'Muitas solicitações. Tente novamente mais tarde.' }
});
const passwordResetConfirmLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Muitas tentativas. Aguarde antes de tentar novamente.' } });
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
const lessonDraftLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Muitas alterações de rascunho. Aguarde um instante.' }
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
    passwordResetTokenHash: { type: String, default: undefined, select: false },
    passwordResetExpiresAt: { type: Date, default: undefined, select: false },
    passwordChangedAt: { type: Date, default: null, select: false },
    authVersion: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger },
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
    savedDraftMap: { type: mongoose.Schema.Types.Mixed, default: {} },
    certificateCode: { type: String, unique: true, sparse: true },
    certificateIssuedAt: { type: Date, default: null },
    githubUrl: { type: String, default: '' },
    liveUrl: { type: String, default: '' },
    certificateStudentName: { type: String, default: undefined },
    certificateCompletedCount: { type: Number, min: 0, default: undefined },
    certificateXp: { type: Number, min: 0, default: undefined },
    certificateGithubUrl: { type: String, default: undefined },
    certificateLiveUrl: { type: String, default: undefined },
    privacyPreferences: {
      showInLeaderboard: { type: Boolean, default: true },
      showCertificateDetails: { type: Boolean, default: true }
    }
  },
  { timestamps: true }
);

const User = mongoose.model('User', userSchema);
const lessonDraftService = createLessonDraftService({ User });

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
const CompletionProof = createCompletionProofModel(mongoose);

// Session authentication is the only supported authenticated API path.
// Production startup fails closed if its dedicated signing secret is missing.
const { Session, RefreshToken } = createSessionModels(mongoose);
const passwordResetService = GMAIL_CLIENT_ID && GMAIL_CLIENT_SECRET && GMAIL_REFRESH_TOKEN && GMAIL_FROM_EMAIL && FRONTEND_URL
  ? createPasswordResetService({
      mongoose, User, Session, bcrypt,
      sendResetEmail: createGmailPasswordResetMailer({
        clientId: GMAIL_CLIENT_ID, clientSecret: GMAIL_CLIENT_SECRET,
        refreshToken: GMAIL_REFRESH_TOKEN, fromEmail: GMAIL_FROM_EMAIL, frontendUrl: FRONTEND_URL
      })
    })
  : null;
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

const requireAuth = sessionAuthEnabled
  ? requireSessionAccess
  : (req, res) => sessionUnavailable(req, res);

// ============================================================================
// ROTAS DE SAÚDE E AUTENTICAÇÃO (E-MAIL/SENHA + GOOGLE OAUTH)
// ============================================================================
// Session-based authentication API.
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
    const user = await createUserWithCertificateCode(User, {
      name: name.trim(), email: normalizedEmail,
      passwordHash: await bcrypt.hash(password, 10)
    }, generateCertificateCode);
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
    const result = await sessionAuthService.createForUser({ userId: activeUser._id, expectedPasswordHash: user.passwordHash, res });
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
      user = await createUserWithCertificateCode(User, {
        name: name || 'Estudante NexusDev', email: email.toLowerCase(),
        avatar: picture || '', googleId
      }, generateCertificateCode);
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
}, requireSessionAccess, requireMatchingSession, (req, res) => sessionManagementService.logoutCurrent(req, res));
app.post('/api/auth/session/logout-all', (req, res, next) => {
  if (!sessionAuthEnabled) return sessionUnavailable(req, res);
  return requireSessionCsrf(req, res, next);
}, requireSessionAccess, requireMatchingSession, (req, res) => sessionManagementService.logoutAll(req, res));
app.get('/api/auth/session/sessions', (req, res, next) => {
  if (!sessionAuthEnabled) return sessionUnavailable(req, res);
  return requireSessionAccess(req, res, next);
}, (req, res) => sessionManagementService.listSessions(req, res));
app.delete('/api/auth/session/sessions/:sessionId', (req, res, next) => {
  if (!sessionAuthEnabled) return sessionUnavailable(req, res);
  return requireSessionCsrf(req, res, next);
}, requireSessionAccess, requireMatchingSession, (req, res) => sessionManagementService.revokeOne(req, res));

app.post('/api/auth/password-reset/request', passwordResetRequestLimiter, passwordResetEmailLimiter, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const { email } = req.body || {};
  if (typeof email !== 'string' || email.length > 254) {
    return res.status(202).json({ message: 'Se o endereço estiver cadastrado, você receberá instruções para redefinir a senha.' });
  }
  if (!passwordResetService) {
    return res.status(503).json({ error: 'Recuperação de senha ainda não está configurada neste ambiente.' });
  }
  try {
    await passwordResetService.request(email);
    return res.status(202).json({ message: 'Se o endereço estiver cadastrado, você receberá instruções para redefinir a senha.' });
  } catch {
    return res.status(202).json({ message: 'Se o endereço estiver cadastrado, você receberá instruções para redefinir a senha.' });
  }
});

app.post('/api/auth/password-reset/confirm', passwordResetConfirmLimiter, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!passwordResetService) return res.status(503).json({ error: 'Recuperação de senha ainda não está configurada neste ambiente.' });
  try {
    const { token, newPassword } = req.body || {};
    const result = await passwordResetService.reset({ token, newPassword });
    if (!result.ok) return res.status(400).json({ error: 'Link inválido, expirado ou já utilizado. Solicite uma nova recuperação.' });
    return res.json({ message: 'Senha alterada com sucesso. Entre novamente com sua nova senha.' });
  } catch {
    return res.status(400).json({ error: 'Não foi possível redefinir a senha. Solicite um novo link.' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'online', service: 'NexusDev API v2.0', timestamp: new Date().toISOString() });
});

// Legacy token-issuing endpoints are retired. The frontend uses session-based auth only.
const legacyAuthRetired = (req, res) => res.status(410).set('Cache-Control', 'no-store')
  .json({ error: 'Este endpoint de autenticação foi desativado. Atualize o aplicativo para usar sessões seguras.' });
app.post('/api/auth/register', authLimiter, legacyAuthRetired);
app.post('/api/auth/login', authLimiter, legacyAuthRetired);
app.post('/api/auth/google', authLimiter, legacyAuthRetired);

app.get('/api/me', requireAuth, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(formatUserResponse(req.user));
});

// Reauthenticate the account owner before a future sensitive action.
// The returned proof is short-lived, bound to this user, and single-use.
app.post('/api/auth/reauthenticate', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
}, requireAuth, reauthLimiter, async (req, res) => {
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
app.get('/api/privacy/preferences', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
}, requireAuth, (req, res) => {
  return res.json({ preferences: normalizePrivacyPreferences(req.user.privacyPreferences) });
});

app.put('/api/privacy/preferences', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
}, requireAuth, async (req, res) => {
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

// Read-only preview: aggregate only the authenticated user's related records.
app.get('/api/privacy/deletion-impact', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
}, requireAuth, async (req, res) => {
  try {
    const userId = req.user._id;
    const [sessionCount, ownedSessions, completionProofs, linkedComments] = await Promise.all([
      Session.countDocuments({ userId }),
      Session.find({ userId }).select('_id').lean(),
      CompletionProof.countDocuments({ userId }),
      Comment.countDocuments({ authorUserId: userId })
    ]);
    const sessionIds = ownedSessions.map((session) => session._id);
    const refreshTokens = await RefreshToken.countDocuments({
      $or: [{ userId }, { sessionId: { $in: sessionIds } }]
    });
    const hasCertificate = Boolean(req.user.certificateIssuedAt);
    const hasLearningData = Boolean(
      (Array.isArray(req.user.completedIds) && req.user.completedIds.length) ||
      (req.user.savedCodeMap && Object.keys(req.user.savedCodeMap).length) ||
      (req.user.savedDraftMap && Object.keys(req.user.savedDraftMap).length) ||
      req.user.xp > 0 || req.user.streak > 1
    );
    return res.json(buildDeletionImpact({
      sessions: sessionCount,
      refreshTokens,
      completionProofs,
      linkedComments,
      hasCertificate,
      hasLearningData,
      hasProfileData: true
    }));
  } catch {
    return res.status(500).json({ error: 'Não foi possível gerar a prévia de impacto.' });
  }
});

app.get('/api/privacy/export', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
}, requireAuth, async (req, res) => {
  try {
    // Scope every query to the authenticated database identity; never accept an owner ID from the client.
    const [comments, sessions] = await Promise.all([
      Comment.find({ authorUserId: req.user._id })
        .sort({ createdAt: 1, _id: 1 })
        .select('_id lessonId author badge text createdAt updatedAt')
        .lean(),
      Session.find({ userId: req.user._id })
        .sort({ createdAt: 1, _id: 1 })
        .select('_id createdAt lastUsedAt expiresAt revokedAt revokeReason')
        .lean()
    ]);
    res.set('Content-Disposition', 'attachment; filename="nexusdev-dados-pessoais.json"');
    return res.json(buildUserDataExport(req.user, comments, sessions));
  } catch {
    return res.status(500).json({ error: 'Não foi possível exportar os dados da conta.' });
  }
});

// Versioned drafts are private to the authenticated owner and use compare-and-swap revisions.
app.get('/api/lessons/:lessonId/draft', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
}, requireAuth, lessonDraftLimiter, async (req, res) => {
  const lessonId = String(req.params.lessonId || '');
  if (!isKnownChallengeId(lessonId)) return res.status(400).json({ error: 'Aula inválida.' });
  try {
    const draft = await lessonDraftService.read(req.user._id, lessonId);
    return res.json({ draft });
  } catch {
    return res.status(500).json({ error: 'Não foi possível carregar o rascunho.' });
  }
});

app.put('/api/lessons/:lessonId/draft', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
}, requireAuth, lessonDraftLimiter, async (req, res) => {
  const lessonId = String(req.params.lessonId || '');
  if (!isKnownChallengeId(lessonId)) return res.status(400).json({ error: 'Aula inválida.' });
  const validation = validateDraftFiles(req.body?.files);
  if (!validation.ok) return res.status(400).json({ error: validation.error });
  try {
    const result = await lessonDraftService.save({
      userId: req.user._id,
      challengeId: lessonId,
      files: validation.files,
      expectedRevision: req.body?.expectedRevision
    });
    if (!result.ok && result.reason === 'invalid_revision') {
      return res.status(400).json({ error: 'Revisão do rascunho inválida.' });
    }
    if (!result.ok) return res.status(409).json({ conflict: true, draft: result.draft });
    return res.json({ saved: true, draft: result.draft });
  } catch {
    return res.status(500).json({ error: 'Não foi possível salvar o rascunho.' });
  }
});

// ============================================================================
// PROGRESSO, RANKING SEMANAL, CERTIFICADOS PÚBLICOS E TUTOR IA CONTEXTUAL
// ============================================================================
app.post('/api/progress/complete', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
}, requireAuth, async (req, res) => {
  try {
    const { challengeId, files, completionProof } = req.body || {};
    if (!isKnownChallengeId(challengeId)) {
      return res.status(400).json({ error: 'Aula inválida ou não encontrada no currículo oficial.' });
    }

    if (!isRunnerSupportedChallenge(challengeId)) {
      return res.status(400).json({ error: 'Esta aula ainda não possui um validador seguro habilitado.' });
    }

    const challengeSpec = getChallengeSpec(challengeId);
    if (!files || typeof files !== 'object' || Array.isArray(files)) {
      return res.status(400).json({ error: 'Os arquivos avaliados são obrigatórios.' });
    }
    const fileNames = Object.keys(files);
    if (fileNames.length !== 1 || fileNames[0] !== challengeSpec.entrypoint) {
      return res.status(400).json({ error: 'Envie somente o arquivo principal desta aula.' });
    }

    let filesHash;
    try {
      filesHash = hashCompletionFiles(files);
    } catch {
      return res.status(400).json({ error: 'Os arquivos excedem os limites ou possuem conteúdo inválido.' });
    }

    // The proof is bound to the exact files evaluated by the trusted runner.
    const proofResult = verifyCompletionProof(completionProof, {
      publicKey: LESSON_PROOF_PUBLIC_KEY,
      userId: req.user._id.toString(),
      challengeId,
      filesHash
    });
    if (!proofResult.ok) {
      if (proofResult.reason === 'not-configured') {
        return res.status(503).json({ error: 'Validação segura de exercícios ainda não está configurada.' });
      }
      return res.status(403).json({ error: 'Comprovante de conclusão ausente ou inválido.' });
    }

    const today = new Date().toISOString().slice(0, 10);
    let user;
    try {
      user = await completeLessonAtomically({ mongoose, User, CompletionProof, userId: req.user._id, proof: proofResult.proof, challengeId, files, today });
    } catch (error) {
      if (error?.code === REPLAY_CODE) return res.status(403).json({ error: 'Este comprovante já foi utilizado.' });
      throw error;
    }
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
  res.set('Cache-Control', 'no-store');
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

    // Freeze the certificate's public facts atomically with its first issuance.
    // Subsequent requests return the original certificate and cannot rewrite its snapshot.
    const candidateCode = user.certificateCode || generateCertificateCode();
    const certificateSnapshot = {
      certificateStudentName: studentName ? studentName.trim() : user.name,
      certificateCompletedCount: completedCount,
      certificateXp: user.xp,
      certificateGithubUrl: githubUrl !== undefined ? githubUrl : user.githubUrl,
      certificateLiveUrl: liveUrl !== undefined ? liveUrl : user.liveUrl
    };
    const issuedUser = await issueCertificateOnce(
      User,
      user._id,
      candidateCode,
      new Date(),
      () => generateCertificateCode(),
      certificateSnapshot
    );
    if (!issuedUser || !issuedUser.certificateIssuedAt) {
      return res.status(409).json({ error: 'Não foi possível confirmar a emissão do certificado. Tente novamente.' });
    }

    return res.json({
      verified: true,
      code: issuedUser.certificateCode,
      studentName: issuedUser.certificateStudentName || issuedUser.name,
      completedCount: issuedUser.certificateCompletedCount ?? new Set(issuedUser.completedIds.filter(isKnownChallengeId)).size,
      xp: issuedUser.certificateXp ?? issuedUser.xp,
      issuedAt: issuedUser.certificateIssuedAt,
      githubUrl: issuedUser.certificateGithubUrl ?? issuedUser.githubUrl,
      liveUrl: issuedUser.certificateLiveUrl ?? issuedUser.liveUrl
    });
  } catch {
    return res.status(500).json({ error: 'Erro ao emitir certificado.' });
  }
});

// Rota pública para recrutadores validarem certificados via link ou QR Code
app.get('/api/certificates/:code', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
}, certificateLookupLimiter, async (req, res) => {
  try {
    const code = normalizeCertificateLookupCode(req.params.code);
    if (!code) return res.status(400).json({ valid: false, error: 'Código de certificado inválido.' });
    const result = await lookupPublicCertificate(User, code);
    return res.status(result.status).json(result.body);
  } catch {
    return res.status(500).json({ valid: false, error: 'Erro ao consultar certificado.' });
  }
});

// Ranking Top 15 da Comunidade
app.get('/api/leaderboard', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
}, publicReadLimiter, async (req, res) => {
  try {
    const topUsers = await User.find({
      'privacyPreferences.showInLeaderboard': { $ne: false },
      xp: { $type: 'number', $gte: 0 }
    })
      .sort({ xp: -1, streak: -1, _id: 1 })
      .limit(15)
      .select('name avatar xp streak completedIds')
      .lean();

    const leaderboard = buildLeaderboard(topUsers);

    return res.json({ leaderboard });
  } catch {
    return res.status(500).json({ error: 'Não foi possível carregar o ranking.' });
  }
});

// Tutor IA Contextual (Analisa código e enunciado da aula sem entregar a resposta pronta)
app.post('/api/tutor/analyze', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
}, tutorLimiter, (req, res) => {
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
app.get('/api/lessons/:lessonId/comments', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
}, publicReadLimiter, async (req, res) => {
  try {
    const lessonId = typeof req.params.lessonId === 'string' ? req.params.lessonId.trim() : '';
    if (!isPublicLessonLookupAllowed(lessonId)) {
      return res.status(400).json({ error: 'Identificador de aula inválido.' });
    }
    const docs = await Comment.find({ lessonId })
      .select('_id author badge text createdAt')
      .sort({ createdAt: -1, _id: -1 })
      .limit(50)
      .lean();
    const comments = docs.map((d) => ({
      id: d._id.toString(),
      author: d.author,
      badge: d.badge || 'Aluno NexusDev',
      time: new Date(d.createdAt).toLocaleDateString('pt-BR'),
      text: d.text
    }));
    return res.json({ comments });
  } catch {
    return res.status(500).json({ error: 'Não foi possível carregar os comentários.' });
  }
});

app.post('/api/lessons/:lessonId/comments', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
}, requireAuth, commentLimiter, async (req, res) => {
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
    // Ensure TTL and ownership indexes exist before accepting authenticated traffic.
    await Promise.all([Session.init(), RefreshToken.init(), CompletionProof.init()]);
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