import { GoogleOAuthProvider } from '@react-oauth/google';

export const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
export const hasGoogleAuth = Boolean(googleClientId);

/** Only load Google Sign-In on auth pages — avoids GSI errors on doctor/patient dashboards. */
export default function GoogleAuthWrapper({ children }) {
  if (!hasGoogleAuth) return children;
  return <GoogleOAuthProvider clientId={googleClientId}>{children}</GoogleOAuthProvider>;
}
