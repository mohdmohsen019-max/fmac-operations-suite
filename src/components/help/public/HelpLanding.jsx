import React, { useEffect, useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import { ChevronDown, ArrowRight, ArrowUpRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../../contexts/LanguageContext';
import LanguageToggle from '../../shared/LanguageToggle';
import ThemeToggle from '../../shared/ThemeToggle';
import FMACLogo from '../../FMACLogo';
import CinematicBackdrop from '../../shared/CinematicBackdrop';
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

/* ── Kinetic headline: word-by-word rise reveal ─────── */
function KineticHeadline({ text, className }) {
  const words = text.split(' ');
  return (
    <h1 className={className} dir="rtl">
      {words.map((w, i) => (
        <span className="kinetic-word-mask" key={i}>
          <motion.span
            className="kinetic-word"
            initial={{ y: '115%', rotate: 4, filter: 'blur(6px)' }}
            animate={{ y: '0%', rotate: 0, filter: 'blur(0px)' }}
            transition={{ delay: 0.55 + i * 0.09, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          >
            {w}
          </motion.span>
        </span>
      ))}
    </h1>
  );
}

/* ── Animated counter ───────────────────────────────── */
function CountUp({ to, suffix = '' }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const [val, setVal] = useState(0);

  useEffect(() => {
    if (!inView) return undefined;
    let raf;
    const start = performance.now();
    const dur = 1400;
    const tick = (now) => {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(to * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, to]);

  return <span ref={ref}>{val}{suffix}</span>;
}

/* ── 3D tilt card with glare ────────────────────────── */
function TiltCard({ children, className, onClick }) {
  const ref = useRef(null);

  const onMove = (e) => {
    const el = ref.current;
    if (!el || window.matchMedia('(pointer: coarse)').matches) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    el.style.setProperty('--tilt-x', `${(py - 0.5) * -9}deg`);
    el.style.setProperty('--tilt-y', `${(px - 0.5) * 9}deg`);
    el.style.setProperty('--glare-x', `${px * 100}%`);
    el.style.setProperty('--glare-y', `${py * 100}%`);
  };

  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--tilt-x', '0deg');
    el.style.setProperty('--tilt-y', '0deg');
  };

  return (
    <div
      ref={ref}
      className={className}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick?.(); }}
    >
      {children}
    </div>
  );
}

/* ════════════════════════════════════════════════════ */
export default function HelpLanding() {
  const navigate = useNavigate();
  const { t, lang } = useLanguage();
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
    <div className="fmac-landing">

      {/* ── Nav ── */}
      <nav className={`landing-nav ${scrolled ? 'scrolled' : ''}`}>
        <img src="/fmac-logo-new.png" alt="FMAC" className="landing-nav-logo" />
        <div className="landing-nav-actions">
          <LanguageToggle />
          <ThemeToggle />
          <button className="landing-nav-staff-btn" onClick={() => navigate('/login')}>
            {isAr ? 'دخول الموظفين' : 'Staff Login'}
            <ArrowUpRight size={14} />
          </button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="landing-hero">
        <CinematicBackdrop intensity={1} />
        <div className="hero-ghost-word" aria-hidden="true">عمليات</div>

        <div className="landing-hero-content">
          <motion.div
            className="hero-logo-wrap"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <FMACLogo size="md" />
          </motion.div>

          <KineticHeadline
            className="hero-text-arabic"
            text="مركز عمليات نادي الفجيرة للفنون القتالية"
          />

          <motion.div
            className="hero-divider"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 1.3, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          />

          <motion.p
            className="hero-text-english"
            initial={{ opacity: 0, letterSpacing: '0.6em' }}
            animate={{ opacity: 1, letterSpacing: '0.34em' }}
            transition={{ delay: 1.35, duration: 1, ease: [0.16, 1, 0.3, 1] }}
          >
            FMAC OPERATIONS SUITE
          </motion.p>

          <motion.p
            className={`hero-subtitle ${isAr ? 'hero-subtitle-ar' : ''}`}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.55, duration: 0.6 }}
          >
            {isAr
              ? 'تقديم الطلبات والدعم والوصول إلى لوحة التحكم الموحدة'
              : 'Submit requests, get support, access the unified console'}
          </motion.p>

          <motion.div
            className="hero-buttons"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.75, duration: 0.6 }}
          >
            <button className="hero-btn-primary" onClick={scrollToServices}>
              <span>{isAr ? 'تقديم طلب' : 'Submit a Request'}</span>
            </button>
            <button className="hero-btn-secondary" onClick={() => navigate('/login')}>
              <span>{isAr ? 'دخول الموظفين' : 'Staff Login'}</span>
            </button>
          </motion.div>
        </div>

        <motion.div
          className="landing-scroll-indicator"
          onClick={scrollToServices}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.3, duration: 0.8 }}
        >
          <span className="scroll-indicator-text">{isAr ? 'اكتشف المزيد' : 'Discover'}</span>
          <ChevronDown className="scroll-indicator-chevron" size={18} />
        </motion.div>
      </section>

      {/* ── Disciplines marquee ── */}
      <div className="landing-marquee" dir="ltr">
        <div className="marquee-track">
          {marqueeItems.map((d, i) => (
            <span className="marquee-item" key={i}>
              <span className="marquee-ar">{d.ar}</span>
              <span className="marquee-diamond">◆</span>
              <span className="marquee-en">{d.en}</span>
              <span className="marquee-diamond dim">◆</span>
            </span>
          ))}
        </div>
      </div>

      {/* ── Services ── */}
      <section className="landing-services" id="landing-services">
        <div className="services-header">
          <motion.h2
            className="services-title-ar"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            خدماتنا
          </motion.h2>
          <motion.div
            className="services-divider"
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
          />
          <motion.p
            className="services-title-en"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            OUR SERVICES
          </motion.p>
        </div>

        <div className="services-grid">
          {SERVICES.map((service, i) => (
            <motion.div
              key={service.id}
              initial={{ opacity: 0, y: 36 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ delay: (i % 3) * 0.1, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            >
              <TiltCard
                className="service-card"
                onClick={() => navigate(`/submit/${service.id}?step=1`)}
              >
                <div className="service-card-glare" />
                <span className="service-card-num">{String(i + 1).padStart(2, '0')}</span>

                <div className="service-card-icon">
                  <svg width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <path d={service.icon} />
                  </svg>
                </div>

                <h3 className="service-card-title-ar">{service.titleAr}</h3>
                <p className="service-card-title-en">{service.titleEn}</p>
                <p className={`service-card-desc ${isAr ? 'service-card-desc-ar' : ''}`}>
                  {isAr ? service.descAr : service.descEn}
                </p>

                <div className="service-card-cta">
                  <span>{isAr ? 'ابدأ الطلب' : 'Start request'}</span>
                  <ArrowRight size={14} className="service-card-cta-arrow" />
                </div>
              </TiltCard>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── About + counters ── */}
      <section className="landing-about">
        <div className="about-container">
          <motion.div
            className="about-text-col"
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <h2 className="about-text-header-ar">قسم العمليات</h2>
            <div className="about-divider" />
            <p className="about-text-header-en">OPERATIONS DEPARTMENT</p>

            <p className="about-text-body about-text-body-ar">
              يُعد قسم العمليات في نادي الفجيرة للفنون القتالية العمود الفقري للنادي، حيث يدير الخدمات اللوجستية
              والأسطول والمرافق لضمان سير العمل بكفاءة. نسعى لتقديم أعلى مستويات الخدمة والدعم لجميع الأعضاء
              والموظفين والزوار.
            </p>
            <p className="about-text-body">
              The Operations Department at Fujairah Martial Arts Club is the backbone of the organization,
              managing logistics, fleet, and facilities to ensure smooth daily operations. We are committed
              to delivering the highest levels of service and support to all members, staff, and visitors.
            </p>
          </motion.div>

          <motion.div
            className="about-stats"
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="about-stat">
              <span className="about-stat-value"><CountUp to={9} suffix="+" /></span>
              <span className="about-stat-label">{isAr ? 'رياضة قتالية' : 'Martial Disciplines'}</span>
            </div>
            <div className="about-stat">
              <span className="about-stat-value"><CountUp to={2} /></span>
              <span className="about-stat-label">{isAr ? 'فرع — الفجيرة ودبا' : 'Branches — Fujairah & Dibba'}</span>
            </div>
            <div className="about-stat">
              <span className="about-stat-value"><CountUp to={6} /></span>
              <span className="about-stat-label">{isAr ? 'قنوات خدمة' : 'Service Channels'}</span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="landing-footer">
        <div className="footer-inner">
          <img src="/fmac-logo-new.png" alt="FMAC" className="footer-logo" />
          <p className="footer-text-ar">نادي الفجيرة للفنون القتالية</p>
          <p className="footer-text-en">FUJAIRAH MARTIAL ARTS CLUB — OPERATIONS</p>
          <div className="footer-rule" />
          <p className="footer-text-copy">© 2026 All Rights Reserved</p>
        </div>
      </footer>
    </div>
  );
}
