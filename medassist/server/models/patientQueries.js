const pool = require('../db/pool');

async function getPatientProfile(userId) {
  const { rows } = await pool.query(
    'SELECT * FROM patient_profiles WHERE user_id = $1',
    [userId]
  );
  return rows[0] || null;
}

async function upsertPatientProfile(userId, data) {
  const {
    age, gender, weightKg, heightCm, bloodGroup,
    existingConditions, allergies, currentMedications,
    smokingStatus, alcoholUse,
  } = data;

  const existing = await getPatientProfile(userId);

  if (existing) {
    const { rows } = await pool.query(
      `UPDATE patient_profiles SET
         age=$2, gender=$3, weight_kg=$4, height_cm=$5, blood_group=$6,
         existing_conditions=$7, allergies=$8, current_medications=$9,
         smoking_status=$10, alcohol_use=$11, updated_at=NOW()
       WHERE user_id=$1
       RETURNING *`,
      [
        userId, age, gender, weightKg, heightCm, bloodGroup,
        existingConditions, allergies, currentMedications,
        smokingStatus, alcoholUse,
      ]
    );
    return rows[0];
  } else {
    const { rows } = await pool.query(
      `INSERT INTO patient_profiles
         (user_id, age, gender, weight_kg, height_cm, blood_group,
          existing_conditions, allergies, current_medications,
          smoking_status, alcohol_use)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        userId, age, gender, weightKg, heightCm, bloodGroup,
        existingConditions, allergies, currentMedications,
        smokingStatus, alcoholUse,
      ]
    );
    return rows[0];
  }
}

async function createSymptomSession(patientId, symptoms) {
  const { rows } = await pool.query(
    `INSERT INTO symptom_sessions (patient_id, symptoms)
     VALUES ($1, $2)
     RETURNING id`,
    [patientId, JSON.stringify(symptoms)]
  );
  return rows[0];
}

async function getSymptomSession(sessionId) {
  const { rows } = await pool.query(
    'SELECT * FROM symptom_sessions WHERE id = $1',
    [sessionId]
  );
  return rows[0] || null;
}

async function updateSessionDiseases(sessionId, diseases) {
  await pool.query(
    'UPDATE symptom_sessions SET predicted_diseases = $1 WHERE id = $2',
    [JSON.stringify(diseases), sessionId]
  );
}

async function saveAgentLog({ sessionId, agentName, steps, totalTurns }) {
  await pool.query(
    `INSERT INTO agent_logs (session_id, agent_name, steps, total_turns)
     VALUES ($1, $2, $3, $4)`,
    [sessionId, agentName, JSON.stringify(steps), totalTurns]
  );
}

async function updateSessionTests(sessionId, tests) {
  await pool.query(
    'UPDATE symptom_sessions SET recommended_tests = $1::jsonb WHERE id = $2',
    [JSON.stringify(tests), sessionId]
  );
}

// Update session progress status
// Valid values: 'pending' | 'diagnosed' | 'tests_ready' | 'report_uploaded' | 'analyzed'
async function updateSessionStatus(sessionId, status) {
  await pool.query(
    'UPDATE symptom_sessions SET status = $1 WHERE id = $2',
    [status, sessionId]
  );
}

// Save the full selected disease object + update status to tests_ready
async function updateSelectedDisease(sessionId, disease) {
  await pool.query(
    `UPDATE symptom_sessions
     SET selected_disease      = $1,
         selected_disease_data = $2::jsonb,
         status                = 'tests_ready'
     WHERE id = $3`,
    [
      disease.disease || String(disease),
      JSON.stringify(disease),
      sessionId,
    ]
  );
}

// Fetch a single session with ownership check + linked report_id
async function getSessionById(sessionId, patientId) {
  const { rows } = await pool.query(
    `SELECT s.*,
            (SELECT br.id
               FROM blood_reports br
              WHERE br.session_id = s.id
              ORDER BY br.created_at DESC
              LIMIT 1) AS report_id
       FROM symptom_sessions s
      WHERE s.id = $1
        AND s.patient_id = $2`,
    [sessionId, patientId]
  );
  return rows[0] || null;
}

// List recent sessions for a patient (includes status + report linkage)
async function getPatientSessions(patientId, limit = 10) {
  const { rows } = await pool.query(
    `SELECT s.id,
            s.symptoms,
            s.predicted_diseases,
            s.selected_disease,
            s.selected_disease_data,
            s.recommended_tests,
            s.status,
            s.created_at,
            (SELECT br.id
               FROM blood_reports br
              WHERE br.session_id = s.id
              ORDER BY br.created_at DESC
              LIMIT 1) AS report_id
       FROM symptom_sessions s
      WHERE s.patient_id = $1
      ORDER BY s.created_at DESC
      LIMIT $2`,
    [patientId, limit]
  );
  return rows;
}

module.exports = {
  getPatientProfile, upsertPatientProfile,
  createSymptomSession, getSymptomSession,
  updateSessionDiseases, saveAgentLog, updateSessionTests,
  updateSessionStatus, updateSelectedDisease,
  getSessionById, getPatientSessions,
};
