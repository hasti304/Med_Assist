import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import api from '../../services/api';
import AssistFlowStepper from '../../components/AssistFlowStepper';
import TagInput, { normalizeTagList } from '../../components/TagInput';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const SMOKING = ['never', 'former', 'current'];
const ALCOHOL = ['none', 'occasional', 'moderate', 'heavy'];

const COMMON_SYMPTOMS = [
  'Fatigue', 'Fever', 'Headache', 'Cough', 'Shortness of Breath',
  'Chest Pain', 'Nausea', 'Abdominal Pain', 'Increased Thirst',
  'Frequent Urination', 'Blurred Vision', 'Weight Loss', 'Dizziness',
  'Joint Pain', 'Skin Rash', 'Sore Throat',
];

const ONSET_OPTIONS = ['sudden', 'gradual', 'intermittent'];
const inputClass = 'w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400';

export default function SymptomWizard() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [step, setStep] = useState(1);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [demographics, setDemographics] = useState({
    age: '', gender: 'male', weightKg: '', heightCm: '', bloodGroup: 'O+',
    smokingStatus: 'never', alcoholUse: 'none',
  });
  const [conditions, setConditions] = useState([]);
  const [allergies, setAllergies] = useState([]);
  const [medications, setMedications] = useState([]);
  const [selectedSymptoms, setSelectedSymptoms] = useState([]);

  useEffect(() => {
    api.get('/patient/profile')
      .then(({ data }) => {
        const p = data.profile;
        if (!p) return;
        setDemographics({
          age: p.age ?? '',
          gender: p.gender || 'male',
          weightKg: p.weight_kg ?? '',
          heightCm: p.height_cm ?? '',
          bloodGroup: p.blood_group || 'O+',
          smokingStatus: p.smoking_status || 'never',
          alcoholUse: p.alcohol_use || 'none',
        });
        setConditions(normalizeTagList(p.existing_conditions));
        setAllergies(normalizeTagList(p.allergies));
        setMedications(normalizeTagList(p.current_medications));
      })
      .catch(() => {})
      .finally(() => setLoadingProfile(false));
  }, []);

  function toggleSymptom(name) {
    setSelectedSymptoms((prev) => {
      const exists = prev.find((s) => s.name === name);
      if (exists) return prev.filter((s) => s.name !== name);
      return [...prev, { name, severity: 5, duration: '7', onset: 'gradual' }];
    });
  }

  function updateSymptom(name, field, value) {
    setSelectedSymptoms((prev) =>
      prev.map((s) => (s.name === name ? { ...s, [field]: value } : s))
    );
  }

  async function saveProfile() {
    await api.put('/patient/profile', {
      age: Number(demographics.age) || null,
      gender: demographics.gender,
      weightKg: Number(demographics.weightKg) || null,
      heightCm: Number(demographics.heightCm) || null,
      bloodGroup: demographics.bloodGroup,
      existingConditions: conditions,
      allergies,
      currentMedications: medications,
      smokingStatus: demographics.smokingStatus,
      alcoholUse: demographics.alcoholUse,
    });
  }

  async function handleSubmit() {
    if (selectedSymptoms.length === 0) {
      toast.error(t('assist.selectOneSymptom'));
      return;
    }
    setSubmitting(true);
    try {
      await saveProfile();
      const { data } = await api.post('/disease/predict', { symptoms: selectedSymptoms });
      toast.success(t('assist.diagnosisReady'));
      navigate(`/patient/results/${data.sessionId}`, {
        state: { diseases: data.diseases, turns: data.turns },
      });
    } catch (err) {
      toast.error(err.message || t('assist.diagnosisFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <AssistFlowStepper current="symptoms" />

      <div className="bg-white rounded-2xl border border-slate-200 shadow p-6">
        <h1 className="text-xl font-bold text-slate-800">{t('assist.wizardTitle')}</h1>
        <p className="text-sm text-slate-500 mt-1">{t('assist.wizardSubtitle')}</p>
        <div className="flex gap-2 mt-4">
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setStep(n)}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${
                step === n ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              {t(`assist.wizardStep${n}`)}
            </button>
          ))}
        </div>
      </div>

      {loadingProfile && step === 1 && (
        <p className="text-xs text-slate-400 animate-pulse px-1">{t('common.loading')}</p>
      )}

      {step === 1 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow p-6 space-y-4">
          <h2 className="text-sm font-bold text-slate-700">{t('assist.step1Title')}</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-500">{t('assist.age')}</label>
              <input type="number" min="1" max="120" className={inputClass} value={demographics.age}
                onChange={(e) => setDemographics((d) => ({ ...d, age: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">{t('assist.gender')}</label>
              <select className={inputClass} value={demographics.gender}
                onChange={(e) => setDemographics((d) => ({ ...d, gender: e.target.value }))}>
                <option value="male">{t('assist.male')}</option>
                <option value="female">{t('assist.female')}</option>
                <option value="other">{t('assist.other')}</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">{t('assist.weight')}</label>
              <input type="number" className={inputClass} value={demographics.weightKg}
                onChange={(e) => setDemographics((d) => ({ ...d, weightKg: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">{t('assist.height')}</label>
              <input type="number" className={inputClass} value={demographics.heightCm}
                onChange={(e) => setDemographics((d) => ({ ...d, heightCm: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-semibold text-slate-500">{t('assist.bloodGroup')}</label>
              <select className={inputClass} value={demographics.bloodGroup}
                onChange={(e) => setDemographics((d) => ({ ...d, bloodGroup: e.target.value }))}>
                {BLOOD_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
          </div>
          <button type="button" onClick={() => setStep(2)}
            className="w-full bg-teal-600 hover:bg-teal-700 text-white font-semibold py-3 rounded-xl transition-colors">
            {t('assist.continue')} →
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow p-6 space-y-4">
          <h2 className="text-sm font-bold text-slate-700">{t('assist.step2Title')}</h2>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">{t('assist.conditions')}</label>
            <TagInput value={conditions} onChange={setConditions} placeholder={t('assist.conditionsPlaceholder')} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">{t('assist.allergies')}</label>
            <TagInput value={allergies} onChange={setAllergies} placeholder={t('assist.allergiesPlaceholder')} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">{t('assist.medications')}</label>
            <TagInput value={medications} onChange={setMedications} placeholder={t('assist.medsPlaceholder')} />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => setStep(1)} className="flex-1 border border-slate-200 text-slate-600 font-semibold py-3 rounded-xl hover:bg-slate-50">
              ← {t('assist.back')}
            </button>
            <button type="button" onClick={() => setStep(3)} className="flex-[2] bg-teal-600 hover:bg-teal-700 text-white font-semibold py-3 rounded-xl">
              {t('assist.continue')} →
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow p-6 space-y-4">
          <h2 className="text-sm font-bold text-slate-700">{t('assist.step3Title')}</h2>
          <p className="text-xs text-slate-500">{t('assist.step3Hint')}</p>
          <div className="flex flex-wrap gap-2">
            {COMMON_SYMPTOMS.map((name) => {
              const active = selectedSymptoms.some((s) => s.name === name);
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => toggleSymptom(name)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                    active ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-slate-600 border-slate-200 hover:border-teal-300'
                  }`}
                >
                  {name}
                </button>
              );
            })}
          </div>

          {selectedSymptoms.length > 0 && (
            <div className="space-y-3 pt-2 border-t border-slate-100">
              {selectedSymptoms.map((s) => (
                <div key={s.name} className="bg-slate-50 rounded-xl p-4 space-y-3">
                  <p className="text-sm font-bold text-slate-800">{s.name}</p>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-500">
                      {t('assist.severity')}: {s.severity}/10
                    </label>
                    <input type="range" min="1" max="10" value={s.severity}
                      onChange={(e) => updateSymptom(s.name, 'severity', Number(e.target.value))}
                      className="w-full accent-teal-600" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-500">{t('assist.durationDays')}</label>
                      <input type="number" min="1" className={inputClass} value={s.duration}
                        onChange={(e) => updateSymptom(s.name, 'duration', e.target.value)} />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-500">{t('assist.onset')}</label>
                      <select className={inputClass} value={s.onset}
                        onChange={(e) => updateSymptom(s.name, 'onset', e.target.value)}>
                        {ONSET_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setStep(2)} className="flex-1 border border-slate-200 text-slate-600 font-semibold py-3 rounded-xl hover:bg-slate-50">
              ← {t('assist.back')}
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || selectedSymptoms.length === 0}
              className="flex-[2] bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-semibold py-3 rounded-xl disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {t('assist.runningDiagnosis')}
                </>
              ) : (
                t('assist.getDiagnosis')
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
