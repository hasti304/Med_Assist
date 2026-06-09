const router = require('express').Router();
const verifyToken = require('../middleware/auth');
const { runDiagnosticAgent } = require('../agents/diagnosticAgent');
const { getRecommendedBloodTests } = require('../services/groqService');
const {
  createSymptomSession,
  getPatientProfile,
  updateSessionDiseases,
  updateSessionTests,
  saveAgentLog,
} = require('../models/patientQueries');

/**
 * POST /api/disease/predict
 * Runs the Diagnostic Agent on submitted symptoms.
 * Body: { symptoms: [{ name, severity, duration, onset }] }
 */
router.post('/predict', verifyToken, async (req, res) => {
  if (req.user.role !== 'patient') {
    return res.status(403).json({ error: 'Patient access only' });
  }

  const { symptoms } = req.body;
  if (!Array.isArray(symptoms) || symptoms.length === 0) {
    return res.status(400).json({ error: 'symptoms array is required and must not be empty' });
  }

  try {
    const patientId = req.user.userId;
    const profile = await getPatientProfile(patientId).catch(() => null);

    // Create a session row before running the agent
    const session = await createSymptomSession(patientId, symptoms);
    const sessionId = session.id;

    const { diseases, turns } = await runDiagnosticAgent(symptoms, profile);

    // Persist results + log
    await updateSessionDiseases(sessionId, diseases);
    await saveAgentLog({
      sessionId,
      agentName: 'diagnosticAgent',
      steps: [{ type: 'ensemble', description: `Ran diagnostic agent — ${turns} provider(s)` }],
      totalTurns: turns,
    });

    return res.json({ sessionId, diseases, turns });
  } catch (err) {
    console.error('Diagnostic Agent error:', err);
    return res.status(500).json({ error: 'Diagnostic Agent failed: ' + err.message });
  }
});

/**
 * POST /api/disease/tests
 * Returns recommended blood tests for a given disease.
 * Body: { sessionId, disease: { disease, icd_code, probability } }
 */
router.post('/tests', verifyToken, async (req, res) => {
  if (req.user.role !== 'patient') {
    return res.status(403).json({ error: 'Patient access only' });
  }

  const { sessionId, disease } = req.body;
  if (!disease?.disease || !disease?.icd_code) {
    return res.status(400).json({ error: 'disease object with disease and icd_code is required' });
  }

  try {
    const patientId = req.user.userId;
    const profile = await getPatientProfile(patientId).catch(() => null);

    const tests = await getRecommendedBloodTests(disease, profile);

    if (sessionId) {
      await updateSessionTests(sessionId, tests).catch((e) =>
        console.warn('[disease] Could not save tests to session:', e.message)
      );
    }

    return res.json({ sessionId: sessionId || null, tests });
  } catch (err) {
    console.error('Blood tests recommendation error:', err);
    return res.status(500).json({ error: 'Failed to get test recommendations: ' + err.message });
  }
});

module.exports = router;
