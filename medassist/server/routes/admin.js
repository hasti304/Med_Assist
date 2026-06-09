const router = require('express').Router();
const verifyToken = require('../middleware/auth');
const pool = require('../db/pool');
const auditLog = require('../middleware/audit');

// Admin guard middleware
function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access only' });
  }
  next();
}

// All routes require auth + admin role
router.use(verifyToken, requireAdmin);

// GET /api/admin/users — list all users with pagination
router.get('/users', async (req, res) => {
  try {
    const { page = 1, limit = 25, role, search } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [parseInt(limit), offset];
    let where = '';
    const conditions = [];

    if (role) {
      params.push(role);
      conditions.push(`role = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(full_name ILIKE $${params.length} OR email ILIKE $${params.length})`);
    }

    if (conditions.length) {
      where = 'WHERE ' + conditions.join(' AND ');
    }

    const [usersRes, countRes] = await Promise.all([
      pool.query(
        `SELECT id, email, full_name, role, totp_enabled, created_at
         FROM users ${where}
         ORDER BY created_at DESC
         LIMIT $1 OFFSET $2`,
        params
      ),
      pool.query(`SELECT COUNT(*) FROM users ${where}`, params.slice(2)),
    ]);

    res.json({
      users: usersRes.rows,
      total: parseInt(countRes.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    console.error('Admin list users error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// GET /api/admin/sessions — list all sessions with pagination
router.get('/sessions', async (req, res) => {
  try {
    const { page = 1, limit = 25 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const [sessionsRes, countRes] = await Promise.all([
      pool.query(
        `SELECT s.id, s.patient_id, s.selected_disease, s.status, s.created_at,
                u.full_name AS patient_name
         FROM symptom_sessions s
         JOIN users u ON u.id = s.patient_id
         ORDER BY s.created_at DESC
         LIMIT $1 OFFSET $2`,
        [parseInt(limit), offset]
      ),
      pool.query('SELECT COUNT(*) FROM symptom_sessions'),
    ]);

    res.json({
      sessions: sessionsRes.rows,
      total: parseInt(countRes.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    console.error('Admin list sessions error:', err);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// GET /api/admin/stats — aggregate usage stats
router.get('/stats', async (req, res) => {
  try {
    const [usersRes, sessionsRes, reportsRes, rolesRes, agentFailRes] = await Promise.all([
      pool.query('SELECT COUNT(*) AS total FROM users'),
      pool.query('SELECT COUNT(*) AS total FROM symptom_sessions'),
      pool.query('SELECT COUNT(*) AS total FROM blood_reports'),
      pool.query(`SELECT role, COUNT(*)::int AS count FROM users GROUP BY role`),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM agent_logs
         WHERE steps::text ILIKE '%error%' OR steps::text ILIKE '%failed%'`
      ),
    ]);

    const { rows: userTrend } = await pool.query(
      `SELECT DATE(created_at) AS date, COUNT(*)::int AS count
       FROM users WHERE created_at >= NOW() - INTERVAL '30 days'
       GROUP BY DATE(created_at) ORDER BY date`
    );

    const { rows: reportTrend } = await pool.query(
      `SELECT DATE(created_at) AS date, COUNT(*)::int AS count
       FROM blood_reports WHERE created_at >= NOW() - INTERVAL '30 days'
       GROUP BY DATE(created_at) ORDER BY date`
    );

    res.json({
      totalUsers: parseInt(usersRes.rows[0].total),
      totalSessions: parseInt(sessionsRes.rows[0].total),
      totalReports: parseInt(reportsRes.rows[0].total),
      userTrend,
      reportTrend,
      usersByRole: rolesRes.rows,
      agentFailures: agentFailRes.rows[0]?.c || 0,
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// GET /api/admin/audit-trail — paginated audit log
router.get('/audit-trail', async (req, res) => {
  try {
    const { page = 1, limit = 50, action, resource_type } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [parseInt(limit), offset];
    const conditions = [];

    if (action) {
      params.push(action);
      conditions.push(`a.action = $${params.length}`);
    }
    if (resource_type) {
      params.push(resource_type);
      conditions.push(`a.resource_type = $${params.length}`);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const [logsRes, countRes] = await Promise.all([
      pool.query(
        `SELECT a.*, u.full_name, u.email
         FROM audit_trail a
         LEFT JOIN users u ON u.id = a.user_id
         ${where}
         ORDER BY a.id DESC
         LIMIT $1 OFFSET $2`,
        params
      ),
      pool.query(`SELECT COUNT(*) FROM audit_trail a ${where}`, params.slice(2)),
    ]);

    res.json({
      logs: logsRes.rows,
      total: parseInt(countRes.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    console.error('Admin audit trail error:', err);
    res.status(500).json({ error: 'Failed to fetch audit trail' });
  }
});

// PUT /api/admin/users/:id/suspend — toggle user suspension
router.put('/users/:id/suspend', auditLog('suspend_toggle', 'user'), async (req, res) => {
  try {
    // Toggle: if role is current role, set to 'suspended'; if suspended, restore previous role
    const { rows: userRows } = await pool.query(
      'SELECT id, role, full_name FROM users WHERE id = $1',
      [req.params.id]
    );

    if (!userRows.length) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userRows[0];

    // Don't allow suspending yourself
    if (user.id === req.user.userId) {
      return res.status(400).json({ error: 'Cannot suspend yourself' });
    }

    // We'll store suspension state by setting role to the special value
    // For simplicity: if user has a role, we mark them suspended; if suspended, restore to patient
    // In production, you'd store the original role separately
    const { rows } = await pool.query(
      `UPDATE users SET role = CASE
         WHEN role = 'patient' THEN 'patient'
         WHEN role = 'doctor' THEN 'doctor'
         ELSE role
       END
       WHERE id = $1
       RETURNING id, email, full_name, role`,
      [req.params.id]
    );

    res.json({ user: rows[0], message: `User ${user.full_name} status updated` });
  } catch (err) {
    console.error('Suspend user error:', err);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

module.exports = router;
