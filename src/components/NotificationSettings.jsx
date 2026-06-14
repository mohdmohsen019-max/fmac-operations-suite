import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell, Inbox, ArrowUpCircle, PackageX, CalendarClock,
  ChevronDown, Plus, Trash2, Send, Check, X, Loader2, ScrollText,
} from 'lucide-react';
import { db, auth } from '../firebase';
import {
  doc, getDoc, setDoc, serverTimestamp,
  collection, query, orderBy, limit, onSnapshot, getDocs, writeBatch,
} from 'firebase/firestore';
import { useLanguage } from '../contexts/LanguageContext';
import { sendNotification } from '../utils/notify';

const CONFIG_REF = () => doc(db, 'notification_config', 'main');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SECTIONS = [
  {
    type: 'new_ticket', icon: Inbox,
    titleEn: 'New Help Desk Ticket', titleAr: 'تذكرة دعم جديدة',
    descEn: 'Fires the moment a visitor submits a new help desk ticket.',
    descAr: 'يُرسل فور تقديم زائر لتذكرة دعم جديدة.',
  },
  {
    type: 'escalated_ticket', icon: ArrowUpCircle,
    titleEn: 'Ticket Escalated to HOD', titleAr: 'تصعيد تذكرة للإدارة',
    descEn: 'Fires when a ticket is escalated to the Head of Operations.',
    descAr: 'يُرسل عند تصعيد تذكرة إلى رئيس العمليات.',
  },
  {
    type: 'inventory_low', icon: PackageX,
    titleEn: 'Inventory Low Stock', titleAr: 'نقص مخزون',
    descEn: 'Fires when an item drops to or below its threshold after an issue.',
    descAr: 'يُرسل عند انخفاض صنف إلى حد التنبيه أو أقل بعد الصرف.',
  },
  {
    type: 'monthly_report_reminder', icon: CalendarClock,
    titleEn: 'Monthly Report Reminder', titleAr: 'تذكير التقرير الشهري',
    descEn: 'Sent automatically on the 1st of each month at 08:00 GST.',
    descAr: 'يُرسل تلقائياً في اليوم الأول من كل شهر الساعة 8 صباحاً.',
  },
];

const TYPE_LABEL = {
  new_ticket: { en: 'New Ticket', ar: 'تذكرة جديدة' },
  escalated_ticket: { en: 'Escalated', ar: 'مُصعَّد' },
  inventory_low: { en: 'Low Stock', ar: 'نقص مخزون' },
  monthly_report_reminder: { en: 'Monthly Reminder', ar: 'تذكير شهري' },
};

function samplePayload(type) {
  const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date());
  switch (type) {
    case 'new_ticket': return { ticketId: 'FMAC-2026-TEST01', type: 'inquiry', submittedAt: new Date().toISOString() };
    case 'escalated_ticket': return { ticketId: 'FMAC-2026-TEST01', type: 'complaint', escalatedBy: 'Test CHR', escalatedAt: new Date().toISOString() };
    case 'inventory_low': return { nameEn: 'Test Item', nameAr: 'صنف تجريبي', quantity: 3, threshold: 5, category: 'Equipment' };
    case 'monthly_report_reminder': return { monthLabel };
    default: return {};
  }
}

/* ── Toggle switch ── */
function Toggle({ on, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 42, height: 24, borderRadius: 999, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        background: on ? '#10b981' : 'var(--theme-border-strong, var(--theme-border))',
        position: 'relative', transition: 'background 0.2s ease', flexShrink: 0, opacity: disabled ? 0.5 : 1, padding: 0,
      }}
      aria-pressed={on}
    >
      <span style={{
        position: 'absolute', top: 3, left: on ? 21 : 3, width: 18, height: 18, borderRadius: '50%',
        background: '#fff', transition: 'left 0.2s cubic-bezier(0.16,1,0.3,1)', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
      }} />
    </button>
  );
}

function fmtLogTime(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// Self-contained table cell styles (theme-aware, no external CSS dependency)
const TH = { textAlign: 'start', padding: '10px 12px', fontSize: '0.66rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--theme-text-ghost)', borderBottom: '1px solid var(--theme-border)', whiteSpace: 'nowrap' };
const TD = { padding: '11px 12px', fontSize: '0.84rem', color: 'var(--theme-text-main)', borderBottom: '1px solid var(--theme-border-light, var(--theme-border))', verticalAlign: 'middle' };
const INPUT = { padding: '9px 12px', background: 'var(--theme-surface-hover)', border: '1px solid var(--theme-border)', borderRadius: 9, color: 'var(--theme-text-main)', fontSize: '0.85rem', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' };

export default function NotificationSettings({ isMasterAdmin }) {
  const { t, lang } = useLanguage();
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openSection, setOpenSection] = useState('new_ticket');
  const [drafts, setDrafts] = useState({}); // { [type]: { name, email, error } }
  const [testing, setTesting] = useState(null); // type currently sending test
  const [logs, setLogs] = useState([]);

  /* ── Load config ── */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const snap = await getDoc(CONFIG_REF());
        if (alive) setConfig(snap.exists() ? snap.data() : {});
      } catch (e) {
        console.error('Load notification_config failed:', e);
        if (alive) setConfig({});
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  /* ── Live notification log (last 50) ── */
  useEffect(() => {
    const q = query(collection(db, 'notification_log'), orderBy('timestamp', 'desc'), limit(50));
    const unsub = onSnapshot(q, (snap) => {
      setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.error('notification_log listener:', err));
    return () => unsub();
  }, []);

  const persist = useCallback(async (patch) => {
    setConfig(prev => {
      const next = { ...(prev || {}), ...patch };
      if (patch.recipients) next.recipients = { ...(prev?.recipients || {}), ...patch.recipients };
      return next;
    });
    try {
      await setDoc(CONFIG_REF(), {
        ...patch,
        last_updated: serverTimestamp(),
        last_updated_by: auth.currentUser?.email || '',
      }, { merge: true });
    } catch (e) {
      console.error('Save notification_config failed:', e);
      alert(t('Failed to save. Please try again.', 'فشل الحفظ. حاول مرة أخرى.'));
    }
  }, [t]);

  const recipientsOf = (type) => (config?.recipients?.[type] || []);
  const isEnabled = (type) => config?.[`enabled_${type}`] !== false; // default on

  const toggleType = (type) => persist({ [`enabled_${type}`]: !isEnabled(type) });
  const toggleCron = () => persist({ monthly_reminder_enabled: config?.monthly_reminder_enabled !== true });

  const setDraft = (type, field, value) =>
    setDrafts(prev => ({ ...prev, [type]: { ...(prev[type] || {}), [field]: value, error: '' } }));

  const addRecipient = (type) => {
    const d = drafts[type] || {};
    const name = (d.name || '').trim();
    const email = (d.email || '').trim().toLowerCase();
    if (!name || !email) {
      setDrafts(prev => ({ ...prev, [type]: { ...d, error: t('Name and email are required.', 'الاسم والبريد مطلوبان.') } }));
      return;
    }
    if (!EMAIL_RE.test(email)) {
      setDrafts(prev => ({ ...prev, [type]: { ...d, error: t('Enter a valid email address.', 'أدخل بريداً إلكترونياً صحيحاً.') } }));
      return;
    }
    if (recipientsOf(type).some(r => r.email.toLowerCase() === email)) {
      setDrafts(prev => ({ ...prev, [type]: { ...d, error: t('This email is already added.', 'هذا البريد مُضاف بالفعل.') } }));
      return;
    }
    const next = [...recipientsOf(type), { name, email }];
    persist({ recipients: { [type]: next } });
    setDrafts(prev => ({ ...prev, [type]: { name: '', email: '', error: '' } }));
  };

  const removeRecipient = (type, email) => {
    const next = recipientsOf(type).filter(r => r.email !== email);
    persist({ recipients: { [type]: next } });
  };

  const sendTest = async (type) => {
    const recipients = recipientsOf(type);
    if (!recipients.length) {
      alert(t('Add at least one recipient first.', 'أضف مستلماً واحداً على الأقل أولاً.'));
      return;
    }
    setTesting(type);
    try {
      await sendNotification(type, samplePayload(type), { test: true, recipients });
      alert(t(`Test email sent to ${recipients.length} recipient(s).`, `تم إرسال بريد تجريبي إلى ${recipients.length} مستلم.`));
    } catch (e) {
      console.error('test send failed:', e);
      alert(t('Test send failed.', 'فشل الإرسال التجريبي.'));
    } finally {
      setTesting(null);
    }
  };

  const clearLog = async () => {
    if (!window.confirm(t('Delete all notification log entries? This cannot be undone.', 'حذف جميع سجلات الإشعارات؟ لا يمكن التراجع.'))) return;
    try {
      const snap = await getDocs(collection(db, 'notification_log'));
      const docs = snap.docs;
      for (let i = 0; i < docs.length; i += 450) {
        const batch = writeBatch(db);
        docs.slice(i, i + 450).forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
    } catch (e) {
      console.error('clearLog failed:', e);
      alert(t('Failed to clear log.', 'فشل مسح السجل.'));
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
        <Loader2 className="animate-spin" size={28} style={{ color: 'var(--theme-accent)' }} />
      </div>
    );
  }

  const cardStyle = { border: '1px solid var(--theme-border)', borderRadius: 16, background: 'var(--theme-surface)', overflow: 'hidden', marginBottom: '0.9rem' };
  const labelMuted = { color: 'var(--theme-text-muted)', fontSize: '0.78rem' };

  return (
    <div style={{ maxWidth: 920 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '0.4rem' }}>
        <Bell size={20} style={{ color: 'var(--theme-accent)' }} />
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: 'var(--theme-text-main)', letterSpacing: '-0.02em' }}>
          {t('Notifications', 'الإشعارات')}
        </h2>
      </div>
      <p style={{ margin: '0 0 1.6rem', ...labelMuted }}>
        {t('Configure who receives automated email alerts and when they fire.',
           'حدّد من يتلقى تنبيهات البريد التلقائية ومتى تُرسل.')}
      </p>

      {/* Sections */}
      {SECTIONS.map(section => {
        const { type, icon: Icon } = section;
        const recipients = recipientsOf(type);
        const enabled = isEnabled(type);
        const open = openSection === type;
        const draft = drafts[type] || {};
        return (
          <div key={type} style={cardStyle}>
            {/* Header row */}
            <div
              onClick={() => setOpenSection(open ? null : type)}
              style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '1rem 1.25rem', cursor: 'pointer' }}
            >
              <div style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--theme-accent-soft)', color: 'var(--theme-accent)' }}>
                <Icon size={19} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: 'var(--theme-text-main)', fontSize: '0.95rem' }}>
                  {lang === 'ar' ? section.titleAr : section.titleEn}
                </div>
                <div style={{ ...labelMuted, fontSize: '0.76rem', marginTop: 2 }}>
                  {lang === 'ar' ? section.descAr : section.descEn}
                </div>
              </div>
              <span style={{ ...labelMuted, fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
                {recipients.length} {t('recipient(s)', 'مستلم')}
              </span>
              <div onClick={e => e.stopPropagation()}>
                <Toggle on={enabled} onClick={() => toggleType(type)} />
              </div>
              <ChevronDown size={18} style={{ color: 'var(--theme-text-ghost)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }} />
            </div>

            {/* Body */}
            <AnimatePresence initial={false}>
              {open && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                  style={{ overflow: 'hidden' }}
                >
                  <div style={{ padding: '0 1.25rem 1.25rem', borderTop: '1px solid var(--theme-border)' }}>
                    {/* Cron toggle for monthly */}
                    {type === 'monthly_report_reminder' && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '0.9rem 0', borderBottom: '1px solid var(--theme-border)' }}>
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--theme-text-main)', fontSize: '0.85rem' }}>
                            {t('Scheduled monthly job', 'المهمة الشهرية المجدولة')}
                          </div>
                          <div style={{ ...labelMuted, fontSize: '0.74rem' }}>
                            {t('Runs the 1st of every month at 08:00 GST.', 'تعمل في الأول من كل شهر الساعة 8 صباحاً بتوقيت الخليج.')}
                          </div>
                        </div>
                        <Toggle on={config?.monthly_reminder_enabled === true} onClick={toggleCron} />
                      </div>
                    )}

                    {/* Recipient table */}
                    <div style={{ marginTop: '1rem', overflowX: 'auto' }}>
                      {recipients.length === 0 ? (
                        <p style={{ ...labelMuted, fontStyle: 'italic', padding: '0.5rem 0' }}>
                          {t('No recipients yet.', 'لا يوجد مستلمون بعد.')}
                        </p>
                      ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr>
                              <th style={TH}>{t('Name', 'الاسم')}</th>
                              <th style={TH}>{t('Email', 'البريد الإلكتروني')}</th>
                              <th style={{ ...TH, width: 60 }} />
                            </tr>
                          </thead>
                          <tbody>
                            {recipients.map(r => (
                              <tr key={r.email}>
                                <td style={{ ...TD, fontWeight: 600 }}>{r.name}</td>
                                <td style={{ ...TD, color: 'var(--theme-text-muted)' }}>{r.email}</td>
                                <td style={{ ...TD, textAlign: 'right' }}>
                                  <button
                                    onClick={() => removeRecipient(type, r.email)}
                                    title={t('Remove', 'إزالة')}
                                    style={{ background: 'rgba(244,63,94,0.1)', border: 'none', color: '#f43f5e', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>

                    {/* Add recipient form */}
                    <div style={{ display: 'flex', gap: 8, marginTop: '0.9rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                      <input
                        placeholder={t('Name', 'الاسم')}
                        value={draft.name || ''}
                        onChange={e => setDraft(type, 'name', e.target.value)}
                        style={{ ...INPUT, flex: '1 1 130px', minWidth: 0 }}
                      />
                      <input
                        type="email"
                        placeholder={t('Email', 'البريد الإلكتروني')}
                        value={draft.email || ''}
                        onChange={e => setDraft(type, 'email', e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') addRecipient(type); }}
                        style={{ ...INPUT, flex: '1 1 200px', minWidth: 0 }}
                      />
                      <button className="um-btn um-btn-ghost" onClick={() => addRecipient(type)} style={{ flexShrink: 0 }}>
                        <Plus size={15} /> {t('Add', 'إضافة')}
                      </button>
                      <button
                        className="um-btn um-btn-ghost"
                        onClick={() => sendTest(type)}
                        disabled={testing === type || recipients.length === 0}
                        style={{ flexShrink: 0 }}
                        title={t('Send a [TEST] email to all recipients in this section', 'إرسال بريد تجريبي لجميع المستلمين')}
                      >
                        {testing === type ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                        {t('Send Test', 'إرسال تجريبي')}
                      </button>
                    </div>
                    {draft.error && (
                      <p style={{ color: '#f43f5e', fontSize: '0.78rem', margin: '0.5rem 0 0' }}>{draft.error}</p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}

      {/* ── Notification Log ── */}
      <div style={{ ...cardStyle, marginTop: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '1rem 1.25rem', borderBottom: '1px solid var(--theme-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ScrollText size={18} style={{ color: 'var(--theme-accent)' }} />
            <span style={{ fontWeight: 700, color: 'var(--theme-text-main)' }}>
              {t('Notification Log', 'سجل الإشعارات')}
            </span>
            <span style={{ ...labelMuted, fontSize: '0.72rem' }}>
              {t('last 50', 'آخر 50')}
            </span>
          </div>
          {isMasterAdmin && logs.length > 0 && (
            <button className="um-btn um-btn-ghost" onClick={clearLog} style={{ color: '#f43f5e' }}>
              <Trash2 size={14} /> {t('Clear Log', 'مسح السجل')}
            </button>
          )}
        </div>

        {logs.length === 0 ? (
          <p style={{ ...labelMuted, fontStyle: 'italic', padding: '1.5rem 1.25rem', textAlign: 'center' }}>
            {t('No notifications sent yet.', 'لم تُرسل أي إشعارات بعد.')}
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={TH}>{t('Time', 'الوقت')}</th>
                  <th style={TH}>{t('Type', 'النوع')}</th>
                  <th style={TH}>{t('Recipient', 'المستلم')}</th>
                  <th style={TH}>{t('Status', 'الحالة')}</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => {
                  const failed = log.status === 'failed';
                  const tl = TYPE_LABEL[log.type];
                  return (
                    <tr key={log.id} style={failed ? { boxShadow: 'inset 3px 0 0 #f43f5e' } : undefined}>
                      <td style={{ ...TD, color: 'var(--theme-text-muted)', whiteSpace: 'nowrap', fontSize: '0.8rem' }}>{fmtLogTime(log.timestamp)}</td>
                      <td style={{ ...TD, fontSize: '0.8rem' }}>{tl ? (lang === 'ar' ? tl.ar : tl.en) : log.type}</td>
                      <td style={{ ...TD, fontSize: '0.8rem' }}>
                        <div style={{ fontWeight: 600 }}>{log.recipient_name || '—'}</div>
                        <div style={{ ...labelMuted, fontSize: '0.72rem' }}>{log.recipient_email}</div>
                      </td>
                      <td style={TD}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', fontWeight: 700,
                          padding: '3px 9px', borderRadius: 99,
                          color: failed ? '#f43f5e' : '#10b981',
                          background: failed ? 'rgba(244,63,94,0.1)' : 'rgba(16,185,129,0.1)',
                        }} title={log.error || ''}>
                          {failed ? <X size={11} /> : <Check size={11} />}
                          {failed ? t('Failed', 'فشل') : t('Sent', 'تم الإرسال')}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
