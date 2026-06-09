import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import GoogleAuthWrapper from './components/GoogleAuthWrapper';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import PrivateRoute from './components/PrivateRoute';
import Navbar from './components/Layout/Navbar';
import ErrorBoundary from './components/ErrorBoundary';
import SessionExpiryModal from './components/SessionExpiryModal';
import ConsentModal, { hasAcceptedConsent } from './components/ConsentModal';

// Auth pages
import Login from './pages/Auth/Login';
import Register from './pages/Auth/Register';
import ForgotPassword from './pages/Auth/ForgotPassword';
import ResetPassword from './pages/Auth/ResetPassword';
import EmailVerify from './pages/Auth/EmailVerify';

// Patient pages
import PatientDashboard from './pages/Patient/PatientDashboard';
import ReportHistory from './pages/Patient/ReportHistory';
import UploadReport from './pages/Patient/UploadReport';
import Analysis from './pages/Patient/Analysis';
import PatientProfile from './pages/Patient/Profile';
import Vitals from './pages/Patient/Vitals';
import NearbyClinics from './pages/Patient/NearbyClinics';
import SymptomWizard from './pages/Patient/SymptomWizard';
import DiagnosticResults from './pages/Patient/DiagnosticResults';
import RecommendedTests from './pages/Patient/RecommendedTests';
import FindDoctor from './pages/FindDoctor';
import MyAppointments from './pages/MyAppointments';

// Doctor pages
import DoctorDashboard from './pages/DoctorDashboard';

// Admin pages
import AdminDashboard from './pages/Admin/AdminDashboard';
import AuditLog from './pages/Admin/AuditLog';

// Public pages (no auth)
import SharedReport from './pages/Shared/SharedReport';
import PublicMedicalID from './pages/Shared/PublicMedicalID';

function Layout({ children }) {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-slate-50 flex">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-teal-600 focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:text-sm focus:font-semibold"
      >
        Skip to main content
      </a>
      <Navbar />
      <div className="flex-1 min-h-screen overflow-y-auto">
        {/* Mobile top bar spacer */}
        <div className="h-14 md:hidden" />
        <main id="main-content" className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>
    </div>
  );
}

function SmartRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'admin') return <Navigate to="/admin/dashboard" replace />;
  if (user.role === 'doctor') return <Navigate to="/doctor/dashboard" replace />;
  return <Navigate to="/patient/dashboard" replace />;
}

function P({ children }) {
  const { user } = useAuth();
  const [consentOk, setConsentOk] = useState(() => hasAcceptedConsent());
  const needsConsent = user?.role === 'patient' && !consentOk;
  return (
    <PrivateRoute role="patient">
      {needsConsent && <ConsentModal onAccept={() => setConsentOk(true)} />}
      <Layout>{children}</Layout>
    </PrivateRoute>
  );
}
function D({ children }) {
  return <PrivateRoute role="doctor"><Layout>{children}</Layout></PrivateRoute>;
}
function A({ children }) {
  return <PrivateRoute role="admin"><Layout>{children}</Layout></PrivateRoute>;
}

export default function App() {
  return (
    <AuthProvider>
    <LanguageProvider>
      <BrowserRouter>
        <Toaster position="top-right" toastOptions={{
          style: { borderRadius: '12px', fontSize: '14px' },
        }} />
        <SessionExpiryModal />
        <Routes>
          {/* Public — Auth (Google OAuth only on these routes) */}
          <Route path="/login" element={<GoogleAuthWrapper><Login /></GoogleAuthWrapper>} />
          <Route path="/register" element={<GoogleAuthWrapper><Register /></GoogleAuthWrapper>} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/auth/verify-email" element={<EmailVerify />} />

          {/* Public — Shared views */}
          <Route path="/shared/:token" element={<SharedReport />} />
          <Route path="/medical-id/:patientId" element={<PublicMedicalID />} />

          {/* Patient */}
          <Route path="/patient/dashboard" element={<P><PatientDashboard /></P>} />
          <Route path="/patient/new-assist" element={<P><SymptomWizard /></P>} />
          <Route path="/patient/results/:sessionId" element={<P><DiagnosticResults /></P>} />
          <Route path="/patient/tests/:sessionId" element={<P><RecommendedTests /></P>} />
          <Route path="/patient/history" element={<P><ReportHistory /></P>} />
          <Route path="/patient/vitals" element={<P><Vitals /></P>} />
          <Route path="/patient/clinics" element={<P><NearbyClinics /></P>} />
          <Route path="/patient/profile" element={<P><PatientProfile /></P>} />
          <Route path="/patient/upload-report" element={<P><UploadReport /></P>} />
          <Route path="/patient/upload-report/:sessionId" element={<P><UploadReport /></P>} />
          <Route path="/patient/analysis/:reportId" element={<P><Analysis /></P>} />
          <Route path="/patient/analysis" element={<P><Analysis /></P>} />
          <Route path="/find-doctor" element={<P><FindDoctor /></P>} />
          <Route path="/my-appointments" element={<P><MyAppointments /></P>} />

          {/* Doctor */}
          <Route path="/doctor/dashboard" element={<D><DoctorDashboard /></D>} />

          {/* Admin */}
          <Route path="/admin/dashboard" element={<A><AdminDashboard /></A>} />
          <Route path="/admin/audit-log" element={<A><AuditLog /></A>} />

          {/* Default */}
          <Route path="/" element={<SmartRedirect />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </LanguageProvider>
    </AuthProvider>
  );
}
