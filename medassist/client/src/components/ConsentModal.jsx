import { useState } from 'react';
import { useTranslation } from 'react-i18next';

const CONSENT_KEY = 'medassist_consent_v1';

export function hasAcceptedConsent() {
  try {
    return localStorage.getItem(CONSENT_KEY) === 'true';
  } catch {
    return false;
  }
}

export default function ConsentModal({ onAccept }) {
  const { t } = useTranslation();
  const [checked, setChecked] = useState(false);

  const handleAccept = () => {
    if (!checked) return;
    localStorage.setItem(CONSENT_KEY, 'true');
    onAccept();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4">
        <h2 className="text-lg font-bold text-slate-800">{t('consent.title')}</h2>
        <p className="text-sm text-slate-600 leading-relaxed">{t('consent.body')}</p>
        <ul className="text-xs text-slate-500 space-y-1 list-disc pl-4">
          <li>{t('consent.bullet1')}</li>
          <li>{t('consent.bullet2')}</li>
          <li>{t('consent.bullet3')}</li>
        </ul>
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-1 rounded text-teal-600"
          />
          <span className="text-sm text-slate-700">{t('consent.agree')}</span>
        </label>
        <button
          type="button"
          onClick={handleAccept}
          disabled={!checked}
          className="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white font-semibold py-3 rounded-xl"
        >
          {t('consent.continue')}
        </button>
      </div>
    </div>
  );
}
