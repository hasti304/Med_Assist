import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { GoogleLogin } from '@react-oauth/google';
import { hasGoogleAuth } from '../../components/GoogleAuthWrapper';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { useLang } from '../../context/LanguageContext';
import api from '../../services/api';
import PasswordInput from '../../components/PasswordInput';
import healthcareIcon from '../../assets/healthcare_icon.png';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { lang, toggleLang } = useLang();
  const [searchParams] = useSearchParams();
  const returnUrl = searchParams.get('returnUrl');
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState(null);
  const [resending, setResending] = useState(false);

  const [googleVerifyEmail, setGoogleVerifyEmail] = useState(null);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  function redirectAfterLogin(user) {
    if (returnUrl) return navigate(returnUrl);
    if (user.role === 'admin') return navigate('/admin/dashboard');
    if (user.role === 'doctor') return navigate('/doctor/dashboard');
    return navigate('/patient/dashboard');
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setUnverifiedEmail(null);
    try {
      const { data } = await api.post('/auth/login', form);
      login({ token: data.token, ...data.user });
      toast.success(`Welcome back, ${data.user.name}!`);
      redirectAfterLogin(data.user);
    } catch (err) {
      const status = err.response?.status || err.status;
      if (status === 404) {
        toast.error(`No account found for ${form.email}. Please register first.`, {
          duration: 5000, icon: '👤',
        });
        setTimeout(() => navigate('/register'), 2500);
      } else if (status === 403) {
        setUnverifiedEmail(form.email);
      } else {
        toast.error(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      await api.post('/auth/resend-verification', { email: unverifiedEmail });
      toast.success('Verification email resent! Check your inbox.');
    } catch {
      toast.error('Failed to resend. Try again.');
    } finally {
      setResending(false);
    }
  };

  const handleGoogleSuccess = async ({ credential }) => {
    try {
      const { data } = await api.post('/auth/google', { credential });
      if (data.needsRole) {
        // Email not in DB — this is Sign In page, so redirect to Register
        toast.error(`No account found for ${data.profile?.email}. Please register first.`, {
          duration: 5000, icon: '👤',
        });
        setTimeout(() => navigate('/register'), 2500);
        return;
      }
      if (data.requiresVerification) {
        if (data.devLink) console.log('[Dev] Verify link:', data.devLink);
        setGoogleVerifyEmail(data.email);
        return;
      }
      login({ token: data.token, ...data.user });
      toast.success(`Welcome back, ${data.user.name}!`);
      redirectAfterLogin(data.user);
    } catch {
      toast.error('Google sign-in failed. Please try again.');
    }
  };


  if (googleVerifyEmail) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-teal-50/30 to-slate-100">
        <div className="bg-white/80 backdrop-blur-sm p-10 rounded-3xl shadow-card-hover w-full max-w-sm border border-white/60 text-center">
          <div className="w-16 h-16 bg-teal-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <svg className="w-8 h-8 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Verify your email</h2>
          <p className="text-sm text-slate-500 mb-2">We sent a verification link to</p>
          <p className="text-sm font-semibold text-slate-800 mb-4">{googleVerifyEmail}</p>
          <p className="text-xs text-slate-400 mb-6">Click the link in the email to activate your account. Link expires in 24 hours.</p>
          <button
            onClick={() => setGoogleVerifyEmail(null)}
            className="w-full bg-gradient-to-r from-teal-600 to-teal-500 text-white font-semibold py-3 rounded-xl text-sm shadow-md hover:shadow-lg transition-all"
          >
            Back to Sign In
          </button>
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
        {/* Language toggle */}
        <div className="absolute top-4 right-4">
          <button
            onClick={toggleLang}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-600 transition-colors"
          >
            <span>{lang === 'en' ? '🇺🇸' : '🇪🇸'}</span>
            <span>{lang === 'en' ? 'EN' : 'ES'}</span>
          </button>
        </div>
        {/* Header */}
        <div className="text-center mb-8">
          <img src={healthcareIcon} alt="MedAssist" className="w-16 h-16 object-contain mx-auto mb-4 rounded-2xl drop-shadow-md" />
          <h1 className="text-2xl font-bold font-display text-gradient">MedAssist AI</h1>
          <p className="text-slate-400 mt-1 text-sm">Your AI-powered health assistant</p>
        </div>

        <h2 className="text-lg font-semibold text-slate-800 mb-5">{t('auth.welcomeBack')}</h2>

        {hasGoogleAuth && (
          <>
            <div className="mb-5 flex justify-center">
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() => toast.error('Google sign-in failed — add this site URL in Google Cloud Console')}
                theme="outline"
                size="large"
                width="368"
                text="continue_with"
                shape="rectangular"
              />
            </div>
            <div className="relative flex items-center gap-3 mb-5">
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-xs text-slate-400 font-medium">{t('auth.orContinueWith')}</span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>
          </>
        )}

        {/* Unverified email banner */}
        {unverifiedEmail && (
          <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <p className="text-sm font-semibold text-amber-800 mb-1">Email not verified</p>
            <p className="text-xs text-amber-700 mb-3">
              Please check your inbox and click the verification link we sent to <strong>{unverifiedEmail}</strong>.
            </p>
            <button
              onClick={handleResend}
              disabled={resending}
              className="text-xs font-semibold text-teal-700 hover:text-teal-800 underline underline-offset-2 disabled:opacity-60"
            >
              {resending ? 'Sending…' : 'Resend verification email'}
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" aria-label="Sign in form">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-600 mb-1.5">{t('auth.email')}</label>
            <input
              id="email"
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
            <label htmlFor="password" className="block text-sm font-medium text-slate-600 mb-1.5">{t('auth.password')}</label>
            <PasswordInput
              id="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              placeholder="Enter your password"
              autoComplete="current-password"
            />
          </div>

          <div className="flex justify-end">
            <Link to="/forgot-password" className="text-sm text-teal-600 hover:text-teal-700 font-medium">
              {t('auth.forgotPassword')}
            </Link>
          </div>

          <button
            type="submit"
            disabled={loading}
            aria-busy={loading}
            className="w-full bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-700 hover:to-teal-600 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-all shadow-md hover:shadow-lg"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                {t('common.loading')}
              </span>
            ) : t('auth.signIn')}
          </button>
        </form>

        <p className="text-center text-sm text-slate-500 mt-6">
          {t('auth.noAccount')}{' '}
          <Link to="/register" className="text-teal-600 hover:text-teal-700 font-semibold">{t('auth.register')}</Link>
        </p>

        <div className="mt-4 p-3 bg-violet-50 border border-violet-200 rounded-xl text-xs text-violet-900">
          <p className="font-semibold mb-1">Demo doctor logins (portfolio)</p>
          <p className="text-violet-800">demo.doctor1@medassist.com · demo.doctor2@medassist.com</p>
          <p className="text-violet-700 mt-0.5">Password: <strong>DemoDoc2024</strong></p>
        </div>

        <div className="mt-4 p-3 bg-amber-50/80 border border-amber-200/60 rounded-xl text-xs text-amber-700 text-center">
          Educational project only — not a substitute for medical advice.
        </div>
      </div>

    </div>
  );
}
