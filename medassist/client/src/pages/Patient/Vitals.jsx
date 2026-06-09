import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import api from '../../services/api';

const fadeIn = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

const VITAL_TYPE_KEYS = [
  { value: 'blood_pressure', labelKey: 'vitals.bloodPressure', unit: 'mmHg', dual: true },
  { value: 'glucose',        labelKey: 'vitals.bloodGlucose',  unit: 'mg/dL' },
  { value: 'weight',         labelKey: 'vitals.weight',        unit: 'kg' },
  { value: 'heart_rate',     labelKey: 'vitals.heartRate',     unit: 'bpm' },
  { value: 'spo2',           labelKey: 'vitals.spo2',          unit: '%' },
  { value: 'temperature',    labelKey: 'vitals.temperature',   unit: '\u00B0F' },
];

const NORMAL_RANGES = {
  blood_pressure: 'Systolic: 90-120, Diastolic: 60-80',
  glucose: '70 - 100 mg/dL (fasting)',
  weight: 'Varies by individual',
  heart_rate: '60 - 100 bpm',
  spo2: '95 - 100%',
  temperature: '97.8 - 99.1\u00B0F',
};

export default function Vitals() {
  const { t } = useTranslation();
  const VITAL_TYPES = VITAL_TYPE_KEYS.map((v) => ({ ...v, label: t(v.labelKey) }));
  const [selectedType, setSelectedType] = useState('blood_pressure');
  const [values, setValues] = useState({ value: '', systolic: '', diastolic: '' });
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [csvText, setCsvText] = useState('type,value,value2,date\nglucose,98,,2025-05-01\nblood_pressure,118,76,2025-05-02');
  const [importing, setImporting] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [insight, setInsight] = useState(null);
  const [loadingInsight, setLoadingInsight] = useState(false);

  const typeConfig = VITAL_TYPES.find((t) => t.value === selectedType);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/patient/vitals?type=${selectedType}&days=30`);
      const formatted = (data.vitals || []).map((v) => ({
        ts: new Date(v.recorded_at).getTime(), // unique key — avoids same-date tooltip collision
        date: new Date(v.recorded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        value: v.value,
        systolic: v.value,     // DB stores systolic in 'value'
        diastolic: v.value2,   // DB stores diastolic in 'value2'
      }));
      setChartData(formatted.reverse()); // chronological order for chart
    } catch {
      // silent — chart just stays empty
    } finally {
      setLoading(false);
    }
  }, [selectedType]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    setInsight(null);
    setLoadingInsight(true);
    api.get(`/patient/vitals/insights?type=${selectedType}`)
      .then(({ data }) => setInsight(data.insight || null))
      .catch(() => {})
      .finally(() => setLoadingInsight(false));
  }, [selectedType]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = { type: selectedType };
      if (typeConfig.dual) {
        payload.value = Number(values.systolic);   // systolic as primary
        payload.value2 = Number(values.diastolic); // diastolic as secondary
      } else {
        payload.value = Number(values.value);
      }
      await api.post('/patient/vitals', payload);
      toast.success(`${typeConfig.label} recorded`);
      setValues({ value: '', systolic: '', diastolic: '' });
      fetchData();
    } catch (err) {
      toast.error(err.message || 'Failed to save vital');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div variants={fadeIn} initial="hidden" animate="visible" className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{t('vitals.title')}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t('vitals.subtitle')}</p>
      </div>

      {/* Type Selector */}
      <div className="flex flex-wrap gap-2">
        {VITAL_TYPES.map((vtype) => (
          <button
            key={vtype.value}
            onClick={() => { setSelectedType(vtype.value); setValues({ value: '', systolic: '', diastolic: '' }); }}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              selectedType === vtype.value
                ? 'bg-teal-600 text-white shadow-md'
                : 'bg-white text-slate-600 border border-slate-200 hover:border-teal-300 hover:text-teal-700'
            }`}
          >
            {vtype.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Entry Form */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-white rounded-2xl border border-slate-200 shadow p-6"
        >
          <h2 className="text-lg font-semibold text-slate-800 mb-1">{t('vitals.logReading')} — {typeConfig.label}</h2>
          <p className="text-xs text-slate-400 mb-4">{t('vitals.normalRange')}: {NORMAL_RANGES[selectedType]}</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {typeConfig.dual ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">{t('vitals.systolic')}</label>
                  <input
                    type="number"
                    value={values.systolic}
                    onChange={(e) => setValues({ ...values, systolic: e.target.value })}
                    required
                    placeholder="120"
                    className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">{t('vitals.diastolic')}</label>
                  <input
                    type="number"
                    value={values.diastolic}
                    onChange={(e) => setValues({ ...values, diastolic: e.target.value })}
                    required
                    placeholder="80"
                    className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Value ({typeConfig.unit})
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={values.value}
                  onChange={(e) => setValues({ ...values, value: e.target.value })}
                  required
                  placeholder="Enter value"
                  className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl transition-colors"
            >
              {submitting ? t('vitals.saving') : t('vitals.save')}
            </button>
          </form>
        </motion.div>

        {/* Chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-1">
            {typeConfig.label} — Last 30 Days
          </h2>
          <p className="text-xs text-slate-400 mb-4">Unit: {typeConfig.unit}</p>

          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : chartData.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
              No data yet. Start recording your {typeConfig.label.toLowerCase()} above.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="ts"
                  tick={{ fontSize: 12, fill: '#94a3b8' }}
                  tickFormatter={(ts) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                />
                <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <Tooltip
                  labelFormatter={(ts) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  contentStyle={{
                    borderRadius: '12px',
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                  }}
                />
                <Legend />
                {typeConfig.dual ? (
                  <>
                    <Line type="monotone" dataKey="systolic" stroke="#0D9488" strokeWidth={2} dot={{ r: 4, fill: '#0D9488' }} name="Systolic" />
                    <Line type="monotone" dataKey="diastolic" stroke="#F59E0B" strokeWidth={2} dot={{ r: 4, fill: '#F59E0B' }} name="Diastolic" />
                  </>
                ) : (
                  <Line type="monotone" dataKey="value" stroke="#0D9488" strokeWidth={2} dot={{ r: 4, fill: '#0D9488' }} name={typeConfig.label} />
                )}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Demo: bulk import from wearable-style CSV (collapsed by default) */}
      <details
        open={showCsvImport}
        onToggle={(e) => setShowCsvImport(e.target.open)}
        className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden"
      >
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:text-teal-700 dark:hover:text-teal-400 list-none flex items-center justify-between">
          <span>{t('vitals.csvImportTitle')}</span>
          <span className="text-xs font-normal text-slate-400">{t('vitals.csvImportHint')}</span>
        </summary>
        <div className="px-4 pb-4 space-y-3 border-t border-slate-200 dark:border-slate-700 pt-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('vitals.csvImportHelp')}</p>
          <textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            rows={4}
            className="w-full text-xs font-mono border border-slate-200 dark:border-slate-600 rounded-xl p-3 bg-white dark:bg-slate-900 dark:text-slate-100"
          />
          <button
            type="button"
            disabled={importing}
            onClick={async () => {
              setImporting(true);
              try {
                const { data } = await api.post('/patient/vitals/import-csv', { csv: csvText });
                toast.success(data.message || 'Imported');
                fetchData();
              } catch (err) {
                toast.error(err.response?.data?.error || err.message || 'Import failed');
              } finally {
                setImporting(false);
              }
            }}
            className="text-sm font-semibold text-teal-700 dark:text-teal-400 hover:text-teal-800 disabled:opacity-50"
          >
            {importing ? t('common.loading') : t('vitals.csvImportBtn')}
          </button>
        </div>
      </details>

      {/* Blood Report Correlation Insight */}
      {(loadingInsight || insight) && (
        <div className="bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-200 rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <span className="text-xl shrink-0">🔗</span>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-teal-800 mb-1">
                {t('vitals.correlation')}
              </h3>
              {loadingInsight ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm text-teal-600">Analysing correlation...</span>
                </div>
              ) : (
                <p className="text-sm text-slate-700 leading-relaxed">{insight}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
