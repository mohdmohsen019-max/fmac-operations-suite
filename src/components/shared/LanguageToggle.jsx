import { useLanguage } from '../../contexts/LanguageContext';
import './LanguageToggle.css';

export default function LanguageToggle() {
  const { lang, toggleLanguage } = useLanguage();
  return (
    <button
      className="lang-toggle-pill"
      onClick={toggleLanguage}
      aria-label={lang === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
      title={lang === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
    >
      <span className={`lang-pill-option${lang === 'en' ? ' active' : ''}`}>EN</span>
      <span className={`lang-pill-option${lang === 'ar' ? ' active' : ''}`}>AR</span>
    </button>
  );
}
