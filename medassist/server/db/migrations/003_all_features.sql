-- Migration 003: All suggestion features (P0–P3)
-- Run: psql $DATABASE_URL -f 003_all_features.sql

-- Password reset tokens (I2)
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Report sharing tokens (P1 Share Report)
CREATE TABLE IF NOT EXISTS report_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token VARCHAR(255) UNIQUE NOT NULL,
  session_id UUID REFERENCES symptom_sessions(id),
  patient_id UUID REFERENCES users(id),
  expires_at TIMESTAMP NOT NULL,
  accessed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Health vitals logs (P1 Vitals Tracker)
CREATE TABLE IF NOT EXISTS vitals_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL, -- blood_pressure, glucose, weight, heart_rate, spo2, temperature
  value FLOAT NOT NULL,
  value2 FLOAT, -- for systolic/diastolic BP
  unit VARCHAR(20),
  recorded_at TIMESTAMP DEFAULT NOW()
);

-- Medication logs (P2 Medication Tracker)
CREATE TABLE IF NOT EXISTS medication_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES users(id) ON DELETE CASCADE,
  medication_name VARCHAR(255) NOT NULL,
  dose VARCHAR(100),
  taken_at TIMESTAMP DEFAULT NOW(),
  report_id UUID REFERENCES blood_reports(id),
  active BOOLEAN DEFAULT TRUE
);

-- Medical ID / Emergency contact (P2)
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
);

-- Doctor-patient access (D1 Patient Records Viewer)
CREATE TABLE IF NOT EXISTS patient_doctor_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES users(id),
  doctor_id UUID REFERENCES users(id),
  session_id UUID REFERENCES symptom_sessions(id),
  granted_at TIMESTAMP DEFAULT NOW(),
  revoked_at TIMESTAMP
);

-- Prescriptions (D2 Digital Prescription Writer)
CREATE TABLE IF NOT EXISTS prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID REFERENCES users(id),
  patient_case JSONB,
  medications JSONB,
  notes TEXT,
  issued_at TIMESTAMP DEFAULT NOW()
);

-- Doctor-patient panel (D4)
CREATE TABLE IF NOT EXISTS doctor_patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID REFERENCES users(id),
  patient_id UUID REFERENCES users(id),
  added_at TIMESTAMP DEFAULT NOW(),
  notes TEXT
);

-- Appointments (D5)
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES users(id),
  doctor_id UUID REFERENCES users(id),
  requested_at TIMESTAMP DEFAULT NOW(),
  scheduled_at TIMESTAMP,
  status VARCHAR(30) DEFAULT 'pending', -- pending, accepted, declined, completed
  notes TEXT
);

-- HIPAA Audit trail (I9)
CREATE TABLE IF NOT EXISTS audit_trail (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50),
  resource_id UUID,
  ip_address VARCHAR(50),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Add clinical_notes to doctor_assist_sessions (D7)
ALTER TABLE doctor_assist_sessions ADD COLUMN IF NOT EXISTS clinical_notes TEXT;

-- Add risk_scores to blood_reports (A1)
ALTER TABLE blood_reports ADD COLUMN IF NOT EXISTS risk_scores JSONB;

-- Add follow_up to blood_reports (A2)
ALTER TABLE blood_reports ADD COLUMN IF NOT EXISTS follow_up JSONB;

-- Add insurance_info to patient_profiles (P3)
ALTER TABLE patient_profiles ADD COLUMN IF NOT EXISTS insurance_info JSONB;

-- Add admin role support
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('patient', 'doctor', 'admin'));

-- Add TOTP columns for 2FA (I8)
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN DEFAULT FALSE;

-- Add selected_disease_data if missing
ALTER TABLE symptom_sessions ADD COLUMN IF NOT EXISTS selected_disease_data JSONB;

-- Add status column if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'symptom_sessions' AND column_name = 'status'
  ) THEN
    ALTER TABLE symptom_sessions ADD COLUMN status VARCHAR(30) DEFAULT 'pending';
  END IF;
END $$;

-- Add patient_id to prescriptions for direct patient linkage
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS patient_id UUID REFERENCES users(id);

-- Unique constraints on profile tables (one profile per user)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'patient_profiles_user_id_unique') THEN
    ALTER TABLE patient_profiles ADD CONSTRAINT patient_profiles_user_id_unique UNIQUE (user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'doctor_profiles_user_id_unique') THEN
    ALTER TABLE doctor_profiles ADD CONSTRAINT doctor_profiles_user_id_unique UNIQUE (user_id);
  END IF;
END $$;
