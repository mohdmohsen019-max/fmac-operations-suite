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
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import './LoginPage.css';
import { auth, db } from '../firebase';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { doc, setDoc, getDoc, getDocs, updateDoc, serverTimestamp, collection, addDoc, query, where } from 'firebase/firestore';
import { JOB_TITLES, MASTER_ADMIN_EMAIL } from '../utils/jobTitlePermissions';

const MODE_COPY = {
  login:  { ar: 'دخول الموظفين',      en: 'Staff sign in' },
  signup: { ar: 'إنشاء حساب جديد',    en: 'New staff account' },
  forgot: { ar: 'استعادة كلمة المرور', en: 'Password recovery' },
};

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

    // Record last login (best-effort — never block sign-in on this write).
    const stampLogin = () => updateDoc(doc(db, 'users', credential.user.uid), { lastLogin: serverTimestamp() }).catch(() => {});

    // Master admin bypasses all status checks
    if (credential.user.email === MASTER_ADMIN_EMAIL) {
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
    <div className="lgn">
      <motion.div
        className="lgn-panel"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* ── Brand side ── */}
        <div className="lgn-brand">
          <button className="lgn-back" onClick={goToPortal}>
            {isAr ? <ArrowRight size={13} /> : <ArrowLeft size={13} />}
            {isAr ? 'العودة للبوابة' : 'Back to portal'}
          </button>

          <div className="lgn-brand-center">
            <img src="/fmac-ops-logo.png" alt="FMAC" className="lgn-logo" />
            <div className="lgn-brand-rule" />
            <h2 className="lgn-club-ar">نادي الفجيرة للفنون القتالية</h2>
            <p className="lgn-club-en">Fujairah Martial Arts Club</p>
          </div>

          <div className="lgn-brand-foot">
            <span>{isAr ? 'منظومة العمليات الموحدة' : 'Unified operations console'}</span>
          </div>
        </div>

        {/* ── Form side ── */}
        <div className="lgn-form-col">
          <div className="lgn-toggles">
            <LanguageToggle />
            <ThemeToggle />
          </div>

          <div className="lgn-form-inner">
            <p className="lgn-kicker">{isAr ? 'بوابة الموظفين' : 'Staff console'}</p>
            <h1 className="lgn-title" dir="auto">
              {isAr ? MODE_COPY[mode].ar : MODE_COPY[mode].en}
            </h1>

            {info && (
              <motion.div className="lgn-msg lgn-msg--ok"
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
                    dir="auto"
                  />
                </label>
              )}

              {mode === 'forgot' && (
                <p className="lgn-hint">
                  {isAr
                    ? 'أدخل بريدك الإلكتروني وسيتواصل معك المدير بعد مراجعة طلبك.'
                    : 'Enter your email address and an admin will review your request and send you a reset link.'}
                </p>
              )}

              <label className="lgn-field">
                <span>{isAr ? 'البريد الإلكتروني' : 'Email address'}</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="staff@fmac.ae"
                  required
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
                    dir="ltr"
                  />
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
                    ? (isAr ? 'تقديم الطلب' : 'Submit request')
                    : mode === 'forgot'
                      ? (isAr ? 'إرسال الطلب' : 'Send request')
                      : (isAr ? 'دخول' : 'Sign in')}
              </button>

              {error && (
                <motion.p className="lgn-msg lgn-msg--err"
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
                    ? (isAr ? 'إنشاء حساب جديد' : 'Create an account')
                    : (isAr ? 'العودة لتسجيل الدخول' : 'Back to sign in')}
                </button>
              </div>
            </form>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
