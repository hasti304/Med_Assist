import { useTranslation } from 'react-i18next';
import { useLang } from '../context/LanguageContext';

/**
 * On analysis page: choose report display language (uses existing translation cache).
 */
export default function ReportLanguageToggle({ onLangChange, disabled }) {
  const { t } = useTranslation();
  const { lang, setLang } = useLang();

  const set = (code) => {
    setLang(code);
    onLangChange?.(code);
  };

  return (
    <div className="flex items-center gap-2 bg-slate-100 rounded-xl p-1">
      <span className="text-xs font-semibold text-slate-500 px-2">{t('analysis.reportLanguage')}:</span>
      {['en', 'es'].map((code) => (
        <button
          key={code}
          type="button"
          disabled={disabled}
          onClick={() => set(code)}
          className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 ${
            lang === code ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
