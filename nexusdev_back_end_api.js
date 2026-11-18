// ============================================================================
// NEXUSDEV BACK-END API — SERVIDOR COMPLETO PRONTO PARA PRODUÇÃO (RENDER/RAILWAY)
// ============================================================================

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');

const app = express();

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET || 'nexusdev-super-secret-key-2026';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const FRONTEND_URL = process.env.FRONTEND_URL || '*';

const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

app.use(helmet());
app.use(
  cors({
    origin: FRONTEND_URL === '*' ? '*' : [FRONTEND_URL, 'http://localhost:5173'],
    credentials: true
  })
);
app.use(express.json({ limit: '2mb' }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { error: 'Muitas requisições. Tente novamente mais tarde.' }
});
app.use('/api/', apiLimiter);

if (!MONGO_URI) {
  console.warn('⚠️ AVISO: MONGO_URI não definida nas variáveis de ambiente.');
} else {
  mongoose
    .connect(MONGO_URI)
    .then(() => console.log('✅ Conectado com sucesso ao MongoDB Atlas'))
    .catch((err) => console.error('❌ Erro ao conectar ao MongoDB:', err.message));
}

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    avatar: { type: String, default: '' },
    googleId: { type: String, default: '' },
    role: { type: String, enum: ['student', 'admin'], default: 'student' },
    xp: { type: Number, default: 0 },
    streak: { type: Number, default: 1 },
    lastActiveDate: { type: String, default: () => new Date().toISOString().slice(0, 10) },
    completedIds: { type: [String], default: [] },
    savedCodeMap: { type: mongoose.Schema.Types.Mixed, default: {} },
    certificateCode: { type: String, unique: true, sparse: true }
  },
  { timestamps: true }
);

const User = mongoose.model('User', userSchema);

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

app.get('/api/health', (req, res) => {
  res.json({ status: 'online', service: 'NexusDev API', timestamp: new Date().toISOString() });
});

app.post('/api/auth/google', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential || !googleClient) {
      return res.status(400).json({ error: 'Credencial inválida ou Google Client ID não configurado.' });
    }

    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

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
      const today = new Date().toISOString().slice(0, 10);
      if (user.lastActiveDate !== today) {
        user.streak += 1;
        user.lastActiveDate = today;
      }
      if (picture) user.avatar = picture;
      if (!user.googleId) user.googleId = googleId;
      await user.save();
    }

    const token = signUserToken(user);

    return res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        xp: user.xp,
        streak: user.streak,
        completedIds: user.completedIds,
        savedCodeMap: user.savedCodeMap,
        certificateCode: user.certificateCode
      }
    });
  } catch (err) {
    return res.status(401).json({ error: 'Falha ao validar conta Google.' });
  }
});

app.get('/api/me', requireAuth, async (req, res) => {
  const user = req.user;
  res.json({
    id: user._id,
    name: user.name,
    email: user.email,
    avatar: user.avatar,
    xp: user.xp,
    streak: user.streak,
    completedIds: user.completedIds,
    savedCodeMap: user.savedCodeMap,
    certificateCode: user.certificateCode
  });
});

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

app.listen(PORT, () => {
  console.log(`🚀 Servidor NexusDev rodando na porta ${PORT}`);
});