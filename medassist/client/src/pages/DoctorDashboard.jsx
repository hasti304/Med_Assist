import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const DEMO_DOCTOR_EMAILS = ['demo.doctor1@medassist.com', 'demo.doctor2@medassist.com'];

const TABS = [
  { id: 'appointments', label: 'Appointments', icon: '📅' },
  { id: 'patients', label: 'Patients', icon: '👥' },
  { id: 'profile', label: 'Profile', icon: '⚙️' },
  { id: 'shared', label: 'Shared reports', icon: '🔗' },
];

function StatusBadge({ status }) {
  const styles = {
    pending: 'bg-amber-50 text-amber-700',
    approved: 'bg-emerald-50 text-emerald-700',
    rejected: 'bg-red-50 text-red-700',
    accepted: 'bg-emerald-50 text-emerald-700',
    declined: 'bg-red-50 text-red-700',
  };
  const label = status === 'accepted' ? 'approved' : status === 'declined' ? 'rejected' : status;
  return (
    <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-semibold capitalize ${styles[status] || 'bg-slate-100 text-slate-600'}`}>
      {label}
    </span>
  );
}

function TabBadge({ count, urgent }) {
  if (!count) return null;
  return (
    <span className={`ml-1.5 inline-flex min-w-[1.25rem] justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ${urgent ? 'bg-amber-500 text-white' : 'bg-teal-100 text-teal-800'}`}>
      {count}
    </span>
  );
}

export default function DoctorDashboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('appointments');
  const [patients, setPatients] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [profile, setProfile] = useState(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadErrors, setLoadErrors] = useState([]);
  const [actionId, setActionId] = useState(null);
  const [rejectReason, setRejectReason] = useState({});
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [patientReports, setPatientReports] = useState([]);
  const [noteText, setNoteText] = useState('');
  const [patientNotes, setPatientNotes] = useState([]);
  const [sharedReports, setSharedReports] = useState([]);

  const isDemoDoctor = DEMO_DOCTOR_EMAILS.includes((user?.email || '').toLowerCase());

  const loadAll = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    const errors = [];

    try {
      const { data } = await api.get('/doctor/patients');
      setPatients(data.patients || []);
    } catch (err) {
      errors.push('patients');
      if (!silent) console.error('doctor/patients', err);
    }

    try {
      const { data } = await api.get('/doctor/appointments');
      setAppointments(data.appointments || []);
    } catch (err) {
      errors.push('appointments');
      if (!silent) console.error('doctor/appointments', err);
    }

    try {
      const { data } = await api.get('/doctor/profile');
      const prof = data.profile;
      setProfile(prof);
      setProfileForm({
        specialization: prof.specialization || '',
        hospitalName: prof.hospital_name || '',
        city: prof.city || '',
        state: prof.state || '',
        phone: prof.phone || '',
        available: prof.available !== false,
      });
    } catch (err) {
      errors.push('profile');
      if (!silent) console.error('doctor/profile', err);
    }

    try {
      const { data } = await api.get('/doctor/shared-reports');
      setSharedReports(data.shares || []);
    } catch {
      setSharedReports([]);
    }

    setLoadErrors(errors);
    if (errors.length) {
      toast.error(`Could not load: ${errors.join(', ')}. Sign out and log in again as a doctor.`);
    }

    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { loadAll(); }, []);

  const pendingAppointments = appointments.filter((a) => a.status === 'pending');
  const handledAppointments = appointments.filter((a) => a.status !== 'pending');

  useEffect(() => {
    if (pendingAppointments.length > 0) setActiveTab('appointments');
  }, [pendingAppointments.length]);

  const handleAppointmentAction = async (id, status) => {
    const appt = appointments.find((a) => a.id === id);
    if (!appt || appt.status !== 'pending') {
      toast.error('This request was already handled. Click Refresh if the list looks out of date.');
      await loadAll(true);
      return;
    }

    setActionId(id);
    const normalized = status === 'approved' ? 'approved' : 'rejected';
    setAppointments((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: normalized } : a))
    );

    try {
      await api.put(`/doctor/appointments/${id}`, {
        status,
        reason: status === 'rejected' ? (rejectReason[id] || '') : undefined,
      });
      toast.success(status === 'approved' ? 'Approved — check the Patients tab' : 'Appointment rejected');
      await loadAll(true);
      if (status === 'approved') setActiveTab('patients');
    } catch (err) {
      setAppointments((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status: 'pending' } : a))
      );
      const msg = err.message || '';
      if (msg.includes('Only pending') || msg.includes('already')) {
        toast.error('Already approved or rejected — refreshing list.');
        await loadAll(true);
      } else {
        toast.error(msg || 'Failed to update appointment');
      }
    } finally {
      setActionId(null);
    }
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.put('/doctor/profile', profileForm);
      setProfile(data.profile);
      setEditingProfile(false);
      toast.success('Profile updated');
    } catch (err) {
      toast.error(err.message || 'Failed to update profile');
    }
  };

  const openPatient = async (patient) => {
    setSelectedPatient(patient);
    setNoteText('');
    setActiveTab('patients');
    try {
      const [repRes, notesRes] = await Promise.all([
        api.get(`/doctor/patients/${patient.id}/reports`),
        api.get(`/doctor/patients/${patient.id}/notes`),
      ]);
      setPatientReports(repRes.data.reports || []);
      setPatientNotes(notesRes.data.notes || []);
    } catch {
      toast.error('Could not load patient details');
    }
  };

  const saveNote = async () => {
    if (!noteText.trim() || !selectedPatient) return;
    try {
      await api.post(`/doctor/patients/${selectedPatient.id}/notes`, { note: noteText });
      toast.success('Note saved');
      setNoteText('');
      const { data } = await api.get(`/doctor/patients/${selectedPatient.id}/notes`);
      setPatientNotes(data.notes || []);
    } catch (err) {
      toast.error(err.message || 'Failed to save note');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <svg className="animate-spin h-8 w-8 text-teal-600" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  const viewPatientFromAppointment = async (appt) => {
    const match = patients.find((p) => p.id === appt.patient_id);
    if (match) {
      openPatient(match);
      return;
    }
    await loadAll(true);
    const { data } = await api.get('/doctor/patients');
    const list = data.patients || [];
    setPatients(list);
    const found = list.find((p) => p.id === appt.patient_id);
    if (found) openPatient(found);
    else toast.error('Patient not linked yet — try Refresh');
  };

  const renderAppointmentCard = (appt, showActions) => (
    <div key={appt.id} className="border border-slate-200 rounded-xl p-4 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-800">{appt.patient_name}</p>
          {appt.listed_doctor_name && (
            <p className="text-xs text-teal-700 font-medium mt-0.5">
              Booked with {appt.listed_doctor_name}
              {appt.listed_specialization ? ` · ${appt.listed_specialization}` : ''}
            </p>
          )}
          <p className="text-sm text-slate-500 mt-0.5">{new Date(appt.requested_at).toLocaleString()}</p>
          {appt.reason && <p className="text-sm text-slate-600 mt-2">{appt.reason}</p>}
        </div>
        <StatusBadge status={appt.status} />
      </div>
      {showActions && appt.status === 'pending' && (
        <>
          <input
            type="text"
            placeholder="Rejection reason (optional)"
            value={rejectReason[appt.id] || ''}
            onChange={(e) => setRejectReason({ ...rejectReason, [appt.id]: e.target.value })}
            className="mt-3 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
          />
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              disabled={actionId === appt.id}
              onClick={() => handleAppointmentAction(appt.id, 'approved')}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
            >
              {actionId === appt.id ? 'Saving…' : 'Approve'}
            </button>
            <button
              type="button"
              disabled={actionId === appt.id}
              onClick={() => handleAppointmentAction(appt.id, 'rejected')}
              className="bg-red-50 text-red-700 border border-red-200 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-red-100 disabled:opacity-50"
            >
              Reject
            </button>
          </div>
        </>
      )}
      {!showActions && appt.status === 'approved' && (
        <button
          type="button"
          onClick={() => viewPatientFromAppointment(appt)}
          className="mt-3 text-sm font-semibold text-teal-600 hover:text-teal-700"
        >
          View patient record →
        </button>
      )}
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="bg-gradient-to-br from-teal-700 via-teal-600 to-emerald-600 rounded-2xl shadow-lg p-6 text-white">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold font-display">Doctor Dashboard</h1>
            <p className="text-teal-100 text-sm mt-1">Signed in as {profile?.full_name || user?.name} ({user?.email})</p>
          </div>
          <button
            type="button"
            onClick={() => loadAll(true)}
            disabled={refreshing}
            className="text-sm font-semibold bg-white/15 hover:bg-white/25 px-4 py-2 rounded-lg disabled:opacity-50"
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {!isDemoDoctor && pendingAppointments.length === 0 && patients.length === 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>Using your own doctor account?</strong> Find-a-Doctor bookings go to the demo portal accounts.
          Sign in as <span className="font-mono">demo.doctor1@medassist.com</span> (password <span className="font-mono">DemoDoc2024</span>) to approve map bookings.
        </div>
      )}

      {pendingAppointments.length > 0 && (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 space-y-3">
          <p className="text-sm font-semibold text-amber-900">
            Action needed: {pendingAppointments.length} pending appointment{pendingAppointments.length > 1 ? 's' : ''}
          </p>
          {pendingAppointments.map((appt) => renderAppointmentCard(appt, true))}
        </div>
      )}

      {loadErrors.length > 0 && (
        <p className="text-sm text-red-600">Some data failed to load ({loadErrors.join(', ')}). Use Refresh or sign in again.</p>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow overflow-hidden">
        <div className="flex flex-wrap gap-1 p-2 border-b border-slate-100 bg-slate-50/80">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
                activeTab === tab.id
                  ? 'bg-white text-teal-700 shadow-sm ring-1 ring-slate-200'
                  : 'text-slate-600 hover:bg-white/60'
              }`}
            >
              <span className="mr-1.5">{tab.icon}</span>
              {tab.label}
              {tab.id === 'appointments' && <TabBadge count={pendingAppointments.length} urgent />}
              {tab.id === 'patients' && <TabBadge count={patients.length} />}
              {tab.id === 'shared' && <TabBadge count={sharedReports.length} />}
            </button>
          ))}
        </div>

        <div className="p-6 min-h-[280px]">
          {activeTab === 'appointments' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-800 mb-3">Pending ({pendingAppointments.length})</h2>
                {pendingAppointments.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    No pending requests. Book as a <strong>patient</strong> via Find a Doctor, then refresh here (use demo doctor login to receive directory bookings).
                  </p>
                ) : (
                  <div className="space-y-4">
                    {pendingAppointments.map((appt) => renderAppointmentCard(appt, true))}
                  </div>
                )}
              </div>
              {handledAppointments.length > 0 && (
                <div>
                  <h2 className="text-lg font-semibold text-slate-800 mb-3">Recent ({handledAppointments.length})</h2>
                  <div className="space-y-3">
                    {handledAppointments.map((appt) => renderAppointmentCard(appt, false))}
                  </div>
                </div>
              )}
              <p className="text-xs text-slate-400 border-t border-slate-100 pt-4">
                Email notifications require SMTP or Gmail OAuth in server .env — approvals still work without email.
              </p>
            </div>
          )}

          {activeTab === 'patients' && (
            <div>
              <h2 className="text-lg font-semibold text-slate-800 mb-4">Assigned patients ({patients.length})</h2>
              {patients.length > 0 && !selectedPatient && (
                <p className="text-sm text-teal-700 font-medium mb-3">
                  Click a patient below to view blood reports and add clinical notes.
                </p>
              )}
              {patients.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Approve a pending appointment first — the patient will appear here with reports and notes.
                </p>
              ) : (
                <div className="space-y-3">
                  {patients.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => openPatient(p)}
                      className={`w-full text-left border rounded-xl p-4 transition-all hover:border-teal-200 hover:shadow-sm ${
                        selectedPatient?.id === p.id ? 'border-teal-400 bg-teal-50/30' : 'border-slate-100'
                      }`}
                    >
                      <div className="flex justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-800">{p.fullName}</p>
                          <p className="text-xs text-slate-500">{p.email}</p>
                        </div>
                        {p.latestReport && (
                          <div className="text-right text-xs text-slate-500">
                            <p>Latest: {new Date(p.latestReport.createdAt).toLocaleDateString()}</p>
                            {p.latestReport.abnormalCount > 0 && (
                              <p className="text-red-500">{p.latestReport.abnormalCount} abnormal</p>
                            )}
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {selectedPatient && (
                <div className="mt-6 border-t border-slate-100 pt-6">
                  <h3 className="font-semibold text-slate-800 mb-3">{selectedPatient.fullName}</h3>
                  <div className="grid lg:grid-cols-2 gap-6">
                    <div>
                      <h4 className="text-sm font-medium text-slate-600 mb-2">Blood reports</h4>
                      {patientReports.length === 0 ? (
                        <p className="text-sm text-slate-500">No reports uploaded.</p>
                      ) : (
                        <ul className="space-y-2 max-h-64 overflow-y-auto">
                          {patientReports.map((r) => (
                            <li key={r.id} className="text-sm border border-slate-100 rounded-lg p-3">
                              <p className="font-medium">{new Date(r.created_at).toLocaleString()}</p>
                              <p className="text-slate-600 mt-1 line-clamp-3">
                                {r.analysis?.summary?.overall_assessment || 'Analysis pending'}
                              </p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-slate-600 mb-2">Clinical notes</h4>
                      <textarea
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        rows={3}
                        placeholder="Write a clinical note…"
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
                      />
                      <button
                        type="button"
                        onClick={saveNote}
                        className="mt-2 bg-teal-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-teal-700"
                      >
                        Save note
                      </button>
                      <ul className="mt-3 space-y-2 max-h-40 overflow-y-auto">
                        {patientNotes.map((n) => (
                          <li key={n.id} className="text-sm bg-slate-50 rounded-lg p-2">
                            <p>{n.note}</p>
                            <p className="text-xs text-slate-400 mt-1">{new Date(n.created_at).toLocaleString()}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'profile' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-800">Practice profile</h2>
                <button
                  type="button"
                  onClick={() => setEditingProfile((v) => !v)}
                  className="text-sm text-teal-600 font-semibold hover:text-teal-700"
                >
                  {editingProfile ? 'Cancel' : 'Edit'}
                </button>
              </div>
              {editingProfile ? (
                <form onSubmit={saveProfile} className="grid sm:grid-cols-2 gap-4">
                  {[
                    ['specialization', 'Specialization'],
                    ['hospitalName', 'Hospital'],
                    ['city', 'City'],
                    ['state', 'State'],
                    ['phone', 'Phone'],
                  ].map(([key, label]) => (
                    <div key={key}>
                      <label className="block text-sm font-medium text-slate-600 mb-1">{label}</label>
                      <input
                        value={profileForm[key] ?? ''}
                        onChange={(e) => setProfileForm({ ...profileForm, [key]: e.target.value })}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
                      />
                    </div>
                  ))}
                  <div className="flex items-center gap-2 sm:col-span-2">
                    <input
                      id="available"
                      type="checkbox"
                      checked={profileForm.available}
                      onChange={(e) => setProfileForm({ ...profileForm, available: e.target.checked })}
                      className="rounded border-slate-300 text-teal-600"
                    />
                    <label htmlFor="available" className="text-sm text-slate-600">Accepting new appointments</label>
                  </div>
                  <button type="submit" className="sm:col-span-2 bg-teal-600 text-white font-semibold py-2.5 rounded-xl text-sm hover:bg-teal-700">
                    Save profile
                  </button>
                </form>
              ) : (
                <dl className="grid sm:grid-cols-2 gap-3 text-sm">
                  <div><dt className="text-slate-400">Name</dt><dd className="font-medium">{profile?.full_name}</dd></div>
                  <div><dt className="text-slate-400">Specialization</dt><dd className="font-medium">{profile?.specialization || '—'}</dd></div>
                  <div><dt className="text-slate-400">Hospital</dt><dd className="font-medium">{profile?.hospital_name || '—'}</dd></div>
                  <div><dt className="text-slate-400">Location</dt><dd className="font-medium">{[profile?.city, profile?.state].filter(Boolean).join(', ') || '—'}</dd></div>
                  <div><dt className="text-slate-400">Phone</dt><dd className="font-medium">{profile?.phone || '—'}</dd></div>
                  <div><dt className="text-slate-400">Availability</dt><dd className="font-medium">{profile?.available ? 'Available' : 'Unavailable'}</dd></div>
                </dl>
              )}
            </div>
          )}

          {activeTab === 'shared' && (
            <div>
              <h2 className="text-lg font-semibold text-slate-800 mb-1">Shared report inbox</h2>
              <p className="text-xs text-slate-500 mb-4">Read-only links from patients.</p>
              {sharedReports.length === 0 ? (
                <p className="text-sm text-slate-500">No shared reports yet.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {sharedReports.map((s) => (
                    <li key={s.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{s.patient_name || 'Patient'}</p>
                        <p className="text-xs text-slate-500">{s.label || 'Shared report'} · {s.access_count || 0} view(s)</p>
                      </div>
                      <a
                        href={`${window.location.origin}/shared/${s.token}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-semibold text-teal-600 hover:text-teal-700"
                      >
                        Open link
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
