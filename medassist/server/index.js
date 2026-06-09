require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();

// Trust Render's (and any reverse proxy's) X-Forwarded-For header so
// express-rate-limit can identify real client IPs correctly.
app.set('trust proxy', 1);

// CORS — allow dev server + production frontend URL
const ALLOWED_ORIGINS = [
  process.env.CLIENT_URL,
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5176',
].filter(Boolean);

const isDev = process.env.NODE_ENV !== 'production';

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // Vite may use any localhost port in development
  if (isDev && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  return false;
}

app.use(cors({
  origin: (origin, cb) => {
    if (isAllowedOrigin(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Rate limiting for agent routes (agents make multiple API calls per request)
// GET requests (result polling, fetching stored reports) are database reads — skip them
const agentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  skip: (req) => req.method === 'GET',
  message: { error: 'Too many requests to AI agent. Please wait a moment.' }
});

// Auth rate limiting — prevent brute force and email spam
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 20,                    // 20 auth attempts per 15 min per IP
  message: { error: 'Too many attempts. Please try again in 15 minutes.' },
  skipSuccessfulRequests: true,
});
const emailLimiter = rateLimit({
  windowMs: 60 * 1000,        // 1 minute
  max: 3,                     // max 3 verification/reset emails per minute
  message: { error: 'Too many email requests. Please wait a minute.' },
});

// Routes
app.use('/api/auth', authLimiter, require('./routes/auth'));
app.use('/api/auth/resend-verification', emailLimiter);
app.use('/api/auth/forgot-password', emailLimiter);
app.use('/api/doctors', require('./routes/doctors'));
app.use('/api/patient', require('./routes/patient'));
const verifyToken = require('./middleware/auth');
const requireDoctor = require('./middleware/requireDoctor');
app.use('/api/doctor', verifyToken, requireDoctor, require('./routes/doctor'));
app.use('/api/disease', agentLimiter, require('./routes/disease'));
app.use('/api/blood-report', agentLimiter, require('./routes/bloodReport'));
app.use('/api/agent', require('./routes/agentStatus'));
app.use('/api/admin', require('./routes/admin'));
// PIN brute-force protection — 10 attempts per 15 min per IP
const pinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many PIN attempts. Please try again in 15 minutes.' },
  skipSuccessfulRequests: true,
});
app.use('/api/shared', pinLimiter, require('./routes/shared'));
app.use('/api/voice',  require('./routes/voice'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log(`MedAssist server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);

  // Run DB migrations for Phase 3 tables
  try {
    const migrate = require('./db/migrate');
    await migrate();
  } catch (err) {
    console.error('[startup] Migration failed:', err.message);
  }

  // Start background email reminder loop
  try {
    const { startReminderLoop } = require('./services/reminderService');
    startReminderLoop();
  } catch (err) {
    console.error('[startup] Reminder loop failed to start:', err.message);
  }
});
