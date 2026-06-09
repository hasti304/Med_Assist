const router = require('express').Router();
const pool = require('../db/pool');

// GET /api/doctors?city=&specialization=&available=
// Public directory — no authentication
router.get('/', async (req, res) => {
  const { city, specialization, available } = req.query;

  try {
    const conditions = ['1=1'];
    const params = [];

    if (city) {
      params.push(city);
      conditions.push(`dp.city ILIKE $${params.length}`);
    }
    if (specialization) {
      params.push(specialization);
      conditions.push(`dp.specialization ILIKE $${params.length}`);
    }
    if (available === 'true') {
      conditions.push('dp.available = TRUE');
    } else if (available === 'false') {
      conditions.push('dp.available = FALSE');
    }

    const { rows } = await pool.query(
      `SELECT dp.id,
              COALESCE(dp.name, u.full_name) AS name,
              dp.specialization,
              dp.hospital_name,
              dp.city,
              dp.state,
              dp.phone,
              dp.available,
              dp.latitude,
              dp.longitude
       FROM doctor_profiles dp
       LEFT JOIN users u ON u.id = dp.user_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY dp.available DESC NULLS LAST, dp.city ASC, dp.name ASC`,
      params
    );

    return res.json({ doctors: rows });
  } catch (err) {
    console.error('GET /api/doctors error:', err);
    return res.status(500).json({ error: 'Failed to fetch doctors' });
  }
});

module.exports = router;
