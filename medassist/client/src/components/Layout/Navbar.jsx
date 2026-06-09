import { useState, useEffect } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { useLang } from '../../context/LanguageContext';
import { useTheme } from '../../hooks/useTheme';
import healthcareIcon from '../../assets/healthcare_icon.png';

/* ─── SVG Icon Components (Heroicons outline 24x24) ─────────────────────── */
const Icons = {
  clipboard: (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z" />
    </svg>
  ),
  plusCircle: (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  ),
  heart: (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
    </svg>
  ),
  pill: (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m10.5 6 6.5 6.5m-7.5.5 2 2M4.5 19.5l6-6m-3-3 6-6a3.182 3.182 0 0 1 4.5 0v0a3.182 3.182 0 0 1 0 4.5l-6 6a3.182 3.182 0 0 1-4.5 0v0a3.182 3.182 0 0 1 0-4.5Z" />
    </svg>
  ),
  calendar: (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
    </svg>
  ),
  idCard: (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Zm6-10.125a1.875 1.875 0 1 1-3.75 0 1.875 1.875 0 0 1 3.75 0Zm1.294 6.336a6.721 6.721 0 0 1-3.17.789 6.721 6.721 0 0 1-3.168-.789 3.376 3.376 0 0 1 6.338 0Z" />
    </svg>
  ),
  calendarCheck: (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5m-9-6 2.25 2.25L15 12" />
    </svg>
  ),
  building: (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Z" />
    </svg>
  ),
  chartBar: (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
    </svg>
  ),
  beaker: (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0 1 12 15a9.065 9.065 0 0 0-6.23.693L5 14.5m14.8.8 1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0 1 12 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
    </svg>
  ),
  sparkles: (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.455L18 2.25l.259 1.036a3.375 3.375 0 0 0 2.456 2.455L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.455ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
    </svg>
  ),
  mapPin: (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
    </svg>
  ),
  document: (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
  ),
  documentText: (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
  ),
  shieldCheck: (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
    </svg>
  ),
  chartPie: (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 1 0 7.5 7.5h-7.5V6Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0 0 13.5 3v7.5Z" />
    </svg>
  ),
  shield: (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 2.25c-4.97 0-9.75 2.683-9.75 2.683S2.25 14.517 12 21.75c9.75-7.233 9.75-16.817 9.75-16.817S16.97 2.25 12 2.25Z" />
    </svg>
  ),
  scroll: (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 0 1-2.25 2.25M16.5 7.5V18a2.25 2.25 0 0 0 2.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 0 0 2.25 2.25h13.5" />
    </svg>
  ),
  sun: (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
    </svg>
  ),
  moon: (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
    </svg>
  ),
  chevronLeft: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
    </svg>
  ),
  chevronRight: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  ),
  bars: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
  ),
  xMark: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  ),
  logout: (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
    </svg>
  ),
};

/* ─── Nav link key definitions (labels resolved via t() in component) ──── */
const PATIENT_LINKS = [
  { to: '/patient/dashboard',      key: 'nav.dashboard',    icon: Icons.clipboard },
  { to: '/patient/new-assist',     key: 'nav.newAssist',    icon: Icons.sparkles },
  { to: '/patient/upload-report',  key: 'nav.uploadReport', icon: Icons.plusCircle },
  { to: '/patient/history',        key: 'nav.myReports',    icon: Icons.chartBar },
  { to: '/patient/vitals',         key: 'nav.vitals',       icon: Icons.heart },
  { to: '/find-doctor',            key: 'nav.findDoctor',   icon: Icons.building },
  { to: '/my-appointments',        key: 'nav.appointments', icon: Icons.calendarCheck },
  { to: '/patient/clinics',        key: 'nav.findLab',      icon: Icons.mapPin },
  { to: '/patient/profile',        key: 'nav.myProfile',    icon: Icons.idCard },
];

const DOCTOR_LINKS = [
  { to: '/doctor/dashboard', key: 'nav.dashboard', icon: Icons.clipboard },
];

const ADMIN_LINKS = [
  { to: '/admin/dashboard', key: 'nav.dashboard', icon: Icons.shield },
  { to: '/admin/audit-log', key: 'nav.auditLog',  icon: Icons.scroll },
];

const STORAGE_KEY = 'medassist_sidebar';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { dark, toggle: toggleTheme } = useTheme();
  const { t } = useTranslation();
  const { lang, toggleLang } = useLang();

  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === 'collapsed'; } catch { return false; }
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, collapsed ? 'collapsed' : 'expanded');
  }, [collapsed]);

  useEffect(() => { setMobileOpen(false); }, [navigate]);

  const handleLogout = () => { logout(); navigate('/login'); setMobileOpen(false); };

  if (!user) return null;

  const navLinks = user.role === 'admin'
    ? ADMIN_LINKS
    : user.role === 'doctor'
      ? DOCTOR_LINKS
      : PATIENT_LINKS;

  const initial = (user.name || user.email || '?').charAt(0).toUpperCase();

  const sidebarContent = (isMobile = false) => {
    const isExpanded = isMobile || !collapsed;
    return (
      <div className="flex flex-col h-full">

        {/* ── Logo ── */}
        <div className={`flex items-center h-16 shrink-0 px-4 ${isExpanded ? 'gap-3' : 'justify-center'}`}>
          <img src={healthcareIcon} alt="MedAssist" className="w-8 h-8 object-contain rounded-lg shrink-0" />
          {isExpanded && (
            <span className="text-[15px] font-semibold text-white tracking-tight whitespace-nowrap">
              MedAssist AI
            </span>
          )}
        </div>

        {/* ── Nav Links ── */}
        <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-0.5">
          {navLinks.map(link => (
            <NavLink
              key={link.to}
              to={link.to}
              onClick={() => isMobile && setMobileOpen(false)}
              title={!isExpanded ? t(link.key) : undefined}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg text-[13px] font-medium transition-all duration-150 group
                ${isExpanded ? 'px-3 py-2.5' : 'justify-center p-2.5'}
                ${isActive
                  ? 'bg-white/20 text-white'
                  : 'text-white/55 hover:bg-white/10 hover:text-white/90'
                }`
              }
            >
              <span className="shrink-0">{link.icon}</span>
              {isExpanded && <span className="leading-none">{t(link.key)}</span>}
            </NavLink>
          ))}
        </nav>

        {/* ── Bottom Section ── */}
        <div className="shrink-0 px-2.5 pb-4 pt-2 space-y-0.5 border-t border-white/10 mt-1">

          {/* Language toggle */}
          {isExpanded ? (
            <button
              onClick={toggleLang}
              className="flex items-center justify-between w-full px-3 py-2 rounded-lg hover:bg-white/10 transition-all duration-150 group"
              title={lang === 'en' ? 'Cambiar a Español' : 'Switch to English'}
            >
              <div className="flex items-center gap-2.5">
                <span className="shrink-0 text-white/55 group-hover:text-white/80 text-base leading-none">
                  {lang === 'en' ? '🇺🇸' : '🇪🇸'}
                </span>
                <span className="text-[13px] text-white/55 group-hover:text-white/80 transition-colors">
                  {lang === 'en' ? 'English' : 'Español'}
                </span>
              </div>
              <div className="flex items-center gap-0.5 bg-white/10 rounded-lg px-2 py-1">
                <span className={`text-[11px] font-bold transition-colors ${lang === 'en' ? 'text-white' : 'text-white/40'}`}>EN</span>
                <span className="text-white/30 mx-0.5">|</span>
                <span className={`text-[11px] font-bold transition-colors ${lang === 'es' ? 'text-white' : 'text-white/40'}`}>ES</span>
              </div>
            </button>
          ) : (
            <button
              onClick={toggleLang}
              title={lang === 'en' ? 'Cambiar a Español' : 'Switch to English'}
              className="flex justify-center w-full p-2.5 rounded-lg text-white/55 hover:bg-white/10 hover:text-white/90 transition-all duration-150 text-sm font-bold"
            >
              {lang === 'en' ? 'ES' : 'EN'}
            </button>
          )}

          {/* Dark / Light mode toggle */}
          {isExpanded ? (
            <button
              onClick={toggleTheme}
              className="flex items-center justify-between w-full px-3 py-2 rounded-lg hover:bg-white/10 transition-all duration-150 group"
              title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              <div className="flex items-center gap-2.5">
                <span className="shrink-0 text-white/55 group-hover:text-white/80 transition-colors">
                  {dark ? Icons.sun : Icons.moon}
                </span>
                <span className="text-[13px] text-white/55 group-hover:text-white/80 transition-colors">
                  {dark ? t('nav.lightMode') : t('nav.darkMode')}
                </span>
              </div>
              <div className={`relative w-9 h-5 rounded-full transition-colors duration-200 shrink-0 ${dark ? 'bg-teal-400' : 'bg-white/20'}`}>
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${dark ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
            </button>
          ) : (
            <button
              onClick={toggleTheme}
              title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
              className="flex justify-center w-full p-2.5 rounded-lg text-white/55 hover:bg-white/10 hover:text-white/90 transition-all duration-150"
            >
              {dark ? Icons.sun : Icons.moon}
            </button>
          )}

          {/* Logout */}
          <button
            onClick={handleLogout}
            title="Log out"
            className={`flex items-center gap-3 w-full rounded-lg text-[13px] text-white/55 hover:bg-red-400/20 hover:text-red-300 transition-all duration-150
              ${isExpanded ? 'px-3 py-2.5' : 'justify-center p-2.5'}`}
          >
            <span className="shrink-0">{Icons.logout}</span>
            {isExpanded && <span>{t('nav.logout')}</span>}
          </button>

          {/* User card */}
          {isExpanded ? (
            <div className="flex items-center gap-3 px-3 py-2.5 mt-1 rounded-lg bg-white/8">
              <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center shrink-0 text-white text-xs font-bold">
                {initial}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-white truncate leading-tight">{user.name}</p>
                <p className="text-[11px] text-white/45 capitalize leading-tight mt-0.5">{user.role}</p>
              </div>
            </div>
          ) : (
            <div className="flex justify-center py-1.5">
              <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-white text-xs font-bold">
                {initial}
              </div>
            </div>
          )}

          {/* Collapse toggle (desktop only) */}
          {!isMobile && (
            <button
              onClick={() => setCollapsed(c => !c)}
              title={collapsed ? 'Expand' : 'Collapse'}
              className="flex items-center justify-center w-full py-2 rounded-lg text-white/35 hover:bg-white/10 hover:text-white/70 transition-all duration-150"
            >
              {collapsed ? Icons.chevronRight : Icons.chevronLeft}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* ── Mobile Top Bar ── */}
      <div className="print:hidden md:hidden fixed top-0 left-0 right-0 z-40 h-14 bg-teal-800 flex items-center justify-between px-4 border-b border-white/10">
        <button
          onClick={() => setMobileOpen(v => !v)}
          className="p-2 rounded-lg text-white/70 hover:bg-white/10 hover:text-white transition-colors"
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
        >
          {mobileOpen ? Icons.xMark : Icons.bars}
        </button>
        <Link to="/" className="flex items-center gap-2">
          <img src={healthcareIcon} alt="MedAssist" className="w-6 h-6 object-contain rounded-md" />
          <span className="text-sm font-semibold text-white">MedAssist AI</span>
        </Link>
        <div className="w-9" />
      </div>

      {/* ── Mobile Backdrop ── */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/40 z-40 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Mobile Sidebar ── */}
      <aside
        className={`print:hidden md:hidden fixed top-0 left-0 h-full w-60 bg-teal-800 z-50 transform transition-transform duration-300 ease-in-out ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {sidebarContent(true)}
      </aside>

      {/* ── Desktop Sidebar ── */}
      <aside
        className={`print:hidden hidden md:flex flex-col shrink-0 h-screen sticky top-0 bg-teal-800 transition-all duration-300 ${
          collapsed ? 'w-[60px]' : 'w-60'
        }`}
      >
        {sidebarContent(false)}
      </aside>
    </>
  );
}
