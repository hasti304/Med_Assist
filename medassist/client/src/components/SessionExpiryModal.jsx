import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';

const overlayAnim = { hidden: { opacity: 0 }, visible: { opacity: 1 }, exit: { opacity: 0 } };
const modalAnim = {
  hidden: { opacity: 0, scale: 0.95, y: 20 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', damping: 25, stiffness: 300 } },
  exit: { opacity: 0, scale: 0.95, y: 20 },
};

export default function SessionExpiryModal() {
  const [visible, setVisible] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleExpired = useCallback(() => {
    if (!user) return;
    setVisible(true);
  }, [user]);

  useEffect(() => {
    // Listen for 401 responses globally
    const handler = () => handleExpired();
    window.addEventListener('medassist:session-expired', handler);
    return () => window.removeEventListener('medassist:session-expired', handler);
  }, [handleExpired]);

  // Also check JWT expiry proactively
  useEffect(() => {
    if (!user?.token) return;

    const checkExpiry = () => {
      try {
        const payload = JSON.parse(atob(user.token.split('.')[1]));
        const expiresAt = payload.exp * 1000;
        const now = Date.now();
        if (now >= expiresAt) {
          handleExpired();
        }
      } catch {
        // Malformed token
      }
    };

    checkExpiry();
    const interval = setInterval(checkExpiry, 30000); // check every 30s
    return () => clearInterval(interval);
  }, [user?.token, handleExpired]);

  const handleSignIn = () => {
    const returnUrl = location.pathname + location.search;
    logout();
    setVisible(false);
    navigate(`/login?returnUrl=${encodeURIComponent(returnUrl)}`);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          variants={overlayAnim}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
        >
          <motion.div
            variants={modalAnim}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center"
          >
            <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>

            <h2 className="text-lg font-bold text-slate-800 mb-2">Session Expired</h2>
            <p className="text-sm text-slate-500 mb-6">
              Your session has expired for security reasons. Please sign in again to continue.
            </p>

            <button
              onClick={handleSignIn}
              className="w-full bg-teal-600 hover:bg-teal-700 text-white font-semibold py-2.5 rounded-xl transition-colors"
            >
              Sign In Again
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
