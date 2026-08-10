import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Home, Search, Copy, CheckCheck } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useParams, useNavigate } from 'react-router-dom';
import { INTAKE_SCALE as FACES } from '../helpConfig';
import './HelpSuccess.css';

/* Submission-experience rating faces come from the shared INTAKE_SCALE so the
   success page and the admin view always render the same emoji/labels. */

export default function HelpSuccess() {
  // Route param is :ticketId — this holds the FMAC-2026-###### number.
  const { ticketId: ticketNumber } = useParams();
  const navigate = useNavigate();
  const { t, lang } = useLanguage();
  const isAr = lang === 'ar';

  const [copied, setCopied] = useState(false);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [rated, setRated] = useState(false);

  useEffect(() => { document.title = 'Request Submitted — FMAC Operations Suite'; }, []);

  const copyNumber = () => {
    navigator.clipboard?.writeText(ticketNumber || '').then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  const rate = async (value) => {
    if (rated) return;
    setRating(value);
    setRated(true); // optimistic — a rating should never feel like it could fail
    try {
      await fetch('/api/rate-intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketNumber, rating: value }),
      });
    } catch { /* low-stakes; the thank-you stands regardless */ }
  };

  const active = hover || rating;

  return (
    <div className="hs-page">
      <motion.div
        className="hs-card"
        initial={{ opacity: 0, y: 26, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      >
        <motion.div
          className="hs-check"
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', bounce: 0.5, delay: 0.12 }}
        >
          <Check size={34} strokeWidth={3} />
        </motion.div>

        <h1 className="hs-title" dir="auto">{isAr ? 'تم تقديم الطلب' : 'Request Submitted'}</h1>
        <p className="hs-sub" dir="auto">
          {isAr
            ? 'تم استلام طلبك بنجاح. سيقوم فريق العمليات بمراجعته والرد عليك قريباً.'
            : 'Your request has been received. Our operations team will review it and get back to you shortly.'}
        </p>

        {/* Ticket number */}
        <div className="hs-ticket">
          <span className="hs-ticket-label">{isAr ? 'رقم تذكرتك' : 'Your ticket number'}</span>
          <div className="hs-ticket-row">
            <span className="hs-ticket-num" dir="ltr">{ticketNumber}</span>
            <button className="hs-copy" onClick={copyNumber} title={isAr ? 'نسخ' : 'Copy'}>
              {copied ? <CheckCheck size={15} /> : <Copy size={15} />}
            </button>
          </div>
          <p className="hs-ticket-hint" dir="auto">
            {isAr
              ? 'احتفظ بهذا الرقم. استخدمه مع آخر ٤ أرقام من هاتفك لمتابعة حالة الطلب في أي وقت.'
              : 'Keep this number. Use it with the last 4 digits of your phone to track progress anytime.'}
          </p>
        </div>

        {/* Submission-experience rating */}
        <div className="hs-rate">
          {!rated ? (
              <div>
                <p className="hs-rate-q" dir="auto">{isAr ? 'كيف كانت تجربة تقديم الطلب؟' : 'How was your submission experience?'}</p>
                <div className="hs-faces" onMouseLeave={() => setHover(0)}>
                  {FACES.map((f) => (
                    <button
                      key={f.value}
                      type="button"
                      className={`hs-face ${active >= f.value ? 'is-on' : ''} ${active === f.value ? 'is-sel' : ''}`}
                      onMouseEnter={() => setHover(f.value)}
                      onFocus={() => setHover(f.value)}
                      onClick={() => rate(f.value)}
                      aria-label={isAr ? f.ar : f.en}
                    >
                      <span className="hs-face-emoji">{f.emoji}</span>
                    </button>
                  ))}
                </div>
                <span className="hs-face-label" dir="auto">
                  {active ? (isAr ? FACES[active - 1].ar : FACES[active - 1].en) : ' '}
                </span>
              </div>
            ) : (
              <motion.div className="hs-thanks" dir="auto"
                initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring', bounce: 0.4 }}>
                <span className="hs-thanks-emoji">{FACES[rating - 1]?.emoji}</span>
                <span className="hs-thanks-text">{isAr ? 'شكراً لتقييمك!' : 'Thanks for your feedback!'}</span>
              </motion.div>
            )}
        </div>

        {/* Actions */}
        <div className="hs-actions">
          <button className="hs-btn hs-btn--ink" onClick={() => navigate(`/track?ticket=${encodeURIComponent(ticketNumber || '')}`)}>
            <Search size={16} /> {isAr ? 'تتبّع طلبي' : 'Track my request'}
          </button>
          <button className="hs-btn hs-btn--ghost" onClick={() => navigate('/')}>
            <Home size={16} /> {isAr ? 'العودة للرئيسية' : 'Return home'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
