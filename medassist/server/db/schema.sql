-- MedAssist AI — PostgreSQL Schema
-- Run: psql -h localhost -U postgres -d medassist -f schema.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users (patients and doctors share this table)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('patient', 'doctor')),
  full_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Patient health profile
CREATE TABLE IF NOT EXISTS patient_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  age INT,
  gender VARCHAR(20),
  weight_kg FLOAT,
  height_cm FLOAT,
  blood_group VARCHAR(10),
  existing_conditions TEXT[],
  allergies TEXT[],
  current_medications TEXT[],
  smoking_status VARCHAR(30),
  alcohol_use VARCHAR(30),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Patient symptom sessions (each diagnostic session)
CREATE TABLE IF NOT EXISTS symptom_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES users(id),
  symptoms JSONB NOT NULL,
  predicted_diseases JSONB,
  selected_disease VARCHAR(255),
  recommended_tests JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Blood report uploads and AI analysis results
CREATE TABLE IF NOT EXISTS blood_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES symptom_sessions(id),
  patient_id UUID REFERENCES users(id),
  image_path TEXT NOT NULL,
  extracted_values JSONB,
  analysis JSONB,
  tablet_recommendations JSONB,
  complexity_flag BOOLEAN DEFAULT FALSE,
  translations JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW()
);


-- Agent execution audit log (for course submission + debugging)
CREATE TABLE IF NOT EXISTS agent_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID,
  agent_name VARCHAR(100),
  steps JSONB,
  total_turns INT,
  created_at TIMESTAMP DEFAULT NOW()
);


-- Magic link tokens for passwordless login
CREATE TABLE IF NOT EXISTS magic_link_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  token VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);
