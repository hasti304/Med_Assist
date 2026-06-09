import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../services/api';

function StatusBadge({ status }) {
  const normalized = status === 'accepted' ? 'approved' : status === 'declined' ? 'rejected' : status;
  const styles = {
    pending: 'bg-amber-50 text-amber-700 border-amber-200',
    approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    rejected: 'bg-red-50 text-red-700 border-red-200',
  };
  return (
    <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-semibold border capitalize ${styles[normalized] || 'bg-slate-50 text-slate-600'}`}>
      {normalized}
    </span>
  );
}

export default function MyAppointments() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/patient/appointments')
      .then((res) => setAppointments(res.data.appointments || []))
      .catch(() => toast.error('Could not load appointments'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 font-display">My Appointments</h1>
          <p className="text-sm text-slate-500 mt-1">Track your appointment requests and doctor responses</p>
        </div>
        <Link
          to="/find-doctor"
          className="bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl"
        >
          Find a Doctor
        </Link>
      </div>

      {loading ? (
        <p className="text-center text-slate-500 py-12">Loading...</p>
      ) : appointments.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow p-8 text-center">
          <p className="text-slate-500">No appointments yet.</p>
          <Link to="/find-doctor" className="inline-block mt-4 text-teal-600 font-semibold text-sm hover:text-teal-700">
            Request your first appointment
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {appointments.map((a) => (
            <div key={a.id} className="bg-white rounded-2xl border border-slate-200 shadow p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-800">{a.doctor_name}</p>
                  <p className="text-sm text-teal-700">{a.specialization}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {[a.hospital_name, a.city].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <StatusBadge status={a.status} />
              </div>
              <p className="text-sm text-slate-600 mt-3">
                <span className="text-slate-400">Requested: </span>
                {new Date(a.requested_at).toLocaleString()}
              </p>
              {a.reason && (
                <p className="text-sm text-slate-600 mt-1">
                  <span className="text-slate-400">Your reason: </span>
                  {a.reason}
                </p>
              )}
              {a.response_reason && (
                <p className="text-sm mt-2 p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <span className="text-slate-400 font-medium">Doctor&apos;s response: </span>
                  {a.response_reason}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
