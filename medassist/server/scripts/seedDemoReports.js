'use strict';

// Load .env from server root before anything else
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const pool = require('../db/pool');

// ── CONFIG ────────────────────────────────────────────────────────────────────
const EMAIL    = 'siddharthbhamare03@gmail.com';
const PASSWORD = 'Sid@12345';
const API_BASE = 'https://medassist-backend-1rne.onrender.com/api';

const REPORTS = [
  {
    pdf:   path.resolve(__dirname, '../../../Blood_History_Visit1_Worst.pdf'),
    date:  '2026-02-03 10:00:00',
    label: 'Visit 1 — Worst',
  },
  {
    pdf:   path.resolve(__dirname, '../../../Blood_History_Visit2_Improving.pdf'),
    date:  '2026-03-03 10:00:00',
    label: 'Visit 2 — Improving',
  },
  {
    pdf:   path.resolve(__dirname, '../../../Blood_History_Visit3_Best.pdf'),
    date:  '2026-04-03 10:00:00',
    label: 'Visit 3 — Best',
  },
];
// ─────────────────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // Step 1 — Login
  console.log('Logging in as', EMAIL, '...');
  const { data: authData } = await axios.post(`${API_BASE}/auth/login`, {
    email: EMAIL,
    password: PASSWORD,
  });
  const token = authData.token;
  if (!token) throw new Error('Login failed — no token in response');
  console.log('Login successful.\n');

  const reportIds = [];

  // Step 2 — Upload each PDF + trigger analysis
  for (let i = 0; i < REPORTS.length; i++) {
    const { pdf, label } = REPORTS[i];
    console.log(`[${i + 1}/${REPORTS.length}] Uploading ${label}...`);

    if (!fs.existsSync(pdf)) {
      throw new Error(`PDF not found: ${pdf}`);
    }

    const form = new FormData();
    form.append('report', fs.createReadStream(pdf), {
      filename: path.basename(pdf),
      contentType: 'application/pdf',
    });

    const { data: uploadData } = await axios.post(
      `${API_BASE}/blood-report/upload`,
      form,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          ...form.getHeaders(),
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      }
    );

    const reportId = uploadData.reportId;
    if (!reportId) throw new Error(`Upload failed for ${label} — no reportId`);
    console.log(`  reportId: ${reportId}  (${uploadData.count} parameters extracted)`);
    reportIds.push(reportId);

    // Trigger analysis (fire-and-forget — agent runs in background)
    axios
      .post(
        `${API_BASE}/blood-report/analyze`,
        { reportId },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      .then(() => console.log(`  Analysis triggered for ${label}`))
      .catch((e) => console.warn(`  Analysis trigger warning: ${e.message}`));

    if (i < REPORTS.length - 1) {
      console.log('  Waiting 3s before next upload...');
      await sleep(3000);
    }
  }

  // Step 3 — Backdate created_at timestamps
  console.log('\nBackdating timestamps...');
  for (let i = 0; i < REPORTS.length; i++) {
    const { date, label } = REPORTS[i];
    await pool.query(
      'UPDATE blood_reports SET created_at = $1 WHERE id = $2',
      [date, reportIds[i]]
    );
    console.log(`  ${label} → ${date}`);
  }

  console.log('\nAll done!');
  console.log('→ Open Report History — you should see 3 reports with monthly timestamps.');
  console.log('→ Analysis runs in the background. Wait ~30 seconds then refresh.');

  await pool.end();
}

main().catch((err) => {
  console.error('\nSeed script failed:', err.response?.data || err.message);
  pool.end();
  process.exit(1);
});
