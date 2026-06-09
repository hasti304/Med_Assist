const router = require('express').Router();
const pool = require('../db/pool');
const { getEmitter } = require('../utils/eventEmitter');

// GET /api/agent/status/:sessionId  — SSE stream of live diagnostic agent steps
router.get('/status/:sessionId', (req, res) => {
  const { sessionId } = req.params;

  try {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    const send = (event, data) => {
      try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch { /* client gone */ }
    };

    // Send heartbeat immediately so client knows connection is live
    send('connected', { sessionId });

    const emitter = getEmitter(sessionId);

    const onStep = (step) => send('step', step);
    const onDone = (result) => {
      send('done', result);
      cleanup();
      res.end();
    };
    const onError = (err) => {
      send('error', { message: err?.message || 'Agent error' });
      cleanup();
      res.end();
    };

    emitter.on('step', onStep);
    emitter.on('done', onDone);
    emitter.on('error', onError);

    function cleanup() {
      emitter.off('step', onStep);
      emitter.off('done', onDone);
      emitter.off('error', onError);
    }

    req.on('close', cleanup);
  } catch (err) {
    console.error('[agentStatus] SSE setup error:', err.message);
    if (!res.headersSent) res.status(500).end();
  }
});

// GET /api/agent/logs/:sessionId  — agent tool call audit log
router.get('/logs/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  try {
    const { rows } = await pool.query(
      'SELECT * FROM agent_logs WHERE session_id = $1 ORDER BY created_at ASC',
      [sessionId]
    );
    res.json({ logs: rows });
  } catch (err) {
    console.error('Agent logs error:', err);
    res.status(500).json({ error: 'Failed to fetch agent logs' });
  }
});

module.exports = router;
