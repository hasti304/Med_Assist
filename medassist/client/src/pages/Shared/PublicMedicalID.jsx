import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';
import toast from 'react-hot-toast';

const fadeIn = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export default function PublicMedicalID() {
  const { patientId } = useParams();
  const [pin, setPin] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (pin.length !== 4) {
      toast.error('Please enter your 4-digit PIN');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`${baseURL}/shared/medical-id/${patientId}?pin=${pin}`);
      setData(res.data);
    } catch (err) {
      const msg = err.response?.data?.error || 'Invalid PIN or ID not found.';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // PIN Entry Screen
  if (!data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-red-50 flex items-center justify-center p-4">
        <motion.div
          variants={fadeIn}
          initial="hidden"
          animate="visible"
          className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full border border-slate-200 text-center"
        >
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z" />
            </svg>
          </div>

          <h1 className="text-xl font-bold text-slate-800 mb-1">Emergency Medical ID</h1>
          <p className="text-sm text-slate-500 mb-6">Enter the 4-digit PIN to access this patient's emergency info.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              maxLength={4}
              placeholder="_ _ _ _"
              className="w-full text-center text-2xl tracking-[0.5em] font-mono border border-slate-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent"
              autoFocus
            />

            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || pin.length !== 4}
              className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl transition-colors"
            >
              {loading ? 'Verifying...' : 'Access Medical ID'}
            </button>
          </form>

          <p className="text-xs text-slate-400 mt-4">
            This is an emergency access page for MedAssist AI.
          </p>
        </motion.div>
      </div>
    );
  }

  // Medical ID Display — API returns flat camelCase: { patientName, emergencyName, emergencyPhone,
  // bloodType, organDonor, criticalNotes, profile: { blood_group, allergies, existing_conditions, current_medications } }
  const { patientName, emergencyName, emergencyPhone, bloodType, organDonor, criticalNotes, profile } = data;

  // Merge allergies: criticalNotes from medical_id + allergies array from profile
  const profileAllergies = profile?.allergies?.length ? profile.allergies.join(', ') : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-red-50 py-8 px-4">
      <motion.div variants={fadeIn} initial="hidden" animate="visible" className="max-w-md mx-auto space-y-4">

        {/* Header */}
        <div className="bg-red-600 rounded-2xl p-6 text-white text-center shadow-lg">
          <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold">MEDICAL ID</h1>
          {patientName && <p className="text-red-100 text-sm mt-1">{patientName}</p>}
        </div>

        {/* Blood Type */}
        {(bloodType || profile?.blood_group) && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow p-5 text-center">
            <p className="text-xs text-slate-400 uppercase tracking-wide font-medium mb-1">Blood Type</p>
            <p className="text-4xl font-bold text-red-600">{bloodType || profile?.blood_group}</p>
          </div>
        )}

        {/* Emergency Contact */}
        {(emergencyName || emergencyPhone) && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow p-5">
            <h2 className="text-sm font-semibold text-slate-800 mb-3">Emergency Contact</h2>
            {emergencyName && (
              <p className="text-slate-700 font-medium">{emergencyName}</p>
            )}
            {emergencyPhone && (
              <a
                href={`tel:${emergencyPhone}`}
                className="inline-flex items-center gap-2 mt-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-semibold transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                Call {emergencyPhone}
              </a>
            )}
          </div>
        )}

        {/* Critical Notes / Allergies */}
        {(criticalNotes || profileAllergies) && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-amber-800 mb-2">Critical Notes / Allergies</h2>
            {criticalNotes && <p className="text-sm text-amber-900 leading-relaxed">{criticalNotes}</p>}
            {profileAllergies && !criticalNotes && (
              <p className="text-sm text-amber-900 leading-relaxed">{profileAllergies}</p>
            )}
          </div>
        )}

        {/* Existing Conditions */}
        {profile?.existing_conditions?.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow p-5">
            <h2 className="text-sm font-semibold text-slate-800 mb-2">Known Conditions</h2>
            <div className="flex flex-wrap gap-2">
              {profile.existing_conditions.map((c) => (
                <span key={c} className="px-2.5 py-1 bg-slate-100 text-slate-700 text-xs font-medium rounded-full">{c}</span>
              ))}
            </div>
          </div>
        )}

        {/* Current Medications */}
        {profile?.current_medications?.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow p-5">
            <h2 className="text-sm font-semibold text-slate-800 mb-2">Current Medications</h2>
            <div className="flex flex-wrap gap-2">
              {profile.current_medications.map((m) => (
                <span key={m} className="px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-full">{m}</span>
              ))}
            </div>
          </div>
        )}

        {/* Organ Donor */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow p-5 flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">Organ Donor</span>
          <span className={`px-3 py-1 rounded-full text-xs font-bold ${
            organDonor ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'
          }`}>
            {organDonor ? 'Yes' : 'No'}
          </span>
        </div>

        <div className="text-center text-xs text-slate-400 py-4">
          MedAssist AI — Emergency Medical ID
        </div>
      </motion.div>
    </div>
  );
}
