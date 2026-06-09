import { createContext, useContext, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const { i18n } = useTranslation();
  const [lang, setLang] = useState(i18n.language === 'es' ? 'es' : 'en');

  const changeLang = useCallback((code) => {
    const next = code === 'es' ? 'es' : 'en';
    i18n.changeLanguage(next);
    localStorage.setItem('medassist_lang', next);
    setLang(next);
  }, [i18n]);

  const toggleLang = useCallback(() => {
    changeLang(lang === 'en' ? 'es' : 'en');
  }, [lang, changeLang]);

  return (
    <LanguageContext.Provider value={{ lang, toggleLang, setLang: changeLang }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLang() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLang must be used inside LanguageProvider');
  return ctx;
}
