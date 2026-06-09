const router = require('express').Router();
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');

// GET /api/shared/:token — validate share token, return read-only session + analysis data
router.get('/:token', async (req, res) => {
  try {
    const { rows: byToken } = await pool.query(
      'SELECT expires_at FROM report_shares WHERE token = $1',
      [req.params.token]
    );
    if (!byToken.length) {
      return res.status(404).json({ error: 'This share link is invalid. Ask the patient to send a new link.' });
    }
    if (byToken[0].expires_at <= new Date()) {
      return res.status(410).json({
        error: 'This share link has expired. Ask the patient to create a new link from their report.',
        expiredAt: byToken[0].expires_at,
      });
    }

    const { rows } = await pool.query(
      `SELECT rs.*, s.symptoms, s.predicted_diseases, s.selected_disease,
              s.selected_disease_data, s.recommended_tests, s.status
       FROM report_shares rs
       LEFT JOIN symptom_sessions s ON s.id = rs.session_id
       WHERE rs.token = $1`,
      [req.params.token]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Shared report not found' });
    }

    const share = rows[0];

    const accessEntry = {
      at: new Date().toISOString(),
      ip: req.ip || req.headers['x-forwarded-for'] || null,
      userAgent: (req.get('user-agent') || '').slice(0, 200),
    };
    await pool.query(
      `UPDATE report_shares
       SET accessed_at = NOW(),
           access_count = COALESCE(access_count, 0) + 1,
           access_log = COALESCE(access_log, '[]'::jsonb) || $2::jsonb
       WHERE id = $1`,
      [share.id, JSON.stringify([accessEntry])]
    );

    // Fetch blood report analysis if session has one
    let analysis = null;
    let tabletRecommendations = null;
    let riskScores = null;
    let followUp = null;

    const { rows: reportRows } = await pool.query(
      share.session_id
        ? `SELECT analysis, tablet_recommendations, risk_scores, follow_up
           FROM blood_reports
           WHERE session_id = $1
           ORDER BY created_at DESC LIMIT 1`
        : `SELECT analysis, tablet_recommendations, risk_scores, follow_up
           FROM blood_reports
           WHERE patient_id = $1 AND analysis IS NOT NULL
           ORDER BY created_at DESC LIMIT 1`,
      [share.session_id || share.patient_id]
    );

    if (reportRows.length) {
      analysis = reportRows[0].analysis;
      tabletRecommendations = reportRows[0].tablet_recommendations;
      riskScores = reportRows[0].risk_scores;
      followUp = reportRows[0].follow_up;
    }

    // Get patient name
    const { rows: userRows } = await pool.query(
      'SELECT full_name FROM users WHERE id = $1',
      [share.patient_id]
    );

    res.json({
      patientName: userRows[0]?.full_name || 'Patient',
      symptoms: share.symptoms,
      predictedDiseases: share.predicted_diseases,
      selectedDisease: share.selected_disease,
      selectedDiseaseData: share.selected_disease_data,
      recommendedTests: share.recommended_tests,
      status: share.status,
      analysis,
      tabletRecommendations,
      riskScores,
      followUp,
      sharedAt: share.id ? new Date() : null,
    });
  } catch (err) {
    console.error('Shared report error:', err);
    res.status(500).json({ error: 'Failed to fetch shared report' });
  }
});

// GET /api/shared/medical-id/:patientId?pin=xxxx — validate PIN, return medical ID data
router.get('/medical-id/:patientId', async (req, res) => {
  const { pin } = req.query;

  if (!pin) {
    return res.status(400).json({ error: 'PIN is required' });
  }

  try {
    const { rows } = await pool.query(
      'SELECT * FROM medical_id WHERE patient_id = $1',
      [req.params.patientId]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Medical ID not found' });
    }

    const medId = rows[0];

    if (!medId.pin_hash) {
      return res.status(400).json({ error: 'No PIN set for this medical ID' });
    }

    const valid = await bcrypt.compare(String(pin), medId.pin_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid PIN' });
    }

    // Get patient name
    const { rows: userRows } = await pool.query(
      'SELECT full_name FROM users WHERE id = $1',
      [req.params.patientId]
    );

    // Get patient profile for additional medical info
    const { rows: profileRows } = await pool.query(
      'SELECT blood_group, existing_conditions, allergies, current_medications FROM patient_profiles WHERE user_id = $1',
      [req.params.patientId]
    );

    res.json({
      patientName: userRows[0]?.full_name || 'Patient',
      emergencyName: medId.emergency_name,
      emergencyPhone: medId.emergency_phone,
      bloodType: medId.blood_type,
      organDonor: medId.organ_donor,
      criticalNotes: medId.critical_notes,
      profile: profileRows[0] || null,
    });
  } catch (err) {
    console.error('Medical ID lookup error:', err);
    res.status(500).json({ error: 'Failed to fetch medical ID' });
  }
});

module.exports = router;
