-- MedAssist AI — Seed Data
-- Demo accounts + 5 doctor profiles in Phoenix, AZ
-- Passwords are bcrypt hashes of 'password123'

-- Demo patient accounts
INSERT INTO users (email, password_hash, role, full_name) VALUES
  ('patient1@demo.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'patient', 'Alex Johnson'),
  ('patient2@demo.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'patient', 'Maria Garcia')
ON CONFLICT (email) DO NOTHING;

-- Demo doctor accounts
INSERT INTO users (email, password_hash, role, full_name) VALUES
  ('doctor1@demo.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'doctor', 'Dr. James Wilson'),
  ('doctor2@demo.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'doctor', 'Dr. Priya Patel')
ON CONFLICT (email) DO NOTHING;

-- Patient profiles
INSERT INTO patient_profiles (user_id, age, gender, weight_kg, height_cm, blood_group)
SELECT id, 28, 'male', 75.0, 178.0, 'O+' FROM users WHERE email = 'patient1@demo.com'
ON CONFLICT DO NOTHING;

INSERT INTO patient_profiles (user_id, age, gender, weight_kg, height_cm, blood_group)
SELECT id, 34, 'female', 62.0, 165.0, 'A+' FROM users WHERE email = 'patient2@demo.com'
ON CONFLICT DO NOTHING;

-- Doctor profiles (Phoenix, AZ coordinates)
INSERT INTO doctor_profiles (user_id, specialization, hospital_name, city, state, latitude, longitude, phone, available)
SELECT id, 'Cardiologist', 'Banner University Medical Center', 'Phoenix', 'AZ', 33.4714, -112.0740, '(602) 555-0101', TRUE
FROM users WHERE email = 'doctor1@demo.com'
ON CONFLICT DO NOTHING;

INSERT INTO doctor_profiles (user_id, specialization, hospital_name, city, state, latitude, longitude, phone, available)
SELECT id, 'Endocrinologist', 'Mayo Clinic Hospital', 'Phoenix', 'AZ', 33.5088, -112.0736, '(602) 555-0102', TRUE
FROM users WHERE email = 'doctor2@demo.com'
ON CONFLICT DO NOTHING;

-- Additional seeded doctors (no user account, just profiles for map display)
-- We insert them as users first with placeholder role then profiles
INSERT INTO users (email, password_hash, role, full_name) VALUES
  ('doctor3@demo.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'doctor', 'Dr. Robert Chen'),
  ('doctor4@demo.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'doctor', 'Dr. Susan Mitchell'),
  ('doctor5@demo.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'doctor', 'Dr. Ahmed Hassan')
ON CONFLICT (email) DO NOTHING;

INSERT INTO doctor_profiles (user_id, specialization, hospital_name, city, state, latitude, longitude, phone, available)
SELECT id, 'Hematologist', 'HonorHealth Scottsdale Osborn', 'Phoenix', 'AZ', 33.4942, -111.9261, '(602) 555-0103', TRUE
FROM users WHERE email = 'doctor3@demo.com'
ON CONFLICT DO NOTHING;

INSERT INTO doctor_profiles (user_id, specialization, hospital_name, city, state, latitude, longitude, phone, available)
SELECT id, 'General Physician', 'Dignity Health St. Joseph', 'Phoenix', 'AZ', 33.4773, -112.0927, '(602) 555-0104', TRUE
FROM users WHERE email = 'doctor4@demo.com'
ON CONFLICT DO NOTHING;

INSERT INTO doctor_profiles (user_id, specialization, hospital_name, city, state, latitude, longitude, phone, available)
SELECT id, 'Pulmonologist', 'Valleywise Health Medical Center', 'Phoenix', 'AZ', 33.4605, -112.0522, '(602) 555-0105', TRUE
FROM users WHERE email = 'doctor5@demo.com'
ON CONFLICT DO NOTHING;
