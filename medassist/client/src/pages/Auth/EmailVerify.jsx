import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';

export default function EmailVerify() {
  const [searchParams] = useSearchParams();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState('verifying'); // 'verifying' | 'success' | 'error'
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setStatus('error');
      setErrorMsg('No verification token found. Please use the link from your email.');
      return;
    }

    api.get(`/auth/verify-email?token=${token}`)
      .then(({ data }) => {
        login({ token: data.token, ...data.user });
        setStatus('success');
        setTimeout(() => {
          if (data.user.role === 'admin') navigate('/admin/dashboard');
          else if (data.user.role === 'doctor') navigate('/doctor/dashboard');
          else navigate('/patient/dashboard');
        }, 2000);
      })
      .catch((err) => {
        setStatus('error');
        setErrorMsg(err.response?.data?.error || 'Invalid or expired verification link.');
      });
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-teal-50/30 to-slate-100">
      <div className="bg-white/80 backdrop-blur-sm p-10 rounded-3xl shadow-card-hover w-full max-w-sm border border-white/60 text-center">

        {status === 'verifying' && (
          <>
            <div className="w-14 h-14 bg-teal-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="animate-spin w-7 h-7 text-teal-600" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            </div>
            <h2 className="text-lg font-bold text-slate-800 mb-1">Verifying your email…</h2>
            <p className="text-sm text-slate-500">Just a moment</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-14 h-14 bg-teal-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-slate-800 mb-1">Email verified!</h2>
            <p className="text-sm text-slate-500">Your account is now active. Taking you to your dashboard…</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-slate-800 mb-1">Link expired or invalid</h2>
            <p className="text-sm text-slate-500 mb-5">{errorMsg}</p>
            <Link
              to="/login"
              className="inline-block w-full bg-gradient-to-r from-teal-600 to-teal-500 text-white font-semibold py-3 rounded-xl text-sm shadow-md hover:shadow-lg transition-all"
            >
              Back to Sign In
            </Link>
            <p className="text-xs text-slate-400 mt-3">
              You can resend the verification email from the sign-in page.
            </p>
          </>
        )}

      </div>
    </div>
  );
}
