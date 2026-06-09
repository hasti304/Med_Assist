import { useState, useEffect, useRef } from 'react';

const STATUS_LABELS = {
  idle: '',
  connecting: 'Connecting to AI agent...',
  running: 'AI agent is working...',
  done: 'Analysis complete',
  error: 'Connection lost',
};

const STEP_ICON = {
  tool_call: '🔧',
  tool_result: '✅',
  thinking: '🧠',
  message: '💬',
  throttled: '⏳',
};

function StepRow({ step, index }) {
  const icon = STEP_ICON[step.type] || '⚡';
  return (
    <div className="flex items-start gap-2.5 animate-fade-in">
      <span className="mt-0.5 text-base shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-slate-700 leading-snug">{step.label}</p>
        {step.detail && (
          <p className="text-xs text-slate-400 truncate max-w-xs mt-0.5">{step.detail}</p>
        )}
      </div>
      <span className="ml-auto text-[10px] text-slate-300 shrink-0 tabular-nums">#{index + 1}</span>
    </div>
  );
}

function ThrottleCountdown({ retryIn }) {
  const [seconds, setSeconds] = useState(retryIn);

  useEffect(() => {
    if (seconds <= 0) return;
    const timer = setTimeout(() => setSeconds(s => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);

  if (seconds <= 0) return null;

  return (
    <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 animate-fade-in">
      <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
        <span className="text-xs font-bold text-amber-700 tabular-nums">{seconds}</span>
      </div>
      <div>
        <p className="text-xs font-medium text-amber-700">AI is busy — retrying in {seconds}s</p>
        <p className="text-[10px] text-amber-500">Rate limit reached, waiting for cooldown</p>
      </div>
    </div>
  );
}

export default function AgentStatusPanel({ steps = [], status = 'idle', throttle = null, className = '' }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [steps.length]);

  if (status === 'idle') return null;

  const isRunning = status === 'running' || status === 'connecting';

  return (
    <div className={`bg-white border border-slate-200 rounded-2xl p-4 shadow-card ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        {isRunning ? (
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-teal-500" />
          </span>
        ) : status === 'done' ? (
          <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
        ) : (
          <span className="inline-flex h-2.5 w-2.5 rounded-full bg-red-400" />
        )}
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Agent Status
        </span>
        <span className="ml-auto text-xs text-slate-400">{STATUS_LABELS[status]}</span>
      </div>

      {/* Throttle countdown */}
      {throttle && <ThrottleCountdown retryIn={throttle.retryIn} />}

      {/* Steps */}
      {steps.length > 0 ? (
        <div className="space-y-2.5 max-h-52 overflow-y-auto pr-1">
          {steps.map((step, i) => (
            <StepRow key={i} step={step} index={i} />
          ))}
          <div ref={bottomRef} />
        </div>
      ) : (
        <p className="text-xs text-slate-400 italic">Waiting for agent steps...</p>
      )}

      {/* Turn count */}
      {steps.length > 0 && (
        <p className="mt-3 text-[10px] text-slate-300 text-right tabular-nums">
          {steps.length} step{steps.length !== 1 ? 's' : ''} recorded
        </p>
      )}
    </div>
  );
}
