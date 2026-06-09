import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { GoogleLogin } from '@react-oauth/google';
import { hasGoogleAuth } from '../../components/GoogleAuthWrapper';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import PasswordInput from '../../components/PasswordInput';

export default function Register() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'patient',
    specialization: '',
    hospitalName: '',
    city: '',
    state: '',
    phone: '',
  });
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  function redirectAfterLogin(user) {
    if (user.role === 'admin') return navigate('/admin/dashboard');
    if (user.role === 'doctor') return navigate('/doctor/dashboard');
    return navigate('/patient/dashboard');
  }

  const handleGoogleSuccess = async ({ credential }) => {
    try {
      const { data } = await api.post('/auth/google', { credential });
      if (data.requiresVerification) {
        if (data.devLink) console.log('[Dev] Verify link:', data.devLink);
        setRegisteredEmail(data.email);
        setRegistered(true);
        return;
      }
      if (data.token) {
        login({ token: data.token, ...data.user });
        toast.success(`Welcome, ${data.user.name}!`);
        redirectAfterLogin(data.user);
      }
    } catch (err) {
      const status = err.response?.status || err.status;
      if (status === 409) {
        toast.error('This Google account already has an account. Please sign in.', { duration: 5000, icon: '👤' });
        setTimeout(() => navigate('/login'), 2500);
      } else {
        toast.error('Google sign-up failed. Please try again.');
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const payload = {
        fullName: form.fullName,
        email: form.email,
        password: form.password,
        role: form.role,
      };
      if (form.role === 'doctor') {
        payload.specialization = form.specialization;
        payload.hospitalName = form.hospitalName;
        payload.city = form.city;
        payload.state = form.state;
        payload.phone = form.phone;
      }
      const { data } = await api.post('/auth/register', payload);
      setRegisteredEmail(form.email);
      setRegistered(true);
      if (data.devLink) console.log('[Dev] Verify link:', data.devLink);
    } catch (err) {
      const status = err.response?.status || err.status;
      if (status === 409) {
        toast.error(`${form.email} already has an account. Redirecting to sign in…`, {
          duration: 5000,
          icon: '👤',
        });
        setTimeout(() => navigate('/login'), 2500);
      } else {
        toast.error(err.message || 'Registration failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (registered) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-teal-50/30 to-slate-100">
        <div className="bg-white/80 backdrop-blur-sm p-10 rounded-3xl shadow-card-hover w-full max-w-sm border border-white/60 text-center">
          <div className="w-16 h-16 bg-teal-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <svg className="w-8 h-8 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Verify your email</h2>
          <p className="text-sm text-slate-500 mb-2">
            We sent a verification link to
          </p>
          <p className="text-sm font-semibold text-slate-800 mb-4">{registeredEmail}</p>
          <p className="text-xs text-slate-400 mb-6">
            Click the link in the email to activate your account. The link expires in 24 hours.
          </p>
          <Link
            to="/login"
            className="inline-block w-full bg-gradient-to-r from-teal-600 to-teal-500 text-white font-semibold py-3 rounded-xl text-sm shadow-md hover:shadow-lg transition-all"
          >
            Go to Sign In
          </Link>
          <p className="text-xs text-slate-400 mt-4">Didn't receive it? Check your spam folder.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-teal-50/30 to-slate-100 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-96 h-96 bg-teal-200/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-teal-300/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

      <div className="relative bg-white/80 backdrop-blur-sm p-8 sm:p-10 rounded-3xl shadow-card-hover w-full max-w-md border border-white/60">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-gradient-to-br from-teal-500 to-teal-700 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-glow-teal">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.627 48.627 0 0 1 12 20.904a48.627 48.627 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold font-display text-gradient">MedAssist AI</h1>
          <p className="text-slate-400 mt-1 text-sm">Your AI-powered health assistant</p>
        </div>

        <h2 className="text-lg font-semibold text-slate-800 mb-6">Create your account</h2>


        {hasGoogleAuth && (
          <>
            <div className="mb-4">
              <div className="flex justify-center">
                <GoogleLogin
                  onSuccess={handleGoogleSuccess}
                  onError={() => toast.error('Google sign-up failed — add this site URL in Google Cloud Console')}
                  theme="outline"
                  size="large"
                  width="368"
                  text="signup_with"
                  shape="rectangular"
                />
              </div>
            </div>
            <div className="relative flex items-center gap-3 mb-5">
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-xs text-slate-400 font-medium">or sign up with email</span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>
          </>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" aria-label="Create account form">
          <div>
            <span className="block text-sm font-medium text-slate-600 mb-2">I am a</span>
            <div className="grid grid-cols-2 gap-2">
              {['patient', 'doctor'].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setForm({ ...form, role: r })}
                  className={`py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                    form.role === r
                      ? 'bg-teal-600 text-white border-teal-600'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-teal-300'
                  }`}
                >
                  {r === 'patient' ? 'Patient' : 'Doctor'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="fullName" className="block text-sm font-medium text-slate-600 mb-1.5">Full Name</label>
            <input
              id="fullName"
              type="text"
              name="fullName"
              value={form.fullName}
              onChange={handleChange}
              required
              autoComplete="name"
              placeholder="John Doe"
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400 transition-all"
            />
          </div>

          <div>
            <label htmlFor="regEmail" className="block text-sm font-medium text-slate-600 mb-1.5">Email</label>
            <input
              id="regEmail"
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              required
              autoComplete="email"
              placeholder="you@example.com"
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400 transition-all"
            />
          </div>

          <div>
            <label htmlFor="regPassword" className="block text-sm font-medium text-slate-600 mb-1.5">Password</label>
            <PasswordInput
              id="regPassword"
              name="password"
              value={form.password}
              onChange={handleChange}
              placeholder="Min. 6 characters"
              autoComplete="new-password"
              minLength={6}
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-600 mb-1.5">Confirm Password</label>
            <PasswordInput
              id="confirmPassword"
              name="confirmPassword"
              value={form.confirmPassword}
              onChange={handleChange}
              placeholder="Re-enter password"
              autoComplete="new-password"
            />
          </div>

          {form.role === 'doctor' && (
            <div className="space-y-4 pt-2 border-t border-slate-100">
              <p className="text-sm font-medium text-slate-700">Practice details</p>
              <div>
                <label htmlFor="specialization" className="block text-sm font-medium text-slate-600 mb-1.5">Specialization</label>
                <input id="specialization" name="specialization" value={form.specialization} onChange={handleChange} required className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400" placeholder="Cardiology" />
              </div>
              <div>
                <label htmlFor="hospitalName" className="block text-sm font-medium text-slate-600 mb-1.5">Hospital / Clinic</label>
                <input id="hospitalName" name="hospitalName" value={form.hospitalName} onChange={handleChange} required className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="city" className="block text-sm font-medium text-slate-600 mb-1.5">City</label>
                  <input id="city" name="city" value={form.city} onChange={handleChange} required className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400" />
                </div>
                <div>
                  <label htmlFor="state" className="block text-sm font-medium text-slate-600 mb-1.5">State</label>
                  <input id="state" name="state" value={form.state} onChange={handleChange} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400" />
                </div>
              </div>
              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-slate-600 mb-1.5">Phone</label>
                <input id="phone" name="phone" type="tel" value={form.phone} onChange={handleChange} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400" />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            aria-busy={loading}
            className="w-full bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-700 hover:to-teal-600 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-all shadow-md hover:shadow-lg"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                Creating account...
              </span>
            ) : 'Create Account'}
          </button>
        </form>

        <p className="text-center text-sm text-slate-500 mt-6">
          Already have an account?{' '}
          <Link to="/login" className="text-teal-600 hover:text-teal-700 font-semibold">
            Sign in
          </Link>
        </p>

        <div className="mt-6 p-3 bg-amber-50/80 border border-amber-200/60 rounded-xl text-xs text-amber-700 text-center">
          Educational project only — not a substitute for medical advice.
        </div>
      </div>
    </div>
  );
}
