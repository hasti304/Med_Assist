import { useState, useEffect } from 'react';
import api from '../services/api';

function parseRange(str) {
  if (!str) return null;
  const lt = str.match(/^[<≤]\s*([\d.]+)/);
  if (lt) return { min: 0, max: parseFloat(lt[1]) };
  const range = str.match(/([\d.]+)\s*[–\-]\s*([\d.]+)/);
  if (range) return { min: parseFloat(range[1]), max: parseFloat(range[2]) };
  return null;
}

function RangeBar({ aVal, bVal, range, dateA, dateB }) {
  if (!range || range.max == null || (aVal == null && bVal == null)) return null;
  const { min, max } = range;
  const span = max - min;
  if (span <= 0) return null;

  const pad = span * 0.5;
  const scaleMin = Math.min(min - pad, aVal ?? Infinity, bVal ?? Infinity);
  const scaleMax = Math.max(max + pad, aVal ?? -Infinity, bVal ?? -Infinity);
  const scaleSpan = scaleMax - scaleMin || 1;

  const pct = (v) => Math.max(1, Math.min(99, ((v - scaleMin) / scaleSpan) * 100));
  const refLeft = pct(min);
  const refWidth = Math.max(2, pct(max) - refLeft);

  const aPct = aVal != null ? pct(aVal) : null;
  const bPct = bVal != null ? pct(bVal) : null;

  return (
    <div className="mt-2 mb-1">
      <div className="relative h-4 w-full">
        <div className="absolute inset-y-1 inset-x-0 rounded-full bg-slate-100" />
        <div
          className="absolute inset-y-1 rounded-full bg-emerald-100 border border-emerald-200"
          style={{ left: `${refLeft}%`, width: `${refWidth}%` }}
        />
        {aPct != null && (
          <div
            className="absolute top-0.5 w-3 h-3 rounded-full bg-slate-500 border-2 border-white shadow-sm"
            style={{ left: `calc(${aPct}% - 6px)` }}
            title={`${dateA}: ${aVal}`}
          />
        )}
        {bPct != null && (
          <div
            className="absolute top-0.5 w-3 h-3 rounded-full bg-teal-500 border-2 border-white shadow-sm"
            style={{ left: `calc(${bPct}% - 6px)` }}
            title={`${dateB}: ${bVal}`}
          />
        )}
      </div>
      <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-400">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-slate-500 inline-block" />
          {dateA}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-teal-500 inline-block" />
          {dateB}
        </span>
        <span className="ml-auto flex items-center gap-1">
          <span className="w-3 h-2 rounded-sm bg-emerald-100 border border-emerald-300 inline-block" />
          normal range
        </span>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  if (!status) return null;
  const cls =
    status === 'normal'
      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
      : 'bg-red-50 text-red-600 border border-red-200';
  return <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${cls}`}>{status}</span>;
}

function DeltaDisplay({ aVal, bVal, unit, trend }) {
  if (aVal == null || bVal == null) return <span className="text-slate-300 text-sm">—</span>;
  const delta = parseFloat((bVal - aVal).toFixed(2));
  if (delta === 0) return <span className="text-slate-400 text-xs font-medium">No change</span>;
  const pct = aVal !== 0 ? Math.round(((bVal - aVal) / Math.abs(aVal)) * 100) : null;
  const up = trend === 'up' || (trend !== 'down' && delta > 0);
  const arrow = up ? '↑' : '↓';
  return (
    <div className={`text-center ${up ? 'text-red-500' : 'text-emerald-600'}`}>
      <div className="text-sm font-bold leading-tight">
        {arrow} {Math.abs(delta)} <span className="text-xs font-normal opacity-75">{unit}</span>
      </div>
      {pct !== null && (
        <div className="text-xs opacity-70 mt-0.5">{up ? '+' : ''}{pct}%</div>
      )}
    </div>
  );
}

function TransitionBadge({ from, to }) {
  if (!from || !to || from === to) return null;
  const worsened = from === 'normal' && (to === 'high' || to === 'low');
  const improved = (from === 'high' || from === 'low') && to === 'normal';
  const cls = worsened
    ? 'bg-red-50 text-red-600 border-red-200'
    : improved
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : 'bg-amber-50 text-amber-700 border-amber-200';
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold border mt-1 ${cls}`}>
      {from} → {to}
    </span>
  );
}

export default function CompareModal({ id1, id2, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get(`/blood-report/compare?id1=${id1}&id2=${id2}`)
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.error || err.message || 'Failed to compare reports'))
      .finally(() => setLoading(false));
  }, [id1, id2]);

  const fmt = (d) =>
    new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const summary = data
    ? {
        worsened: data.diff.filter(
          (r) => r.a && r.b && r.a.status === 'normal' && (r.b.status === 'high' || r.b.status === 'low')
        ).length,
        improved: data.diff.filter(
          (r) => r.a && r.b && (r.a.status === 'high' || r.a.status === 'low') && r.b.status === 'normal'
        ).length,
        stable: data.diff.filter((r) => r.a && r.b && r.a.status === r.b.status).length,
      }
    : null;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Report Comparison</h2>
            {data && (
              <p className="text-xs text-slate-400 mt-0.5">
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-slate-500 inline-block" />
                  {fmt(data.report_a.created_at)}
                </span>
                &nbsp;vs&nbsp;
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-teal-500 inline-block" />
                  {fmt(data.report_b.created_at)}
                </span>
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-lg hover:bg-slate-100"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Summary bar */}
        {summary && (
          <div className="flex gap-2 px-6 py-3 bg-slate-50 border-b border-slate-100 shrink-0">
            <span className="text-xs font-medium text-slate-500 mr-1 self-center">Overview:</span>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
              {summary.worsened} Worsened
            </span>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              {summary.improved} Improved
            </span>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
              {summary.stable} Stable
            </span>
          </div>
        )}

        {/* Column headers */}
        {data && (
          <div className="grid grid-cols-[1.8fr_1fr_1fr_1fr] gap-2 px-6 pt-3 pb-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider shrink-0">
            <span>Parameter</span>
            <span className="text-center">{fmt(data.report_a.created_at)}</span>
            <span className="text-center">{fmt(data.report_b.created_at)}</span>
            <span className="text-center">Change</span>
          </div>
        )}

        {/* Rows */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {loading && (
            <div className="flex items-center justify-center h-64">
              <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {error && <div className="p-6 text-center text-red-500 text-sm">{error}</div>}
          {data &&
            data.diff.map((row, i) => {
              const range = parseRange(row.normal_range);
              const aNum = row.a ? parseFloat(row.a.value) : null;
              const bNum = row.b ? parseFloat(row.b.value) : null;
              const worsened =
                row.a && row.b && row.a.status === 'normal' && (row.b.status === 'high' || row.b.status === 'low');
              const improved =
                row.a && row.b && (row.a.status === 'high' || row.a.status === 'low') && row.b.status === 'normal';
              const dateA = fmt(data.report_a.created_at);
              const dateB = fmt(data.report_b.created_at);

              return (
                <div
                  key={i}
                  className={`rounded-xl px-2 py-3 mb-1 transition-colors ${
                    worsened ? 'bg-red-50/60' : improved ? 'bg-emerald-50/50' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="grid grid-cols-[1.8fr_1fr_1fr_1fr] gap-2 items-start">
                    {/* Parameter */}
                    <div>
                      <p className="text-sm font-semibold text-slate-800 capitalize leading-tight">{row.parameter}</p>
                      {row.normal_range && (
                        <p className="text-xs text-slate-400 mt-0.5">Ref: {row.normal_range}</p>
                      )}
                    </div>

                    {/* Value A */}
                    <div className="text-center">
                      {row.a ? (
                        <>
                          <span className="text-sm font-bold text-slate-700">{row.a.value}</span>
                          <span className="text-xs text-slate-400 ml-0.5">{row.a.unit}</span>
                          <div className="mt-0.5">
                            <StatusBadge status={row.a.status} />
                          </div>
                        </>
                      ) : (
                        <span className="text-slate-300 text-sm">—</span>
                      )}
                    </div>

                    {/* Value B */}
                    <div className="text-center">
                      {row.b ? (
                        <>
                          <span className="text-sm font-bold text-slate-700">{row.b.value}</span>
                          <span className="text-xs text-slate-400 ml-0.5">{row.b.unit}</span>
                          <div className="mt-0.5">
                            <StatusBadge status={row.b.status} />
                          </div>
                        </>
                      ) : (
                        <span className="text-slate-300 text-sm">—</span>
                      )}
                    </div>

                    {/* Delta + Transition */}
                    <div className="flex flex-col items-center">
                      <DeltaDisplay
                        aVal={aNum}
                        bVal={bNum}
                        unit={row.a?.unit || row.b?.unit || ''}
                        trend={row.trend}
                      />
                      <TransitionBadge from={row.a?.status} to={row.b?.status} />
                    </div>
                  </div>

                  {/* Range bar */}
                  {range && range.max != null && (aNum != null || bNum != null) && (
                    <div className="mt-1 px-1">
                      <RangeBar aVal={aNum} bVal={bNum} range={range} dateA={dateA} dateB={dateB} />
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
