import React, { useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import LanguageToggle from './shared/LanguageToggle';
import ThemeToggle from './shared/ThemeToggle';
import { useLanguage } from '../contexts/LanguageContext';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import './LoginPage.css';
import { auth, db } from '../firebase';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { doc, setDoc, getDoc, getDocs, serverTimestamp, collection, addDoc, query, where } from 'firebase/firestore';
import { JOB_TITLES, MASTER_ADMIN_EMAIL } from '../utils/jobTitlePermissions';

/* ── Geometric Pattern SVG ── */
function LoginPatternSVG() {
  const size = 120;
  const half = size / 2;
  const patternPaths = [];
  for (let row = -3; row < 8; row++) {
    for (let col = -3; col < 8; col++) {
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
    <svg viewBox="-400 -400 1200 1200" xmlns="http://www.w3.org/2000/svg">
      {patternPaths}
    </svg>
  );
}

function CornerOrnament() {
  return (
    <svg viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M0 0 L24 0 L24 3 L3 3 L3 24 L0 24 Z" fill="currentColor" />
      <path d="M10 0 L10 10 L0 10" stroke="currentColor" strokeWidth="0.5" fill="none" />
      <path d="M16 0 Q16 16 0 16" stroke="currentColor" strokeWidth="0.5" fill="none" />
      <circle cx="8" cy="8" r="1.5" fill="currentColor" opacity="0.5" />
    </svg>
  );
}

function LoginMandala({ size = 200 }) {
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
          <circle cx="150" cy="150" r="130" fill="none" stroke="var(--login-accent-gold)" strokeWidth="0.5" className="hud-stroke-subtle" opacity="0.12" />
          <circle cx="150" cy="150" r="140" fill="none" stroke="var(--login-accent-gold)" strokeWidth="0.5" className="hud-stroke" strokeDasharray="3, 10" opacity="0.18" />
          
          <g className="fmac-logo-hud-outer">
            <polygon points={star1} fill="none" stroke="var(--login-accent-gold)" strokeWidth="0.5" className="hud-stroke-subtle" opacity="0.1" />
          </g>
          <g className="fmac-logo-hud-inner">
            <polygon points={star2} fill="none" stroke="var(--login-accent-gold)" strokeWidth="0.5" className="hud-stroke-subtle" opacity="0.1" />
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
            fill="var(--logo-f-c, var(--login-text-primary))"
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
            fill="var(--logo-f-c, var(--login-text-primary))"
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
            fill="var(--logo-m-a, var(--login-accent-red))"
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
            fill="var(--logo-m-a, var(--login-accent-red))"
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

function BottomOrnament() {
  return (
    <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <polygon points="20,5 23,17 35,20 23,23 20,35 17,23 5,20 17,17"
        fill="none" stroke="currentColor" strokeWidth="0.5" />
      <polygon points="20,10 25,15 30,20 25,25 20,30 15,25 10,20 15,15"
        fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.6" />
      <circle cx="20" cy="20" r="3" fill="currentColor" opacity="0.3" />
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════ */
export default function LoginPage() {
  const navigate = useNavigate();
  const { t, lang } = useLanguage();
  const isAr = lang === 'ar';
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  const switchMode = (next) => {
    setMode(next);
    setError('');
    setInfo('');
    setDisplayName('');
    setJobTitle('');
    setPassword('');
  };

  const handleLogin = async () => {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    const userDoc = await getDoc(doc(db, 'users', credential.user.uid));

    // Master admin bypasses all status checks
    if (credential.user.email === MASTER_ADMIN_EMAIL) {
      navigate('/dashboard');
      return;
    }

    if (!userDoc.exists()) {
      await signOut(auth);
      setError(isAr ? 'لم يتم العثور على ملف تعريفي. تواصل مع الإدارة.' : 'No profile found. Contact your administrator.');
      return;
    }

    const data = userDoc.data();

    if (data.status === 'pending') {
      await signOut(auth);
      setError(isAr
        ? 'طلبك قيد المراجعة. يرجى الانتظار حتى تتم الموافقة.'
        : 'Your request is under review. Please wait for admin approval.');
      return;
    }

    if (data.status === 'rejected') {
      await signOut(auth);
      setError(isAr
        ? 'تم رفض طلبك. يرجى التواصل مع الإدارة.'
        : 'Your request has been rejected. Please contact the administration.');
      return;
    }

    // Allow both new format (approved: true) and legacy format (status: 'active')
    const isApproved = data.approved === true || data.status === 'active';
    if (!isApproved) {
      await signOut(auth);
      setError(isAr ? 'حسابك غير مفعل.' : 'Your account is not activated.');
      return;
    }

    navigate('/dashboard');
  };

  const handleSignUp = async () => {
    if (!jobTitle) {
      setError(isAr ? 'يرجى اختيار المسمى الوظيفي.' : 'Please select a job title.');
      return;
    }

    const credential = await createUserWithEmailAndPassword(auth, email, password);
    const newUser = credential.user;

    await setDoc(doc(db, 'users', newUser.uid), {
      uid: newUser.uid,
      email,
      displayName: displayName || email.split('@')[0],
      jobTitle,
      role: null,
      status: 'pending',
      approved: false,
      approvedBy: null,
      approvedAt: null,
      permissions: null,
      createdAt: serverTimestamp(),
      lastLogin: null,
    });

    // Sign out immediately — user must wait for approval
    await signOut(auth);

    setInfo(
      isAr
        ? 'تم تقديم طلبك بنجاح. في انتظار موافقة المدير.'
        : 'Your request has been submitted. Awaiting admin approval.'
    );
    setError('');
    switchMode('login');
  };

  const handleForgotRequest = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError(isAr ? 'يرجى إدخال البريد الإلكتروني.' : 'Please enter your email address.');
      return;
    }

    // Validate that the email is actually registered
    const usersSnap = await getDocs(query(collection(db, 'users'), where('email', '==', normalizedEmail)));
    if (usersSnap.empty) {
      setError(isAr
        ? 'هذا البريد الإلكتروني غير مسجل في النظام.'
        : 'This email address is not registered in the system.');
      return;
    }

    // Check for an existing pending request to avoid duplicates
    const existingSnap = await getDocs(query(
      collection(db, 'password_reset_requests'),
      where('email', '==', normalizedEmail),
      where('status', '==', 'pending')
    ));
    if (!existingSnap.empty) {
      setInfo(isAr
        ? 'لديك طلب معلق بالفعل. يرجى انتظار مراجعة المدير.'
        : 'You already have a pending request. Please wait for admin review.');
      setError('');
      switchMode('login');
      return;
    }

    const userDoc = usersSnap.docs[0];
    await addDoc(collection(db, 'password_reset_requests'), {
      email: normalizedEmail,
      uid: userDoc.id,
      displayName: userDoc.data().displayName || '',
      status: 'pending',
      requestedAt: serverTimestamp(),
    });

    setInfo(isAr
      ? 'تم إرسال طلبك بنجاح. سيقوم المدير بمراجعته وستتمكن من تسجيل الدخول بكلمة مرور مؤقتة قريباً.'
      : 'Your request has been submitted. An admin will review it and you will be able to sign in with a temporary password shortly.');
    setError('');
    switchMode('login');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setInfo('');
    try {
      if (mode === 'signup') {
        await handleSignUp();
      } else if (mode === 'forgot') {
        await handleForgotRequest();
      } else {
        await handleLogin();
      }
    } catch (err) {
      setError(err.message || (mode === 'signup'
        ? t('Registration failed.', 'فشل إنشاء الحساب.')
        : t('Authentication failed.', 'فشل التحقق من الهوية.')));
    } finally {
      setLoading(false);
    }
  };

  const goToPortal = () => {
    window.history.pushState({}, '', '/');
    window.location.reload();
  };

  return (
    <div className="login-redesign">

      {/* ══ LEFT COLUMN — decorative ════════════════ */}
      <motion.div
        className="login-left-col"
        initial={{ opacity: 0, x: -40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="login-left-pattern"><LoginPatternSVG /></div>
        <div className="login-left-glow" />
        <div className="login-corner tl"><CornerOrnament /></div>
        <div className="login-corner tr"><CornerOrnament /></div>
        <div className="login-corner bl"><CornerOrnament /></div>
        <div className="login-corner br"><CornerOrnament /></div>
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          style={{ position: 'relative', zIndex: 5 }}
        >
          <LoginMandala size={200} />
        </motion.div>
        <button className="login-back-link" onClick={goToPortal}>
          <ArrowLeft size={14} />
          <span>{isAr ? 'العودة للبوابة' : 'Back to Portal'}</span>
        </button>
      </motion.div>

      {/* ══ RIGHT COLUMN — login form ══════════════ */}
      <motion.div
        className="login-right-col"
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="login-noise" />

        <div className="login-top-actions">
          <LanguageToggle />
          <ThemeToggle />
        </div>

        <div className="login-form-container">
          <div className="login-brand-row">
            <img src="/fmac-logo-new.png" alt="FMAC" className="login-brand-logo" />
            <div className="login-brand-divider" />
            <span className="login-brand-text">CONSOLE</span>
          </div>

          <h1 className="login-heading-ar">
            {mode === 'signup' ? 'إنشاء حساب جديد' : mode === 'forgot' ? 'استعادة كلمة المرور' : 'دخول الموظفين'}
          </h1>
          <p className="login-heading-en">
            {mode === 'signup' ? 'NEW STAFF ACCOUNT' : mode === 'forgot' ? 'PASSWORD RECOVERY' : 'STAFF AUTHENTICATION'}
          </p>
          <div className="login-gold-line" />

          {info && (
            <motion.div
              className="login-info-msg"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                background: 'rgba(16,185,129,0.08)',
                border: '1px solid rgba(16,185,129,0.3)',
                color: '#10b981',
                borderRadius: '8px',
                padding: '12px 16px',
                fontSize: '0.85rem',
                marginBottom: '16px',
                lineHeight: 1.6,
              }}
            >
              {info}
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="login-form">
            {mode === 'signup' && (
              <div className="login-field">
                <label className="login-label">
                  {isAr ? 'الاسم الكامل' : 'Display Name'}
                </label>
                <input
                  type="text"
                  className="login-input"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={isAr ? 'اسمك' : 'Your Name'}
                  required
                />
              </div>
            )}

            {mode === 'forgot' && (
              <p style={{ fontSize: '0.82rem', color: 'var(--theme-text-muted)', marginBottom: '12px', lineHeight: 1.6 }}>
                {isAr
                  ? 'أدخل بريدك الإلكتروني وسيتواصل معك المدير بعد مراجعة طلبك.'
                  : 'Enter your email address and an admin will review your request and send you a reset link.'}
              </p>
            )}

            <div className="login-field">
              <label className="login-label">
                {isAr ? 'البريد الإلكتروني' : 'Email Address'}
              </label>
              <input
                type="email"
                className="login-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="staff@fmac.ae"
                required
              />
            </div>

            {mode !== 'forgot' && (
              <div className="login-field">
                <label className="login-label">
                  {isAr ? 'كلمة المرور' : 'Password'}
                </label>
                <input
                  type="password"
                  className="login-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
            )}

            {mode === 'signup' && (
              <div className="login-field">
                <label className="login-label">
                  {isAr ? 'المسمى الوظيفي / Job Title' : 'Job Title / المسمى الوظيفي'}
                </label>
                <select
                  className="login-input"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  required
                  style={{ cursor: 'pointer' }}
                >
                  <option value="">{isAr ? '— اختر المسمى الوظيفي —' : '— Select Job Title —'}</option>
                  {JOB_TITLES.map(title => (
                    <option key={title} value={title}>{title}</option>
                  ))}
                </select>
              </div>
            )}

            <button type="submit" className="login-submit-btn" disabled={loading}>
              {loading ? (
                <div className="login-progress-bar">
                  <div className="login-progress-fill" />
                </div>
              ) : mode === 'signup' ? (
                isAr ? 'تقديم الطلب / SUBMIT REQUEST' : 'SUBMIT REQUEST / تقديم الطلب'
              ) : mode === 'forgot' ? (
                isAr ? 'إرسال الطلب / SEND REQUEST' : 'SEND REQUEST / إرسال الطلب'
              ) : (
                isAr ? 'دخول / ACCESS CONSOLE' : 'ACCESS CONSOLE / دخول'
              )}
            </button>

            {error && (
              <motion.p
                className="login-error-msg"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
              >
                {error}
              </motion.p>
            )}

            {mode === 'login' && (
              <button
                type="button"
                className="login-switch-link"
                onClick={() => switchMode('forgot')}
                style={{ fontSize: '0.78rem', opacity: 0.65, marginTop: '2px' }}
              >
                {isAr ? 'نسيت كلمة المرور؟ / Forgot Password?' : 'Forgot Password? / نسيت كلمة المرور؟'}
              </button>
            )}

            <button
              type="button"
              className="login-switch-link"
              onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
            >
              {mode === 'login'
                ? (isAr ? 'إنشاء حساب / Create Account' : 'Create Account / إنشاء حساب')
                : (isAr ? 'العودة لتسجيل الدخول / Sign In' : 'Sign In / تسجيل الدخول')}
            </button>
          </form>

          <div className="login-bottom-ornament">
            <BottomOrnament />
          </div>
        </div>
      </motion.div>
    </div>
  );
}
