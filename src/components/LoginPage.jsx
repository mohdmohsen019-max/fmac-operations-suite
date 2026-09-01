/**
 * Staff login — the door to the console.
 * Presentation matches the suite's own frame language: black #0a0a0a frame,
 * one rounded bone/white split panel, Inter + ink type, brand-red accents.
 * All auth flows (login / signup→pending / forgot→reset request) unchanged.
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import LanguageToggle from './shared/LanguageToggle';
import ThemeToggle from './shared/ThemeToggle';
import CustomSelect from './CustomSelect';
import { useLanguage } from '../contexts/LanguageContext';
import { useNavigate } from 'react-router-dom';
import './LoginPage.css';
import portalArtwork from '../assets/fmac-portal/fujairah-city-portal.webp';
import portalLogo from '../assets/fmac-portal/fmac-ops-mark-ivory.png';
import { auth, db } from '../firebase';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc, serverTimestamp, collection, addDoc } from 'firebase/firestore';
import { JOB_TITLES, MASTER_ADMIN_EMAIL } from '../utils/jobTitlePermissions';
import { applyAuthPersistence, REMEMBERED_SESSION_DAYS, saveAuthSession } from '../services/authSession';

const MODE_COPY = {
  login:  { ar: 'دخول الموظفين',      en: 'Staff sign in' },
  signup: { ar: 'إنشاء حساب جديد',    en: 'New staff account' },
  forgot: { ar: 'استعادة كلمة المرور', en: 'Password recovery' },
};

const FMAC_EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@fmac[.]fujairah[.]ae$/i;

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
  const [rememberDevice, setRememberDevice] = useState(true);

  const switchMode = (next) => {
    setMode(next);
    setError('');
    setInfo('');
    setDisplayName('');
    setJobTitle('');
    setPassword('');
  };

  const handleLogin = async () => {
    await applyAuthPersistence(auth, rememberDevice);
    const credential = await signInWithEmailAndPassword(auth, email, password);
    const userDoc = await getDoc(doc(db, 'users', credential.user.uid));

    // Record last login (best-effort — never block sign-in on this write).
    const stampLogin = () => updateDoc(doc(db, 'users', credential.user.uid), { lastLogin: serverTimestamp() }).catch(() => {});

    // Master admin bypasses all status checks
    if (credential.user.email === MASTER_ADMIN_EMAIL) {
      saveAuthSession(credential.user.uid, rememberDevice);
      stampLogin();
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

    if (data.status === 'deactivated') {
      await signOut(auth);
      setError(isAr
        ? 'تم تعطيل حسابك. يرجى التواصل مع الإدارة.'
        : 'Your account has been deactivated. Please contact the administration.');
      return;
    }

    // "Active" must match how User Management + usePermissions decide it:
    // the approved flag OR an approved/active status. (User Management marks
    // accounts active with status: 'approved'; legacy accounts used 'active'.)
    const isApproved = data.approved === true
      || data.status === 'active'
      || data.status === 'approved';
    if (!isApproved) {
      await signOut(auth);
      setError(isAr ? 'حسابك غير مفعل.' : 'Your account is not activated.');
      return;
    }

    saveAuthSession(credential.user.uid, rememberDevice);
    stampLogin();
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
    if (!FMAC_EMAIL_PATTERN.test(normalizedEmail)) {
      setError(isAr ? 'استخدم بريدك الرسمي ‎@fmac.fujairah.ae.' : 'Use your official @fmac.fujairah.ae email address.');
      return;
    }

    // This screen is intentionally unauthenticated. Do not query the private
    // users collection here: doing so both fails the rules and leaks whether an
    // employee account exists. The admin resolves this email after signing in.
    await addDoc(collection(db, 'password_reset_requests'), {
      email: normalizedEmail,
      status: 'pending',
      requestedAt: serverTimestamp(),
    });

    setInfo(isAr
      ? 'تم إرسال طلبك. إذا كان البريد مسجلاً، سيراجع المدير الطلب.'
      : 'Your request has been submitted. If the email is registered, an admin will review it.');
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

  const modeDescription = mode === 'login'
    ? (isAr ? 'سجّل الدخول بحسابك، أو اطلب حساباً جديداً.' : 'Sign in with your account, or request a new one.')
    : mode === 'signup'
      ? (isAr ? 'أنشئ طلب حساب جديد. يبدأ الوصول بعد موافقة الإدارة.' : 'Create a new account request. Access starts after administrator approval.')
      : (isAr ? 'أرسل طلب الاستعادة باستخدام بريدك الرسمي المسجل.' : 'Send a recovery request using your registered official email.');

  return (
    <div className={`lgn${isAr ? ' lgn--ar' : ''}`}>
      <div className="lgn-backdrop" aria-hidden="true">
        <img src={portalArtwork} alt="" />
      </div>
      <motion.div
        className="lgn-shell"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <header className="lgn-topbar">
          <div className="lgn-toggles">
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </header>

        <div className="lgn-layout">
          <aside className="lgn-brand" aria-label={isAr ? 'هوية إدارة العمليات' : 'Operations Department identity'}>
            <img className="lgn-brand-art" src={portalArtwork} alt="" />
            <div className="lgn-brand-shade" aria-hidden="true" />
            <div className="lgn-brand-head">
              <img className="lgn-brand-logo" src={portalLogo} alt="FMAC Operations Department" />
            </div>
            <div className="lgn-brand-copy">
              <p>{isAr ? 'منظومة العمليات' : 'Operations suite'}</p>
              <h2>{isAr ? 'بوابة فريق العمل' : 'The staff gateway'}</h2>
              <span>{isAr ? 'نادي الفجيرة للفنون القتالية' : 'Fujairah Martial Arts Club'}</span>
            </div>
          </aside>

          <main className="lgn-form-col">
            <div className="lgn-form-inner">
              <h1 className="lgn-title" dir="auto">
                {isAr ? MODE_COPY[mode].ar : MODE_COPY[mode].en}
              </h1>
              <p className="lgn-description">{modeDescription}</p>

              {info && (
                <motion.div className="lgn-msg lgn-msg--ok" role="status" aria-live="polite"
                  initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}>
                  {info}
                </motion.div>
              )}

              <form onSubmit={handleSubmit} className="lgn-form">
                {mode === 'signup' && (
                  <label className="lgn-field">
                    <span>{isAr ? 'الاسم الكامل' : 'Display name'}</span>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder={isAr ? 'اسمك' : 'Your name'}
                      required
                      autoComplete="name"
                      dir="auto"
                    />
                  </label>
                )}

                <label className="lgn-field">
                  <span>{isAr ? 'البريد الإلكتروني' : 'Email address'}</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="staff@fmac.fujairah.ae"
                    required
                    autoComplete="email"
                    dir="ltr"
                  />
                </label>

                {mode !== 'forgot' && (
                  <label className="lgn-field">
                    <span>{isAr ? 'كلمة المرور' : 'Password'}</span>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      dir="ltr"
                    />
                  </label>
                )}

                {mode === 'login' && (
                  <label className="lgn-remember">
                    <input
                      type="checkbox"
                      checked={rememberDevice}
                      onChange={(event) => setRememberDevice(event.target.checked)}
                    />
                    <span>
                      <strong>{isAr ? `ابقَ مسجلاً لمدة ${REMEMBERED_SESSION_DAYS} أيام` : `Keep me signed in for ${REMEMBERED_SESSION_DAYS} days`}</strong>
                      <small>{isAr ? 'على جهاز موثوق فقط' : 'On a trusted device only'}</small>
                    </span>
                  </label>
                )}

                {mode === 'signup' && (
                  <div className="lgn-field">
                    <span>{isAr ? 'المسمى الوظيفي' : 'Job title'}</span>
                    <CustomSelect
                      value={jobTitle}
                      onChange={setJobTitle}
                      placeholder={isAr ? '— اختر المسمى الوظيفي —' : '— Select job title —'}
                      options={JOB_TITLES.map(title => ({ value: title, label: title }))}
                    />
                  </div>
                )}

                <button type="submit" className="lgn-submit" disabled={loading}>
                  {loading
                    ? (isAr ? 'جارٍ التحقق…' : 'Verifying…')
                    : mode === 'signup'
                      ? (isAr ? 'تقديم طلب الحساب' : 'Submit account request')
                      : mode === 'forgot'
                        ? (isAr ? 'إرسال طلب الاستعادة' : 'Send recovery request')
                        : (isAr ? 'الدخول إلى المنظومة' : 'Enter operations suite')}
                </button>

                {error && (
                  <motion.p className="lgn-msg lgn-msg--err" role="alert" aria-live="assertive"
                    initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}>
                    {error}
                  </motion.p>
                )}

                <div className="lgn-links">
                  {mode === 'login' && (
                    <button type="button" onClick={() => switchMode('forgot')}>
                      {isAr ? 'نسيت كلمة المرور؟' : 'Forgot password?'}
                    </button>
                  )}
                  <button type="button" onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}>
                    {mode === 'login'
                      ? (isAr ? 'طلب حساب جديد' : 'Request an account')
                      : (isAr ? 'العودة لتسجيل الدخول' : 'Back to sign in')}
                  </button>
                </div>
              </form>
            </div>
          </main>
        </div>
      </motion.div>
    </div>
  );
}
