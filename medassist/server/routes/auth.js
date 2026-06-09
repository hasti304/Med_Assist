const router = require('express').Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const { OAuth2Client } = require('google-auth-library');
const { findByEmail, createUser } = require('../models/User');
const pool = require('../db/pool');
const verifyToken = require('../middleware/auth');
const { sendEmail, sendWelcomeEmail } = require('../services/emailService');

async function sendVerificationEmail(userId, email) {
  const token = crypto.randomBytes(32).toString('hex');
  await pool.query(
    `INSERT INTO email_verification_tokens (user_id, token, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '24 hours')`,
    [userId, token]
  );
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const verifyLink = `${clientUrl}/auth/verify-email?token=${token}`;
  const result = await sendEmail({
    to: email,
    subject: 'MedAssist AI — Verify your email',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 0">
        <div style="text-align:center;margin-bottom:24px">
          <div style="display:inline-block;width:56px;height:56px;background:#0d9488;border-radius:16px;line-height:56px;font-size:28px">🏥</div>
        </div>
        <h2 style="color:#0f172a;margin:0 0 8px">Welcome to MedAssist AI</h2>
        <p style="color:#475569;margin:0 0 24px">Please verify your email address to activate your account. This link expires in <strong>24 hours</strong>.</p>
        <p style="text-align:center;margin:28px 0">
          <a href="${verifyLink}" style="display:inline-block;padding:14px 32px;background:#0d9488;color:#fff;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;">Verify Email Address</a>
        </p>
        <p style="color:#94a3b8;font-size:12px;text-align:center">If you didn't create a MedAssist AI account, you can safely ignore this email.</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/>
        <p style="color:#cbd5e1;font-size:11px;text-align:center">MedAssist AI</p>
      </div>
    `,
  });
  return { token, devLink: result?.dev ? verifyLink : null };
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const {
    email, password, role, fullName,
    specialization, hospitalName, city, state, phone,
  } = req.body;

  if (!email || !password || !role || !fullName) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  if (!['patient', 'doctor'].includes(role)) {
    return res.status(400).json({ error: 'Role must be patient or doctor' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  if (role === 'doctor' && (!specialization || !hospitalName || !city)) {
    return res.status(400).json({
      error: 'Doctor registration requires specialization, hospital name, and city',
    });
  }

  try {
    const existing = await findByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await createUser({ email, passwordHash, role, fullName });

    if (role === 'doctor') {
      await pool.query(
        `INSERT INTO doctor_profiles
           (user_id, specialization, hospital_name, city, state, phone, available)
         VALUES ($1, $2, $3, $4, $5, $6, TRUE)
         ON CONFLICT (user_id) DO NOTHING`,
        [user.id, specialization, hospitalName, city, state || null, phone || null]
      );
    } else {
      await pool.query(
        'INSERT INTO patient_profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING',
        [user.id]
      );
    }

    const { devLink } = await sendVerificationEmail(user.id, email);

    res.status(201).json({
      requiresVerification: true,
      email,
      ...(devLink && { devLink }),
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const user = await findByEmail(email);
    if (!user) {
      return res.status(404).json({ error: 'No account found with this email address.', notFound: true });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Incorrect password. Please try again.' });
    }

    if (!user.email_verified) {
      return res.status(403).json({ error: 'Please verify your email before signing in.', unverified: true, email });
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role, name: user.full_name, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: { id: user.id, email: user.email, role: user.role, name: user.full_name },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// GET /api/auth/verify-email?token=xxx — click link from email
router.get('/verify-email', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Token is required' });

  try {
    const { rows } = await pool.query(
      `SELECT * FROM email_verification_tokens
       WHERE token = $1 AND used = false AND expires_at > NOW()`,
      [token]
    );

    if (!rows.length) {
      return res.status(400).json({ error: 'Invalid or expired verification link' });
    }

    const { user_id } = rows[0];
    await pool.query('UPDATE users SET email_verified = true WHERE id = $1', [user_id]);
    await pool.query('UPDATE email_verification_tokens SET used = true WHERE token = $1', [token]);

    const { rows: userRows } = await pool.query(
      'SELECT id, email, role, full_name FROM users WHERE id = $1',
      [user_id]
    );
    const user = userRows[0];

    const jwtToken = jwt.sign(
      { userId: user.id, role: user.role, name: user.full_name, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token: jwtToken,
      user: { id: user.id, email: user.email, role: user.role, name: user.full_name },
    });
  } catch (err) {
    console.error('Email verify error:', err);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// POST /api/auth/resend-verification
router.post('/resend-verification', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  try {
    const user = await findByEmail(email);
    if (!user || user.email_verified) {
      return res.json({ message: 'If that email exists and is unverified, a new link has been sent.' });
    }

    await pool.query(
      'UPDATE email_verification_tokens SET used = true WHERE user_id = $1 AND used = false',
      [user.id]
    );

    const { devLink } = await sendVerificationEmail(user.id, email);

    res.json({
      message: 'Verification email resent.',
      ...(devLink && { devLink }),
    });
  } catch (err) {
    console.error('Resend verification error:', err);
    res.status(500).json({ error: 'Failed to resend verification email' });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    const user = await findByEmail(email);
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');

      await pool.query(
        `INSERT INTO password_reset_tokens (user_id, token, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
        [user.id, token]
      );

      const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
      const resetLink = `${clientUrl}/reset-password?token=${token}`;

      const emailResult = await sendEmail({
        to: email,
        subject: 'MedAssist AI — Password Reset',
        html: `
          <h2>Password Reset Request</h2>
          <p>Click the link below to reset your password. This link expires in 1 hour.</p>
          <p><a href="${resetLink}" style="display:inline-block;padding:12px 24px;background:#0d9488;color:#fff;border-radius:8px;text-decoration:none;">Reset Password</a></p>
          <p style="color:#666;font-size:12px;">If you did not request this, ignore this email.</p>
        `,
      });

      if (emailResult?.dev) {
        return res.json({
          message: 'Reset link generated (dev mode — no SMTP configured)',
          resetLink,
        });
      }
    }

    res.json({ message: 'If that email is registered, a reset link has been sent.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;

  if (!token || !password) {
    return res.status(400).json({ error: 'Token and new password are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT * FROM password_reset_tokens
       WHERE token = $1 AND used = false AND expires_at > NOW()`,
      [token]
    );

    if (!rows.length) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const resetToken = rows[0];
    const passwordHash = await bcrypt.hash(password, 12);

    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, resetToken.user_id]);
    await pool.query('UPDATE password_reset_tokens SET used = true WHERE id = $1', [resetToken.id]);

    // Fetch email to send confirmation — fire-and-forget, don't block the response
    pool.query('SELECT email, full_name FROM users WHERE id = $1', [resetToken.user_id])
      .then(({ rows }) => {
        if (!rows.length) return;
        const { email, full_name } = rows[0];
        sendEmail({
          to: email,
          subject: 'MedAssist AI — Your password was changed',
          html: `
            <h2>Password Changed Successfully</h2>
            <p>Hi ${full_name || 'there'},</p>
            <p>Your MedAssist AI account password was just reset successfully.</p>
            <p>If you made this change, no action is needed.</p>
            <p style="color:#dc2626;font-weight:bold;">If you did NOT request this change, your account may be compromised. Please contact support immediately or use "Forgot Password" to secure your account.</p>
            <p style="color:#666;font-size:12px;margin-top:24px;">— MedAssist AI Team</p>
          `,
        }).catch((e) => console.warn('[auth] Password change email failed:', e.message));
      })
      .catch(() => {});

    res.json({ message: 'Password has been reset successfully' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// POST /api/auth/2fa/setup
router.post('/2fa/setup', verifyToken, async (req, res) => {
  try {
    const secret = speakeasy.generateSecret({
      name: `MedAssist AI (${req.user.name || 'User'})`,
      issuer: 'MedAssist AI',
    });

    await pool.query('UPDATE users SET totp_secret = $1 WHERE id = $2', [secret.base32, req.user.userId]);

    const qrDataUrl = await QRCode.toDataURL(secret.otpauth_url);

    res.json({ secret: secret.base32, otpauth_url: secret.otpauth_url, qr: qrDataUrl });
  } catch (err) {
    console.error('2FA setup error:', err);
    res.status(500).json({ error: 'Failed to set up 2FA' });
  }
});

// POST /api/auth/2fa/verify
router.post('/2fa/verify', verifyToken, async (req, res) => {
  const { token: totpToken } = req.body;
  if (!totpToken) return res.status(400).json({ error: 'TOTP token is required' });

  try {
    const { rows } = await pool.query('SELECT totp_secret FROM users WHERE id = $1', [req.user.userId]);

    if (!rows.length || !rows[0].totp_secret) {
      return res.status(400).json({ error: '2FA not set up yet. Call /2fa/setup first.' });
    }

    const verified = speakeasy.totp.verify({
      secret: rows[0].totp_secret,
      encoding: 'base32',
      token: totpToken,
      window: 1,
    });

    if (!verified) return res.status(400).json({ error: 'Invalid TOTP token' });

    await pool.query('UPDATE users SET totp_enabled = true WHERE id = $1', [req.user.userId]);

    res.json({ message: '2FA enabled successfully' });
  } catch (err) {
    console.error('2FA verify error:', err);
    res.status(500).json({ error: 'Failed to verify 2FA token' });
  }
});

// POST /api/auth/2fa/validate
router.post('/2fa/validate', async (req, res) => {
  const { email, password, token: totpToken } = req.body;

  if (!email || !password || !totpToken) {
    return res.status(400).json({ error: 'Email, password, and TOTP token are required' });
  }

  try {
    const user = await findByEmail(email);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    if (!user.totp_enabled || !user.totp_secret) {
      return res.status(400).json({ error: '2FA is not enabled for this account' });
    }

    const verified = speakeasy.totp.verify({
      secret: user.totp_secret,
      encoding: 'base32',
      token: totpToken,
      window: 1,
    });

    if (!verified) return res.status(401).json({ error: 'Invalid TOTP token' });

    const jwtToken = jwt.sign(
      { userId: user.id, role: user.role, name: user.full_name, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token: jwtToken,
      user: { id: user.id, email: user.email, role: user.role, name: user.full_name },
    });
  } catch (err) {
    console.error('2FA validate error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/google — sign in or register via Google OAuth
router.post('/google', async (req, res) => {
  const { credential, role } = req.body;
  if (!credential) return res.status(400).json({ error: 'Google credential required' });

  try {
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const { email, name } = ticket.getPayload();

    let user = await findByEmail(email);

    // Existing verified user — log in directly
    if (user && user.email_verified) {
      const token = jwt.sign(
        { userId: user.id, role: user.role, name: user.full_name, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );
      return res.json({
        token,
        user: { id: user.id, email: user.email, role: user.role, name: user.full_name },
      });
    }

    // Existing unverified user — resend verification
    if (user && !user.email_verified) {
      await pool.query(
        'UPDATE email_verification_tokens SET used = true WHERE user_id = $1 AND used = false',
        [user.id]
      );
      const { devLink } = await sendVerificationEmail(user.id, email);
      return res.json({
        requiresVerification: true,
        email,
        ...(devLink && { devLink }),
      });
    }

    // New Google user — email already verified by Google, log in directly
    user = await createUser({ email, passwordHash: 'OAUTH_GOOGLE', role: 'patient', fullName: name });
    await pool.query(
      'INSERT INTO patient_profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING',
      [user.id]
    );
    await pool.query('UPDATE users SET email_verified = true WHERE id = $1', [user.id]);

    // Welcome email — fire-and-forget
    sendWelcomeEmail(email, name).catch(e => console.warn('[auth] Welcome email failed:', e.message));

    const token = jwt.sign(
      { userId: user.id, role: user.role, name: user.full_name, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    return res.json({
      token,
      user: { id: user.id, email: user.email, role: user.role, name: user.full_name },
    });
  } catch (err) {
    console.error('Google auth error:', err);
    res.status(401).json({ error: 'Google authentication failed' });
  }
});

module.exports = router;
