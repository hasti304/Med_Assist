import { useState, useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import api from '../../services/api';
import AssistFlowStepper from '../../components/AssistFlowStepper';

function ProbabilityBar({ value }) {
  const pct = Math.min(100, Math.max(0, Number(value) || 0));
  const color = pct >= 70 ? 'bg-red-500' : pct >= 40 ? 'bg-amber-500' : 'bg-teal-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-bold text-slate-600 w-10 text-right">{pct}%</span>
    </div>
  );
}

export default function DiagnosticResults() {
  const { sessionId } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [diseases, setDiseases] = useState(state?.diseases || []);
  const [loading, setLoading] = useState(!state?.diseases?.length);
  const [selecting, setSelecting] = useState(null);

  useEffect(() => {
    if (diseases.length) return;
    setLoading(true);
    api.get(`/patient/sessions/${sessionId}`)
      .then(({ data }) => {
        const list = data.session?.predicted_diseases;
        if (Array.isArray(list) && list.length) setDiseases(list);
        else toast.error(t('assist.noDiagnosis'));
      })
      .catch(() => toast.error(t('assist.loadSessionFailed')))
      .finally(() => setLoading(false));
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSelect(disease) {
    setSelecting(disease.icd_code);
    try {
      await api.post(`/patient/sessions/${sessionId}/select-disease`, { disease });
      navigate(`/patient/tests/${sessionId}`, { state: { disease } });
    } catch (err) {
      toast.error(err.message || t('assist.selectFailed'));
      setSelecting(null);
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto py-16 flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-slate-500">{t('assist.loadingResults')}</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <AssistFlowStepper current="diagnosis" />

      <div className="bg-white rounded-2xl border border-slate-200 shadow p-6">
        <h1 className="text-xl font-bold text-slate-800">{t('assist.resultsTitle')}</h1>
        <p className="text-sm text-slate-500 mt-1">{t('assist.resultsSubtitle')}</p>
        {state?.turns != null && (
          <p className="text-xs text-teal-600 mt-2 font-medium">
            {t('assist.agentTurns', { count: state.turns })}
          </p>
        )}
      </div>

      <div className="space-y-3">
        {diseases.map((d, i) => (
          <div
            key={d.icd_code || i}
            className="bg-white rounded-2xl border border-slate-200 shadow p-5 hover:border-teal-200 transition-colors"
          >
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base font-bold text-slate-800">{d.disease}</h2>
                  {d.icd_code && (
                    <span className="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded-lg">
                      ICD-10 {d.icd_code}
                    </span>
                  )}
                </div>
                {d.icd_description && (
                  <p className="text-xs text-slate-500 mt-1">{d.icd_description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleSelect(d)}
                disabled={selecting === d.icd_code}
                className="shrink-0 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-50"
              >
                {selecting === d.icd_code ? t('common.loading') : t('assist.getTests')}
              </button>
            </div>

            <div className="mt-3">
              <ProbabilityBar value={d.probability} />
            </div>

            {d.description && (
              <p className="text-sm text-slate-600 mt-3 leading-relaxed">{d.description}</p>
            )}

            {d.matched_symptoms?.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {d.matched_symptoms.map((s) => (
                  <span key={s} className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-teal-50 text-teal-700">
                    {s}
                  </span>
                ))}
              </div>
            )}

            {d.reasoning && (
              <p className="text-xs text-slate-400 mt-2 italic border-t border-slate-100 pt-2">{d.reasoning}</p>
            )}
          </div>
        ))}
      </div>

      {!diseases.length && (
        <div className="text-center py-8">
          <p className="text-slate-500 mb-4">{t('assist.noDiagnosis')}</p>
          <button
            type="button"
            onClick={() => navigate('/patient/new-assist')}
            className="text-teal-600 font-semibold text-sm hover:underline"
          >
            {t('assist.startOver')}
          </button>
        </div>
      )}
    </div>
  );
}
