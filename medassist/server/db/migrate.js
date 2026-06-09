const pool = require('./pool');

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS supplement_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id UUID REFERENCES users(id) ON DELETE CASCADE,
      ingredient_name VARCHAR(255) NOT NULL,
      taken_at DATE NOT NULL DEFAULT CURRENT_DATE,
      UNIQUE(patient_id, ingredient_name, taken_at)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS reminders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id UUID REFERENCES users(id) ON DELETE CASCADE,
      report_id UUID REFERENCES blood_reports(id) ON DELETE CASCADE,
      message TEXT NOT NULL,
      send_at TIMESTAMP NOT NULL,
      sent BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS doctor_profiles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
      specialization VARCHAR(100),
      hospital_name VARCHAR(255),
      city VARCHAR(100),
      state VARCHAR(50),
      latitude FLOAT,
      longitude FLOAT,
      phone VARCHAR(30),
      available BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS doctor_notes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      doctor_id UUID REFERENCES users(id) ON DELETE CASCADE,
      patient_id UUID REFERENCES users(id) ON DELETE CASCADE,
      note TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS doctor_patients (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      doctor_id UUID REFERENCES users(id) ON DELETE CASCADE,
      patient_id UUID REFERENCES users(id) ON DELETE CASCADE,
      added_at TIMESTAMP DEFAULT NOW(),
      notes TEXT,
      UNIQUE (doctor_id, patient_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS appointments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id UUID REFERENCES users(id) ON DELETE CASCADE,
      doctor_id UUID REFERENCES users(id) ON DELETE CASCADE,
      requested_at TIMESTAMP NOT NULL DEFAULT NOW(),
      status VARCHAR(30) DEFAULT 'pending',
      reason TEXT,
      response_reason TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reason TEXT`);
  await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS response_reason TEXT`);
  await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()`);
  await pool.query(`
    ALTER TABLE appointments ADD COLUMN IF NOT EXISTS doctor_profile_id UUID REFERENCES doctor_profiles(id)
  `);

  await pool.query(`ALTER TABLE doctor_profiles ADD COLUMN IF NOT EXISTS name VARCHAR(255)`);
  await pool.query(`ALTER TABLE doctor_profiles ALTER COLUMN user_id DROP NOT NULL`);

  // Cached LLM outputs (daily tips, vitals insights, translations)
  await pool.query(`ALTER TABLE blood_reports ADD COLUMN IF NOT EXISTS daily_tips JSONB`);
  await pool.query(`ALTER TABLE blood_reports ADD COLUMN IF NOT EXISTS daily_tips_generated_at TIMESTAMP`);
  await pool.query(`ALTER TABLE blood_reports ADD COLUMN IF NOT EXISTS translations JSONB`);
  await pool.query(`ALTER TABLE blood_reports ADD COLUMN IF NOT EXISTS risk_scores JSONB`);
  await pool.query(`ALTER TABLE patient_profiles ADD COLUMN IF NOT EXISTS vitals_insights JSONB`);

  // follow_up must be JSONB (legacy DBs may have boolean)
  await pool.query(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'blood_reports'
          AND column_name = 'follow_up' AND udt_name <> 'jsonb'
      ) THEN
        ALTER TABLE blood_reports DROP COLUMN follow_up;
      END IF;
    END $$
  `);
  await pool.query(`ALTER TABLE blood_reports ADD COLUMN IF NOT EXISTS follow_up JSONB`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS vitals_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id UUID REFERENCES users(id) ON DELETE CASCADE,
      type VARCHAR(50) NOT NULL,
      value FLOAT NOT NULL,
      value2 FLOAT,
      unit VARCHAR(20),
      recorded_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS report_shares (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      token VARCHAR(255) UNIQUE NOT NULL,
      session_id UUID REFERENCES symptom_sessions(id),
      patient_id UUID REFERENCES users(id),
      expires_at TIMESTAMP NOT NULL,
      accessed_at TIMESTAMP,
      access_count INT DEFAULT 0,
      access_log JSONB DEFAULT '[]'::jsonb,
      label VARCHAR(120),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    ALTER TABLE report_shares ADD COLUMN IF NOT EXISTS access_count INT DEFAULT 0
  `);
  await pool.query(`
    ALTER TABLE report_shares ADD COLUMN IF NOT EXISTS access_log JSONB DEFAULT '[]'::jsonb
  `);
  await pool.query(`
    ALTER TABLE report_shares ADD COLUMN IF NOT EXISTS label VARCHAR(120)
  `);
  await pool.query(`
    ALTER TABLE patient_profiles ADD COLUMN IF NOT EXISTS insurance_info JSONB
  `);
  await pool.query(`
    ALTER TABLE patient_profiles ADD COLUMN IF NOT EXISTS reminder_preferences JSONB DEFAULT '{"email":true,"sms":false}'::jsonb
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS medical_id (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
      emergency_name VARCHAR(255),
      emergency_phone VARCHAR(30),
      blood_type VARCHAR(10),
      organ_donor BOOLEAN DEFAULT FALSE,
      critical_notes TEXT,
      pin_hash VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    ALTER TABLE symptom_sessions ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'pending'
  `);
  await pool.query(`
    ALTER TABLE symptom_sessions ADD COLUMN IF NOT EXISTS selected_disease_data JSONB
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS medication_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id UUID REFERENCES users(id) ON DELETE CASCADE,
      medication_name VARCHAR(255) NOT NULL,
      dose VARCHAR(100),
      taken_at TIMESTAMP DEFAULT NOW(),
      report_id UUID REFERENCES blood_reports(id),
      active BOOLEAN DEFAULT TRUE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS agent_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id UUID,
      agent_name VARCHAR(100),
      steps JSONB,
      total_turns INT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  try {
    const { seedIndianDoctors } = require('./seedIndianDoctors');
    await seedIndianDoctors();
  } catch (err) {
    console.error('[migrate] Doctor directory seed failed:', err.message);
  }

  try {
    const { seedDemoDoctors } = require('./seedDemoDoctors');
    await seedDemoDoctors();
  } catch (err) {
    console.error('[migrate] Demo doctor seed failed:', err.message);
  }

  console.log('[migrate] Tables ensured: supplement_logs, reminders, doctor_profiles, doctor_notes, appointments');
}

module.exports = migrate;
