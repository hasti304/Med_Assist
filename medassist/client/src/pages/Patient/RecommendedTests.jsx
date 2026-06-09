import { useState, useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import api from '../../services/api';
import AssistFlowStepper from '../../components/AssistFlowStepper';

const URGENCY_STYLE = {
  essential: 'bg-red-50 text-red-700 border-red-200',
  recommended: 'bg-amber-50 text-amber-700 border-amber-200',
  optional: 'bg-slate-50 text-slate-600 border-slate-200',
};

export default function RecommendedTests() {
  const { sessionId } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [disease, setDisease] = useState(state?.disease || null);
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        let d = state?.disease;
        let cachedTests = null;

        if (!d) {
          const { data } = await api.get(`/patient/sessions/${sessionId}`);
          const session = data.session;
          d = session?.selected_disease_data || (session?.selected_disease ? { disease: session.selected_disease } : null);
          if (Array.isArray(session?.recommended_tests) && session.recommended_tests.length) {
            cachedTests = session.recommended_tests;
          }
        }

        if (!d?.disease || !d?.icd_code) {
          if (!cancelled) {
            toast.error(t('assist.pickDiagnosisFirst'));
            navigate(`/patient/results/${sessionId}`);
          }
          return;
        }

        if (!cancelled) setDisease(d);

        if (cachedTests?.length) {
          if (!cancelled) setTests(cachedTests);
          return;
        }

        const { data: testData } = await api.post('/disease/tests', { sessionId, disease: d });
        if (!cancelled) setTests(testData.tests || []);
      } catch (err) {
        if (!cancelled) toast.error(err.message || t('assist.testsFailed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto py-16 flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-slate-500">{t('assist.loadingTests')}</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <AssistFlowStepper current="tests" />

      <div className="bg-white rounded-2xl border border-slate-200 shadow p-6">
        <h1 className="text-xl font-bold text-slate-800">{t('assist.testsTitle')}</h1>
        <p className="text-sm text-slate-500 mt-1">{t('assist.testsSubtitle')}</p>
        {disease && (
          <p className="text-xs text-teal-700 font-semibold mt-2">
            {disease.disease} {disease.icd_code ? `(${disease.icd_code})` : ''}
          </p>
        )}
      </div>

      <div className="space-y-3">
        {tests.map((test, i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-200 shadow p-5">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-base font-bold text-slate-800">{test.test_name}</h2>
                {test.abbreviation && (
                  <span className="text-xs font-mono text-slate-500">{test.abbreviation}</span>
                )}
              </div>
              {test.urgency && (
                <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border capitalize ${URGENCY_STYLE[test.urgency] || URGENCY_STYLE.optional}`}>
                  {test.urgency}
                </span>
              )}
            </div>
            {test.reason && <p className="text-sm text-slate-600 mt-2">{test.reason}</p>}
            <div className="flex flex-wrap gap-3 mt-2 text-xs text-slate-500">
              {test.normal_range && (
                <span><span className="font-semibold">{t('assist.normalRange')}:</span> {test.normal_range}</span>
              )}
              {test.what_to_expect && (
                <span className="text-slate-400 italic">{test.what_to_expect}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-100 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <p className="font-semibold text-slate-800">{t('assist.readyUpload')}</p>
          <p className="text-xs text-slate-500 mt-1">{t('assist.uploadHint')}</p>
        </div>
        <button
          type="button"
          onClick={() => navigate(`/patient/upload-report/${sessionId}`, { state: { sessionId, disease } })}
          className="bg-teal-600 hover:bg-teal-700 text-white font-semibold px-6 py-3 rounded-xl whitespace-nowrap shadow-sm"
        >
          {t('assist.uploadReport')} →
        </button>
      </div>
    </div>
  );
}
