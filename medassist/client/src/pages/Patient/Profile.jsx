import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import TagInput, { normalizeTagList } from '../../components/TagInput';

const fadeIn = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const SMOKING = ['never', 'former', 'current'];
const ALCOHOL = ['none', 'occasional', 'moderate', 'heavy'];

const inputClass = 'w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400 transition-all placeholder:text-slate-400';
const labelClass = 'block text-xs font-semibold text-slate-500 mb-1.5';

function InfoRow({ icon, label, value }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-slate-200 last:border-0">
      <div className="w-8 h-8 bg-teal-50 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
        <span className="text-sm">{icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
        <p className="text-sm text-slate-800 font-medium mt-0.5">{value || '—'}</p>
      </div>
    </div>
  );
}

function TagList({ items, emptyText, color = 'teal' }) {
  if (!items?.length) return <span className="text-xs text-slate-400 italic">{emptyText}</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, i) => (
        <span key={i} className={`text-xs font-medium px-2.5 py-1 rounded-lg bg-${color}-50 text-${color}-700 ring-1 ring-${color}-200/60`}>
          {item}
        </span>
      ))}
    </div>
  );
}

export default function PatientProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [conditions, setConditions] = useState([]);
  const [allergies, setAllergies] = useState([]);
  const [medications, setMedications] = useState([]);
  const [insurance, setInsurance] = useState({ provider: '', policy_number: '', pcp_name: '', pcp_phone: '' });
  const [reminderPrefs, setReminderPrefs] = useState({ email: true, sms: false, phone: '' });
  const [shares, setShares] = useState([]);

  const { register, handleSubmit, reset, formState: { errors } } = useForm();

  useEffect(() => {
    api.get('/patient/profile')
      .then(res => {
        const p = res.data.profile;
        setProfile(p);
        if (p) {
          reset({
            age: p.age || '', gender: p.gender || '',
            weightKg: p.weightKg || p.weight_kg || '',
            heightCm: p.heightCm || p.height_cm || '',
            bloodGroup: p.bloodGroup || p.blood_group || '',
            smokingStatus: p.smokingStatus || p.smoking_status || '',
            alcoholUse: p.alcoholUse || p.alcohol_use || '',
          });
          setConditions(normalizeTagList(p.existingConditions || p.existing_conditions));
          setAllergies(normalizeTagList(p.allergies));
          setMedications(normalizeTagList(p.currentMedications || p.current_medications));
          setInsurance(p.insurance_info || { provider: '', policy_number: '', pcp_name: '', pcp_phone: '' });
          setReminderPrefs(p.reminder_preferences || { email: true, sms: false, phone: '' });
        }
      })
      .catch(() => toast.error('Failed to load profile'))
      .finally(() => setLoading(false));

    api.get('/patient/reminder-preferences').then((r) => {
      if (r.data.preferences) setReminderPrefs((prev) => ({ ...prev, ...r.data.preferences }));
    }).catch(() => {});
    api.get('/patient/share-access').then((r) => setShares(r.data.shares || [])).catch(() => {});
  }, []);

  async function onSubmit(data) {
    setSaving(true);
    try {
      const res = await api.put('/patient/profile', {
        ...data,
        existingConditions: conditions,
        allergies,
        currentMedications: medications,
        insuranceInfo: insurance,
        reminderPreferences: reminderPrefs,
      });
      setProfile(res.data.profile);
      setEditing(false);
      toast.success('Profile updated!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-400">Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div variants={fadeIn} initial="hidden" animate="visible" className="max-w-4xl mx-auto space-y-6 pb-10">
      {/* Hero */}
      <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-teal-700 via-teal-600 to-emerald-600">
        <div className="absolute top-0 right-0 w-72 h-72 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/4" />

        <div className="relative px-6 sm:px-8 py-8 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-white/15 backdrop-blur-sm rounded-2xl flex items-center justify-center ring-1 ring-white/20 text-3xl font-bold text-white">
              {(user?.name || 'P').charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">{user?.name || 'Patient'}</h1>
              <p className="text-teal-100 text-sm mt-0.5">{user?.email}</p>
              <span className="inline-block mt-1.5 px-2.5 py-0.5 bg-white/15 text-teal-100 rounded-lg text-xs font-semibold backdrop-blur-sm ring-1 ring-white/10 capitalize">
                {user?.role || 'patient'}
              </span>
            </div>
          </div>
          <button
            onClick={() => setEditing(v => !v)}
            className="flex items-center gap-2 bg-white/15 hover:bg-white/25 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-all border border-white/10 backdrop-blur-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
            </svg>
            {editing ? 'Cancel' : 'Edit Profile'}
          </button>
        </div>
      </div>

      {editing ? (
        /* ── Edit Mode ── */
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow p-6 space-y-5">
            <h2 className="text-sm font-bold text-slate-700 pb-3 border-b border-slate-200">Basic Information</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <label className={labelClass}>Age *</label>
                <input type="number" {...register('age', { required: 'Required' })} placeholder="28" className={inputClass} />
                {errors.age && <p className="text-red-500 text-[10px] mt-1">{errors.age.message}</p>}
              </div>
              <div>
                <label className={labelClass}>Gender *</label>
                <select {...register('gender', { required: 'Required' })} className={`${inputClass} bg-white`}>
                  <option value="">Select</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
                {errors.gender && <p className="text-red-500 text-[10px] mt-1">{errors.gender.message}</p>}
              </div>
              <div>
                <label className={labelClass}>Weight (kg)</label>
                <input type="number" {...register('weightKg')} placeholder="72" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Height (cm)</label>
                <input type="number" {...register('heightCm')} placeholder="170" className={inputClass} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>Blood Group</label>
                <select {...register('bloodGroup')} className={`${inputClass} bg-white`}>
                  <option value="">Select</option>
                  {BLOOD_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Smoking Status</label>
                <select {...register('smokingStatus')} className={`${inputClass} bg-white`}>
                  <option value="">Select</option>
                  {SMOKING.map(s => <option key={s} value={s} className="capitalize">{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Alcohol Use</label>
                <select {...register('alcoholUse')} className={`${inputClass} bg-white`}>
                  <option value="">Select</option>
                  {ALCOHOL.map(a => <option key={a} value={a} className="capitalize">{a.charAt(0).toUpperCase() + a.slice(1)}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow p-6 space-y-5">
            <h2 className="text-sm font-bold text-slate-700 pb-3 border-b border-slate-200">Medical History</h2>
            <div>
              <label className={labelClass}>Existing Conditions</label>
              <TagInput value={conditions} onChange={setConditions} placeholder="e.g. Hypertension, Diabetes" />
            </div>
            <div>
              <label className={labelClass}>Allergies</label>
              <TagInput value={allergies} onChange={setAllergies} placeholder="e.g. Penicillin, Peanuts" />
            </div>
            <div>
              <label className={labelClass}>Current Medications</label>
              <TagInput value={medications} onChange={setMedications} placeholder="e.g. Lisinopril 10mg" />
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-700 pb-3 border-b border-slate-200">Insurance & PCP</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Insurance provider</label>
                <input className={inputClass} value={insurance.provider} onChange={(e) => setInsurance({ ...insurance, provider: e.target.value })} />
              </div>
              <div>
                <label className={labelClass}>Policy number</label>
                <input className={inputClass} value={insurance.policy_number} onChange={(e) => setInsurance({ ...insurance, policy_number: e.target.value })} />
              </div>
              <div>
                <label className={labelClass}>Primary care physician</label>
                <input className={inputClass} value={insurance.pcp_name} onChange={(e) => setInsurance({ ...insurance, pcp_name: e.target.value })} />
              </div>
              <div>
                <label className={labelClass}>PCP phone</label>
                <input className={inputClass} value={insurance.pcp_phone} onChange={(e) => setInsurance({ ...insurance, pcp_phone: e.target.value })} />
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button type="submit" disabled={saving}
              className="bg-teal-600 text-white font-bold text-sm px-8 py-3 rounded-xl hover:bg-teal-700 disabled:opacity-50 transition-all shadow-md hover:shadow-lg">
              {saving ? 'Saving...' : 'Save Profile'}
            </button>
            <button type="button" onClick={() => setEditing(false)}
              className="text-slate-500 font-medium text-sm px-6 py-3 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        /* ── View Mode ── */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left column */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow p-6">
            <h2 className="text-sm font-bold text-slate-700 pb-3 mb-1 border-b border-slate-200">Basic Information</h2>
            <InfoRow icon="🎂" label="Age" value={profile?.age ? `${profile.age} years` : null} />
            <InfoRow icon="👤" label="Gender" value={profile?.gender ? profile.gender.charAt(0).toUpperCase() + profile.gender.slice(1) : null} />
            <InfoRow icon="⚖️" label="Weight" value={profile?.weightKg || profile?.weight_kg ? `${profile.weightKg || profile.weight_kg} kg` : null} />
            <InfoRow icon="📏" label="Height" value={profile?.heightCm || profile?.height_cm ? `${profile.heightCm || profile.height_cm} cm` : null} />
            <InfoRow icon="🩸" label="Blood Group" value={profile?.bloodGroup || profile?.blood_group} />
            <InfoRow icon="🚬" label="Smoking" value={profile?.smokingStatus || profile?.smoking_status ? (profile.smokingStatus || profile.smoking_status).charAt(0).toUpperCase() + (profile.smokingStatus || profile.smoking_status).slice(1) : null} />
            <InfoRow icon="🍷" label="Alcohol" value={profile?.alcoholUse || profile?.alcohol_use ? (profile.alcoholUse || profile.alcohol_use).charAt(0).toUpperCase() + (profile.alcoholUse || profile.alcohol_use).slice(1) : null} />
          </div>

          {/* Right column */}
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 shadow p-6">
              <h2 className="text-sm font-bold text-slate-700 pb-3 mb-3 border-b border-slate-200">Existing Conditions</h2>
              <TagList items={profile?.existingConditions || profile?.existing_conditions} emptyText="No conditions listed" />
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow p-6">
              <h2 className="text-sm font-bold text-slate-700 pb-3 mb-3 border-b border-slate-200">Allergies</h2>
              <TagList items={profile?.allergies} emptyText="No allergies listed" color="red" />
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow p-6">
              <h2 className="text-sm font-bold text-slate-700 pb-3 mb-3 border-b border-slate-200">Current Medications</h2>
              <TagList items={profile?.currentMedications || profile?.current_medications} emptyText="No medications listed" color="amber" />
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow p-6 space-y-4">
        <h2 className="text-sm font-bold text-slate-700 border-b border-slate-200 pb-3">Follow-up reminders</h2>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={reminderPrefs.email !== false} onChange={(e) => setReminderPrefs({ ...reminderPrefs, email: e.target.checked })} />
          Email reminders for recheck dates
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-500">
          <input type="checkbox" checked={!!reminderPrefs.sms} disabled />
          SMS (demo — configure provider in production)
        </label>
        <button
          type="button"
          onClick={() => api.put('/patient/reminder-preferences', reminderPrefs).then(() => toast.success('Reminder preferences saved')).catch(() => toast.error('Save failed'))}
          className="text-sm font-semibold text-teal-600 hover:text-teal-700"
        >
          Save reminder preferences
        </button>
      </div>

      {shares.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow p-6">
          <h2 className="text-sm font-bold text-slate-700 border-b border-slate-200 pb-3 mb-3">Who viewed your shared links</h2>
          <ul className="space-y-2 text-sm">
            {shares.map((s) => (
              <li key={s.id} className="flex justify-between gap-2 border-b border-slate-100 py-2">
                <span className="text-slate-600">{s.label || 'Shared report'} · {s.access_count || 0} view(s)</span>
                <span className="text-xs text-slate-400">{s.accessed_at ? new Date(s.accessed_at).toLocaleDateString() : 'Not yet'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!profile && !editing && (
        <div className="bg-teal-50 border border-teal-200 rounded-2xl p-8 text-center">
          <div className="w-14 h-14 bg-teal-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <svg className="w-7 h-7 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
            </svg>
          </div>
          <h3 className="text-base font-bold text-teal-800 mb-1">Complete Your Profile</h3>
          <p className="text-sm text-teal-600 mb-4">Adding your health details helps AI agents provide more accurate assessments.</p>
          <button onClick={() => setEditing(true)}
            className="bg-teal-600 text-white font-bold text-sm px-6 py-2.5 rounded-xl hover:bg-teal-700 transition-all shadow-md">
            Set Up Profile
          </button>
        </div>
      )}
    </motion.div>
  );
}
