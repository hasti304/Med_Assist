/**
 * Two login-enabled demo doctor accounts for portfolio demonstrations.
 * They can approve/reject appointment requests made to any directory doctor.
 */
const bcrypt = require('bcryptjs');
const pool = require('./pool');
const { DEMO_DOCTOR_EMAILS, DEMO_PASSWORD } = require('../utils/demoDoctors');

const DEMO_DOCTORS = [
  {
    email: DEMO_DOCTOR_EMAILS[0],
    fullName: 'Dr. Sarah Chen (Demo)',
    specialization: 'General Medicine — Demo Portal',
    hospital: 'MedAssist Demo Clinic',
    city: 'Chicago',
    state: 'IL',
    lat: 41.8781,
    lng: -87.6298,
    phone: '+1 (312) 555-0101',
  },
  {
    email: DEMO_DOCTOR_EMAILS[1],
    fullName: 'Dr. Marcus Reed (Demo)',
    specialization: 'Multi-Specialty — Demo Portal',
    hospital: 'MedAssist Demo Hospital',
    city: 'New York',
    state: 'NY',
    lat: 40.7128,
    lng: -74.0060,
    phone: '+1 (212) 555-0102',
  },
];

async function seedDemoDoctors() {
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE
  `);

  const hash = await bcrypt.hash(DEMO_PASSWORD, 12);

  for (const d of DEMO_DOCTORS) {
    const { rows: existing } = await pool.query('SELECT id FROM users WHERE email = $1', [d.email]);
    let userId;

    if (existing.length) {
      userId = existing[0].id;
      await pool.query(
        `UPDATE users
         SET password_hash = $1, role = 'doctor', full_name = $2, email_verified = TRUE
         WHERE id = $3`,
        [hash, d.fullName, userId]
      );
    } else {
      const { rows } = await pool.query(
        `INSERT INTO users (email, password_hash, role, full_name, email_verified)
         VALUES ($1, $2, 'doctor', $3, TRUE)
         RETURNING id`,
        [d.email, hash, d.fullName]
      );
      userId = rows[0].id;
    }

    await pool.query(
      `INSERT INTO doctor_profiles
         (user_id, name, specialization, hospital_name, city, state,
          latitude, longitude, phone, available)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE)
       ON CONFLICT (user_id) DO UPDATE SET
         name = EXCLUDED.name,
         specialization = EXCLUDED.specialization,
         hospital_name = EXCLUDED.hospital_name,
         city = EXCLUDED.city,
         state = EXCLUDED.state,
         latitude = EXCLUDED.latitude,
         longitude = EXCLUDED.longitude,
         phone = EXCLUDED.phone,
         available = TRUE`,
      [userId, d.fullName, d.specialization, d.hospital, d.city, d.state, d.lat, d.lng, d.phone]
    );
  }

  console.log('[seed] Demo doctor logins (password: DemoDoc2024):');
  console.log('[seed]   demo.doctor1@medassist.com — Dr. Sarah Chen (Demo)');
  console.log('[seed]   demo.doctor2@medassist.com — Dr. Marcus Reed (Demo)');
}

module.exports = { seedDemoDoctors, DEMO_DOCTORS, DEMO_PASSWORD };
