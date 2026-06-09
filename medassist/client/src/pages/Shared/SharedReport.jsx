import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';

const fadeIn = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

const STATUS_STYLE = {
  normal:        'bg-green-50 text-green-700',
  low:           'bg-yellow-50 text-yellow-800',
  high:          'bg-orange-50 text-orange-800',
  critical_low:  'bg-red-100 text-red-800',
  critical_high: 'bg-red-200 text-red-900',
};

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export default function SharedReport() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchReport = async () => {
      try {
        const res = await axios.get(`${baseURL}/shared/${token}`);
        setData(res.data);
      } catch (err) {
        const status = err.response?.status;
        const msg = err.response?.data?.error;
        if (status === 410) {
          setError(msg || 'This link has expired. Ask the patient to share a new link from their report.');
        } else {
          setError(msg || 'This link is invalid or has expired.');
        }
      } finally {
        setLoading(false);
      }
    };
    fetchReport();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-teal-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-teal-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md text-center border border-slate-200">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-lg font-bold text-slate-800 mb-2">Link Unavailable</h1>
          <p className="text-sm text-slate-500">{error}</p>
        </div>
      </div>
    );
  }

  const { analysis, disease, patientName } = data || {};
  const summary = analysis?.summary;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-teal-50 py-8 px-4">
      <div className="max-w-3xl mx-auto mb-4 bg-teal-700 text-white rounded-xl px-4 py-3 text-center text-sm">
        <strong>Caregiver / family view</strong> — read-only shared summary. Not for clinical decisions.
      </div>
      <motion.div variants={fadeIn} initial="hidden" animate="visible" className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-teal-50 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800">Shared Medical Report</h1>
              <p className="text-sm text-teal-600 font-medium">{disease || 'Medical Analysis'}</p>
            </div>
          </div>
          {patientName && (
            <p className="text-sm text-slate-500">Patient: {patientName}</p>
          )}
          <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
            This is a shared, read-only view of an AI-generated medical analysis. Always consult a physician.
          </div>
        </div>

        {/* Summary */}
        {summary && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow p-6">
            <h2 className="text-lg font-bold text-slate-800 border-b border-slate-200 pb-2 mb-4">Summary</h2>
            <p className="text-slate-700 leading-relaxed">{summary.overall_assessment}</p>
            {summary.root_cause && (
              <p className="text-sm text-slate-500 mt-2">
                <span className="font-medium text-slate-700">Root cause:</span> {summary.root_cause}
              </p>
            )}
          </div>
        )}

        {/* Findings */}
        {analysis?.abnormal_findings?.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow p-6">
            <h2 className="text-lg font-bold text-slate-800 border-b border-slate-200 pb-2 mb-4">
              Abnormal Findings ({analysis.abnormal_findings.length})
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 border-b border-slate-200">
                    <th className="pb-2 font-medium">Parameter</th>
                    <th className="pb-2 font-medium">Value</th>
                    <th className="pb-2 font-medium">Normal Range</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {analysis.abnormal_findings.map((f, i) => (
                    <tr key={i}>
                      <td className="py-2 pr-3 font-medium text-slate-800">{f.parameter}</td>
                      <td className="py-2 pr-3 font-mono font-semibold">{f.your_value}</td>
                      <td className="py-2 pr-3 text-slate-500 font-mono text-xs">{f.normal_range}</td>
                      <td className="py-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLE[f.status] || 'bg-slate-100 text-slate-600'}`}>
                          {f.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}


        {/* Diet */}
        {analysis?.diet_plan && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow p-6">
            <h2 className="text-lg font-bold text-slate-800 border-b border-slate-200 pb-2 mb-4">Diet Plan</h2>
            {analysis.diet_plan.overview && (
              <p className="text-sm text-slate-600 mb-3">{analysis.diet_plan.overview}</p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {analysis.diet_plan.foods_to_eat?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-green-700 mb-2">Recommended Foods</h3>
                  <ul className="space-y-1">
                    {analysis.diet_plan.foods_to_eat.map((f, i) => (
                      <li key={i} className="text-sm text-slate-600 bg-green-50 rounded-lg p-2">
                        <span className="font-medium">{f.food}</span> — {f.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {analysis.diet_plan.foods_to_avoid?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-red-600 mb-2">Foods to Avoid</h3>
                  <ul className="space-y-1">
                    {analysis.diet_plan.foods_to_avoid.map((f, i) => (
                      <li key={i} className="text-sm text-slate-600 bg-red-50 rounded-lg p-2">
                        <span className="font-medium">{f.food}</span> — {f.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-slate-400 py-4">
          MedAssist AI — For educational purposes only. Not a substitute for professional medical advice.
        </div>
      </motion.div>
    </div>
  );
}
