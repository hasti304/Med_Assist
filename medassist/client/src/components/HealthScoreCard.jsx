import { useState, useEffect } from 'react';
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import { useLang } from '../context/LanguageContext';

function ScoreGauge({ score, riskLevel }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(Math.max(score ?? 0, 0), 100) / 100;
  const strokeDashoffset = circumference * (1 - pct);

  const lvl = (riskLevel || '').toLowerCase();
  const color =
    lvl === 'low'      ? '#10b981'
    : lvl === 'moderate' ? '#f59e0b'
    : lvl === 'high'     ? '#f97316'
    : lvl === 'critical' ? '#ef4444'
    : '#0D9488';

  return (
    <div className="relative w-28 h-28 flex items-center justify-center shrink-0">
      <svg className="w-28 h-28 -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="10" />
        <circle
          cx="60" cy="60" r={radius}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1s ease' }}
        />
      </svg>
      <div className="absolute text-center">
        <p className="text-2xl font-bold text-slate-800">{score ?? '—'}</p>
        <p className="text-[10px] text-slate-400 -mt-0.5">/ 100</p>
      </div>
    </div>
  );
}

export default function HealthScoreCard() {
  const { t } = useTranslation();
  const { lang } = useLang();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [translatedSummary, setTranslatedSummary] = useState(null);

  useEffect(() => {
    api.get('/blood-report/latest-score')
      .then((res) => setData(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (lang !== 'es' || !data?.summary) { setTranslatedSummary(null); return; }
    api.post('/voice/translate', { lang, texts: { summary: data.summary } })
      .then((r) => { if (r.data?.summary) setTranslatedSummary(r.data.summary); })
      .catch(() => {});
  }, [lang, data?.summary]);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow p-5 animate-pulse">
        <div className="h-3 w-28 bg-slate-100 rounded mb-4" />
        <div className="flex gap-5 items-center">
          <div className="w-28 h-28 rounded-full bg-slate-100 shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-full bg-slate-100 rounded" />
            <div className="h-3 w-3/4 bg-slate-100 rounded" />
            <div className="h-8 w-full bg-slate-100 rounded mt-3" />
          </div>
        </div>
      </div>
    );
  }

  if (!data?.score) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow p-5">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">{t('healthScore.title')}</p>
        <div className="flex items-center gap-3 text-slate-400">
          <svg className="w-10 h-10 shrink-0 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
          </svg>
          <p className="text-sm">{t('healthScore.noScore')}</p>
        </div>
      </div>
    );
  }

  const lvl = (data.risk_level || '').toLowerCase();
  const riskColor =
    lvl === 'low'      ? 'text-emerald-600'
    : lvl === 'moderate' ? 'text-amber-600'
    : lvl === 'high'     ? 'text-orange-500'
    : 'text-red-600';

  const sparkData = (data.sparkline || []).map((d) => ({
    date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    score: d.score,
  }));

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow p-5">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">{t('healthScore.title')}</p>
      <div className="flex items-center gap-5 flex-wrap">
        <ScoreGauge score={data.score} riskLevel={data.risk_level} />
        <div className="flex-1 min-w-0 space-y-2">
          <div>
            <p className={`text-sm font-bold capitalize ${riskColor}`}>
              {data.risk_level ? t(`analysis.riskLevels.${(data.risk_level || '').toLowerCase()}`, { defaultValue: `${data.risk_level} ${t('healthScore.risk')}` }) : ''}
            </p>
            {data.summary && (
              <p className="text-xs text-slate-500 mt-1 line-clamp-3 leading-relaxed">{translatedSummary ?? data.summary}</p>
            )}
          </div>
          {sparkData.length > 1 && (
            <div>
              <p className="text-[10px] text-slate-400 mb-1">
                {t('healthScore.scoreTrend')} — {sparkData.length} {sparkData.length !== 1 ? t('healthScore.reportsPlural') : t('healthScore.reports')}
              </p>
              <ResponsiveContainer width="100%" height={50}>
                <LineChart data={sparkData}>
                  <Tooltip
                    contentStyle={{ borderRadius: '8px', fontSize: '12px', border: '1px solid #e2e8f0' }}
                    formatter={(v) => [v, 'Score']}
                    labelFormatter={(l) => l}
                  />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke={
                      lvl === 'low' ? '#10b981'
                      : lvl === 'moderate' ? '#f59e0b'
                      : lvl === 'high' ? '#f97316'
                      : '#ef4444'
                    }
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
