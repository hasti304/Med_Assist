import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const CITIES = [
  'All Cities',
  'New York',
  'Los Angeles',
  'Chicago',
  'Houston',
  'Phoenix',
  'Philadelphia',
  'San Antonio',
  'Dallas',
];

const SPECIALIZATIONS = [
  'All Specializations',
  'Cardiologist',
  'Dermatologist',
  'Neurologist',
  'Orthopedic',
  'General Physician',
  'Diabetologist',
  'Psychiatrist',
  'Pediatrician',
];

const SPEC_ICONS = {
  Cardiologist: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
    </svg>
  ),
  Dermatologist: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 0 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
    </svg>
  ),
  Neurologist: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
    </svg>
  ),
  Orthopedic: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998-5.059" />
    </svg>
  ),
  'General Physician': (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998-5.059" />
    </svg>
  ),
  Diabetologist: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3" />
    </svg>
  ),
  Psychiatrist: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 9.563C9 8.252 10.008 7.5 12 7.5s3 .752 3 1.563c0 .794-.703 1.438-1.5 1.438h-3c-.797 0-1.5-.644-1.5-1.438Z" />
    </svg>
  ),
  Pediatrician: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
    </svg>
  ),
};

function SpecIcon({ specialization }) {
  const icon = SPEC_ICONS[specialization] || SPEC_ICONS['General Physician'];
  return (
    <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-teal-50 text-teal-600 shrink-0">
      {icon}
    </span>
  );
}

function SkeletonCard() {
  return (
    <div className="animate-pulse bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
      <div className="flex gap-3">
        <div className="w-10 h-10 bg-slate-200 rounded-xl" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-slate-200 rounded w-2/3" />
          <div className="h-3 bg-slate-200 rounded w-1/2" />
        </div>
      </div>
      <div className="h-3 bg-slate-200 rounded w-3/4" />
      <div className="h-3 bg-slate-200 rounded w-1/3" />
    </div>
  );
}

export default function NearbyClinics() {
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [city, setCity] = useState('All Cities');
  const [specialization, setSpecialization] = useState('All Specializations');
  const [availableOnly, setAvailableOnly] = useState(false);

  const fetchDoctors = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (city !== 'All Cities') params.set('city', city);
      if (specialization !== 'All Specializations') params.set('specialization', specialization);
      if (availableOnly) params.set('available', 'true');
      const qs = params.toString();
      const { data } = await axios.get(`${API_BASE}/doctors${qs ? `?${qs}` : ''}`);
      setDoctors(data.doctors || []);
    } catch {
      toast.error('Could not load doctors');
      setDoctors([]);
    } finally {
      setLoading(false);
    }
  }, [city, specialization, availableOnly]);

  useEffect(() => {
    fetchDoctors();
  }, [fetchDoctors]);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="bg-gradient-to-br from-teal-700 via-teal-600 to-emerald-600 rounded-2xl shadow-lg p-6 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/3" />
        <h1 className="text-2xl font-bold font-display relative">Find a Doctor Near You</h1>
        <p className="text-teal-100 text-sm mt-1 relative">
          Browse doctors across major US cities — call directly to schedule a visit
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow p-5">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label htmlFor="city-filter" className="block text-sm font-medium text-slate-600 mb-1.5">City</label>
            <select
              id="city-filter"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400"
            >
              {CITIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="spec-filter" className="block text-sm font-medium text-slate-600 mb-1.5">Specialization</label>
            <select
              id="spec-filter"
              value={specialization}
              onChange={(e) => setSpecialization(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400"
            >
              {SPECIALIZATIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2.5 cursor-pointer py-2.5">
              <input
                type="checkbox"
                checked={availableOnly}
                onChange={(e) => setAvailableOnly(e.target.checked)}
                className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
              />
              <span className="text-sm font-medium text-slate-600">Available only</span>
            </label>
          </div>
        </div>
        {!loading && (
          <p className="text-xs text-slate-400 mt-3">
            {doctors.length} doctor{doctors.length !== 1 ? 's' : ''} found
          </p>
        )}
      </div>

      {loading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => <SkeletonCard key={i} />)}
        </div>
      ) : doctors.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow py-16 text-center">
          <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998-5.059" />
            </svg>
          </div>
          <p className="font-semibold text-slate-700">No doctors found</p>
          <p className="text-sm text-slate-500 mt-1">Try changing your city or specialization filters.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {doctors.map((doc) => (
            <article
              key={doc.id}
              className="bg-white rounded-2xl border border-slate-200 shadow p-5 hover:border-teal-200 hover:shadow-md transition-all"
            >
              <div className="flex items-start gap-3">
                <SpecIcon specialization={doc.specialization} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-slate-800 leading-tight">{doc.name}</h3>
                    <span className={`shrink-0 px-2 py-0.5 rounded-lg text-[11px] font-semibold ${
                      doc.available
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-slate-100 text-slate-500'
                    }`}>
                      {doc.available ? 'Available' : 'Unavailable'}
                    </span>
                  </div>
                  <p className="text-sm text-teal-700 font-medium mt-0.5">{doc.specialization}</p>
                </div>
              </div>

              <div className="mt-4 space-y-1.5 text-sm text-slate-600">
                <p className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Z" />
                  </svg>
                  {doc.hospital_name}
                </p>
                <p className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                  </svg>
                  {[doc.city, doc.state].filter(Boolean).join(', ')}
                </p>
                {doc.phone && (
                  <a
                    href={`tel:${doc.phone.replace(/\s/g, '')}`}
                    className="inline-flex items-center gap-2 text-teal-600 font-semibold hover:text-teal-700 hover:underline mt-1"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" />
                    </svg>
                    {doc.phone}
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
