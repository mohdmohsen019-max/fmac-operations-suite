import { useState, useEffect, useRef } from 'react';
import { Bell, ChevronRight, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../contexts/LanguageContext';
import useAttentionSignals from '../../hooks/useAttentionSignals';
import './AttentionBell.css';

/**
 * Global attention bell — lives in the floating cluster on every route
 * (the dashboard renders its own themed variant in its header).
 */
export default function AttentionBell() {
  const { t, locale } = useLanguage();
  const navigate = useNavigate();
  const { signals, count, loading, refresh } = useAttentionSignals();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const items = [
    signals.outStock > 0 && {
      key: 'stock', n: signals.outStock,
      label: t('items out of stock', 'صنف نفذ مخزونه'),
      path: '/inventory/reorder',
    },
    signals.unapproved > 0 && {
      key: 'sections', n: signals.unapproved,
      label: t('report sections unapproved', 'قسم تقرير غير معتمد'),
      path: '/reports',
    },
    signals.overdueTickets > 0 && {
      key: 'overdue', n: signals.overdueTickets,
      label: t('tickets past SLA', 'تذكرة تجاوزت الموعد'),
      path: '/help',
    },
    signals.pendingUsers > 0 && {
      key: 'pending', n: signals.pendingUsers,
      label: t('accounts awaiting approval', 'حساب بانتظار الموافقة'),
      path: '/users/dashboard',
    },
  ].filter(Boolean);

  return (
    <div className="ab-wrap" ref={wrapRef}>
      <button
        className="ab-btn"
        aria-label={t('Notifications', 'الإشعارات')}
        onClick={() => setOpen(v => !v)}
      >
        <Bell size={13} strokeWidth={2} />
        {count > 0 && <span className="ab-dot" aria-hidden="true" />}
      </button>

      {open && (
        <div className="ab-menu">
          <div className="ab-menu-head">
            <span>{t('Needs attention', 'يتطلب انتباهك')}</span>
            <button
              className="ab-refresh"
              aria-label={t('Refresh', 'تحديث')}
              onClick={refresh}
              disabled={loading}
            >
              <RefreshCw size={12} className={loading ? 'ab-spin' : undefined} />
            </button>
          </div>
          {items.length === 0 ? (
            <div className="ab-none">
              {loading
                ? t('Checking…', 'جارٍ الفحص…')
                : t('All clear — nothing needs attention.', 'كل شيء على ما يرام.')}
            </div>
          ) : items.map(item => (
            <button
              key={item.key}
              className="ab-item"
              onClick={() => { setOpen(false); navigate(item.path); }}
            >
              <b dir="ltr">{item.n.toLocaleString(locale)}</b>
              <span>{item.label}</span>
              <ChevronRight size={13} strokeWidth={2} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
