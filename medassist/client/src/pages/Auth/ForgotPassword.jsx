import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../services/api';

const fadeIn = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5 } } };

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [resetLink, setResetLink] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post('/auth/forgot-password', { email });
      // In dev mode (no SMTP), the server returns the reset link directly
      if (data.resetLink) {
        setResetLink(data.resetLink);
      }
    } catch {
      // Silently ignore — don't leak whether email exists
    } finally {
      setLoading(false);
      setSent(true);
      toast.success('If that email is registered, you will receive a reset link.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-teal-50">
      <motion.div
        variants={fadeIn}
        initial="hidden"
        animate="visible"
        className="bg-white p-8 rounded-2xl shadow-lg w-full max-w-md border border-slate-200"
      >
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-teal-600">MedAssist AI</h1>
          <p className="text-slate-400 mt-1 text-sm">Password Recovery</p>
        </div>

        {sent ? (
          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-teal-50 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-8 h-8 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-slate-800">Check your email</h2>
            <p className="text-sm text-slate-500">
              If an account exists for <span className="font-medium text-slate-700">{email}</span>,
              we sent a password reset link. It may take a few minutes to arrive.
            </p>
            {resetLink && (
              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-left">
                <p className="text-xs font-semibold text-amber-700 mb-1">Dev Mode — No SMTP configured</p>
                <p className="text-xs text-amber-600 mb-2">Click the link below to reset your password:</p>
                <a
                  href={resetLink}
                  className="text-sm text-teal-600 font-medium hover:underline break-all"
                >
                  {resetLink}
                </a>
              </div>
            )}
            <Link
              to="/login"
              className="inline-block mt-4 text-teal-600 hover:text-teal-700 font-medium text-sm hover:underline"
            >
              Back to Sign In
            </Link>
          </div>
        ) : (
          <>
            <h2 className="text-xl font-semibold text-slate-800 mb-2">Forgot your password?</h2>
            <p className="text-sm text-slate-500 mb-6">
              Enter your email address and we will send you a link to reset your password.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-shadow"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl transition-colors"
              >
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>
            </form>

            <p className="text-center text-sm text-slate-500 mt-6">
              Remember your password?{' '}
              <Link to="/login" className="text-teal-600 hover:underline font-medium">
                Sign In
              </Link>
            </p>
          </>
        )}
      </motion.div>
    </div>
  );
}
