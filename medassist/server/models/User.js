const pool = require('../db/pool');

async function findByEmail(email) {
  const { rows } = await pool.query(
    'SELECT * FROM users WHERE email = $1',
    [email]
  );
  return rows[0] || null;
}

async function createUser({ email, passwordHash, role, fullName }) {
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, role, full_name)
     VALUES ($1, $2, $3, $4)
     RETURNING id, email, role, full_name`,
    [email, passwordHash, role, fullName]
  );
  return rows[0];
}

module.exports = { findByEmail, createUser };
