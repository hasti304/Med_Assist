const EventEmitter = require('events');

// Session-scoped EventEmitter map — used by SSE endpoint (Day 5)
const sessionEmitters = new Map();

function getEmitter(sessionId) {
  if (!sessionEmitters.has(sessionId)) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(5);
    sessionEmitters.set(sessionId, emitter);
    // Auto-cleanup after 10 minutes
    setTimeout(() => sessionEmitters.delete(sessionId), 10 * 60 * 1000);
  }
  return sessionEmitters.get(sessionId);
}

function deleteEmitter(sessionId) {
  sessionEmitters.delete(sessionId);
}

module.exports = { getEmitter, deleteEmitter };
