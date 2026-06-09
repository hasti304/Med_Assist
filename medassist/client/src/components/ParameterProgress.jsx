import { useTranslation } from 'react-i18next';

// Status config — matches Analysis.jsx STATUS_STYLE palette exactly
const STATUS_CFG = {
  critical_high: {
    label:   'Critical High',
    pill:    'bg-red-100 text-red-800',
    val:     'text-red-600',
    border:  'border-l-red-500',
    track:   '#ef4444',
    devClr:  'text-red-500',
    dir:     '▲▲',
  },
  critical_low: {
    label:   'Critical Low',
    pill:    'bg-red-100 text-red-800',
    val:     'text-red-600',
    border:  'border-l-red-500',
    track:   '#ef4444',
    devClr:  'text-red-500',
    dir:     '▼▼',
  },
  high: {
    label:   'High',
    pill:    'bg-orange-50 text-orange-700',
    val:     'text-orange-600',
    border:  'border-l-orange-400',
    track:   '#f97316',
    devClr:  'text-orange-500',
    dir:     '▲',
  },
  low: {
    label:   'Low',
    pill:    'bg-amber-50 text-amber-700',
    val:     'text-amber-600',
    border:  'border-l-amber-400',
    track:   '#f59e0b',
    devClr:  'text-amber-600',
    dir:     '▼',
  },
  normal: {
    label:   'Normal',
    pill:    'bg-emerald-50 text-emerald-700',
    val:     'text-emerald-600',
    border:  'border-l-emerald-400',
    track:   '#10b981',
    devClr:  'text-emerald-600',
    dir:     '✓',
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseNormalRange(r) {
  if (!r) return null;
  if (/[MF]\s*:/i.test(r)) return null;
  const m = r.match(/([\d.]+)\s*[-–]\s*([\d.]+)/);
  if (m) return { low: parseFloat(m[1]), high: parseFloat(m[2]) };
  const gt = r.match(/^[>≥>=]+\s*([\d.]+)/);
  if (gt) return { low: parseFloat(gt[1]), high: null };
  const lt = r.match(/^[<≤<=]+\s*([\d.]+)/);
  if (lt) return { low: null, high: parseFloat(lt[1]) };
  return null;
}

function getDeviation(val, range, status) {
  if (!range) return '';
  if ((status === 'low' || status === 'critical_low') && range.low != null) {
    const pct = Math.round(((range.low - val) / range.low) * 100);
    return `${pct}% below normal`;
  }
  if ((status === 'high' || status === 'critical_high') && range.high != null) {
    const pct = Math.round(((val - range.high) / range.high) * 100);
    return `${pct}% above normal`;
  }
  return '';
}

// ── Inline gauge bar ──────────────────────────────────────────────────────────
function GaugeBar({ val, range, trackColor }) {
  const { low, high } = range;
  let sMin, sMax;
  if (low != null && high != null) {
    sMin = Math.min(val, low) * 0.55;
    sMax = Math.max(val, high) * 1.45;
  } else if (low != null) {
    sMin = Math.min(val, low) * 0.5;
    sMax = Math.max(val * 1.5, low * 2);
  } else {
    sMin = 0;
    sMax = Math.max(val, high ?? 1) * 1.4;
  }
  if (sMax - sMin < 0.001) { sMin = 0; sMax = Math.max(val, 1) * 2; }

  const span = sMax - sMin;
  const clamp = (n) => Math.max(0, Math.min(100, n));
  const vPos  = clamp(((val  - sMin) / span) * 100);
  const lPos  = low  != null ? clamp(((low  - sMin) / span) * 100) : 0;
  const hPos  = high != null ? clamp(((high - sMin) / span) * 100) : 100;
  const gW    = Math.max(0.5, hPos - lPos);

  return (
    <div className="mt-2.5 mb-1">
      {/* Track */}
      <div className="relative h-2 rounded-full overflow-visible">
        <div className="absolute inset-0 rounded-full overflow-hidden flex">
          {lPos > 0 && (
            <div style={{ width: `${lPos}%`, background: 'linear-gradient(90deg,#fde68a,#fb923c)' }} />
          )}
          <div style={{ width: `${gW}%`, background: 'linear-gradient(90deg,#6ee7b7,#059669)' }} />
          {100 - hPos > 0 && (
            <div style={{ width: `${100 - hPos}%`, background: 'linear-gradient(90deg,#fb923c,#ef4444)' }} />
          )}
        </div>
        {/* Range tick markers */}
        {low  != null && <div className="absolute -top-0.5 w-px h-3 bg-slate-400/60 z-10" style={{ left: `${lPos}%` }} />}
        {high != null && <div className="absolute -top-0.5 w-px h-3 bg-slate-400/60 z-10" style={{ left: `${hPos}%` }} />}
        {/* Value dot */}
        <div
          className="absolute -top-[5px] w-[14px] h-[14px] rounded-full border-2 border-white z-20 -translate-x-1/2"
          style={{
            left: `${vPos}%`,
            backgroundColor: trackColor,
            boxShadow: `0 0 0 2px ${trackColor}40, 0 1px 4px rgba(0,0,0,.15)`,
          }}
        />
      </div>
      {/* Scale labels */}
      <div className="flex justify-between mt-1.5 text-[10px] font-mono text-slate-400">
        <span>{sMin.toFixed(1)}</span>
        <span className="text-slate-500 font-medium">
          {low != null ? low : ''}
          {low != null && high != null ? '–' : ''}
          {high != null ? high : ''}
          {' '}<span className="text-slate-400 font-normal">ref</span>
        </span>
        <span>{sMax.toFixed(1)}</span>
      </div>
    </div>
  );
}

// ── Single parameter row ──────────────────────────────────────────────────────
function ParamRow({ param }) {
  const { t } = useTranslation();
  const { parameter, your_value, normal_range, status, unit } = param;
  const cfg     = STATUS_CFG[status] || STATUS_CFG.normal;
  const val     = parseFloat(your_value);
  const range   = parseNormalRange(normal_range);
  const dev     = range && !isNaN(val) ? getDeviation(val, range, status) : '';
  const isCrit  = status === 'critical_high' || status === 'critical_low';

  return (
    <div className={`border-l-[3px] pl-3 py-2.5 ${cfg.border}`}>
      {/* Top line: name + value */}
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <span className="text-sm font-semibold text-slate-800 leading-tight truncate">{parameter}</span>
          {isCrit && (
            <span className="text-[9px] font-black tracking-wider text-white bg-red-500 px-1.5 py-0.5 rounded uppercase shrink-0">
              CRITICAL
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-1 shrink-0">
          <span className={`text-base font-extrabold font-mono leading-none ${cfg.val}`}>{your_value}</span>
          {unit && <span className="text-xs text-slate-400">{unit}</span>}
          <span className={`ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded ${cfg.pill}`}>
            {t(`analysis.statusLabels.${status}`, { defaultValue: cfg.label })}
          </span>
        </div>
      </div>

      {/* Sub-line: ref range + deviation */}
      <div className="flex items-center justify-between gap-2 mt-0.5">
        {normal_range ? (
          <span className="text-[11px] text-slate-400">
            Ref: <span className="text-slate-500 font-medium">{normal_range}{unit ? ` ${unit}` : ''}</span>
          </span>
        ) : <span />}
        {dev && (
          <span className={`text-[11px] font-semibold ${cfg.devClr}`}>
            {cfg.dir} {dev}
          </span>
        )}
      </div>

      {/* Gauge or divider */}
      {range && !isNaN(val) ? (
        <GaugeBar val={val} range={range} trackColor={cfg.track} />
      ) : (
        <div className="mt-2 h-px bg-slate-100" />
      )}
    </div>
  );
}

// ── Summary chips strip ───────────────────────────────────────────────────────
function SummaryStrip({ params }) {
  const { t } = useTranslation();
  const cnt = params.reduce((a, p) => ({ ...a, [p.status]: (a[p.status] || 0) + 1 }), {});
  const chips = [
    { k: 'critical_high', cls: 'bg-red-100 text-red-700' },
    { k: 'critical_low',  cls: 'bg-red-100 text-red-700' },
    { k: 'high',          cls: 'bg-orange-50 text-orange-700' },
    { k: 'low',           cls: 'bg-amber-50 text-amber-700' },
  ].filter(c => cnt[c.k] > 0);

  if (!chips.length) return null;
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {chips.map(({ k, cls }) => (
        <span key={k} className={`text-xs font-semibold px-2.5 py-1 rounded-lg ${cls}`}>
          {cnt[k]} {t(`analysis.statusLabels.${k}`, { defaultValue: STATUS_CFG[k]?.label })}
        </span>
      ))}
      <span className="ml-auto text-[11px] text-slate-400">
        {params.length} parameter{params.length !== 1 ? 's' : ''} flagged
      </span>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function ParameterProgress({ extractedValues }) {
  const { t } = useTranslation();
  const abnormal = (extractedValues || []).filter(v => v.status && v.status !== 'normal');
  if (!abnormal.length) return null;

  const critical = abnormal.filter(p => p.status === 'critical_high' || p.status === 'critical_low');

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4 animate-slide-up">
      {/* Header — matches Section component exactly */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <h2 className="text-base font-bold font-display text-slate-800 flex items-center gap-2">
          <span className="text-lg">🔬</span>
          {t('analysis.parameterProgress')}
        </h2>
        <span className="text-sm font-semibold text-slate-500">
          {abnormal.length} flagged
        </span>
      </div>

      {/* Description */}
      <p className="text-xs text-slate-400 -mt-2">
        {t('parameterProgress.description')}
      </p>

      {/* Summary chips */}
      <SummaryStrip params={abnormal} />

      {/* Critical alert */}
      {critical.length > 0 && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <span className="text-base shrink-0">⚠️</span>
          <div>
            <p className="text-sm font-bold text-red-700">
              {critical.length} Critical Value{critical.length > 1 ? 's' : ''} — Immediate Attention Required
            </p>
            <p className="text-xs text-red-600 mt-0.5">
              These results are significantly outside normal limits. Please consult your physician promptly.
            </p>
          </div>
        </div>
      )}

      {/* Parameter rows */}
      <div className="space-y-1 divide-y divide-slate-50 max-h-[420px] overflow-y-auto pr-1">
        {abnormal.map((param, i) => (
          <ParamRow key={i} param={param} />
        ))}
      </div>

      <p className="text-[10px] text-slate-300 text-center pt-1 border-t border-slate-100">
        Reference ranges are laboratory-specific. Interpret with a qualified clinician.
      </p>
    </div>
  );
}
