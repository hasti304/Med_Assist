const DEMO_DOCTOR_EMAILS = [
  'demo.doctor1@medassist.com',
  'demo.doctor2@medassist.com',
];

const DEMO_PASSWORD = 'DemoDoc2024';

async function getDemoDoctorUsers(pool) {
  const { rows } = await pool.query(
    `SELECT id, email, full_name FROM users
     WHERE email = ANY($1::text[]) AND role = 'doctor'
     ORDER BY email`,
    [DEMO_DOCTOR_EMAILS]
  );
  return rows;
}

function isDemoDoctorEmail(email) {
  return email && DEMO_DOCTOR_EMAILS.includes(email.toLowerCase());
}

async function isDemoDoctor(pool, userId) {
  const { rows } = await pool.query(
    `SELECT 1 FROM users WHERE id = $1 AND email = ANY($2::text[])`,
    [userId, DEMO_DOCTOR_EMAILS]
  );
  return rows.length > 0;
}

/** Prefer JWT email (no DB); fall back to DB lookup for older tokens. */
function isDemoDoctorUser(user, pool) {
  if (isDemoDoctorEmail(user?.email)) return Promise.resolve(true);
  if (user?.userId && pool) return isDemoDoctor(pool, user.userId);
  return Promise.resolve(false);
}

module.exports = {
  DEMO_DOCTOR_EMAILS,
  DEMO_PASSWORD,
  getDemoDoctorUsers,
  isDemoDoctor,
  isDemoDoctorEmail,
  isDemoDoctorUser,
};
