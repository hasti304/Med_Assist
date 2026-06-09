const router = require('express').Router();
const crypto = require('crypto');
const verifyToken = require('../middleware/auth');
const requirePatient = require('../middleware/requirePatient');
const pool = require('../db/pool');
const {
  getPatientProfile,
  upsertPatientProfile,
  getPatientSessions,
  getSessionById,
  updateSelectedDisease,
} = require('../models/patientQueries');
const { getNearbyDoctors } = require('../services/osmService');
const { sendAppointmentRequestEmail } = require('../services/email');
const { getDemoDoctorUsers } = require('../utils/demoDoctors');

// GET /api/patient/profile
router.get('/profile', verifyToken, async (req, res) => {
  try {
    const profile = await getPatientProfile(req.user.userId);
    res.json({ profile: profile || null });
  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// PUT /api/patient/profile
router.put('/profile', verifyToken, async (req, res) => {
  const {
    age, gender, weightKg, heightCm, bloodGroup,
    existingConditions, allergies, currentMedications,
    smokingStatus, alcoholUse,
  } = req.body;

  if (!age || !gender) {
    return res.status(400).json({ error: 'Age and gender are required' });
  }

  const { insuranceInfo, reminderPreferences } = req.body;

  try {
    const profile = await upsertPatientProfile(req.user.userId, {
      age: parseInt(age),
      gender,
      weightKg: weightKg ? parseFloat(weightKg) : null,
      heightCm: heightCm ? parseFloat(heightCm) : null,
      bloodGroup: bloodGroup || null,
      existingConditions: existingConditions || [],
      allergies: allergies || [],
      currentMedications: currentMedications || [],
      smokingStatus: smokingStatus || null,
      alcoholUse: alcoholUse || null,
    });

    if (insuranceInfo !== undefined || reminderPreferences !== undefined) {
      await pool.query(
        `UPDATE patient_profiles
         SET insurance_info = COALESCE($2::jsonb, insurance_info),
             reminder_preferences = COALESCE($3::jsonb, reminder_preferences),
             updated_at = NOW()
         WHERE user_id = $1`,
        [
          req.user.userId,
          insuranceInfo != null ? JSON.stringify(insuranceInfo) : null,
          reminderPreferences != null ? JSON.stringify(reminderPreferences) : null,
        ]
      );
    }

    const updated = await getPatientProfile(req.user.userId);
    res.json({ profile: updated || profile });
  } catch (err) {
    console.error('Upsert profile error:', err);
    res.status(500).json({ error: 'Failed to save profile' });
  }
});

// GET /api/patient/vitals/insights?type=glucose — LLM-generated blood report correlation
// Cached 2h per patient+type in patient_profiles.vitals_insights JSONB
router.get('/vitals/insights', verifyToken, async (req, res) => {
  const patientId = req.user.userId;
  const { type } = req.query;
  if (!type) return res.status(400).json({ error: 'type is required' });

  // Check DB cache (2h TTL per type)
  try {
    const { rows: profileRows } = await pool.query(
      'SELECT vitals_insights FROM patient_profiles WHERE user_id = $1',
      [patientId]
    );
    const cached = profileRows[0]?.vitals_insights?.[type];
    if (cached?.insight && cached?.generated_at) {
      const age = Date.now() - new Date(cached.generated_at).getTime();
      if (age < 2 * 60 * 60 * 1000) {
        console.log(`[patient] Returning cached vitals insight for ${patientId}/${type}`);
        return res.json({ insight: cached.insight, cached: true });
      }
    }
  } catch {
    // If vitals_insights column doesn't exist yet (pre-migration), fall through
  }

  try {
    const { rows: vitalsRows } = await pool.query(
      `SELECT value, value2, recorded_at FROM vitals_logs
        WHERE patient_id = $1 AND type = $2
        ORDER BY recorded_at DESC LIMIT 7`,
      [patientId, type]
    );
    if (!vitalsRows.length) return res.json({ insight: null, message: 'Log vitals to see insights' });

    const { rows: reportRows } = await pool.query(
      `SELECT extracted_values FROM blood_reports
        WHERE patient_id = $1 AND session_id IS NULL AND extracted_values IS NOT NULL
        ORDER BY created_at DESC LIMIT 1`,
      [patientId]
    );
    if (!reportRows.length) return res.json({ insight: null });

    const TYPE_LABEL = {
      glucose: 'blood glucose', blood_pressure: 'blood pressure',
      heart_rate: 'heart rate', weight: 'weight',
      spo2: 'oxygen saturation (SpO2)', temperature: 'body temperature',
    };
    const RELEVANT_KEYWORDS = {
      glucose:        ['hba1c', 'glucose', 'insulin', 'glycat'],
      blood_pressure: ['cholesterol', 'ldl', 'hdl', 'triglyceride', 'creatinine', 'sodium', 'potassium'],
      heart_rate:     ['hemoglobin', 'tsh', 'thyroid', 'potassium', 'sodium', 'calcium'],
      weight:         ['cholesterol', 'triglyceride', 'glucose', 'insulin'],
      spo2:           ['hemoglobin', 'rbc', 'wbc', 'hematocrit'],
      temperature:    ['wbc', 'neutrophil', 'lymphocyte', 'crp', 'esr'],
    };

    const keywords = RELEVANT_KEYWORDS[type] || [];
    const extractedValues = reportRows[0].extracted_values || [];

    let relevantFindings = extractedValues.filter((v) =>
      keywords.some((k) => (v.parameter || '').toLowerCase().includes(k))
    ).slice(0, 5);

    if (!relevantFindings.length) {
      relevantFindings = extractedValues.filter((v) => v.status && v.status !== 'normal').slice(0, 3);
    }
    if (!relevantFindings.length) return res.json({ insight: null });

    const readingsSummary = vitalsRows.slice(0, 5).map((v) => {
      const date = new Date(v.recorded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return v.value2 ? `${v.value}/${v.value2} (${date})` : `${v.value} (${date})`;
    }).join(', ');

    const findingsSummary = relevantFindings.map((f) =>
      `${f.parameter}: ${f.value}${f.unit ? ' ' + f.unit : ''} [${f.status || 'normal'}]`
    ).join('; ');

    const prompt = `Explain in 1-2 sentences how this patient's recent ${TYPE_LABEL[type] || type} readings relate to their blood test results. Reference actual numbers. Do NOT give medical advice.

Recent ${TYPE_LABEL[type] || type}: ${readingsSummary}
Blood test results: ${findingsSummary}

Respond with exactly 1-2 sentences, under 50 words.`;

    const { getProviders, getAvailableProviders } = require('../utils/aiClients');
    const providers = getProviders();
    const available = getAvailableProviders();

    let insight = null;
    for (const name of available) {
      const provider = providers[name];
      try {
        const response = await provider.client.chat.completions.create({
          model: provider.model,
          messages: [
            { role: 'system', content: 'You generate concise medical data correlations. Return only 1-2 sentences, no preamble.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.4,
          max_tokens: 100,
        });
        insight = response.choices[0]?.message?.content?.trim() || null;
        if (insight) break;
      } catch (err) {
        const status = err?.status || err?.response?.status;
        if (status === 429 || status === 503) continue;
        throw err;
      }
    }

    if (insight) {
      // Persist to DB — merge new type entry into the JSONB column
      await pool.query(
        `UPDATE patient_profiles
         SET vitals_insights = COALESCE(vitals_insights, '{}'::jsonb) || $1::jsonb
         WHERE user_id = $2`,
        [JSON.stringify({ [type]: { insight, generated_at: new Date().toISOString() } }), patientId]
      ).catch((e) => console.warn('[patient] Could not persist vitals insight:', e.message));
    }
    return res.json({ insight: insight || null });
  } catch (err) {
    console.error('Vitals insights error:', err);
    return res.status(500).json({ error: 'Failed to generate insight' });
  }
});

// GET /api/patient/vitals — get patient's vitals (query: type, days)
router.get('/vitals', verifyToken, async (req, res) => {
  try {
    const { type, days } = req.query;
    let query = 'SELECT * FROM vitals_logs WHERE patient_id = $1';
    const params = [req.user.userId];

    if (type) {
      params.push(type);
      query += ` AND type = $${params.length}`;
    }
    if (days) {
      params.push(parseInt(days));
      query += ` AND recorded_at >= NOW() - INTERVAL '1 day' * $${params.length}`;
    }

    query += ' ORDER BY recorded_at DESC LIMIT 200';
    const { rows } = await pool.query(query, params);
    res.json({ vitals: rows });
  } catch (err) {
    console.error('Get vitals error:', err);
    res.status(500).json({ error: 'Failed to fetch vitals' });
  }
});

// POST /api/patient/vitals — save a new vital reading
router.post('/vitals', verifyToken, async (req, res) => {
  const { type, value, value2, unit } = req.body;
  if (!type || value === undefined) {
    return res.status(400).json({ error: 'type and value are required' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO vitals_logs (patient_id, type, value, value2, unit)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [req.user.userId, type, value, value2 || null, unit || null]
    );
    res.status(201).json({ vital: rows[0] });
  } catch (err) {
    console.error('Save vital error:', err);
    res.status(500).json({ error: 'Failed to save vital' });
  }
});

// POST /api/patient/supplement-log — toggle "taken today" for an ingredient
router.post('/supplement-log', verifyToken, async (req, res) => {
  const { ingredient_name } = req.body;
  if (!ingredient_name) return res.status(400).json({ error: 'ingredient_name is required' });

  const patientId = req.user.userId;
  const today = new Date().toISOString().split('T')[0];

  try {
    try {
      await pool.query(
        'INSERT INTO supplement_logs (patient_id, ingredient_name, taken_at) VALUES ($1, $2, $3)',
        [patientId, ingredient_name, today]
      );
      return res.json({ taken: true, ingredient_name });
    } catch (insertErr) {
      if (insertErr.code === '23505') {
        // UNIQUE violation → already taken → un-toggle
        await pool.query(
          'DELETE FROM supplement_logs WHERE patient_id = $1 AND ingredient_name = $2 AND taken_at = $3',
          [patientId, ingredient_name, today]
        );
        return res.json({ taken: false, ingredient_name });
      }
      throw insertErr;
    }
  } catch (err) {
    console.error('Supplement log toggle error:', err);
    return res.status(500).json({ error: 'Failed to update supplement log' });
  }
});

// GET /api/patient/supplement-log — today's taken ingredients + streaks
router.get('/supplement-log', verifyToken, async (req, res) => {
  const patientId = req.user.userId;
  const today = new Date().toISOString().split('T')[0];

  try {
    const { rows: todayRows } = await pool.query(
      'SELECT ingredient_name FROM supplement_logs WHERE patient_id = $1 AND taken_at = $2',
      [patientId, today]
    );

    const { rows: historyRows } = await pool.query(
      `SELECT ingredient_name, taken_at FROM supplement_logs
        WHERE patient_id = $1 AND taken_at >= CURRENT_DATE - INTERVAL '30 days'
        ORDER BY taken_at DESC`,
      [patientId]
    );

    // Group taken dates by ingredient
    const byIngredient = {};
    for (const r of historyRows) {
      const name = r.ingredient_name;
      if (!byIngredient[name]) byIngredient[name] = new Set();
      byIngredient[name].add(r.taken_at.toISOString().split('T')[0]);
    }

    // Compute consecutive-day streak backward from today
    const streaks = {};
    for (const [name, datesSet] of Object.entries(byIngredient)) {
      let streak = 0;
      const d = new Date(today);
      while (true) {
        const ds = d.toISOString().split('T')[0];
        if (datesSet.has(ds)) {
          streak++;
          d.setDate(d.getDate() - 1);
        } else {
          break;
        }
      }
      streaks[name] = streak;
    }

    return res.json({ today: todayRows.map((r) => r.ingredient_name), streaks });
  } catch (err) {
    console.error('Get supplement log error:', err);
    return res.status(500).json({ error: 'Failed to fetch supplement log' });
  }
});

// GET /api/patient/badges — compute engagement badges
router.get('/badges', verifyToken, async (req, res) => {
  const patientId = req.user.userId;

  try {
    const { rows: reports } = await pool.query(
      `SELECT id, created_at, extracted_values, analysis, follow_up
         FROM blood_reports
        WHERE patient_id = $1 AND session_id IS NULL
        ORDER BY created_at ASC`,
      [patientId]
    );

    const analyzed = reports.filter(
      (r) => r.analysis && (r.analysis.summary || r.analysis.abnormal_findings?.length > 0)
    );

    const badges = [];

    if (analyzed.length >= 1) {
      badges.push({ id: 'first_report', label: 'First Report', icon: '🩸', description: 'Uploaded and analyzed your first blood report' });
    }

    if (analyzed.length >= 3) {
      badges.push({ id: 'on_track', label: 'On Track', icon: '📈', description: 'Has 3 or more analyzed reports — great consistency!' });
    }

    const { rows: sessions } = await pool.query(
      'SELECT COUNT(*)::int AS c FROM symptom_sessions WHERE patient_id = $1',
      [patientId]
    );
    if (sessions[0]?.c >= 1) {
      badges.push({ id: 'new_assist', label: 'Symptom Explorer', icon: '✨', description: 'Completed a New Assist symptom check' });
    }

    const { rows: vitals } = await pool.query(
      `SELECT COUNT(DISTINCT DATE(recorded_at))::int AS days
         FROM vitals_logs WHERE patient_id = $1 AND recorded_at >= NOW() - INTERVAL '7 days'`,
      [patientId]
    );
    if (vitals[0]?.days >= 3) {
      badges.push({ id: 'vitals_streak', label: 'Vitals Streak', icon: '💓', description: 'Logged vitals on 3+ days this week' });
    }

    const { rows: pendingRem } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM reminders WHERE patient_id = $1 AND sent = false AND send_at > NOW()`,
      [patientId]
    );
    if (pendingRem[0]?.c >= 1 && analyzed.length >= 1) {
      badges.push({ id: 'followup_scheduled', label: 'Follow-up Planned', icon: '📅', description: 'Has an upcoming recheck reminder scheduled' });
    }

    // Improving: any abnormal parameter status improved between last 2 reports
    if (analyzed.length >= 2) {
      const older = analyzed[analyzed.length - 2];
      const newer = analyzed[analyzed.length - 1];
      const olderAbnormal = older.analysis?.abnormal_findings || [];
      const newerExtracted = newer.extracted_values || [];

      let improving = false;
      for (const finding of olderAbnormal) {
        const name = finding.parameter?.toLowerCase();
        const newVal = newerExtracted.find((v) => v.parameter?.toLowerCase() === name);
        if (!newVal) continue;
        const oldSt = finding.status;
        const newSt = newVal.status;
        if (['high', 'critical_high', 'low', 'critical_low'].includes(oldSt) && newSt === 'normal') {
          improving = true; break;
        }
        if ((oldSt === 'critical_high' && newSt === 'high') || (oldSt === 'critical_low' && newSt === 'low')) {
          improving = true; break;
        }
      }
      if (improving) {
        badges.push({ id: 'improving', label: 'Improving', icon: '✅', description: 'A parameter moved closer to normal range between your last two reports' });
      }
    }

    // Follow-up Champion: newest report uploaded within the recheck window of the second-to-last
    if (analyzed.length >= 2) {
      const penultimate = analyzed[analyzed.length - 2];
      const latest = analyzed[analyzed.length - 1];
      const fu = penultimate.follow_up;
      if (fu) {
        const items = Array.isArray(fu) ? fu : [fu];
        for (const item of items) {
          const recheckIn = item.recheck_in || item.timeframe || '';
          const m = recheckIn.match(/(\d+)\s*(day|week|month)s?/i);
          if (!m) continue;
          let days = parseInt(m[1]);
          const unit = m[2].toLowerCase();
          if (unit === 'week') days *= 7;
          if (unit === 'month') days *= 30;
          const diffDays = (new Date(latest.created_at) - new Date(penultimate.created_at)) / 86400000;
          if (diffDays <= days) {
            badges.push({ id: 'followup_champion', label: 'Follow-up Champion', icon: '🔁', description: 'Uploaded a new report within the recommended recheck window' });
            break;
          }
        }
      }
    }

    return res.json({ badges });
  } catch (err) {
    console.error('Badges error:', err);
    return res.status(500).json({ error: 'Failed to compute badges' });
  }
});

// GET /api/patient/sessions — list recent symptom sessions for the logged-in patient
router.get('/sessions', verifyToken, async (req, res) => {
  try {
    const sessions = await getPatientSessions(req.user.userId, 20);
    return res.json({ sessions });
  } catch (err) {
    console.error('Get patient sessions error:', err);
    return res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// GET /api/patient/sessions/:id — single session (resume wizard / upload / tests)
router.get('/sessions/:id', verifyToken, requirePatient, async (req, res) => {
  try {
    const session = await getSessionById(req.params.id, req.user.userId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    return res.json({ session });
  } catch (err) {
    console.error('Get patient session error:', err);
    return res.status(500).json({ error: 'Failed to fetch session' });
  }
});

// POST /api/patient/sessions/:id/select-disease — persist chosen diagnosis before tests
router.post('/sessions/:id/select-disease', verifyToken, requirePatient, async (req, res) => {
  const { disease } = req.body;
  if (!disease?.disease || !disease?.icd_code) {
    return res.status(400).json({ error: 'disease object with disease and icd_code is required' });
  }
  try {
    const session = await getSessionById(req.params.id, req.user.userId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    await updateSelectedDisease(req.params.id, disease);
    return res.json({ ok: true, sessionId: req.params.id, disease });
  } catch (err) {
    console.error('Select disease error:', err);
    return res.status(500).json({ error: 'Failed to save selected disease' });
  }
});

// POST /api/patient/sessions/:id/share
// :id may be a symptom_session id OR a blood_report id
router.post('/sessions/:id/share', verifyToken, async (req, res) => {
  const patientId = req.user.userId;
  const { id } = req.params;

  try {
    let sessionId = null;

    // First: check if it's a symptom session
    const { rows: sessions } = await pool.query(
      'SELECT id FROM symptom_sessions WHERE id = $1 AND patient_id = $2',
      [id, patientId]
    );

    if (sessions.length) {
      sessionId = id;
    } else {
      // Try as a blood_report id — use its session_id if available
      const { rows: reports } = await pool.query(
        'SELECT id, session_id FROM blood_reports WHERE id = $1 AND patient_id = $2',
        [id, patientId]
      );
      if (!reports.length) {
        return res.status(404).json({ error: 'Report not found' });
      }
      sessionId = reports[0].session_id || null;
    }

    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const label = req.body?.label || 'Caregiver / family view';

    await pool.query(
      `INSERT INTO report_shares (token, session_id, patient_id, expires_at, label)
       VALUES ($1, $2, $3, $4, $5)`,
      [token, sessionId, patientId, expiresAt, label]
    );

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    return res.json({ token, expiresAt, shareUrl: `${clientUrl}/shared/${token}`, label });
  } catch (err) {
    console.error('[share] Error:', err);
    return res.status(500).json({ error: 'Failed to create share link' });
  }
});

// GET /api/patient/doctors?city=&specialization=&availableOnly=true
router.get('/doctors', verifyToken, requirePatient, async (req, res) => {
  const { city, specialization, availableOnly } = req.query;
  try {
    const conditions = ['(dp.user_id IS NULL OR u.role = \'doctor\')'];
    const params = [];
    if (city) {
      params.push(`%${city}%`);
      conditions.push(`dp.city ILIKE $${params.length}`);
    }
    if (specialization) {
      params.push(`%${specialization}%`);
      conditions.push(`dp.specialization ILIKE $${params.length}`);
    }
    if (availableOnly === 'true') {
      conditions.push('dp.available = TRUE');
    }

    const { rows } = await pool.query(
      `SELECT dp.id,
              dp.user_id,
              COALESCE(dp.name, u.full_name) AS full_name,
              u.email,
              dp.specialization, dp.hospital_name, dp.city, dp.state,
              dp.phone, dp.available, dp.latitude, dp.longitude,
              (u.email IN ('demo.doctor1@medassist.com', 'demo.doctor2@medassist.com')) AS is_demo_account
       FROM doctor_profiles dp
       LEFT JOIN users u ON u.id = dp.user_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY dp.available DESC NULLS LAST,
                (u.email IN ('demo.doctor1@medassist.com', 'demo.doctor2@medassist.com')) DESC,
                dp.city ASC, full_name ASC`,
      params
    );
    return res.json({ doctors: rows });
  } catch (err) {
    console.error('List doctors error:', err);
    return res.status(500).json({ error: 'Failed to fetch doctors' });
  }
});

// POST /api/patient/appointments
router.post('/appointments', verifyToken, requirePatient, async (req, res) => {
  const patientId = req.user.userId;
  const { doctorId, requestedAt, reason } = req.body;

  if (!doctorId || !requestedAt) {
    return res.status(400).json({ error: 'doctorId and requestedAt are required' });
  }

  try {
    const { rows: doctors } = await pool.query(
      `SELECT dp.id AS profile_id, dp.user_id, dp.available, dp.specialization,
              COALESCE(u.full_name, dp.name) AS doctor_name, u.email
       FROM doctor_profiles dp
       LEFT JOIN users u ON u.id = dp.user_id
       WHERE dp.id = $1 AND (dp.user_id IS NULL OR u.role = 'doctor')`,
      [doctorId]
    );
    if (!doctors.length || doctors[0].available === false) {
      return res.status(404).json({ error: 'Doctor not found or not available' });
    }

    const doc = doctors[0];
    const { rows: patients } = await pool.query(
      'SELECT full_name FROM users WHERE id = $1',
      [patientId]
    );

    const { rows } = await pool.query(
      `INSERT INTO appointments (patient_id, doctor_id, doctor_profile_id, requested_at, reason, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       RETURNING *`,
      [patientId, doc.user_id || null, doc.profile_id, requestedAt, reason || null]
    );

    const patientName = patients[0]?.full_name || 'Patient';
    const isDirectoryBooking = !doc.user_id;
    const notifyPayload = {
      patientName,
      requestedAt,
      reason: reason || null,
      doctorName: doc.doctor_name,
      listedDoctorName: isDirectoryBooking ? doc.doctor_name : null,
      listedSpecialization: isDirectoryBooking ? doc.specialization : null,
    };

    if (doc.user_id && doc.email) {
      sendAppointmentRequestEmail({
        doctorEmail: doc.email,
        ...notifyPayload,
      }).catch((e) => console.error('[patient] Appointment request email failed:', e.message));
    } else if (isDirectoryBooking) {
      const demoDoctors = await getDemoDoctorUsers(pool);
      await Promise.all(
        demoDoctors.map((demo) =>
          sendAppointmentRequestEmail({
            doctorEmail: demo.email,
            doctorName: demo.full_name,
            ...notifyPayload,
          }).catch((e) => console.error(`[patient] Demo doctor notify (${demo.email}) failed:`, e.message))
        )
      );
    }

    return res.status(201).json({ appointment: rows[0] });
  } catch (err) {
    console.error('Create appointment error:', err);
    return res.status(500).json({ error: 'Failed to request appointment' });
  }
});

// GET /api/patient/appointments
router.get('/appointments', verifyToken, requirePatient, async (req, res) => {
  const patientId = req.user.userId;
  try {
    const { rows } = await pool.query(
      `SELECT a.id, a.requested_at, a.status, a.reason, a.response_reason, a.created_at,
              COALESCE(u.id, dp.user_id) AS doctor_id,
              COALESCE(u.full_name, dp.name) AS doctor_name,
              dp.specialization, dp.hospital_name, dp.city
       FROM appointments a
       LEFT JOIN doctor_profiles dp ON dp.id = a.doctor_profile_id
       LEFT JOIN users u ON u.id = COALESCE(a.doctor_id, dp.user_id)
       WHERE a.patient_id = $1
       ORDER BY a.created_at DESC`,
      [patientId]
    );
    return res.json({ appointments: rows });
  } catch (err) {
    console.error('Get patient appointments error:', err);
    return res.status(500).json({ error: 'Failed to fetch appointments' });
  }
});

// GET /api/patient/clinics?lat=<lat>&lng=<lng>&radius=<radius>
router.get('/clinics', verifyToken, async (req, res) => {
  const lat    = parseFloat(req.query.lat);
  const lng    = parseFloat(req.query.lng);
  const radius = parseInt(req.query.radius) || 10000;

  if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return res.status(400).json({ error: 'Invalid lat/lng' });
  }

  try {
    const places = await getNearbyDoctors(lat, lng, radius);
    return res.json({ places });
  } catch (err) {
    console.error('[/clinics]', err.message);
    const isCircuit = err.message.includes('circuit open');
    return res.status(503).json({
      error: isCircuit ? 'circuit_open' : 'overpass_failed',
      message: err.message,
    });
  }
});

// GET /api/patient/timeline — unified health activity feed
router.get('/timeline', verifyToken, requirePatient, async (req, res) => {
  const patientId = req.user.userId;
  try {
    const events = [];

    const [reports, vitals, appts, reminders, sessions] = await Promise.all([
      pool.query(
        `SELECT id, created_at, analysis FROM blood_reports WHERE patient_id = $1 ORDER BY created_at DESC LIMIT 20`,
        [patientId]
      ),
      pool.query(
        `SELECT type, value, value2, unit, recorded_at FROM vitals_logs WHERE patient_id = $1 ORDER BY recorded_at DESC LIMIT 15`,
        [patientId]
      ),
      pool.query(
        `SELECT a.requested_at, a.status, u.full_name AS doctor_name
           FROM appointments a JOIN users u ON u.id = a.doctor_id
          WHERE a.patient_id = $1 ORDER BY a.created_at DESC LIMIT 10`,
        [patientId]
      ),
      pool.query(
        `SELECT message, send_at, sent FROM reminders WHERE patient_id = $1 ORDER BY send_at DESC LIMIT 10`,
        [patientId]
      ),
      pool.query(
        `SELECT id, created_at, selected_disease, predicted_diseases, recommended_tests
           FROM symptom_sessions WHERE patient_id = $1 ORDER BY created_at DESC LIMIT 10`,
        [patientId]
      ),
    ]);

    for (const r of reports.rows) {
      const analyzed = !!(r.analysis?.summary || r.analysis?.abnormal_findings?.length);
      events.push({
        type: 'report',
        date: r.created_at,
        title: analyzed ? 'Blood report analyzed' : 'Blood report uploaded',
        detail: analyzed ? 'AI analysis complete' : 'Awaiting analysis',
        icon: '🩸',
        link: analyzed ? `/patient/analysis/${r.id}` : `/patient/upload-report`,
      });
    }
    for (const s of sessions.rows) {
      events.push({
        type: 'symptom',
        date: s.created_at,
        title: 'New Assist session',
        detail: s.selected_disease
          || (s.recommended_tests ? 'Tests recommended' : null)
          || (s.predicted_diseases ? 'Diagnosis ready' : null)
          || 'Symptom check',
        icon: '✨',
        link: `/patient/results/${s.id}`,
      });
    }
    for (const v of vitals.rows) {
      const val = v.value2 != null ? `${v.value}/${v.value2}` : String(v.value);
      events.push({
        type: 'vital',
        date: v.recorded_at,
        title: `Vitals: ${v.type.replace(/_/g, ' ')}`,
        detail: `${val} ${v.unit || ''}`.trim(),
        icon: '💓',
        link: '/patient/vitals',
      });
    }
    for (const a of appts.rows) {
      events.push({
        type: 'appointment',
        date: a.requested_at,
        title: `Appointment — ${a.status}`,
        detail: `Dr. ${a.doctor_name}`,
        icon: '📅',
        link: '/my-appointments',
      });
    }
    for (const rem of reminders.rows) {
      events.push({
        type: 'reminder',
        date: rem.send_at,
        title: rem.sent ? 'Follow-up reminder sent' : 'Follow-up reminder scheduled',
        detail: rem.message?.slice(0, 80) || '',
        icon: '🔔',
        link: '/patient/history',
      });
    }

    events.sort((a, b) => new Date(b.date) - new Date(a.date));
    return res.json({ events: events.slice(0, 40) });
  } catch (err) {
    console.error('Timeline error:', err);
    return res.status(500).json({ error: 'Failed to load timeline' });
  }
});

// GET /api/patient/share-access — who opened shared links
router.get('/share-access', verifyToken, requirePatient, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, token, label, created_at, expires_at, accessed_at, access_count, access_log
         FROM report_shares
        WHERE patient_id = $1
        ORDER BY created_at DESC
        LIMIT 30`,
      [req.user.userId]
    );
    return res.json({ shares: rows });
  } catch (err) {
    console.error('Share access error:', err);
    return res.status(500).json({ error: 'Failed to fetch share access log' });
  }
});

// GET /api/patient/reminder-preferences
router.get('/reminder-preferences', verifyToken, requirePatient, async (req, res) => {
  try {
    const profile = await getPatientProfile(req.user.userId);
    const prefs = profile?.reminder_preferences || { email: true, sms: false };
    return res.json({ preferences: prefs });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load preferences' });
  }
});

// PUT /api/patient/reminder-preferences
router.put('/reminder-preferences', verifyToken, requirePatient, async (req, res) => {
  const { email, sms, phone } = req.body;
  try {
    const prefs = { email: email !== false, sms: !!sms, phone: phone || null };
    await pool.query(
      `UPDATE patient_profiles SET reminder_preferences = $2::jsonb, updated_at = NOW() WHERE user_id = $1`,
      [req.user.userId, JSON.stringify(prefs)]
    );
    return res.json({ preferences: prefs });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to save preferences' });
  }
});

// POST /api/patient/vitals/import-csv — demo wearable/mock import
router.post('/vitals/import-csv', verifyToken, requirePatient, async (req, res) => {
  const { csv } = req.body;
  if (!csv || typeof csv !== 'string') {
    return res.status(400).json({ error: 'csv text is required' });
  }
  const lines = csv.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) {
    return res.status(400).json({ error: 'CSV needs a header row and at least one data row' });
  }
  const header = lines[0].toLowerCase().split(',').map((h) => h.trim());
  const typeIdx = header.findIndex((h) => h === 'type');
  const valueIdx = header.findIndex((h) => h === 'value');
  const dateIdx = header.findIndex((h) => h.includes('date'));
  const value2Idx = header.findIndex((h) => h === 'value2' || h === 'diastolic');
  if (typeIdx < 0 || valueIdx < 0) {
    return res.status(400).json({ error: 'CSV must include type and value columns' });
  }

  const patientId = req.user.userId;
  let imported = 0;
  try {
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.trim());
      const type = cols[typeIdx]?.replace(/"/g, '');
      const value = parseFloat(cols[valueIdx]);
      if (!type || Number.isNaN(value)) continue;
      const value2 = value2Idx >= 0 ? parseFloat(cols[value2Idx]) : null;
      const recordedAt = dateIdx >= 0 && cols[dateIdx] ? new Date(cols[dateIdx]) : new Date();
      await pool.query(
        `INSERT INTO vitals_logs (patient_id, type, value, value2, unit, recorded_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          patientId,
          type,
          value,
          Number.isNaN(value2) ? null : value2,
          type === 'blood_pressure' ? 'mmHg' : type === 'glucose' ? 'mg/dL' : null,
          recordedAt,
        ]
      );
      imported++;
    }
    return res.json({ imported, message: `Imported ${imported} vital reading(s)` });
  } catch (err) {
    console.error('CSV import error:', err);
    return res.status(500).json({ error: 'Failed to import CSV' });
  }
});

// GET /api/patient/export-health-packet — PDF bundle (report + vitals + profile)
router.get('/export-health-packet', verifyToken, requirePatient, async (req, res) => {
  const patientId = req.user.userId;
  const lang = req.query.lang || 'en';
  try {
    const { rows: userRows } = await pool.query('SELECT full_name, email FROM users WHERE id = $1', [patientId]);
    const profile = await getPatientProfile(patientId);
    const { rows: reportRows } = await pool.query(
      `SELECT * FROM blood_reports WHERE patient_id = $1 AND analysis IS NOT NULL ORDER BY created_at DESC LIMIT 1`,
      [patientId]
    );
    const { rows: vitalRows } = await pool.query(
      `SELECT * FROM vitals_logs WHERE patient_id = $1 ORDER BY recorded_at DESC LIMIT 20`,
      [patientId]
    );
    let medicalId = null;
    try {
      const { rows: medRows } = await pool.query(
        'SELECT * FROM medical_id WHERE patient_id = $1',
        [patientId]
      );
      medicalId = medRows[0] || null;
    } catch (medErr) {
      if (medErr.code !== '42P01') throw medErr;
    }

    const { generateHealthPacketPDF } = require('../services/pdfService');
    const pdfBuffer = await generateHealthPacketPDF({
      patientName: userRows[0]?.full_name || 'Patient',
      email: userRows[0]?.email,
      profile,
      report: reportRows[0] || null,
      vitals: vitalRows,
      medicalId,
      lang,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=MedAssist_Health_Packet.pdf');
    return res.send(pdfBuffer);
  } catch (err) {
    console.error('Health packet export error:', err);
    return res.status(500).json({ error: err.message || 'Failed to generate health packet' });
  }
});

module.exports = router;
