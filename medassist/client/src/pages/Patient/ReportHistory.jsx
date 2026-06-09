import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../../services/api';
import CompareModal from '../../components/CompareModal';

const KEY_PARAMS = [
  { key: 'hemoglobin', label: 'Hemoglobin', unit: 'g/dL', color: '#ef4444' },
  { key: 'hba1c', label: 'HbA1c', unit: '%', color: '#f97316' },
  { key: 'glucose', label: 'Glucose', unit: 'mg/dL', color: '#eab308' },
  { key: 'cholesterol', label: 'Cholesterol', unit: 'mg/dL', color: '#8b5cf6' },
  { key: 'ldl', label: 'LDL', unit: 'mg/dL', color: '#ec4899' },
  { key: 'hdl', label: 'HDL', unit: 'mg/dL', color: '#10b981' },
  { key: 'triglycerides', label: 'Triglycerides', unit: 'mg/dL', color: '#3b82f6' },
  { key: 'creatinine', label: 'Creatinine', unit: 'mg/dL', color: '#6366f1' },
  { key: 'wbc', label: 'WBC', unit: 'K/uL', color: '#14b8a6' },
  { key: 'platelets', label: 'Platelets', unit: 'K/uL', color: '#f59e0b' },
];

function matchParam(name, key) {
  if (!name) return false;
  const n = name.toLowerCase();
  if (key === 'hba1c') return n.includes('hba1c') || n.includes('hb a1c') || n.includes('glycated') || n.includes('a1c');
  if (key === 'hdl') return n.includes('hdl');
  if (key === 'ldl') return n.includes('ldl');
  if (key === 'cholesterol')
    return (n.includes('cholesterol') || n.includes('chol')) && !n.includes('ldl') && !n.includes('hdl');
  return n.includes(key);
}

function buildTrendData(reports, paramKey) {
  return reports
    .map((r) => {
      const match = (r.extracted_values || []).find((v) => matchParam(v.parameter, paramKey));
      if (!match) return null;
      const num = parseFloat(match.value);
      if (isNaN(num)) return null;
      return {
        date: new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        value: num,
        status: match.status,
      };
    })
    .filter(Boolean);
}

export default function ReportHistory() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedParam, setSelectedParam] = useState('hemoglobin');
  const [compareIds, setCompareIds] = useState([]);
  const [showCompare, setShowCompare] = useState(false);

  useEffect(() => {
    api.get('/blood-report/history')
      .then((res) => setReports(res.data.reports || []))
      .catch(() => toast.error('Could not load report history'))
      .finally(() => setLoading(false));
  }, []);

  const availableParams = useMemo(
    () =>
      KEY_PARAMS.filter((p) =>
        reports.some((r) => (r.extracted_values || []).some((v) => matchParam(v.parameter, p.key)))
      ),
    [reports]
  );

  const paramConfig = KEY_PARAMS.find((p) => p.key === selectedParam) || KEY_PARAMS[0];
  const trendData = useMemo(() => buildTrendData(reports, selectedParam), [reports, selectedParam]);

  function toggleCompare(id) {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="h-8 w-48 bg-slate-200 rounded-xl animate-pulse" />
        <div className="h-64 bg-white rounded-2xl border border-slate-200 animate-pulse" />
        <div className="h-32 bg-white rounded-2xl border border-slate-200 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{t('history.title')}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {reports.length} {reports.length !== 1 ? t('healthScore.reportsPlural') : t('healthScore.reports')} — {t('history.subtitle')}
          </p>
        </div>
        {compareIds.length === 2 && (
          <button
            onClick={() => setShowCompare(true)}
            className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold px-5 py-2.5 rounded-xl transition-all shadow-md text-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
            </svg>
            {t('history.compare')}
          </button>
        )}
      </div>

      {reports.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow p-12 text-center">
          <div className="w-16 h-16 bg-teal-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
            </svg>
          </div>
          <h2 className="text-base font-semibold text-slate-700 mb-2">No reports yet</h2>
          <p className="text-sm text-slate-400 mb-5 max-w-xs mx-auto">
            Upload a blood report and run analysis to start tracking your health trends.
          </p>
          <button
            onClick={() => navigate('/patient/upload-report')}
            className="bg-teal-600 hover:bg-teal-700 text-white font-semibold px-6 py-2.5 rounded-xl transition-all shadow-md text-sm"
          >
            Upload Your First Report
          </button>
        </div>
      ) : (
        <>
          {/* Trend Chart */}
          {availableParams.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow p-6">
              <h2 className="text-base font-semibold text-slate-800 mb-4">Parameter Trends</h2>

              {/* Param selector pills */}
              <div className="flex flex-wrap gap-2 mb-6">
                {availableParams.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => setSelectedParam(p.key)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all border ${
                      selectedParam === p.key
                        ? 'text-white border-transparent shadow-sm'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-teal-300 hover:text-teal-700'
                    }`}
                    style={selectedParam === p.key ? { backgroundColor: p.color, borderColor: p.color } : {}}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {trendData.length < 2 ? (
                <div className="flex flex-col items-center justify-center h-48 text-slate-400 text-sm gap-1">
                  <svg className="w-8 h-8 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
                  </svg>
                  <span>Need at least 2 reports with {paramConfig.label} data to show a trend.</span>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={trendData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#94a3b8' }} />
                    <YAxis
                      tick={{ fontSize: 12, fill: '#94a3b8' }}
                      unit={` ${paramConfig.unit}`}
                      width={60}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: '12px',
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                      }}
                      formatter={(v) => [`${v} ${paramConfig.unit}`, paramConfig.label]}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke={paramConfig.color}
                      strokeWidth={2.5}
                      dot={{ r: 5, fill: paramConfig.color, strokeWidth: 0 }}
                      activeDot={{ r: 7 }}
                      name={paramConfig.label}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          )}

          {/* Report Cards */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 px-1">
              {compareIds.length === 0
                ? 'Select up to 2 reports to compare side-by-side'
                : compareIds.length === 1
                ? 'Select one more report to enable comparison'
                : 'Click "Compare Selected Reports" to view the diff'}
            </p>
            <div className="space-y-3">
              {[...reports].reverse().map((r) => {
                const date = new Date(r.created_at).toLocaleDateString('en-US', {
                  month: 'long', day: 'numeric', year: 'numeric',
                });
                const selected = compareIds.includes(r.id);
                return (
                  <div
                    key={r.id}
                    className={`bg-white rounded-2xl border shadow p-5 transition-all ${
                      selected
                        ? 'border-teal-400 shadow-md ring-1 ring-teal-200'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div className="flex items-center gap-3">
                        {/* Checkbox */}
                        <button
                          onClick={() => toggleCompare(r.id)}
                          className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all shrink-0 ${
                            selected
                              ? 'border-teal-500 bg-teal-500'
                              : 'border-slate-300 hover:border-teal-400 bg-white'
                          }`}
                          aria-label={selected ? 'Deselect for comparison' : 'Select for comparison'}
                        >
                          {selected && (
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{date}</p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span
                              className={`text-xs px-2 py-0.5 rounded-lg font-medium ${
                                r.analyzed
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-amber-50 text-amber-700'
                              }`}
                            >
                              {r.analyzed ? 'Analyzed' : 'Uploaded'}
                            </span>
                            <span className="text-xs text-slate-400">{r.total_parameters} {t('history.parameters')}</span>
                            {r.abnormal_count > 0 && (
                              <span className="text-xs text-red-500">
                                {r.abnormal_count} {t('history.abnormal')}
                              </span>
                            )}
                            {r.composite_score !== null && (
                              <span className="text-xs font-medium text-teal-600">
                                Score: {r.composite_score}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => navigate(`/patient/analysis/${r.id}`)}
                        className="text-sm font-semibold text-teal-600 hover:text-teal-700 transition-colors whitespace-nowrap"
                      >
                        {t('history.viewAnalysis')} →
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {showCompare && compareIds.length === 2 && (
        <CompareModal
          id1={compareIds[0]}
          id2={compareIds[1]}
          onClose={() => setShowCompare(false)}
        />
      )}
    </div>
  );
}
