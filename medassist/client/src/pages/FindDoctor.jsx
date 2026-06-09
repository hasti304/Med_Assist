import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../services/api';
import DoctorsMap from '../components/DoctorsMap';

export default function FindDoctor() {
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ city: '', specialization: '', availableOnly: false });
  const [modalDoctor, setModalDoctor] = useState(null);
  const [highlightId, setHighlightId] = useState(null);
  const [form, setForm] = useState({ requestedAt: '', reason: '' });
  const [submitting, setSubmitting] = useState(false);

  const loadDoctors = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.city) params.set('city', filters.city);
      if (filters.specialization) params.set('specialization', filters.specialization);
      if (filters.availableOnly) params.set('availableOnly', 'true');
      const { data } = await api.get(`/patient/doctors?${params}`);
      setDoctors(data.doctors || []);
    } catch {
      toast.error('Could not load doctors');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadDoctors(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openModal = (doctor) => {
    setModalDoctor(doctor);
    setHighlightId(doctor.id);
    setForm({ requestedAt: '', reason: '' });
  };

  const submitAppointment = async (e) => {
    e.preventDefault();
    if (!form.requestedAt) {
      toast.error('Please select date and time');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/patient/appointments', {
        doctorId: modalDoctor.id,
        requestedAt: new Date(form.requestedAt).toISOString(),
        reason: form.reason,
      });
      toast.success('Appointment request sent — doctor will be notified by email');
      setModalDoctor(null);
    } catch (err) {
      toast.error(err.message || 'Failed to request appointment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="bg-gradient-to-br from-teal-700 via-teal-600 to-emerald-600 rounded-2xl shadow-lg p-6 text-white">
        <h1 className="text-2xl font-bold font-display">Find a Doctor</h1>
        <p className="text-teal-100 text-sm mt-1">Search US doctors on the map and request an appointment</p>
        <p className="text-teal-200/90 text-xs mt-2">
          Directory doctors are for discovery. Pending requests appear on demo doctor accounts — log in as{' '}
          <strong>demo.doctor1@medassist.com</strong> or <strong>demo.doctor2@medassist.com</strong> (password: DemoDoc2024).
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow p-5">
        <div className="grid sm:grid-cols-3 gap-4">
          <input
            placeholder="City"
            value={filters.city}
            onChange={(e) => setFilters({ ...filters, city: e.target.value })}
            className="border border-slate-200 rounded-xl px-4 py-2.5 text-sm"
          />
          <input
            placeholder="Specialization"
            value={filters.specialization}
            onChange={(e) => setFilters({ ...filters, specialization: e.target.value })}
            className="border border-slate-200 rounded-xl px-4 py-2.5 text-sm"
          />
          <label className="flex items-center gap-2 text-sm text-slate-600 px-2">
            <input
              type="checkbox"
              checked={filters.availableOnly}
              onChange={(e) => setFilters({ ...filters, availableOnly: e.target.checked })}
              className="rounded text-teal-600"
            />
            Available only
          </label>
        </div>
        <button
          type="button"
          onClick={loadDoctors}
          className="mt-4 bg-teal-600 hover:bg-teal-700 text-white font-semibold px-5 py-2.5 rounded-xl text-sm"
        >
          Search
        </button>
      </div>

      {!loading && doctors.length > 0 && (
        <DoctorsMap doctors={doctors} onSelectDoctor={openModal} selectedId={highlightId} />
      )}

      {loading ? (
        <p className="text-center text-slate-500 py-12">Loading doctors...</p>
      ) : doctors.length === 0 ? (
        <p className="text-center text-slate-500 py-12">No doctors match your filters.</p>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {doctors.map((d) => (
            <div
              key={d.id}
              className={`bg-white rounded-2xl border shadow p-5 transition-colors ${
                highlightId === d.id ? 'border-teal-400 ring-2 ring-teal-100' : 'border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-slate-800">{d.full_name || d.name}</h3>
                {d.is_demo_account && (
                  <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">
                    Demo login
                  </span>
                )}
              </div>
              <p className="text-sm text-teal-700 font-medium mt-0.5">{d.specialization}</p>
              <p className="text-sm text-slate-500 mt-2">{d.hospital_name}</p>
              <p className="text-sm text-slate-500">{[d.city, d.state].filter(Boolean).join(', ')}</p>
              {d.phone && <p className="text-sm text-slate-500 mt-1">{d.phone}</p>}
              <button
                type="button"
                onClick={() => openModal(d)}
                className="mt-4 w-full bg-gradient-to-r from-teal-600 to-teal-500 text-white font-semibold py-2.5 rounded-xl text-sm hover:from-teal-700 hover:to-teal-600"
              >
                Request Appointment
              </button>
            </div>
          ))}
        </div>
      )}

      {modalDoctor && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-slate-800">Request appointment</h3>
            <p className="text-sm text-slate-500 mt-1">Dr. {modalDoctor.full_name}</p>
            <form onSubmit={submitAppointment} className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Date & time</label>
                <input
                  type="datetime-local"
                  required
                  value={form.requestedAt}
                  onChange={(e) => setForm({ ...form, requestedAt: e.target.value })}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Reason</label>
                <textarea
                  rows={3}
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  placeholder="Brief reason for visit..."
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setModalDoctor(null)}
                  className="flex-1 border border-slate-200 text-slate-600 font-semibold py-2.5 rounded-xl text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 bg-teal-600 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50"
                >
                  {submitting ? 'Sending...' : 'Submit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
