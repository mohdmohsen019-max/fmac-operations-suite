import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Keyboard } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import './ShortcutLayer.css';

/* g-then-key destinations */
const GOTO = {
  d: { path: '/dashboard',             en: 'Overview',        ar: 'نظرة عامة' },
  a: { path: '/activity',              en: 'Activity Log',    ar: 'سجل النشاط' },
  n: { path: '/insights',              en: 'Insights',        ar: 'الرؤى' },
  t: { path: '/strategy',              en: 'Strategy & Excellence', ar: 'الاستراتيجية والتميز' },
  f: { path: '/fleet/dashboard',       en: 'Fleet',           ar: 'الأسطول' },
  m: { path: '/fleet/livemap',         en: 'Live Map',        ar: 'الخريطة' },
  i: { path: '/inventory',             en: 'Inventory',       ar: 'المخزون' },
  r: { path: '/inventory/reorder',     en: 'Reorder Sheet',   ar: 'إعادة الطلب' },
  s: { path: '/assets',                en: 'Assets',          ar: 'الأصول' },
  p: { path: '/reports',               en: 'Dept. Reports',   ar: 'التقارير' },
  h: { path: '/help',                  en: 'Help Desk',       ar: 'الدعم' },
  u: { path: '/users/dashboard',       en: 'Users',           ar: 'المستخدمون' },
  l: { path: '/logistics/attendance',  en: 'Logistics',       ar: 'اللوجستيات' },
  w: { path: '/wallboard',             en: 'Wallboard',       ar: 'شاشة العمليات' },
  x: { path: '/crisis',                en: 'Crisis Management', ar: 'إدارة الأزمات' },
};

const isTyping = (el) =>
  el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);

export default function ShortcutLayer() {
  const navigate = useNavigate();
  const { t, lang } = useLanguage();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [armed, setArmed] = useState(false);   // "g" pressed, waiting for target
  const armTimer = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector('.cp-backdrop')) return; // palette owns the keyboard

      if (e.key === '?') {
        e.preventDefault();
        setSheetOpen(v => !v);
        return;
      }
      if (e.key === 'Escape') { setSheetOpen(false); setArmed(false); return; }

      const k = e.key.toLowerCase();
      if (!armed && k === 'g') {
        setArmed(true);
        clearTimeout(armTimer.current);
        armTimer.current = setTimeout(() => setArmed(false), 1400);
        return;
      }
      if (armed && GOTO[k]) {
        e.preventDefault();
        clearTimeout(armTimer.current);
        setArmed(false);
        setSheetOpen(false);
        navigate(GOTO[k].path);
      } else if (armed) {
        setArmed(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); clearTimeout(armTimer.current); };
  }, [armed, navigate]);

  return (
    <>
      {armed && (
        <div className="sk-armed" aria-hidden="true">
          <span className="sk-kbd">g</span> {t('then…', 'ثم…')}
        </div>
      )}

      {sheetOpen && (
        <div className="sk-backdrop" onMouseDown={() => setSheetOpen(false)}>
          <div className="sk" role="dialog" aria-modal="true" aria-label={t('Keyboard shortcuts', 'اختصارات لوحة المفاتيح')} onMouseDown={e => e.stopPropagation()}>
            <div className="sk-head">
              <Keyboard size={16} strokeWidth={1.9} />
              <h2>{t('Keyboard shortcuts', 'اختصارات لوحة المفاتيح')}</h2>
              <span className="sk-kbd">esc</span>
            </div>

            <div className="sk-grid">
              <div className="sk-col">
                <div className="sk-group">{t('Anywhere', 'في أي مكان')}</div>
                <div className="sk-row"><span>{t('Command palette & search', 'لوحة الأوامر والبحث')}</span><span><span className="sk-kbd">Ctrl</span><span className="sk-kbd">K</span></span></div>
                <div className="sk-row"><span>{t('This cheat sheet', 'هذه القائمة')}</span><span><span className="sk-kbd">?</span></span></div>
                <div className="sk-row"><span>{t('Go-to mode', 'وضع الانتقال')}</span><span><span className="sk-kbd">g</span> {t('then a key', 'ثم مفتاح')}</span></div>
              </div>
              <div className="sk-col">
                <div className="sk-group">{t('Go to', 'الانتقال إلى')}</div>
                {Object.entries(GOTO).map(([key, def]) => (
                  <div className="sk-row" key={key}>
                    <span>{lang === 'ar' ? def.ar : def.en}</span>
                    <span><span className="sk-kbd">g</span><span className="sk-kbd">{key}</span></span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
