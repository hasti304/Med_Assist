import { useState, useEffect, useRef } from 'react';
import { formatAgentStep } from '../utils/agentSteps';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

/**
 * Connects to SSE endpoint and streams live diagnostic agent steps.
 * @param {string|null} sessionId
 * @returns {{ steps, status, connected }}
 */
export function useAgentStatus(sessionId) {
  const [steps, setSteps] = useState([]);
  const [status, setStatus] = useState('idle'); // idle | connecting | running | done | error
  const [connected, setConnected] = useState(false);
  const esRef = useRef(null);

  useEffect(() => {
    if (!sessionId) return;

    setStatus('connecting');
    const es = new EventSource(`${API_BASE}/api/agent/status/${sessionId}`);
    esRef.current = es;

    es.addEventListener('connected', () => {
      setConnected(true);
      setStatus('running');
    });

    es.addEventListener('step', (e) => {
      try {
        const raw = JSON.parse(e.data);
        setSteps((prev) => [...prev, formatAgentStep(raw)]);
      } catch { /* ignore parse errors */ }
    });

    es.addEventListener('done', () => {
      setStatus('done');
      setConnected(false);
      es.close();
    });

    es.onerror = () => {
      setStatus('error');
      setConnected(false);
      es.close();
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [sessionId]);

  return { steps, status, connected };
}
