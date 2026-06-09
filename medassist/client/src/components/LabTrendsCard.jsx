import { useState, useEffect, useMemo } from 'react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import api from '../services/api';

const TRACKED = [
  { key: 'hemoglobin', label: 'Hemoglobin', color: '#ef4444' },
  { key: 'glucose', label: 'Glucose', color: '#eab308' },
  { key: 'hba1c', label: 'HbA1c', color: '#f97316' },
];

function matchParam(name, key) {
  if (!name) return false;
  const n = name.toLowerCase();
  if (key === 'hba1c') return n.includes('hba1c') || n.includes('hb a1c') || n.includes('glycated') || n.includes('a1c');
  return n.includes(key);
}

function buildSeries(reports, key) {
  return reports
    .map((r) => {
      const m = (r.extracted_values || []).find((v) => matchParam(v.parameter, key));
      if (!m) return null;
      const num = parseFloat(m.value);
      if (Number.isNaN(num)) return null;
      return {
        date: new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        value: num,
      };
    })
    .filter(Boolean);
}

function MiniSpark({ data, color }) {
  if (data.length < 2) {
    return <p className="text-[10px] text-slate-400 italic h-[36px] flex items-center">Need 2+ reports</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={36}>
      <LineChart data={data}>
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export default function LabTrendsCard() {
  const { t } = useTranslation();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/blood-report/history')
      .then((res) => setReports(res.data.reports || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const series = useMemo(() => {
    const out = {};
    for (const p of TRACKED) {
      const s = buildSeries(reports, p.key);
      if (s.length >= 2) out[p.key] = s;
    }
    return out;
  }, [reports]);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow p-5 animate-pulse h-40" />
    );
  }

  if (Object.keys(series).length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow p-5 md:col-span-2">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          {t('dashboard.labTrends')}
        </p>
        <Link to="/patient/history" className="text-xs font-semibold text-teal-600 hover:text-teal-700">
          {t('dashboard.viewAllTrends')} →
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {TRACKED.filter((p) => series[p.key]).map((p) => {
          const data = series[p.key];
          const last = data[data.length - 1]?.value;
          const prev = data[data.length - 2]?.value;
          const delta = last != null && prev != null ? last - prev : null;
          return (
            <div key={p.key} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-slate-700">{p.label}</span>
                {delta != null && delta !== 0 && (
                  <span className={`text-[10px] font-bold ${delta > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                    {delta > 0 ? '↑' : '↓'} {Math.abs(delta).toFixed(1)}
                  </span>
                )}
              </div>
              <MiniSpark data={data} color={p.color} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
