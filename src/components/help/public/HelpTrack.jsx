/**
 * Public request tracking — متابعة الطلب.
 * A submitter enters their ticket number + the last 4 digits of the phone they
 * used, and sees a privacy-safe progress timeline. No login, no PII returned.
 * Backed by the trackTicket Cloud Function (POST /api/track-ticket), which is
 * the only public read path into `requests`.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Search, Loader2, CircleCheck, CircleDot, Clock, AlertCircle, ShieldCheck } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLanguage } from '../../../contexts/LanguageContext';
import { TYPE_LABEL, fmtDuration } from '../helpConfig';
import './HelpTrack.css';

const STATUS_META = {
  new:      { ar: 'تم الاستلام',  en: 'Received',    hex: '#d97706' },
  progress: { ar: 'قيد المعالجة', en: 'In progress', hex: '#2563eb' },
  closed:   { ar: 'مكتمل',        en: 'Completed',   hex: '#17b26a' },
};

const STAGE_META = {
  received:    { ar: 'تم استلام الطلب',       en: 'Request received',    icon: CircleCheck },
  in_progress: { ar: 'قيد المعالجة',          en: 'Being handled',       icon: CircleDot },
  escalated:   { ar: 'تم التصعيد إلى الإدارة', en: 'Escalated to management', icon: AlertCircle },
  closed:      { ar: 'تم إنجاز الطلب',         en: 'Request completed',   icon: CircleCheck },
};

export default function HelpTrack() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { t, lang } = useLanguage();
  const isAr = lang === 'ar';

  const [ticket, setTicket] = useState(params.get('ticket') || '');
  const [verify, setVerify] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // { found, ... } | null
  const [error, setError] = useState('');

  useEffect(() => { document.title = 'Track a Request — FMAC Operations Suite'; }, []);

  const canSubmit = ticket.trim().length >= 6 && verify.replace(/\D/g, '').length >= 4;

  const lookup = async (e) => {
    e?.preventDefault?.();
    if (!canSubmit || loading) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch('/api/track-ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketNumber: ticket.trim(), verify: verify.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error('server');
      setResult(data);
    } catch (err) {
      setError(t('Something went wrong. Please try again.', 'حدث خطأ ما. يرجى المحاولة مرة أخرى.'));
    } finally {
      setLoading(false);
    }
  };

  const fmtDate = (iso) => {
    if (!iso) return '';
    try { return new Date(iso).toLocaleString(isAr ? 'ar-AE' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }); }
    catch { return ''; }
  };

  const statusMeta = result?.found ? (STATUS_META[result.status] || STATUS_META.new) : null;
  const typeLabel = result?.found && result.type ? TYPE_LABEL[result.type] : null;

  const timeline = useMemo(() => {
    if (!result?.found) return [];
    return (result.timeline || []).map((s) => ({ ...s, meta: STAGE_META[s.key] })).filter((s) => s.meta);
  }, [result]);

  return (
    <div className="ht-page">
      <button className="ht-back" onClick={() => navigate('/')}>
        <ArrowLeft size={16} />
        <span>{isAr ? 'العودة للرئيسية' : 'Back to home'}</span>
      </button>

      <motion.div className="ht-card"
        initial={{ opacity: 0, y: 24, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>

        <div className="ht-head">
          <div className="ht-head-icon"><Search size={20} /></div>
          <div className="ht-head-names">
            <span className="ht-head-ar">متابعة الطلب</span>
            <span className="ht-head-en">TRACK A REQUEST</span>
          </div>
        </div>

        <p className="ht-lead" dir="auto">
          {isAr
            ? 'أدخل رقم طلبك وآخر ٤ أرقام من هاتفك لعرض حالة الطلب وتقدّمه.'
            : 'Enter your ticket number and the last 4 digits of your phone to see its status and progress.'}
        </p>

        <form onSubmit={lookup} className="ht-form">
          <div className="ht-field">
            <label className="ht-label">{isAr ? 'رقم الطلب' : 'Ticket number'} <span className="ht-req">*</span></label>
            <input className="ht-input ht-input--mono" dir="ltr" placeholder="FMAC-2026-000000"
              value={ticket} onChange={(e) => setTicket(e.target.value)} />
          </div>
          <div className="ht-field">
            <label className="ht-label">{isAr ? 'آخر ٤ أرقام من الهاتف' : 'Last 4 digits of phone'} <span className="ht-req">*</span></label>
            <input className="ht-input ht-input--mono" dir="ltr" inputMode="numeric" maxLength={4} placeholder="••••"
              value={verify} onChange={(e) => setVerify(e.target.value.replace(/\D/g, '').slice(0, 4))} />
          </div>
          <button type="submit" className="ht-submit" disabled={!canSubmit || loading}>
            {loading ? <Loader2 size={17} className="ht-spin" /> : <Search size={16} />}
            {isAr ? 'عرض الحالة' : 'Check status'}
          </button>
        </form>

        {error && <div className="ht-alert ht-alert--err"><AlertCircle size={15} />{error}</div>}

        <AnimatePresence mode="wait">
          {result && !result.found && (
            <motion.div key="miss" className="ht-alert ht-alert--miss"
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <AlertCircle size={15} />
              {isAr
                ? 'لم نعثر على طلب مطابق. تأكد من رقم الطلب وآخر ٤ أرقام من الهاتف الذي استخدمته عند التقديم.'
                : 'No matching request. Check the ticket number and the last 4 digits of the phone used to submit.'}
            </motion.div>
          )}

          {result?.found && (
            <motion.div key="hit" className="ht-result"
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>

              {/* Status header */}
              <div className="ht-status" style={{ borderColor: statusMeta.hex }}>
                <div className="ht-status-main">
                  <span className="ht-status-dot" style={{ background: statusMeta.hex }} />
                  <span className="ht-status-label" style={{ color: statusMeta.hex }}>
                    {isAr ? statusMeta.ar : statusMeta.en}
                  </span>
                </div>
                <div className="ht-status-meta" dir="auto">
                  {typeLabel && <span className="ht-chip">{isAr ? typeLabel.ar : typeLabel.en}</span>}
                </div>
              </div>

              <div className="ht-num" dir="ltr">{result.ticketNumber}</div>

              {/* Progress timeline */}
              <div className="ht-timeline">
                {timeline.map((s, i) => {
                  const Icon = s.meta.icon;
                  const last = i === timeline.length - 1;
                  const done = result.status === 'closed' || !last;
                  return (
                    <div className="ht-tl-row" key={s.key + i}>
                      <div className="ht-tl-marker">
                        <span className="ht-tl-icon" style={{ color: done ? '#17b26a' : statusMeta.hex, borderColor: done ? '#17b26a' : statusMeta.hex }}>
                          <Icon size={14} />
                        </span>
                        {!last && <span className="ht-tl-line" />}
                      </div>
                      <div className="ht-tl-body">
                        <span className="ht-tl-title">{isAr ? s.meta.ar : s.meta.en}</span>
                        {s.at && <span className="ht-tl-date" dir="auto">{fmtDate(s.at)}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Facts */}
              <div className="ht-facts">
                {result.status !== 'closed' && result.slaDeadline && (
                  <div className="ht-fact">
                    <Clock size={14} />
                    <span>{isAr ? 'الموعد المستهدف للرد' : 'Target response by'}</span>
                    <strong dir="auto">{fmtDate(result.slaDeadline)}</strong>
                  </div>
                )}
                {result.status === 'closed' && result.resolutionMinutes != null && (
                  <div className="ht-fact">
                    <CircleCheck size={14} />
                    <span>{isAr ? 'زمن الإنجاز' : 'Resolution time'}</span>
                    <strong dir="auto">{fmtDuration(result.resolutionMinutes, lang)}</strong>
                  </div>
                )}
              </div>

              {result.status === 'closed' ? (
                <p className="ht-foot-note" dir="auto">
                  {isAr
                    ? 'تم إنجاز طلبك. إن كان لديك استفسار إضافي، يسعدنا تقديم طلب جديد.'
                    : 'Your request is complete. If you need anything else, you are welcome to submit a new request.'}
                </p>
              ) : (
                <p className="ht-foot-note" dir="auto">
                  {isAr
                    ? 'فريق العمليات يعمل على طلبك وسيتواصل معك عبر بيانات التواصل التي قدمتها.'
                    : 'Our operations team is working on your request and will reach you via the contact details you provided.'}
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="ht-submit-cta">
          <span>{isAr ? 'لم تقدّم طلباً بعد؟' : "Haven't submitted a request yet?"}</span>
          <button className="ht-link" onClick={() => navigate('/')}>{isAr ? 'قدّم طلباً' : 'Submit a request'}</button>
        </div>
      </motion.div>

      <div className="ht-trust" dir="auto">
        <ShieldCheck size={13} />
        {isAr ? 'لا نعرض أي بيانات شخصية على هذه الصفحة — حالة الطلب فقط.' : 'No personal data is shown here — status only.'}
      </div>
    </div>
  );
}
