module.exports = function requirePatient(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (req.user.role !== 'patient') {
    return res.status(403).json({ error: 'Patient access required' });
  }
  next();
};
