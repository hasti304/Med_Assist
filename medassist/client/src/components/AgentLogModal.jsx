import { useState, useEffect, useRef } from 'react';
import api from '../services/api';

function ToolResultPreview({ result }) {
  if (!result) return <span className="text-slate-400 italic">no result</span>;
  if (result.error) return <span className="text-red-500">{result.error}</span>;

  // Summarise common tool results concisely
  if (result.results) {
    // ICD lookup
    const codes = result.results.slice(0, 3).map(r => `${r.code} — ${r.name}`).join('; ');
    return <span className="text-green-700">{codes || 'No results'}</span>;
  }
  if (result.drugs) {
    const names = result.drugs.slice(0, 3).map(d => d.generic_name || d.brand_name).join(', ');
    return <span className="text-green-700">{result.drugs.length} drug(s): {names}</span>;
  }
  if (result.interactions) {
    return <span className={result.interactions.length ? 'text-orange-600' : 'text-green-700'}>
      {result.interactions.length} interaction(s) found
    </span>;
  }
  if (result.parameter) {
    // Lab range
    const entries = Object.entries(result)
      .filter(([k]) => !['parameter'].includes(k) && typeof result[k] !== 'object')
      .slice(0, 3)
      .map(([k, v]) => `${k}: ${v}`)
      .join(' · ');
    return <span className="text-green-700">{entries}</span>;
  }
  if (result.note) return <span className="text-yellow-600 italic">{result.note}</span>;

  // Generic fallback
  const str = JSON.stringify(result).slice(0, 120);
  return <span className="text-slate-600 font-mono">{str}</span>;
}

function StepRow({ step, index }) {
  const [expanded, setExpanded] = useState(false);
  const ts = step.timestamp
    ? new Date(step.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '';

  const argsStr = step.args
    ? Object.entries(step.args).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' · ')
    : '';

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full text-left px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors flex items-start gap-3"
      >
        <span className="shrink-0 bg-blue-100 text-blue-700 text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center mt-0.5">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-slate-800 font-mono">🔧 {step.tool}</span>
            {ts && <span className="text-xs text-slate-400">{ts}</span>}
          </div>
          {argsStr && (
            <p className="text-xs text-slate-500 mt-0.5 truncate">{argsStr}</p>
          )}
        </div>
        <span className="text-slate-400 text-xs shrink-0">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="px-4 py-3 space-y-3 bg-white border-t border-slate-200">
          {step.args && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Input Parameters</p>
              <pre className="text-xs bg-slate-50 rounded-lg px-3 py-2 overflow-x-auto text-slate-700">
                {JSON.stringify(step.args, null, 2)}
              </pre>
            </div>
          )}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Result</p>
            <div className="text-xs bg-slate-50 rounded-lg px-3 py-2">
              <ToolResultPreview result={step.result} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AgentLogModal({ sessionId, agentName, onClose }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const overlayRef = useRef(null);

  useEffect(() => {
    if (!sessionId) return;
    api.get(`/agent/logs/${sessionId}`)
      .then(res => {
        setLogs(res.data.logs || []);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [sessionId]);

  // Close on overlay click
  const handleOverlayClick = e => {
    if (e.target === overlayRef.current) onClose();
  };

  // Close on Escape
  useEffect(() => {
    const handler = e => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const allSteps = logs.flatMap(log => {
    try {
      return Array.isArray(log.steps) ? log.steps : JSON.parse(log.steps || '[]');
    } catch { return []; }
  });

  const totalTurns = logs.reduce((sum, l) => sum + (l.total_turns || 0), 0);

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="agent-log-title"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">

        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div>
            <h2 id="agent-log-title" className="font-bold text-slate-800 text-lg">Agent Audit Log</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {agentName && <span className="font-medium">{agentName}</span>}
              {totalTurns > 0 && <span> · {totalTurns} reasoning turn{totalTurns !== 1 ? 's' : ''}</span>}
              {allSteps.length > 0 && <span> · {allSteps.length} tool call{allSteps.length !== 1 ? 's' : ''}</span>}
            </p>
          </div>
          <button onClick={onClose}
            className="text-slate-400 hover:text-slate-700 text-2xl leading-none transition-colors"
            aria-label="Close agent log">
            ×
          </button>
        </div>

        {/* Modal body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
              Failed to load log: {error}
            </div>
          )}

          {!loading && !error && allSteps.length === 0 && (
            <div className="text-center py-16 text-slate-400 text-sm">
              No tool calls recorded for this session.
            </div>
          )}

          {!loading && allSteps.map((step, i) => (
            <StepRow key={i} step={step} index={i} />
          ))}
        </div>

        {/* Modal footer */}
        <div className="px-6 py-3 border-t border-slate-200 shrink-0 flex justify-between items-center">
          <p className="text-xs text-slate-400 italic">
            Tool calls are logged for educational transparency.
          </p>
          <button onClick={onClose}
            className="text-sm text-slate-600 border border-slate-300 px-4 py-1.5 rounded-lg hover:bg-slate-50 transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
