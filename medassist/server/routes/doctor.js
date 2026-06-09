const router = require('express').Router();
const pool = require('../db/pool');
const {
  sendApprovalEmail,
  sendDeclineEmail,
} = require('../services/email');
const { isDemoDoctor, isDemoDoctorUser } = require('../utils/demoDoctors');

async function assertPatientAssigned(doctorId, patientId) {
  const { rows } = await pool.query(
    `SELECT 1 FROM doctor_patients
     WHERE doctor_id = $1 AND patient_id = $2`,
    [doctorId, patientId]
  );
  return rows.length > 0;
}

// GET /api/doctor/profile
router.get('/profile', async (req, res) => {
  const doctorId = req.user.userId;
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.full_name, u.role,
              dp.specialization, dp.hospital_name, dp.city, dp.state,
              dp.phone, dp.available
       FROM users u
       LEFT JOIN doctor_profiles dp ON dp.user_id = u.id
       WHERE u.id = $1`,
      [doctorId]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Doctor not found' });
    }
    return res.json({ profile: rows[0] });
  } catch (err) {
    console.error('Get doctor profile error:', err);
    return res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// PUT /api/doctor/profile
router.put('/profile', async (req, res) => {
  const doctorId = req.user.userId;
  const {
    specialization, hospitalName, city, state, phone, available,
  } = req.body;

  try {
    const { rows } = await pool.query(
      `INSERT INTO doctor_profiles
         (user_id, specialization, hospital_name, city, state, phone, available)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id) DO UPDATE SET
         specialization = COALESCE($2, doctor_profiles.specialization),
         hospital_name = COALESCE($3, doctor_profiles.hospital_name),
         city = COALESCE($4, doctor_profiles.city),
         state = COALESCE($5, doctor_profiles.state),
         phone = COALESCE($6, doctor_profiles.phone),
         available = COALESCE($7, doctor_profiles.available)
       RETURNING *`,
      [
        doctorId,
        specialization || null,
        hospitalName || null,
        city || null,
        state || null,
        phone || null,
        available !== undefined ? Boolean(available) : true,
      ]
    );
    const { rows: full } = await pool.query(
      `SELECT u.id, u.email, u.full_name, u.role,
              dp.specialization, dp.hospital_name, dp.city, dp.state,
              dp.phone, dp.available
       FROM users u
       LEFT JOIN doctor_profiles dp ON dp.user_id = u.id
       WHERE u.id = $1`,
      [doctorId]
    );
    return res.json({ profile: full[0] || rows[0] });
  } catch (err) {
    console.error('Update doctor profile error:', err);
    return res.status(500).json({ error: 'Failed to update profile' });
  }
});

// GET /api/doctor/patients
router.get('/patients', async (req, res) => {
  const doctorId = req.user.userId;
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.full_name, u.email,
              pp.age, pp.gender, pp.blood_group,
              br.id AS latest_report_id,
              br.created_at AS latest_report_at,
              br.analysis,
              br.complexity_flag
       FROM doctor_patients dp
       JOIN users u ON u.id = dp.patient_id
       LEFT JOIN patient_profiles pp ON pp.user_id = u.id
       LEFT JOIN LATERAL (
         SELECT id, created_at, analysis, complexity_flag
         FROM blood_reports
         WHERE patient_id = u.id
         ORDER BY created_at DESC
         LIMIT 1
       ) br ON TRUE
       WHERE dp.doctor_id = $1
       ORDER BY u.full_name`,
      [doctorId]
    );

    const patients = rows.map((r) => {
      const summary = r.analysis?.summary?.overall_assessment || null;
      const abnormalCount = Array.isArray(r.analysis?.abnormal_findings)
        ? r.analysis.abnormal_findings.length
        : 0;
      return {
        id: r.id,
        fullName: r.full_name,
        email: r.email,
        age: r.age,
        gender: r.gender,
        bloodGroup: r.blood_group,
        latestReport: r.latest_report_id ? {
          id: r.latest_report_id,
          createdAt: r.latest_report_at,
          summary,
          abnormalCount,
          complexityFlag: r.complexity_flag,
        } : null,
      };
    });

    return res.json({ patients });
  } catch (err) {
    console.error('Get doctor patients error:', err);
    return res.status(500).json({ error: 'Failed to fetch patients' });
  }
});

// GET /api/doctor/patients/:patientId/reports
router.get('/patients/:patientId/reports', async (req, res) => {
  const doctorId = req.user.userId;
  const { patientId } = req.params;

  try {
    if (!(await assertPatientAssigned(doctorId, patientId))) {
      return res.status(403).json({ error: 'Patient not assigned to you' });
    }

    const { rows } = await pool.query(
      `SELECT id, created_at, image_path, extracted_values, analysis,
              complexity_flag, risk_scores, follow_up
       FROM blood_reports
       WHERE patient_id = $1
       ORDER BY created_at DESC`,
      [patientId]
    );
    return res.json({ reports: rows });
  } catch (err) {
    console.error('Get patient reports error:', err);
    return res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

// POST /api/doctor/patients/:patientId/notes
router.post('/patients/:patientId/notes', async (req, res) => {
  const doctorId = req.user.userId;
  const { patientId } = req.params;
  const { note } = req.body;

  if (!note || !note.trim()) {
    return res.status(400).json({ error: 'Note text is required' });
  }

  try {
    if (!(await assertPatientAssigned(doctorId, patientId))) {
      return res.status(403).json({ error: 'Patient not assigned to you' });
    }

    const { rows } = await pool.query(
      `INSERT INTO doctor_notes (doctor_id, patient_id, note)
       VALUES ($1, $2, $3)
       RETURNING id, doctor_id, patient_id, note, created_at`,
      [doctorId, patientId, note.trim()]
    );
    return res.status(201).json({ note: rows[0] });
  } catch (err) {
    console.error('Create doctor note error:', err);
    return res.status(500).json({ error: 'Failed to save note' });
  }
});

// GET /api/doctor/patients/:patientId/notes
router.get('/patients/:patientId/notes', async (req, res) => {
  const doctorId = req.user.userId;
  const { patientId } = req.params;

  try {
    if (!(await assertPatientAssigned(doctorId, patientId))) {
      return res.status(403).json({ error: 'Patient not assigned to you' });
    }

    const { rows } = await pool.query(
      `SELECT dn.id, dn.note, dn.created_at, u.full_name AS doctor_name
       FROM doctor_notes dn
       JOIN users u ON u.id = dn.doctor_id
       WHERE dn.doctor_id = $1 AND dn.patient_id = $2
       ORDER BY dn.created_at DESC`,
      [doctorId, patientId]
    );
    return res.json({ notes: rows });
  } catch (err) {
    console.error('Get doctor notes error:', err);
    return res.status(500).json({ error: 'Failed to fetch notes' });
  }
});

// GET /api/doctor/appointments
router.get('/appointments', async (req, res) => {
  const doctorId = req.user.userId;
  try {
    const demo = await isDemoDoctorUser(req.user, pool);
    const { rows } = await pool.query(
      demo
        ? `SELECT a.id, a.patient_id, a.doctor_id, a.doctor_profile_id, a.requested_at, a.status,
                  a.reason, a.response_reason, a.created_at,
                  u.full_name AS patient_name, u.email AS patient_email,
                  COALESCE(dp.name, du.full_name) AS listed_doctor_name,
                  dp.specialization AS listed_specialization
           FROM appointments a
           JOIN users u ON u.id = a.patient_id
           LEFT JOIN doctor_profiles dp ON dp.id = a.doctor_profile_id
           LEFT JOIN users du ON du.id = a.doctor_id
           WHERE a.doctor_id = $1
              OR (a.doctor_profile_id IS NOT NULL AND a.status = 'pending')
           ORDER BY
             CASE a.status WHEN 'pending' THEN 0 ELSE 1 END,
             a.requested_at DESC`
        : `SELECT a.id, a.patient_id, a.doctor_id, a.doctor_profile_id, a.requested_at, a.status,
                  a.reason, a.response_reason, a.created_at,
                  u.full_name AS patient_name, u.email AS patient_email,
                  COALESCE(dp.name, du.full_name) AS listed_doctor_name,
                  dp.specialization AS listed_specialization
           FROM appointments a
           JOIN users u ON u.id = a.patient_id
           LEFT JOIN doctor_profiles dp ON dp.id = a.doctor_profile_id
           LEFT JOIN users du ON du.id = a.doctor_id
           WHERE a.doctor_id = $1
              OR a.doctor_profile_id IN (
                SELECT id FROM doctor_profiles WHERE user_id = $1
              )
           ORDER BY
             CASE a.status WHEN 'pending' THEN 0 ELSE 1 END,
             a.requested_at DESC`,
      [doctorId]
    );
    return res.json({ appointments: rows });
  } catch (err) {
    console.error('Get doctor appointments error:', err);
    return res.status(500).json({ error: 'Failed to fetch appointments' });
  }
});

// PUT /api/doctor/appointments/:id
router.put('/appointments/:id', async (req, res) => {
  const doctorId = req.user.userId;
  const { id } = req.params;
  const { status, reason } = req.body;

  const normalized = status === 'accepted' ? 'approved' : status === 'declined' ? 'rejected' : status;
  if (!['approved', 'rejected'].includes(normalized)) {
    return res.status(400).json({ error: 'status must be approved or rejected' });
  }

  try {
    const demo = await isDemoDoctorUser(req.user, pool);
    const { rows: existing } = await pool.query(
      demo
        ? `SELECT a.*, pu.email AS patient_email, pu.full_name AS patient_name,
                  COALESCE(du.full_name, dp.name) AS doctor_name
           FROM appointments a
           JOIN users pu ON pu.id = a.patient_id
           LEFT JOIN doctor_profiles dp ON dp.id = a.doctor_profile_id
           LEFT JOIN users du ON du.id = a.doctor_id
           WHERE a.id = $1
             AND (a.doctor_id = $2
                  OR (a.doctor_profile_id IS NOT NULL AND a.status = 'pending'))`
        : `SELECT a.*, pu.email AS patient_email, pu.full_name AS patient_name,
                  COALESCE(du.full_name, dp.name) AS doctor_name
           FROM appointments a
           JOIN users pu ON pu.id = a.patient_id
           LEFT JOIN doctor_profiles dp ON dp.id = a.doctor_profile_id
           LEFT JOIN users du ON du.id = a.doctor_id
           WHERE a.id = $1
             AND (a.doctor_id = $2
                  OR a.doctor_profile_id IN (
                    SELECT id FROM doctor_profiles WHERE user_id = $2
                  ))`,
      [id, doctorId]
    );
    if (!existing.length) {
      return res.status(404).json({ error: 'Appointment not found' });
    }
    const appt = existing[0];
    if (appt.status !== 'pending') {
      return res.status(400).json({ error: 'Only pending appointments can be updated' });
    }

    const { rows } = await pool.query(
      `UPDATE appointments
       SET status = $1,
           response_reason = $2,
           doctor_id = COALESCE(doctor_id, $4)
       WHERE id = $3
       RETURNING *`,
      [normalized, reason || null, id, doctorId]
    );

    if (normalized === 'approved') {
      await pool.query(
        `INSERT INTO doctor_patients (doctor_id, patient_id)
         SELECT $1, $2
         WHERE NOT EXISTS (
           SELECT 1 FROM doctor_patients WHERE doctor_id = $1 AND patient_id = $2
         )`,
        [doctorId, appt.patient_id]
      );

      sendApprovalEmail({
        patientEmail: appt.patient_email,
        patientName: appt.patient_name,
        doctorName: appt.doctor_name,
        scheduledAt: appt.requested_at,
        appointmentId: id,
      }).catch((e) => console.error('[doctor] Approval email failed:', e.message));
    } else {
      sendDeclineEmail({
        patientEmail: appt.patient_email,
        patientName: appt.patient_name,
        doctorName: appt.doctor_name,
        doctorNotes: reason || null,
      }).catch((e) => console.error('[doctor] Decline email failed:', e.message));
    }

    return res.json({ appointment: rows[0] });
  } catch (err) {
    console.error('Update appointment error:', err);
    return res.status(500).json({ error: 'Failed to update appointment' });
  }
});

// GET /api/doctor/shared-reports — reports patients shared (linked patients)
router.get('/shared-reports', async (req, res) => {
  const doctorId = req.user.userId;
  try {
    const { rows } = await pool.query(
      `SELECT rs.id, rs.token, rs.label, rs.created_at, rs.expires_at, rs.access_count, rs.accessed_at,
              u.full_name AS patient_name, u.email AS patient_email
         FROM report_shares rs
         JOIN users u ON u.id = rs.patient_id
        WHERE rs.patient_id IN (
          SELECT patient_id FROM doctor_patients WHERE doctor_id = $1
          UNION
          SELECT patient_id FROM appointments WHERE doctor_id = $1 AND status = 'approved'
        )
        ORDER BY rs.created_at DESC
        LIMIT 50`,
      [doctorId]
    );
    return res.json({ shares: rows });
  } catch (err) {
    console.error('Doctor shared reports error:', err);
    return res.status(500).json({ error: 'Failed to fetch shared reports' });
  }
});

module.exports = router;
