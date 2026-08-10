import { createContext, useContext, useState, useEffect } from 'react';

const LanguageContext = createContext();

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(
    () => localStorage.getItem('fmac-lang') || 'en'
  );

  useEffect(() => {
    const dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.setAttribute('dir', dir);
    document.documentElement.setAttribute('lang', lang);
    localStorage.setItem('fmac-lang', lang);
  }, [lang]);

  const toggleLanguage = () => setLang(p => (p === 'en' ? 'ar' : 'en'));

  return (
    <LanguageContext.Provider value={{ lang, toggleLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useLanguage = () => {
  const { lang, toggleLanguage } = useContext(LanguageContext);
  // t(english, arabic) — returns the right string for active language
  const t = (en, ar) => (lang === 'ar' ? ar : en);
  // locale string for date/number formatting
  const locale = lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US';
  const isRTL = lang === 'ar';
  return { lang, toggleLanguage, t, locale, isRTL };
}
