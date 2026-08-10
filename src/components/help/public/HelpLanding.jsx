/**
 * Public landing — the light editorial face of the suite.
 * Same design language as the staff console: bone canvas, ink type, brand-red
 * accents, flat white cards, per-module tint chips. All routes and the
 * request-wizard entry points are unchanged.
 */
import React, { useEffect, useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import { ArrowRight, ArrowUpRight, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../../contexts/LanguageContext';
import LanguageToggle from '../../shared/LanguageToggle';
import ThemeToggle from '../../shared/ThemeToggle';
import './HelpLanding.css';

/* ── Service icon paths ─────────────────────────────── */
const SERVICE_ICONS = {
  inquiry:     'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z',
  complaint:   'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
  suggestion:  'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z',
  meeting:     'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
  call:        'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z',
  maintenance: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
};

/* ── Sports marquee content ─────────────────────────── */
const DISCIPLINES = [
  { ar: 'تايكوندو', en: 'TAEKWONDO' },
  { ar: 'جودو', en: 'JUDO' },
  { ar: 'مبارزة', en: 'FENCING' },
  { ar: 'ملاكمة', en: 'BOXING' },
  { ar: 'رماية', en: 'ARCHERY' },
  { ar: 'كاراتيه', en: 'KARATE' },
  { ar: 'مصارعة', en: 'WRESTLING' },
  { ar: 'جوجيتسو', en: 'JIU-JITSU' },
  { ar: 'سباحة', en: 'SWIMMING' },
];

/* Per-card module tints — the suite's identity colours as icon chips. */
const CARD_TINTS = [
  { bg: '#fdeef0', ink: '#a32d2d' },
  { bg: '#e8f0fd', ink: '#2563eb' },
  { bg: '#e9f7f1', ink: '#0c7a58' },
  { bg: '#f8f3e6', ink: '#8a6d1f' },
  { bg: '#f3efff', ink: '#6d4fc4' },
  { bg: '#e6f4f7', ink: '#0e7490' },
];

/* ── Count-up number (kept from the previous design) ── */
function CountUp({ to, suffix = '' }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!inView) return;
    let raf; const t0 = performance.now(); const dur = 1100;
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      setVal(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, to]);
  return <span ref={ref}>{val}{suffix}</span>;
}

const rise = {
  initial: { opacity: 0, y: 22 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-40px' },
  transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] },
};

export default function HelpLanding() {
  const navigate = useNavigate();
  const { lang } = useLanguage();
  const isAr = lang === 'ar';
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const SERVICES = [
    { id: 'inquiry',     titleAr: 'استفسار عام',   titleEn: 'General Inquiry',   descAr: 'اطرح سؤالاً عن برامجنا أو جداولنا أو رسومنا.',          descEn: 'Ask a question about our programs, schedules, or fees.',     icon: SERVICE_ICONS.inquiry },
    { id: 'complaint',   titleAr: 'تقديم شكوى',    titleEn: 'File a Complaint',  descAr: 'أبلغ عن مشكلة بأمان. نأخذ جميع الملاحظات بجدية.',        descEn: 'Report an issue securely. We take all feedback seriously.',  icon: SERVICE_ICONS.complaint },
    { id: 'suggestion',  titleAr: 'تقديم اقتراح',  titleEn: 'Make a Suggestion', descAr: 'شارك أفكارك لمساعدتنا في تحسين خدماتنا.',                descEn: 'Share your ideas to help us improve our services.',          icon: SERVICE_ICONS.suggestion },
    { id: 'meeting',     titleAr: 'طلب اجتماع',    titleEn: 'Request a Meeting', descAr: 'جدوِل اجتماعاً رسمياً مع الإدارة أو المدربين.',           descEn: 'Schedule a formal meeting with management or coaches.',      icon: SERVICE_ICONS.meeting },
    { id: 'call',        titleAr: 'طلب مكالمة',    titleEn: 'Request a Call',    descAr: 'اترك رقمك وسنتصل بك في الوقت المناسب.',                  descEn: 'Leave your number and we will call you back.',               icon: SERVICE_ICONS.call },
    { id: 'maintenance', titleAr: 'مشكلة صيانة',   titleEn: 'Maintenance Issue', descAr: 'أبلغ عن مشكلة في المرفق أو وسائل النقل.',                descEn: 'Report a facility or transport issue requiring attention.',  icon: SERVICE_ICONS.maintenance },
  ];

  const scrollToServices = () =>
    document.getElementById('landing-services')?.scrollIntoView({ behavior: 'smooth' });

  const marqueeItems = [...DISCIPLINES, ...DISCIPLINES]; // doubled for seamless loop

  return (
    <div className="pl">

      {/* ── Nav ── */}
      <nav className={`pl-nav ${scrolled ? 'pl-nav--scrolled' : ''}`}>
        <div className="pl-nav-brand">
          <img src="/fmac-ops-logo.png" alt="FMAC" className="pl-nav-logo" />
          <span className="pl-nav-word">{isAr ? 'إدارة العمليات' : 'Operations'}</span>
        </div>
        <div className="pl-nav-actions">
          <LanguageToggle />
          <ThemeToggle />
          <button className="pl-btn pl-btn--ghost pl-btn--sm" onClick={() => navigate('/track')}>
            <Search size={13} />
            {isAr ? 'تتبّع طلب' : 'Track a request'}
          </button>
          <button className="pl-btn pl-btn--ink pl-btn--sm" onClick={() => navigate('/login')}>
            {isAr ? 'دخول الموظفين' : 'Staff Login'}
            <ArrowUpRight size={13} />
          </button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <header className="pl-hero">
        {/* Atmosphere layer — texture keeps the bone canvas from reading empty */}
        <div className="pl-hero-bg" aria-hidden="true">
          <div className="pl-hero-glow" />
          <span className="pl-hero-ghost">FMAC</span>
          <div className="pl-hero-frame" />
        </div>

        <div className="pl-hero-inner">
          <motion.p className="pl-kicker"
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}>
            FMAC OPERATIONS SUITE
          </motion.p>

          <motion.h1 className="pl-hero-title" dir="rtl"
            initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}>
            مركز عمليات نادي الفجيرة
            <span> للفنون القتالية</span>
          </motion.h1>

          <motion.p className="pl-hero-sub" dir="auto"
            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.18 }}>
            {isAr
              ? 'تقديم الطلبات والدعم والوصول إلى لوحة التحكم الموحدة'
              : 'Submit requests, get support, access the unified console'}
          </motion.p>

          <motion.div className="pl-hero-actions"
            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.28 }}>
            <button className="pl-btn pl-btn--ink" onClick={scrollToServices}>
              {isAr ? 'تقديم طلب' : 'Submit a Request'}
            </button>
            <button className="pl-btn pl-btn--ghost" onClick={() => navigate('/login')}>
              {isAr ? 'دخول الموظفين' : 'Staff Login'}
            </button>
          </motion.div>

          {/* Quick-access request bar — immediate action, fills the hero */}
          <motion.div className="pl-hero-quick"
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.4 }}>
            <span className="pl-hero-quick-label">{isAr ? 'طلب سريع' : 'Quick request'}</span>
            <div className="pl-hero-quick-row">
              {SERVICES.map((s, i) => {
                const tint = CARD_TINTS[i % CARD_TINTS.length];
                return (
                  <button key={s.id} className="pl-quick"
                    onClick={() => navigate(`/submit/${s.id}?step=1`)}>
                    <span className="pl-quick-icon" style={{ background: tint.bg, color: tint.ink }}>
                      <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                        <path d={s.icon} />
                      </svg>
                    </span>
                    <span>{isAr ? s.titleAr : s.titleEn}</span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        </div>
      </header>

      {/* ── Disciplines marquee ── */}
      <div className="pl-marquee" dir="ltr">
        <div className="pl-marquee-track">
          {marqueeItems.map((d, i) => (
            <span className="pl-marquee-item" key={i}>
              <span className="pl-marquee-ar">{d.ar}</span>
              <span className="pl-marquee-diamond">◆</span>
              <span className="pl-marquee-en">{d.en}</span>
              <span className="pl-marquee-diamond pl-marquee-diamond--dim">◆</span>
            </span>
          ))}
        </div>
      </div>

      {/* ── Services ── */}
      <section className="pl-section" id="landing-services">
        <motion.div className="pl-section-head" {...rise}>
          <h2 className="pl-section-title" dir="rtl">خدماتنا</h2>
          <div className="pl-section-rule" />
          <p className="pl-section-sub">OUR SERVICES</p>
        </motion.div>

        <div className="pl-services">
          {SERVICES.map((service, i) => {
            const tint = CARD_TINTS[i % CARD_TINTS.length];
            return (
              <motion.button
                key={service.id}
                className="pl-card"
                onClick={() => navigate(`/submit/${service.id}?step=1`)}
                initial={{ opacity: 0, y: 26 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ delay: (i % 3) * 0.08, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="pl-card-top">
                  <span className="pl-card-icon" style={{ background: tint.bg, color: tint.ink }}>
                    <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                      <path d={service.icon} />
                    </svg>
                  </span>
                  <span className="pl-card-num">{String(i + 1).padStart(2, '0')}</span>
                </div>
                <h3 className="pl-card-title" dir="rtl">{service.titleAr}</h3>
                <p className="pl-card-title-en">{service.titleEn}</p>
                <p className="pl-card-desc" dir="auto">
                  {isAr ? service.descAr : service.descEn}
                </p>
                <span className="pl-card-cta">
                  {isAr ? 'ابدأ الطلب' : 'Start request'}
                  <ArrowRight size={13} className="pl-card-arrow" />
                </span>
              </motion.button>
            );
          })}
        </div>
      </section>

      {/* ── About + counters ── */}
      <section className="pl-section pl-section--about">
        <div className="pl-about">
          <motion.div className="pl-about-text" {...rise}>
            <h2 className="pl-section-title" dir="rtl">قسم العمليات</h2>
            <div className="pl-section-rule pl-section-rule--start" />
            <p className="pl-section-sub">OPERATIONS DEPARTMENT</p>

            <p className="pl-about-body" dir="rtl">
              يُعد قسم العمليات في نادي الفجيرة للفنون القتالية العمود الفقري للنادي، حيث يدير الخدمات اللوجستية
              والأسطول والمرافق لضمان سير العمل بكفاءة. نسعى لتقديم أعلى مستويات الخدمة والدعم لجميع الأعضاء
              والموظفين والزوار.
            </p>
            <p className="pl-about-body pl-about-body--en">
              The Operations Department at Fujairah Martial Arts Club is the backbone of the organization,
              managing logistics, fleet, and facilities to ensure smooth daily operations. We are committed
              to delivering the highest levels of service and support to all members, staff, and visitors.
            </p>
          </motion.div>

          <motion.div className="pl-stats" {...rise}>
            <div className="pl-stat" style={{ background: '#fdeef0' }}>
              <span className="pl-stat-num" style={{ color: '#a32d2d' }}><CountUp to={9} suffix="+" /></span>
              <span className="pl-stat-label">{isAr ? 'رياضة قتالية' : 'Martial Disciplines'}</span>
            </div>
            <div className="pl-stat" style={{ background: '#e9f7f1' }}>
              <span className="pl-stat-num" style={{ color: '#0c7a58' }}><CountUp to={3} /></span>
              <span className="pl-stat-label">{isAr ? 'فروع — الفجيرة ودبا والبدية' : 'Branches — Fujairah, Dibba & Al Bidya'}</span>
            </div>
            <div className="pl-stat" style={{ background: '#e8f0fd' }}>
              <span className="pl-stat-num" style={{ color: '#2563eb' }}><CountUp to={6} /></span>
              <span className="pl-stat-label">{isAr ? 'قنوات خدمة' : 'Service Channels'}</span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Footer — the frame ink band ── */}
      <footer className="pl-footer">
        <img src="/fmac-ops-logo-light.png" alt="FMAC" className="pl-footer-logo" />
        <p className="pl-footer-ar" dir="rtl">نادي الفجيرة للفنون القتالية</p>
        <p className="pl-footer-en">FUJAIRAH MARTIAL ARTS CLUB — OPERATIONS</p>
        <div className="pl-footer-rule" />
        <p className="pl-footer-copy">© 2026 All Rights Reserved</p>
      </footer>
    </div>
  );
}
