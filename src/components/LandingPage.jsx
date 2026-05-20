import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import ThreeScene from './shared/ThreeScene';
import './LoginPage.css';
import { useLanguage } from '../contexts/LanguageContext';

const gsap = window.gsap;

export default function LandingPage({ onNavigate }) {
  const { t } = useLanguage();
  const leftPanelRef = useRef(null);
  const logoContainerRef = useRef(null);

  // 2. GSAP Animations & Parallax
  useEffect(() => {
    if (!gsap) return;

    // Entrance
    const tl = gsap.timeline();
    tl.from(".letter-F", { duration: 1.2, y: 60, rotateY: -25, ease: "power3.out" }, 0.1)
      .from(".letter-M", { duration: 1.2, y: 60, rotateY: -15, ease: "power3.out" }, 0.25)
      .from(".letter-A", { duration: 1.2, y: 60, rotateY: 15,  ease: "power3.out" }, 0.4)
      .from(".letter-C", { duration: 1.2, y: 60, rotateY: 25,  ease: "power3.out" }, 0.55);

    // Idle Float
    gsap.to(".letter-F", { y: -12, duration: 3.5, yoyo: true, repeat: -1, ease: "sine.inOut", delay: 0 });
    gsap.to(".letter-M", { y: -18, duration: 4.2, yoyo: true, repeat: -1, ease: "sine.inOut", delay: 0.6 });
    gsap.to(".letter-A", { y: -14, duration: 3.8, yoyo: true, repeat: -1, ease: "sine.inOut", delay: 1.1 });
    gsap.to(".letter-C", { y: -10, duration: 4.6, yoyo: true, repeat: -1, ease: "sine.inOut", delay: 0.3 });

    // Mouse Parallax
    const handleMouseMove = (e) => {
      const rect = leftPanelRef.current.getBoundingClientRect();
      const cx = (e.clientX - rect.left) / rect.width - 0.5;
      const cy = (e.clientY - rect.top) / rect.height - 0.5;
      
      gsap.to(logoContainerRef.current, {
        rotateY: cx * 12,
        rotateX: -cy * 8,
        duration: 0.8,
        ease: 'power2.out'
      });
    };

    const handleMouseLeave = () => {
      gsap.to(logoContainerRef.current, { rotateY: 0, rotateX: 0, duration: 1.2, ease: 'power3.out' });
    };

    const leftPanel = leftPanelRef.current;
    leftPanel.addEventListener('mousemove', handleMouseMove);
    leftPanel.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      leftPanel.removeEventListener('mousemove', handleMouseMove);
      leftPanel.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  return (
    <div className="login-page-container">
      {/* LEFT PANEL (55%) */}
      <div className="login-panel-left" id="left-panel" ref={leftPanelRef}>
        <ThreeScene theme="landing" />
        <div className="logo-perspective" style={{ zIndex: 10, position: 'relative' }}>
          <div className="logo-container" id="logo-container" ref={logoContainerRef}>
            <span className="letter letter-F">F</span>
            <span className="letter letter-M">M</span>
            <span className="letter letter-A">A</span>
            <span className="letter letter-C">C</span>
          </div>
        </div>
        <div className="watermark-text" style={{ zIndex: 10, position: 'relative' }}>LOGISTICS HUB CONSOLE</div>
      </div>

      {/* DIVIDER */}
      <div className="panel-divider">
        <div className="divider-diamond"></div>
      </div>

      {/* RIGHT PANEL (45%) */}
      <div className="login-panel-right">
        <div className="noise-overlay"></div>
        <div className="login-form-wrapper">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <div className="form-branding-row">
              <img src="/fmac-logo-new.png" alt="FMAC" className="mini-logo-img" />
              <div className="branding-divider"></div>
              <div className="branding-text">OPERATIONS</div>
            </div>
            
            <header className="form-header" style={{ marginBottom: '40px' }}>
              <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>{t('WELCOME TO FMAC OPERATIONS', 'مرحباً بكم في عمليات FMAC')}</h1>
              <p style={{ color: 'var(--theme-accent)', fontWeight: 'bold', marginBottom: '16px' }}>{t('Fujairah Martial Arts Club — Operations Department', 'نادي فجيرة للفنون القتالية — قسم العمليات')}</p>
              <p style={{ color: 'var(--theme-text-muted)', fontSize: '1rem', lineHeight: '1.5' }}>{t('Your unified hub for Logistics, Fleet Management, and Support Services.', 'مركزك الموحد للوجستيات وإدارة الأسطول وخدمات الدعم.')}</p>
            </header>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '20px' }}>
              <button 
                className="login-btn" 
                onClick={() => onNavigate('/login')}
                style={{ width: '100%', padding: '16px', fontSize: '1rem' }}
              >
                {t('STAFF LOGIN', 'تسجيل دخول الموظفين')}
              </button>
              
              <button 
                onClick={() => onNavigate('/help')}
                style={{ 
                  width: '100%', 
                  padding: '16px', 
                  fontSize: '1rem',
                  background: 'transparent',
                  color: 'var(--theme-text-main)',
                  border: '1px solid var(--theme-border)',
                  borderRadius: '8px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  textTransform: 'uppercase',
                  letterSpacing: '1px'
                }}
                onMouseOver={(e) => e.currentTarget.style.borderColor = 'var(--theme-border-strong)'}
                onMouseOut={(e) => e.currentTarget.style.borderColor = 'var(--theme-border)'}
              >
                {t('SUBMIT A REQUEST', 'تقديم طلب')}
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
