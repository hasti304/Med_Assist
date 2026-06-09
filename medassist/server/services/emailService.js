const nodemailer = require('nodemailer');

/**
 * Send an email.
 *
 * Priority:
 *  1. Gmail OAuth2    — HTTPS API, works on Render, sends to ANY recipient
 *  2. Brevo HTTP API  — fallback HTTP API
 *  3. Resend HTTP API — fallback (free tier restricted to account owner email)
 *  4. Gmail SMTP      — local dev only (Render blocks outbound port 587)
 */
async function sendEmail({ to, subject, html }) {
  // ── 1. Gmail REST API via OAuth2 (pure HTTPS port 443 — Render never blocks this)
  if (process.env.GMAIL_REFRESH_TOKEN) {
    // Direct fetch — no google-auth-library to avoid malformed-request issues
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: process.env.GMAIL_REFRESH_TOKEN,
        grant_type: 'refresh_token',
      }).toString(),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      throw new Error(`Gmail token refresh failed: ${tokenData.error} — ${tokenData.error_description}`);
    }
    const accessToken = tokenData.access_token;

    const encodedSubject = `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;
    const raw = Buffer.from(
      `From: MedAssist AI <${process.env.SMTP_USER}>\r\n` +
      `To: ${to}\r\n` +
      `Subject: ${encodedSubject}\r\n` +
      `MIME-Version: 1.0\r\n` +
      `Content-Type: text/html; charset=utf-8\r\n\r\n` +
      html
    ).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Gmail send failed: ${data.error?.message || JSON.stringify(data)}`);
    console.log(`[emailService] Sent via Gmail API to ${to}: ${data.id}`);
    return data;
  }

  // ── 2. Brevo HTTP API ───────────────────────────────────────────────────────
  if (process.env.BREVO_API_KEY) {
    const senderEmail = process.env.SMTP_USER || 'siddharthbhamare01@gmail.com';
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'MedAssist AI', email: senderEmail },
        to: [{ email: to }],
        subject,
        htmlContent: html,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || JSON.stringify(data));
    console.log(`[emailService] Sent via Brevo to ${to}: ${data.messageId}`);
    return data;
  }

  // ── 3. Resend (free tier: only delivers to account owner email) ─────────────
  if (process.env.RESEND_API_KEY) {
    const actualTo = process.env.RESEND_TO_OVERRIDE || to;
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'MedAssist AI <onboarding@resend.dev>',
        to: [actualTo],
        subject,
        html,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || JSON.stringify(data));
    console.log(`[emailService] Sent via Resend to ${actualTo}: ${data.id}`);
    return data;
  }

  // ── 4. Gmail SMTP (local dev only — blocked on Render) ─────────────────────
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    const info = await transporter.sendMail({
      from: `"MedAssist AI" <${process.env.SMTP_USER}>`,
      to, subject, html,
    });
    console.log(`[emailService] Sent via Gmail to ${to}: ${info.messageId}`);
    return info;
  }

  console.log(`[emailService] No provider configured. To: ${to} | Subject: ${subject}`);
  return { dev: true };
}

async function sendAnalysisComplete(email, sessionId) {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  return sendEmail({
    to: email,
    subject: 'Your MedAssist AI Analysis is Ready',
    html: `
      <h2>Your Blood Report Analysis is Complete</h2>
      <p>Your MedAssist AI analysis for session <strong>${sessionId}</strong> is now ready.</p>
      <p><a href="${clientUrl}/patient/results/${sessionId}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none;">View Results</a></p>
      <p style="color:#666;font-size:12px;">MedAssist AI &mdash; Your AI Health Assistant</p>
    `,
  });
}

async function sendReportShared(email, shareToken) {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  return sendEmail({
    to: email,
    subject: 'A Patient Has Shared a Report With You',
    html: `
      <h2>New Shared Report</h2>
      <p>A patient has shared their MedAssist AI report with you.</p>
      <p><a href="${clientUrl}/shared/${shareToken}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none;">View Report</a></p>
      <p style="color:#666;font-size:12px;">MedAssist AI &mdash; Your AI Health Assistant</p>
    `,
  });
}

async function sendFollowUpReminder(email, patientName, message) {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  return sendEmail({
    to: email,
    subject: 'MedAssist AI — Blood Test Recheck Reminder',
    html: `
      <h2>Time to Recheck Your Blood Tests</h2>
      <p>Hi ${patientName},</p>
      <p>${message}</p>
      <p>Upload your latest report for an updated AI analysis.</p>
      <p><a href="${clientUrl}/patient/upload-report" style="display:inline-block;padding:12px 24px;background:#0d9488;color:#fff;border-radius:6px;text-decoration:none;">Upload Report</a></p>
      <p style="color:#666;font-size:12px;">MedAssist AI &mdash; Your AI Health Assistant</p>
    `,
  });
}

async function sendWelcomeEmail(email, fullName) {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  return sendEmail({
    to: email,
    subject: 'Welcome to MedAssist AI',
    html: `
      <h2>Welcome to MedAssist AI, ${fullName || 'there'}!</h2>
      <p>Your account has been created successfully via Google Sign-In.</p>
      <p>You can now upload blood reports, get AI-powered health insights, find doctors, and track your health over time.</p>
      <p><a href="${clientUrl}/patient/intake" style="display:inline-block;padding:12px 24px;background:#0d9488;color:#fff;border-radius:6px;text-decoration:none;">Get Started</a></p>
      <p style="color:#666;font-size:12px;">MedAssist AI &mdash; Your AI Health Assistant</p>
    `,
  });
}

module.exports = { sendEmail, sendAnalysisComplete, sendReportShared, sendFollowUpReminder, sendWelcomeEmail };
