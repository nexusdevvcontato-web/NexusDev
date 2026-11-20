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
const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');

const app = express();

const config = require('./src/config');
const { PORT, MONGO_URI, JWT_SECRET, GOOGLE_CLIENT_ID, ALLOWED_ORIGINS } = config;

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
    role: { type: String, enum: ['student', 'admin'], default: 'student' },
    xp: { type: Number, default: 0 },
    streak: { type: Number, default: 1 },
    lastActiveDate: { type: String, default: () => new Date().toISOString().slice(0, 10) },
    completedIds: { type: [String], default: [] },
    savedCodeMap: { type: mongoose.Schema.Types.Mixed, default: {} },
    certificateCode: { type: String, unique: true, sparse: true },
    certificateIssuedAt: { type: Date, default: null },
    githubUrl: { type: String, default: '' },
    liveUrl: { type: String, default: '' }
  },
  { timestamps: true }
);

const User = mongoose.model('User', userSchema);

const commentSchema = new mongoose.Schema(
  {
    lessonId: { type: String, required: true, index: true },
    author: { type: String, required: true, trim: true },
    badge: { type: String, default: 'Aluno NexusDev' },
    text: { type: String, required: true, trim: true, maxlength: 1000 }
  },
  { timestamps: true }
);

const Comment = mongoose.model('Comment', commentSchema);

function generateCertificateCode(name, completedCount) {
  const cleanName = (name || 'ALUNO').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `NXD-2026-${cleanName || 'DEV'}-${String(completedCount).padStart(3, '0')}-${randomSuffix}`;
}

function signUserToken(user) {
  return jwt.sign(
    { id: user._id.toString(), email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '30d' }
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
    createdAt: user.createdAt
  };
}

async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token de autenticação ausente.' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) return res.status(401).json({ error: 'Usuário não encontrado.' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
  }
}

// ============================================================================
// ROTAS DE SAÚDE E AUTENTICAÇÃO (E-MAIL/SENHA + GOOGLE OAUTH)
// ============================================================================
app.get('/api/health', (req, res) => {
  res.json({ status: 'online', service: 'NexusDev API v2.0', timestamp: new Date().toISOString() });
});

app.post('/api/auth/register', authLimiter, async (req, res) => {
  try {
    const { name, email, password } = req.body;
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
    if (user.lastActiveDate !== today) {
      user.streak += 1;
      user.lastActiveDate = today;
      await user.save();
    }

    const token = signUserToken(user);
    return res.json({ token, user: formatUserResponse(user) });
  } catch {
    return res.status(500).json({ error: 'Erro ao realizar login.' });
  }
});

app.post('/api/auth/google', authLimiter, async (req, res) => {
  try {
    const { credential } = req.body;
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
      const today = new Date().toISOString().slice(0, 10);
      if (user.lastActiveDate !== today) {
        user.streak += 1;
        user.lastActiveDate = today;
      }
      if (picture) user.avatar = picture;
      await user.save();
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

// ============================================================================
// PROGRESSO, RANKING SEMANAL, CERTIFICADOS PÚBLICOS E TUTOR IA CONTEXTUAL
// ============================================================================
app.post('/api/progress/complete', requireAuth, async (req, res) => {
  try {
    const { challengeId, files } = req.body;
    if (!challengeId) return res.status(400).json({ error: 'challengeId obrigatório.' });

    const user = req.user;

    if (files && typeof files === 'object') {
      user.savedCodeMap = { ...(user.savedCodeMap || {}), [challengeId]: files };
    }

    if (!user.completedIds.includes(challengeId)) {
      user.completedIds.push(challengeId);
      user.xp += 50;
    }

    const today = new Date().toISOString().slice(0, 10);
    if (user.lastActiveDate !== today) {
      user.streak += 1;
      user.lastActiveDate = today;
    }

    if (!user.certificateCode) {
      user.certificateCode = generateCertificateCode(user.name, user.completedIds.length);
    }

    await user.save();

    return res.json({
      xp: user.xp,
      streak: user.streak,
      completedIds: user.completedIds,
      certificateCode: user.certificateCode
    });
  } catch {
    return res.status(500).json({ error: 'Erro ao salvar progresso.' });
  }
});

app.post('/api/certificates/issue', requireAuth, async (req, res) => {
  try {
    const { studentName, githubUrl, liveUrl } = req.body;
    const user = req.user;

    if (studentName && studentName.trim()) {
      user.name = studentName.trim();
    }
    if (githubUrl) user.githubUrl = githubUrl.trim();
    if (liveUrl) user.liveUrl = liveUrl.trim();
    if (!user.certificateCode) {
      user.certificateCode = generateCertificateCode(user.name, user.completedIds.length);
    }
    user.certificateIssuedAt = new Date();
    await user.save();

    return res.json({
      verified: true,
      code: user.certificateCode,
      studentName: user.name,
      completedCount: user.completedIds.length,
      xp: user.xp,
      issuedAt: user.certificateIssuedAt,
      githubUrl: user.githubUrl,
      liveUrl: user.liveUrl
    });
  } catch {
    return res.status(500).json({ error: 'Erro ao emitir certificado.' });
  }
});

// Rota pública para recrutadores validarem certificados via link ou QR Code
app.get('/api/certificates/:code', async (req, res) => {
  try {
    const code = req.params.code.trim().toUpperCase();
    const user = await User.findOne({ certificateCode: code });
    if (!user) {
      return res.status(404).json({ valid: false, error: 'Código de certificado não encontrado.' });
    }
    return res.json({
      valid: true,
      code: user.certificateCode,
      studentName: user.name,
      completedCount: user.completedIds.length,
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
app.get('/api/leaderboard', async (req, res) => {
  try {
    const topUsers = await User.find({})
      .sort({ xp: -1, streak: -1 })
      .limit(15)
      .select('name avatar xp streak completedIds');

    const leaderboard = topUsers.map((u, idx) => ({
      rank: idx + 1,
      name: u.name,
      avatar: u.avatar,
      xp: u.xp || 0,
      streak: u.streak || 1,
      completedCount: Array.isArray(u.completedIds) ? u.completedIds.length : 0
    }));

    return res.json({ leaderboard });
  } catch {
    return res.json({ leaderboard: [] });
  }
});

// Tutor IA Contextual (Analisa código e enunciado da aula sem entregar a resposta pronta)
app.post('/api/tutor/analyze', (req, res) => {
  const { challengeTitle, language, targetFunction, instructions, filesMap, failedTests } = req.body || {};
  const tips = [];
  const allCode = Object.values(filesMap || {}).join('\n');

  if (!allCode.trim()) {
    return res.json({
      tips: ['O editor está vazio. Comece escrevendo a estrutura pedida nas instruções à esquerda.']
    });
  }

  const openBraces = (allCode.match(/\{/g) || []).length;
  const closeBraces = (allCode.match(/\}/g) || []).length;
  if (openBraces !== closeBraces) {
    tips.push(`Chaves desbalanceadas: você abriu ${openBraces} "{" e fechou ${closeBraces} "}".`);
  }

  if (language === 'html') {
    const html = filesMap['index.html'] || '';
    const css = filesMap['style.css'] || '';
    if (instructions?.includes('<h1>') && !/<h1\b/i.test(html)) {
      tips.push('Inclua uma tag de título principal <h1>...</h1> dentro do index.html.');
    }
    if (instructions?.includes('display: flex') && !/display\s*:\s*flex/i.test(css)) {
      tips.push('Abra a aba "style.css" e adicione "display: flex;" no seletor solicitado.');
    }
    if (instructions?.includes('display: grid') && !/display\s*:\s*grid/i.test(css)) {
      tips.push('Abra a aba "style.css" e ative "display: grid;" no contêiner.');
    }
  } else {
    if (targetFunction && !allCode.includes(targetFunction)) {
      tips.push(`Mantenha o nome exato da função "${targetFunction}" definida no desafio.`);
    }
    if (!/\breturn\b/.test(allCode) && !allCode.includes('res.status')) {
      tips.push('Sua função precisa retornar um resultado usando a palavra-chave "return".');
    }
  }

  if (Array.isArray(failedTests) && failedTests.length > 0 && tips.length === 0) {
    tips.push(`Foco no critério "${failedTests[0].description}": ${failedTests[0].error}`);
  }

  if (tips.length === 0) {
    tips.push(
      `Excelente progresso na aula "${challengeTitle}"! Clique em "Verificar Código" para validar todos os testes.`
    );
  }

  return res.json({ tips });
});

// ============================================================================
// FÓRUM DA COMUNIDADE POR AULA (PERSISTIDO NO MONGODB)
// ============================================================================
app.get('/api/lessons/:lessonId/comments', async (req, res) => {
  try {
    const lessonId = String(req.params.lessonId || '').trim();
    const docs = await Comment.find({ lessonId }).sort({ createdAt: -1 }).limit(50);
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

app.post('/api/lessons/:lessonId/comments', requireAuth, async (req, res) => {
  try {
    const lessonId = String(req.params.lessonId || '').trim();
    const text = String(req.body?.text || '').trim();
    if (!lessonId || !text) {
      return res.status(400).json({ error: 'Escreva uma mensagem válida.' });
    }

    const created = await Comment.create({
      lessonId,
      author: req.user.name,
      badge: req.user.role === 'admin' ? 'Mentor NexusDev' : 'Aluno NexusDev',
      text: text.slice(0, 1000)
    });

    req.user.xp = (req.user.xp || 0) + 10;
    await req.user.save();

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