const pool = require('../db/pool');

/**
 * Middleware factory that logs an action to the audit_trail table.
 * Usage: router.post('/endpoint', verifyToken, auditLog('create', 'prescription'), handler)
 */
function auditLog(action, resourceType) {
  return async (req, res, next) => {
    // Fire-and-forget: don't block the request if audit logging fails
    try {
      const userId = req.user ? req.user.userId : null;
      const resourceId = (req.params && req.params.id) || (req.body && req.body.id) || null;
      const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || null;
      const userAgent = req.headers['user-agent'] || null;

      pool.query(
        `INSERT INTO audit_trail (user_id, action, resource_type, resource_id, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, action, resourceType, resourceId ? String(resourceId) : null, ipAddress, userAgent]
      ).catch((err) => console.error('[audit] Failed to log:', err.message));
    } catch (err) {
      console.error('[audit] Middleware error:', err.message);
    }
    next();
  };
}

module.exports = auditLog;
