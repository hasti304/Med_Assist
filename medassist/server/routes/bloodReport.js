const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const verifyToken = require('../middleware/auth');
const upload = require('../middleware/upload');
const { extractBloodValuesFromImage } = require('../services/geminiService');
const { runBloodReportAgent } = require('../agents/bloodReportAgent');
const { getPatientProfile, updateSessionStatus } = require('../models/patientQueries');
const pool = require('../db/pool');
const { isAnalysisComplete } = require('../utils/analysisQuality');

// POST /api/blood-report/upload
// Step 1: upload file + OCR only → return extracted values immediately
router.post('/upload', verifyToken, upload.single('report'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const patientId = req.user.userId;
  const { sessionId } = req.body;
  const filePath = req.file.path;
  const mimeType = req.file.mimetype;
  const relativePath = req.file.originalname;

  try {
    const extractedValues = await extractBloodValuesFromImage(filePath, mimeType);

    // Delete the file immediately after OCR — Render's disk is ephemeral anyway
    fs.unlink(filePath, () => {});

    const { rows } = await pool.query(
      `INSERT INTO blood_reports
         (session_id, patient_id, image_path, extracted_values)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [sessionId || null, patientId, relativePath, JSON.stringify(extractedValues)]
    );

    // Advance session status if a sessionId was provided
    if (sessionId) {
      await updateSessionStatus(sessionId, 'report_uploaded').catch((e) =>
        console.warn('[bloodReport] Could not update session status:', e.message)
      );
    }

    return res.json({
      reportId: rows[0].id,
      extractedValues,
      count: extractedValues.length,
    });
  } catch (err) {
    console.error('Blood report upload error:', err);
    return res.status(500).json({ error: err.message || 'OCR extraction failed' });
  }
});

// POST /api/blood-report/analyze
// Step 2: run Blood Report Agent on previously uploaded report
router.post('/analyze', verifyToken, async (req, res) => {
  const { reportId } = req.body;
  if (!reportId) return res.status(400).json({ error: 'reportId is required' });

  try {
    // Fetch the saved blood report
    const { rows } = await pool.query(
      'SELECT * FROM blood_reports WHERE id = $1 AND patient_id = $2',
      [reportId, req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Report not found' });

    const report = rows[0];

    // If already analyzed, return cached result (don't re-run agents)
    // Pass { force: true } in body to bypass cache and re-analyze
    const forceReanalyze = req.body.force === true;
    const cached = report.analysis;
    const cachedTabs = report.tablet_recommendations;
    const analysisComplete = isAnalysisComplete(cached);
    const hasFullResult = !forceReanalyze && analysisComplete;

    if (hasFullResult) {
      console.log(`[bloodReport] Returning cached analysis for report ${reportId}`);
      return res.json({
        reportId,
        analysis: cached,
        tabletRecommendations: cachedTabs,
        doctorReferralNeeded: report.complexity_flag || false,
        riskScores: report.risk_scores || null,
        followUp: report.follow_up || null,
        cached: true,
        partial: false,
      });
    }

    if (forceReanalyze) {
      await pool.query(
        `UPDATE blood_reports
         SET analysis = NULL, risk_scores = NULL, follow_up = NULL, translations = NULL
         WHERE id = $1`,
        [reportId]
      ).catch((e) => console.warn('[bloodReport] Could not clear cache for re-analyze:', e.message));
    } else if (cached && !analysisComplete) {
      console.log(`[bloodReport] Partial analysis for ${reportId} — re-run allowed`);
    }

    const extractedValues = report.extracted_values || [];
    // patientProfile may be null for users who skipped profile setup — agent handles null safely
    const patientProfile = await getPatientProfile(req.user.userId).catch(() => null);

    // Capture closure values before sending response (req may be GC'd after res.json)
    const patientId = req.user.userId;
    const sessionId = report.session_id;

    // Fire-and-forget — analysis takes 60-120s, far beyond Render's request timeout.
    // Client polls GET /blood-report/:id until analysis appears in DB.
    runBloodReportAgent({ reportId, extractedValues, patientProfile: patientProfile || null })
      .then(async ({ tabletRecommendations, doctorReferralNeeded }) => {
        // Advance session status
        if (sessionId) {
          await updateSessionStatus(sessionId, 'analyzed').catch((e) =>
            console.warn('[bloodReport] Could not update session status:', e.message)
          );
        }
        // Auto-populate medication_logs from tablet recommendations
        if (tabletRecommendations?.length > 0) {
          try {
            for (const tab of tabletRecommendations) {
              const medName = tab.name || tab.generic_name;
              if (!medName) continue;
              const { rows: existing } = await pool.query(
                `SELECT id FROM medication_logs
                 WHERE patient_id = $1 AND medication_name = $2 AND report_id = $3`,
                [patientId, medName, reportId]
              );
              if (existing.length === 0) {
                await pool.query(
                  `INSERT INTO medication_logs (patient_id, medication_name, dose, report_id, active)
                   VALUES ($1, $2, $3, $4, true)`,
                  [patientId, medName, tab.dosage || tab.dose || null, reportId]
                );
              }
            }
            console.log(`[bloodReport] Auto-populated ${tabletRecommendations.length} medications`);
          } catch (medErr) {
            console.warn('[bloodReport] Could not auto-populate medications:', medErr.message);
          }
        }
        // Clear stale translations so the next language switch re-translates fresh content
        if (forceReanalyze) {
          await pool.query('UPDATE blood_reports SET translations = NULL WHERE id = $1', [reportId])
            .catch((e) => console.warn('[bloodReport] Could not clear translations cache:', e.message));
        }
      })
      .catch((err) => console.error('[bloodReport] Background analysis error:', err.message));

    // Respond immediately — client will poll GET /blood-report/:id every 5s
    return res.json({ reportId, status: 'processing' });
  } catch (err) {
    console.error('Blood report analysis error:', err);
    return res.status(500).json({ error: err.message || 'Blood Report Agent failed' });
  }
});

// POST /api/blood-report/risk-scores — run risk scoring agent, save to blood_reports.risk_scores
router.post('/risk-scores', verifyToken, async (req, res) => {
  const { reportId } = req.body;
  if (!reportId) return res.status(400).json({ error: 'reportId is required' });

  try {
    const { rows } = await pool.query(
      'SELECT * FROM blood_reports WHERE id = $1 AND patient_id = $2',
      [reportId, req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Report not found' });

    const report = rows[0];

    // Return cached result — no need to re-run the agent
    if (report.risk_scores) {
      console.log(`[bloodReport] Returning cached risk scores for report ${reportId}`);
      return res.json({ reportId, riskScores: report.risk_scores, cached: true });
    }

    const patientProfile = await getPatientProfile(req.user.userId).catch(() => null);

    const { runRiskScoringAgent } = require('../agents/riskScoringAgent');

    runRiskScoringAgent({
      extractedValues: report.extracted_values || [],
      patientProfile: patientProfile || null,
    })
      .then(async (riskScores) => {
        await pool.query(
          'UPDATE blood_reports SET risk_scores = $1 WHERE id = $2',
          [JSON.stringify(riskScores), reportId]
        );
      })
      .catch((err) => console.error('[bloodReport] Background risk scoring error:', err.message));

    return res.json({ reportId, status: 'processing' });
  } catch (err) {
    console.error('Risk scores error:', err);
    return res.status(500).json({ error: err.message || 'Risk scoring failed' });
  }
});

// POST /api/blood-report/follow-up — run follow-up agent, save to blood_reports.follow_up
router.post('/follow-up', verifyToken, async (req, res) => {
  const { reportId } = req.body;
  if (!reportId) return res.status(400).json({ error: 'reportId is required' });

  try {
    const { rows } = await pool.query(
      'SELECT * FROM blood_reports WHERE id = $1 AND patient_id = $2',
      [reportId, req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Report not found' });

    const report = rows[0];

    // Return cached result — no need to re-run the agent
    if (report.follow_up) {
      console.log(`[bloodReport] Returning cached follow-up for report ${reportId}`);
      return res.json({ reportId, followUp: report.follow_up, cached: true });
    }

    const { runFollowUpAgent } = require('../agents/followUpAgent');
    const patientId = req.user.userId;

    runFollowUpAgent({
      abnormalFindings: report.analysis?.abnormal_findings || [],
      tabletRecommendations: report.tablet_recommendations || [],
    })
      .then(async (followUp) => {
        await pool.query(
          'UPDATE blood_reports SET follow_up = $1::jsonb WHERE id = $2',
          [JSON.stringify(followUp), reportId]
        );
        // Schedule email reminders — delete existing unsent ones first (idempotent)
        try {
          await pool.query('DELETE FROM reminders WHERE report_id = $1 AND sent = false', [reportId]);
          const items = Array.isArray(followUp) ? followUp : [followUp];
          for (const item of items) {
            const recheckIn = item.recheck_in || item.timeframe || '';
            const m = recheckIn.match(/(\d+)\s*(day|week|month)s?/i);
            if (!m) continue;
            let days = parseInt(m[1]);
            const unit = m[2].toLowerCase();
            if (unit === 'week') days *= 7;
            if (unit === 'month') days *= 30;
            const sendAt = new Date();
            sendAt.setDate(sendAt.getDate() + Math.max(1, days - 3));
            await pool.query(
              'INSERT INTO reminders (patient_id, report_id, message, send_at) VALUES ($1, $2, $3, $4)',
              [
                patientId,
                reportId,
                `Reminder: Time to recheck "${item.test || item.name}" — recommended recheck: ${recheckIn}.`,
                sendAt,
              ]
            );
          }
        } catch (reminderErr) {
          console.warn('[bloodReport] Could not schedule reminders:', reminderErr.message);
        }
      })
      .catch((err) => console.error('[bloodReport] Background follow-up error:', err.message));

    return res.json({ reportId, status: 'processing' });
  } catch (err) {
    console.error('Follow-up error:', err);
    return res.status(500).json({ error: err.message || 'Follow-up agent failed' });
  }
});

// GET /api/blood-report/standalone — list standalone reports (no session) for the logged-in patient
router.get('/standalone', verifyToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, created_at, extracted_values, analysis, tablet_recommendations
         FROM blood_reports
        WHERE patient_id = $1 AND session_id IS NULL
        ORDER BY created_at DESC
        LIMIT 20`,
      [req.user.userId]
    );

    const reports = rows.map((r) => {
      const extracted = r.extracted_values || [];
      const abnormalCount = extracted.filter(
        (v) => v.status && v.status !== 'normal'
      ).length;
      return {
        id: r.id,
        created_at: r.created_at,
        total_parameters: extracted.length,
        abnormal_count: abnormalCount,
        analyzed: !!(r.analysis && (r.analysis.summary || r.analysis.abnormal_findings?.length > 0)),
      };
    });

    return res.json({ reports });
  } catch (err) {
    console.error('Standalone reports error:', err);
    return res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

// GET /api/blood-report/history — all patient reports with extracted values (for trend charts)
router.get('/history', verifyToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, created_at, extracted_values, analysis, risk_scores
         FROM blood_reports
        WHERE patient_id = $1
        ORDER BY created_at ASC
        LIMIT 50`,
      [req.user.userId]
    );

    const reports = rows.map((r) => {
      const extracted = r.extracted_values || [];
      return {
        id: r.id,
        created_at: r.created_at,
        extracted_values: extracted,
        total_parameters: extracted.length,
        abnormal_count: extracted.filter((v) => v.status && v.status !== 'normal').length,
        analyzed: !!(r.analysis && (r.analysis.summary || r.analysis.abnormal_findings?.length > 0)),
        composite_score: r.risk_scores?.composite_score ?? null,
        risk_level: r.risk_scores?.risk_level ?? null,
      };
    });

    return res.json({ reports });
  } catch (err) {
    console.error('History error:', err);
    return res.status(500).json({ error: 'Failed to fetch report history' });
  }
});

// GET /api/blood-report/compare?id1=X&id2=Y — side-by-side parameter diff
router.get('/compare', verifyToken, async (req, res) => {
  const { id1, id2 } = req.query;
  if (!id1 || !id2) return res.status(400).json({ error: 'id1 and id2 are required' });

  try {
    const { rows } = await pool.query(
      `SELECT id, created_at, extracted_values
         FROM blood_reports
        WHERE id = ANY($1::uuid[]) AND patient_id = $2`,
      [[id1, id2], req.user.userId]
    );

    const a = rows.find((r) => String(r.id) === String(id1));
    const b = rows.find((r) => String(r.id) === String(id2));
    if (!a || !b) return res.status(404).json({ error: 'One or both reports not found' });

    const aMap = {};
    const bMap = {};
    for (const v of (a.extracted_values || [])) aMap[v.parameter?.toLowerCase()] = v;
    for (const v of (b.extracted_values || [])) bMap[v.parameter?.toLowerCase()] = v;

    const allKeys = new Set([...Object.keys(aMap), ...Object.keys(bMap)]);
    const diff = [...allKeys].sort().map((key) => {
      const av = aMap[key];
      const bv = bMap[key];
      const aNum = av ? parseFloat(av.value) : null;
      const bNum = bv ? parseFloat(bv.value) : null;
      let trend = null;
      if (aNum !== null && bNum !== null && !isNaN(aNum) && !isNaN(bNum)) {
        trend = bNum > aNum ? 'up' : bNum < aNum ? 'down' : 'same';
      }
      return {
        parameter: av?.parameter || bv?.parameter || key,
        normal_range: av?.normal_range || bv?.normal_range || null,
        a: av ? { value: av.value, unit: av.unit, status: av.status } : null,
        b: bv ? { value: bv.value, unit: bv.unit, status: bv.status } : null,
        trend,
      };
    });

    return res.json({
      report_a: { id: a.id, created_at: a.created_at },
      report_b: { id: b.id, created_at: b.created_at },
      diff,
    });
  } catch (err) {
    console.error('Compare error:', err);
    return res.status(500).json({ error: 'Failed to compare reports' });
  }
});

// GET /api/blood-report/latest-score — latest composite health score + sparkline
router.get('/latest-score', verifyToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, created_at, risk_scores
         FROM blood_reports
        WHERE patient_id = $1 AND risk_scores IS NOT NULL AND session_id IS NULL
        ORDER BY created_at DESC LIMIT 10`,
      [req.user.userId]
    );

    if (!rows.length) return res.json({ score: null });

    const latest = rows[0];
    const sparkline = [...rows].reverse().map((r) => ({
      date: r.created_at,
      score: r.risk_scores?.composite_score ?? null,
    })).filter((d) => d.score !== null);

    return res.json({
      score: latest.risk_scores?.composite_score ?? null,
      risk_level: latest.risk_scores?.risk_level ?? null,
      summary: latest.risk_scores?.summary ?? null,
      sparkline,
    });
  } catch (err) {
    console.error('Latest score error:', err);
    return res.status(500).json({ error: 'Failed to fetch health score' });
  }
});

// GET /api/blood-report/daily-tips — LLM-generated personalized tips, cached 24h in DB
router.get('/daily-tips', verifyToken, async (req, res) => {
  const patientId = req.user.userId;
  const forceRefresh = req.query.force === 'true';

  try {
    const { rows } = await pool.query(
      `SELECT id, analysis, extracted_values, daily_tips, daily_tips_generated_at FROM blood_reports
        WHERE patient_id = $1 AND analysis IS NOT NULL AND session_id IS NULL
        ORDER BY created_at DESC LIMIT 1`,
      [patientId]
    );

    if (!rows.length) {
      return res.json({ tips: [], message: 'No analyzed reports found' });
    }

    const report = rows[0];

    // Return DB-cached tips if they are less than 24h old
    if (!forceRefresh && report.daily_tips && report.daily_tips_generated_at) {
      const age = Date.now() - new Date(report.daily_tips_generated_at).getTime();
      if (age < 24 * 60 * 60 * 1000) {
        console.log(`[bloodReport] Returning cached daily tips for patient ${patientId}`);
        return res.json({ tips: report.daily_tips, cached: true });
      }
    }
    const abnormal = report.analysis?.abnormal_findings || [];
    const summary = report.analysis?.summary?.overall_assessment || '';

    const abnormalLines = abnormal.slice(0, 5)
      .map((f) => `${f.parameter}: ${f.your_value} (${f.status})`)
      .join(', ');

    const prompt = `Based on this patient's recent blood test, generate exactly 3 short personalized health tips.
Each tip must be under 20 words, directly reference the actual findings below, and be actionable today.
Do NOT give generic advice — be specific to what was found.

Findings: ${abnormalLines || summary || 'Values within normal range'}
Overall assessment: ${summary}

Return ONLY a JSON array of 3 strings. Example format:
["Your hemoglobin is low — add spinach or lentils to your lunch today.", "...", "..."]`;

    const { getProviders, getAvailableProviders, isProviderLimited } = require('../utils/aiClients');
    const providers = getProviders();
    const available = getAvailableProviders().filter(name => !isProviderLimited(name));

    let tips = null;
    for (const name of available) {
      const provider = providers[name];
      try {
        const response = await provider.client.chat.completions.create({
          model: provider.model,
          messages: [
            { role: 'system', content: 'You generate brief personalized health tips. Return ONLY a JSON array of 3 strings, no other text.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.7,
          max_tokens: 180,
        });
        const raw = response.choices[0]?.message?.content?.trim() || '';
        const cleaned = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
        try {
          const parsed = JSON.parse(cleaned);
          if (Array.isArray(parsed) && parsed.length >= 3) { tips = parsed.slice(0, 3); break; }
        } catch {
          continue;
        }
      } catch (err) {
        const status = err?.status || err?.response?.status;
        if (status >= 400) continue; // skip any failed provider — never throw for tips
        throw err;
      }
    }

    if (!tips) {
      tips = [
        'Stay hydrated — drink at least 8 glasses of water daily.',
        'Try adding more leafy greens to your meals this week.',
        'A 20-minute walk after meals helps regulate blood sugar and energy levels.',
      ];
    }

    // Persist to DB so tips survive server restarts
    await pool.query(
      'UPDATE blood_reports SET daily_tips = $1, daily_tips_generated_at = NOW() WHERE id = $2',
      [JSON.stringify(tips), report.id]
    ).catch((e) => console.warn('[bloodReport] Could not persist daily tips:', e.message));

    return res.json({ tips });
  } catch (err) {
    console.error('Daily tips error:', err);
    return res.status(500).json({ error: 'Failed to generate tips' });
  }
});

// GET /api/blood-report/:id/summary-card — 1-page patient-friendly summary PDF
router.get('/:id/summary-card', verifyToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM blood_reports WHERE id = $1 AND patient_id = $2',
      [req.params.id, req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Report not found' });

    const report = rows[0];
    const lang = req.query.lang || 'en';
    const { rows: userRows } = await pool.query('SELECT full_name FROM users WHERE id = $1', [req.user.userId]);
    const { generateSummaryCardPDF } = require('../services/pdfService');

    const pdfBuffer = await generateSummaryCardPDF({
      patientName: userRows[0]?.full_name || 'Patient',
      score: report.risk_scores?.composite_score ?? null,
      riskLevel: report.risk_scores?.risk_level ?? null,
      findings: (report.analysis?.abnormal_findings || []).slice(0, 3),
      dietPlan: report.analysis?.diet_plan || null,
      followUp: report.follow_up || null,
      lang,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=MedAssist_SummaryCard_${req.params.id}.pdf`);
    return res.send(pdfBuffer);
  } catch (err) {
    console.error('Summary card PDF error:', err);
    return res.status(500).json({ error: 'Failed to generate summary card' });
  }
});

// GET /api/blood-report/:id/export-pdf — standalone PDF (no session required)
router.get('/:id/export-pdf', verifyToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM blood_reports WHERE id = $1 AND patient_id = $2',
      [req.params.id, req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Report not found' });

    const report = rows[0];
    const lang = req.query.lang || 'en';
    const { rows: userRows } = await pool.query('SELECT full_name FROM users WHERE id = $1', [req.user.userId]);
    const { generateSessionPDF } = require('../services/pdfService');

    const pdfBuffer = await generateSessionPDF({
      patientName: userRows[0]?.full_name || 'Patient',
      disease: lang === 'es' ? 'Análisis de Reporte de Sangre' : 'Standalone Blood Report Analysis',
      symptoms: [],
      analysis: report.analysis || {},
      tabletRecommendations: report.tablet_recommendations || [],
      riskScores: report.risk_scores || null,
      followUp: report.follow_up || null,
      lang,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=MedAssist_BloodReport_${req.params.id}.pdf`);
    return res.send(pdfBuffer);
  } catch (err) {
    console.error('Blood report PDF export error:', err);
    return res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

// GET /api/blood-report/:id/translations?lang=es
router.get('/:id/translations', verifyToken, async (req, res) => {
  const { lang } = req.query;
  if (!lang || lang === 'en') return res.json({});
  try {
    const { rows } = await pool.query(
      'SELECT translations FROM blood_reports WHERE id = $1 AND patient_id = $2',
      [req.params.id, req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    return res.json(rows[0].translations?.[lang] || {});
  } catch (err) {
    console.error('Fetch translations error:', err);
    return res.status(500).json({ error: 'Failed to fetch translations' });
  }
});

// PUT /api/blood-report/:id/translations
router.put('/:id/translations', verifyToken, async (req, res) => {
  const { lang, data } = req.body;
  if (!lang || !data) return res.status(400).json({ error: 'lang and data required' });
  try {
    await pool.query(
      `UPDATE blood_reports
         SET translations = COALESCE(translations, '{}'::jsonb) || jsonb_build_object($1::text, $2::jsonb)
       WHERE id = $3 AND patient_id = $4`,
      [lang, JSON.stringify(data), req.params.id, req.user.userId]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error('Save translations error:', err);
    return res.status(500).json({ error: 'Failed to save translations' });
  }
});

// POST /api/blood-report/:id/demo-reminder — demo-only: bypasses timer, fires reminder immediately
router.post('/:id/demo-reminder', verifyToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM blood_reports WHERE id = $1 AND patient_id = $2',
      [req.params.id, req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Report not found' });

    const followUp = rows[0].follow_up;
    if (!followUp) return res.status(400).json({ error: 'No follow-up data — generate follow-up recommendations first' });

    const item = Array.isArray(followUp) ? followUp[0] : followUp;
    const reminderMessage = `Reminder: Time to recheck "${item.test || item.name}" — recommended recheck: ${item.recheck_in || item.timeframe || 'TBD'}.`;

    const { rows: userRows } = await pool.query(
      'SELECT email, full_name FROM users WHERE id = $1',
      [req.user.userId]
    );
    if (!userRows.length || !userRows[0].email) {
      return res.status(500).json({ error: 'Could not resolve patient email' });
    }

    // Store the reminder row (mirrors production behaviour)
    await pool.query('DELETE FROM reminders WHERE report_id = $1 AND sent = false', [req.params.id]);
    const { rows: reminderRows } = await pool.query(
      `INSERT INTO reminders (patient_id, report_id, message, send_at)
       VALUES ($1, $2, $3, NOW() - INTERVAL '1 second') RETURNING id`,
      [req.user.userId, req.params.id, reminderMessage]
    );

    // Send the email now (same path as production hourly loop)
    const { sendFollowUpReminder } = require('../services/emailService');
    await sendFollowUpReminder(userRows[0].email, userRows[0].full_name || 'Patient', reminderMessage);
    await pool.query('UPDATE reminders SET sent = true WHERE id = $1', [reminderRows[0].id]);

    console.log(`[bloodReport] DEMO reminder sent for report ${req.params.id} to ${userRows[0].email}`);

    return res.json({
      success: true,
      email: userRows[0].email,
      subject: 'MedAssist AI — Blood Test Recheck Reminder',
      message: reminderMessage,
    });
  } catch (err) {
    console.error('[demo-reminder]', err);
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/blood-report/:id
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM blood_reports WHERE id = $1 AND patient_id = $2',
      [req.params.id, req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Report not found' });
    const report = rows[0];
    const complete = isAnalysisComplete(report.analysis);
    return res.json({
      ...report,
      analysisComplete: complete,
      partial: !!report.analysis && !complete,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch report' });
  }
});

module.exports = router;
