import React from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { ChevronDown, ArrowRight } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';

import { useTheme } from '../../../contexts/ThemeContext';
import LanguageToggle from '../../shared/LanguageToggle';
import ThemeToggle from '../../shared/ThemeToggle';
import FMACLogo from '../../FMACLogo';
import './HelpLanding.css';

/* ── SVG Icon Paths (same as before) ────────────────── */
const SERVICE_ICONS = {
  inquiry:     'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z',
  complaint:   'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
  suggestion:  'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z',
  meeting:     'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
  call:        'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z',
  maintenance: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
};

/* ── Geometric Pattern SVG ──────────────────────────── */
function IslamicPatternSVG() {
  const size = 120;
  const half = size / 2;
  const patternPaths = [];
  
  for (let row = -5; row < 10; row++) {
    for (let col = -5; col < 10; col++) {
      const cx = col * size + (row % 2 === 0 ? 0 : half);
      const cy = row * size;
      const r = 40;
      
      const points1 = [];
      const points2 = [];
      for (let i = 0; i < 4; i++) {
        const angle1 = (i * 90) * Math.PI / 180;
        const angle2 = (i * 90 + 45) * Math.PI / 180;
        points1.push(`${cx + r * Math.cos(angle1)},${cy + r * Math.sin(angle1)}`);
        points2.push(`${cx + r * Math.cos(angle2)},${cy + r * Math.sin(angle2)}`);
      }
      
      patternPaths.push(
        <g key={`star-${row}-${col}`}>
          <polygon points={points1.join(' ')} fill="none" stroke="rgba(201,168,76,0.04)" strokeWidth="0.5" />
          <polygon points={points2.join(' ')} fill="none" stroke="rgba(201,168,76,0.04)" strokeWidth="0.5" />
          <circle cx={cx} cy={cy} r={3} fill="none" stroke="rgba(201,168,76,0.03)" strokeWidth="0.5" />
        </g>
      );
    }
  }

  return (
    <svg viewBox="-600 -600 1800 1800" xmlns="http://www.w3.org/2000/svg">
      {patternPaths}
    </svg>
  );
}

/* ── Corner Ornament SVG ───────────────────────────── */
function CornerOrnament() {
  return (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M0 0 L30 0 L30 4 L4 4 L4 30 L0 30 Z" fill="currentColor" />
      <path d="M12 0 L12 12 L0 12" stroke="currentColor" strokeWidth="0.5" fill="none" />
      <path d="M20 0 Q20 20 0 20" stroke="currentColor" strokeWidth="0.5" fill="none" />
      <path d="M5 40 Q5 5 40 5" stroke="currentColor" strokeWidth="0.5" fill="none" opacity="0.6" />
      <circle cx="10" cy="10" r="2" fill="currentColor" opacity="0.5" />
    </svg>
  );
}

/* ── Card Corner Ornament (small) ──────────────────── */
function CardOrnament() {
  return (
    <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <polygon points="20,5 23,17 35,20 23,23 20,35 17,23 5,20 17,17" 
        fill="none" stroke="currentColor" strokeWidth="0.5" />
      <polygon points="20,10 25,15 30,20 25,25 20,30 15,25 10,20 15,15" 
        fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.6" />
    </svg>
  );
}

/* ── Elite FMAC Animated Logo Component ────────────── */
function FmacAnimatedLogo({ size = 280 }) {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const springConfig = { damping: 25, stiffness: 200, mass: 0.5 };
  const rotateX = useSpring(useTransform(mouseY, [-size / 2, size / 2], [12, -12]), springConfig);
  const rotateY = useSpring(useTransform(mouseX, [-size / 2, size / 2], [-12, 12]), springConfig);

  const bgX = useSpring(useTransform(mouseX, [-size / 2, size / 2], [-4, 4]), springConfig);
  const bgY = useSpring(useTransform(mouseY, [-size / 2, size / 2], [-4, 4]), springConfig);

  const fcX = useSpring(useTransform(mouseX, [-size / 2, size / 2], [-10, 10]), springConfig);
  const fcY = useSpring(useTransform(mouseY, [-size / 2, size / 2], [-10, 10]), springConfig);

  const maX = useSpring(useTransform(mouseX, [-size / 2, size / 2], [-18, 18]), springConfig);
  const maY = useSpring(useTransform(mouseY, [-size / 2, size / 2], [-18, 18]), springConfig);

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    mouseX.set(x);
    mouseY.set(y);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  const star1 = "79,79 221,79 221,221 79,221";
  const star2 = "150,50 250,150 150,250 50,150";

  return (
    <motion.div
      className="fmac-logo-container"
      style={{
        width: size,
        height: size,
        rotateX,
        rotateY,
        transformStyle: 'preserve-3d',
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      whileHover={{ scale: 1.04 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="fmac-logo-glow" />

      <svg viewBox="0 0 300 300" className="fmac-logo-svg">
        <motion.g style={{ x: bgX, y: bgY, transformStyle: 'preserve-3d' }}>
          <circle cx="150" cy="150" r="130" fill="none" stroke="var(--land-accent-gold)" strokeWidth="0.5" className="hud-stroke-subtle" opacity="0.12" />
          <circle cx="150" cy="150" r="140" fill="none" stroke="var(--land-accent-gold)" strokeWidth="0.5" className="hud-stroke" strokeDasharray="3, 10" opacity="0.18" />
          
          <g className="fmac-logo-hud-outer">
            <polygon points={star1} fill="none" stroke="var(--land-accent-gold)" strokeWidth="0.5" className="hud-stroke-subtle" opacity="0.1" />
          </g>
          <g className="fmac-logo-hud-inner">
            <polygon points={star2} fill="none" stroke="var(--land-accent-gold)" strokeWidth="0.5" className="hud-stroke-subtle" opacity="0.1" />
          </g>
        </motion.g>

        <motion.g style={{ x: fcX, y: fcY, transformStyle: 'preserve-3d' }}>
          <motion.text
            x="75"
            y="155"
            fontFamily="'Barlow Condensed', sans-serif"
            fontWeight="900"
            fontStyle="italic"
            fontSize="135"
            textAnchor="middle"
            dominantBaseline="central"
            fill="var(--logo-f-c, var(--land-text-primary))"
            initial={{ x: -60, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.15))' }}
          >
            F
          </motion.text>

          <motion.text
            x="225"
            y="155"
            fontFamily="'Barlow Condensed', sans-serif"
            fontWeight="900"
            fontStyle="italic"
            fontSize="135"
            textAnchor="middle"
            dominantBaseline="central"
            fill="var(--logo-f-c, var(--land-text-primary))"
            initial={{ x: 60, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
            style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.15))' }}
          >
            C
          </motion.text>
        </motion.g>

        <motion.g style={{ x: maX, y: maY, transformStyle: 'preserve-3d' }}>
          <motion.text
            x="150"
            y="95"
            fontFamily="'Barlow Condensed', sans-serif"
            fontWeight="900"
            fontStyle="italic"
            fontSize="115"
            textAnchor="middle"
            dominantBaseline="central"
            fill="var(--logo-m-a, var(--land-accent-red))"
            initial={{ y: -60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            style={{ filter: 'drop-shadow(0 8px 20px rgba(192, 57, 43, 0.3))' }}
          >
            M
          </motion.text>

          <motion.text
            x="150"
            y="205"
            fontFamily="'Barlow Condensed', sans-serif"
            fontWeight="900"
            fontStyle="italic"
            fontSize="100"
            textAnchor="middle"
            dominantBaseline="central"
            fill="var(--logo-m-a, var(--land-accent-red))"
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
            style={{ filter: 'drop-shadow(0 8px 20px rgba(192, 57, 43, 0.3))' }}
          >
            A
          </motion.text>
        </motion.g>
      </svg>
    </motion.div>
  );
}

function DecorativeStar() {
  const cx = 100;
  const cy = 100;
  const r = 80;
  const points1 = [];
  const points2 = [];
  for (let i = 0; i < 4; i++) {
    const a1 = (i * 90) * Math.PI / 180;
    const a2 = (i * 90 + 45) * Math.PI / 180;
    points1.push(`${cx + r * Math.cos(a1)},${cy + r * Math.sin(a1)}`);
    points2.push(`${cx + r * Math.cos(a2)},${cy + r * Math.sin(a2)}`);
  }
  
  return (
    <svg viewBox="0 0 200 200" className="about-star-svg" fill="none">
      <polygon points={points1.join(' ')} stroke="currentColor" strokeWidth="1" />
      <polygon points={points2.join(' ')} stroke="currentColor" strokeWidth="1" />
      <circle cx={cx} cy={cy} r={60} stroke="currentColor" strokeWidth="0.5" />
      <circle cx={cx} cy={cy} r={40} stroke="currentColor" strokeWidth="0.5" />
      <circle cx={cx} cy={cy} r={8} fill="currentColor" opacity="0.3" />
    </svg>
  );
}

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: { 
    opacity: 1, y: 0,
    transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] },
  },
};

const cardContainerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1, y: 0,
    transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] },
  },
};

import { useNavigate } from 'react-router-dom';

export default function HelpLanding() {
  const navigate = useNavigate();
  const { t, lang } = useLanguage();
  const isAr = lang === 'ar';
  

  const SERVICES = [
    { 
      id: 'inquiry',
      titleAr: 'استفسار عام',
      titleEn: 'General Inquiry',
      descAr: 'اطرح سؤالاً عن برامجنا أو جداولنا أو رسومنا.',
      descEn: 'Ask a question about our programs, schedules, or fees.',
      icon: SERVICE_ICONS.inquiry,
    },
    { 
      id: 'complaint',
      titleAr: 'تقديم شكوى',
      titleEn: 'File a Complaint',
      descAr: 'أبلغ عن مشكلة بأمان. نأخذ جميع الملاحظات بجدية.',
      descEn: 'Report an issue securely. We take all feedback seriously.',
      icon: SERVICE_ICONS.complaint,
    },
    { 
      id: 'suggestion',
      titleAr: 'تقديم اقتراح',
      titleEn: 'Make a Suggestion',
      descAr: 'شارك أفكارك لمساعدتنا في تحسين خدماتنا.',
      descEn: 'Share your ideas to help us improve our services.',
      icon: SERVICE_ICONS.suggestion,
    },
    { 
      id: 'meeting',
      titleAr: 'طلب اجتماع',
      titleEn: 'Request a Meeting',
      descAr: 'جدوِل اجتماعاً رسمياً مع الإدارة أو المدربين.',
      descEn: 'Schedule a formal meeting with management or coaches.',
      icon: SERVICE_ICONS.meeting,
    },
    { 
      id: 'call',
      titleAr: 'طلب مكالمة',
      titleEn: 'Request a Call',
      descAr: 'اترك رقمك وسنتصل بك في الوقت المناسب.',
      descEn: 'Leave your number and we will call you back.',
      icon: SERVICE_ICONS.call,
    },
    { 
      id: 'maintenance',
      titleAr: 'مشكلة صيانة',
      titleEn: 'Maintenance Issue',
      descAr: 'أبلغ عن مشكلة في المرفق أو وسائل النقل.',
      descEn: 'Report a facility or transport issue requiring attention.',
      icon: SERVICE_ICONS.maintenance,
    },
  ];

  const scrollToServices = () =>
    document.getElementById('landing-services')?.scrollIntoView({ behavior: 'smooth' });

  return (
    <div className="fmac-landing">
      
      <div className="landing-geo-pattern">
        <IslamicPatternSVG />
      </div>

      <div className="landing-corner-ornament top-left"><CornerOrnament /></div>
      <div className="landing-corner-ornament top-right"><CornerOrnament /></div>
      <div className="landing-corner-ornament bottom-left"><CornerOrnament /></div>
      <div className="landing-corner-ornament bottom-right"><CornerOrnament /></div>

      <nav className="landing-nav">
        <img src="/fmac-logo-new.png" alt="FMAC" className="landing-nav-logo" />
        <div className="landing-nav-actions">
          <LanguageToggle />
          <ThemeToggle />
          <button
            className="landing-nav-staff-btn"
            onClick={() => navigate('/login')}
          >
            {isAr ? 'دخول الموظفين' : 'Staff Login'}
          </button>
        </div>
      </nav>

      <section className="landing-hero">
        <div className="landing-hero-glow" />
        
        <motion.div
          className="landing-hero-content"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.div
            className="fmac-logo-container"
            variants={itemVariants}
          >
            <FMACLogo size="md" />
          </motion.div>

          <motion.h1 className="hero-text-arabic" variants={itemVariants}>
            مركز عمليات نادي الفجيرة للفنون القتالية
          </motion.h1>

          <motion.div className="hero-divider" variants={itemVariants} />

          <motion.p className="hero-text-english" variants={itemVariants}>
            FMAC OPERATIONS SUITE
          </motion.p>

          <motion.p 
            className={`hero-subtitle ${isAr ? 'hero-subtitle-ar' : ''}`}
            variants={itemVariants}
          >
            {isAr
              ? 'تقديم الطلبات والدعم والوصول إلى لوحة التحكم الموحدة'
              : 'Submit requests, get support, access the unified console'}
          </motion.p>

          <motion.div className="hero-buttons" variants={itemVariants}>
            <motion.button
              className={`hero-btn-primary ${isAr ? 'hero-btn-primary-ar' : ''}`}
              onClick={scrollToServices}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              {isAr ? 'تقديم طلب' : 'Submit a Request'}
            </motion.button>

            <motion.button
              className={`hero-btn-secondary ${isAr ? 'hero-btn-secondary-ar' : ''}`}
              onClick={() => navigate('/login')}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              {isAr ? 'دخول الموظفين' : 'Staff Login'}
            </motion.button>
          </motion.div>
        </motion.div>

        <div className="landing-scroll-indicator" onClick={scrollToServices}>
          <span className={`scroll-indicator-text ${isAr ? 'scroll-indicator-text-ar' : 'scroll-indicator-text-en'}`}>
            {isAr ? 'اكتشف المزيد' : 'Discover'}
          </span>
          <ChevronDown className="scroll-indicator-chevron" size={20} />
        </div>
      </section>

      <section className="landing-services" id="landing-services">
        <div className="services-header">
          <motion.h2
            className="services-title-ar"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            خدماتنا
          </motion.h2>
          <motion.div
            className="services-divider"
            initial={{ opacity: 0, scaleX: 0 }}
            whileInView={{ opacity: 1, scaleX: 1 }}
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

        <motion.div
          className="services-grid"
          variants={cardContainerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-60px" }}
        >
          {SERVICES.map((service) => (
            <motion.div
              key={service.id}
              className="service-card"
              variants={cardVariants}
              whileHover={{ y: -4 }}
              onClick={() => navigate(`/submit/${service.id}?step=1`)}
            >
              <div className="service-card-ornament"><CardOrnament /></div>

              <div className="service-card-icon">
                <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <path d={service.icon} />
                </svg>
              </div>

              {/* Text */}
              <h3 className="service-card-title-ar">{service.titleAr}</h3>
              <p className="service-card-title-en">{service.titleEn}</p>
              <p className={`service-card-desc ${isAr ? 'service-card-desc-ar' : ''}`}>
                {isAr ? service.descAr : service.descEn}
              </p>

              {/* Hover arrow */}
              <div className="service-card-arrow">
                <ArrowRight size={16} />
              </div>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ══ ABOUT SECTION ══════════════════════════ */}
      <section className="landing-about">
        <div className="about-container">
          <motion.div
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
            className="about-decorative"
            initial={{ opacity: 0, scale: 0.8 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            <DecorativeStar />
          </motion.div>
        </div>
      </section>

      {/* ══ FOOTER ═════════════════════════════════ */}
      <footer className="landing-footer">
        <img src="/fmac-logo-new.png" alt="FMAC" className="footer-logo" />
        <p className="footer-text-ar">نادي الفجيرة للفنون القتالية</p>
        <p className="footer-text-copy">© 2026 All Rights Reserved</p>
      </footer>
    </div>
  );
}
