import React, { useState, useEffect } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import LanguageToggle from './shared/LanguageToggle';
import ThemeToggle from './shared/ThemeToggle';
import FMACLogo from './FMACLogo';
import CustomSelect from './CustomSelect';
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
import { doc, setDoc, getDoc, getDocs, updateDoc, serverTimestamp, collection, addDoc, query, where } from 'firebase/firestore';
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

/* ── NEXUS COMMAND: helper geometry ── */
const _toRad = d => d * Math.PI / 180;

const _arcPath = (cx, cy, r, s, e) => {
  const x1 = cx + r * Math.cos(_toRad(s)), y1 = cy + r * Math.sin(_toRad(s));
  const x2 = cx + r * Math.cos(_toRad(e)), y2 = cy + r * Math.sin(_toRad(e));
  const lg = (e - s + 360) % 360 > 180 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${lg} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
};

const _hexPath = (cx, cy, r, rot = 0) => {
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = _toRad(i * 60 + rot);
    return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
  });
  return `M ${pts[0]} L ${pts.slice(1).join(' L ')} Z`;
};

const NEXUS_NODES = [
  { id: 'F', x: 150, y: 55,  arcStart: -128, arcEnd: -52 },
  { id: 'M', x: 245, y: 150, arcStart:  -38, arcEnd:  38 },
  { id: 'A', x: 150, y: 245, arcStart:   52, arcEnd: 128 },
  { id: 'C', x:  55, y: 150, arcStart:  142, arcEnd: 218 },
];

const AMBIENT_PARTICLES = Array.from({ length: 16 }, (_, i) => {
  const a = _toRad(i * 22.5 - 90);
  return {
    x: parseFloat((150 + 138 * Math.cos(a)).toFixed(2)),
    y: parseFloat((150 + 138 * Math.sin(a)).toFixed(2)),
    r: i % 4 === 0 ? 2.2 : 1.2,
    delay: i * 0.19,
    bright: i % 4 === 0,
  };
});

function LoginMandala({ size = 280 }) {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [tappedNodes, setTappedNodes] = useState(new Set());
  const [autoNode, setAutoNode] = useState('F');
  const [scanLine, setScanLine] = useState(false);

  const sc = { damping: 25, stiffness: 180, mass: 0.6 };
  const rX = useSpring(useTransform(mouseY, [-size / 2, size / 2], [10, -10]), sc);
  const rY = useSpring(useTransform(mouseX, [-size / 2, size / 2], [-10, 10]), sc);
  const p1x = useSpring(useTransform(mouseX, [-size / 2, size / 2], [-4, 4]), sc);
  const p1y = useSpring(useTransform(mouseY, [-size / 2, size / 2], [-4, 4]), sc);
  const p3x = useSpring(useTransform(mouseX, [-size / 2, size / 2], [-14, 14]), sc);
  const p3y = useSpring(useTransform(mouseY, [-size / 2, size / 2], [-14, 14]), sc);

  const handleMouseMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    mouseX.set(e.clientX - r.left - r.width / 2);
    mouseY.set(e.clientY - r.top - r.height / 2);
  };
  const handleMouseLeave = () => { mouseX.set(0); mouseY.set(0); };

  useEffect(() => {
    const ids = ['F', 'M', 'A', 'C'];
    let i = 0;
    const t = setInterval(() => { i = (i + 1) % 4; setAutoNode(ids[i]); }, 1700);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      setScanLine(true);
      setTimeout(() => setScanLine(false), 1800);
    }, 6500);
    return () => clearInterval(t);
  }, []);

  const toggleTap = (nodeId) => {
    setTappedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId); else next.add(nodeId);
      return next;
    });
  };

  const isActive = (id) =>
    hoveredNode === id ||
    tappedNodes.has(id) ||
    (hoveredNode == null && tappedNodes.size === 0 && autoNode === id);

  /* Pre-compute radar sector path (static, no deps) */
  const radarPath = [
    'M 150 150',
    `L ${(150 + 108 * Math.cos(_toRad(-28))).toFixed(2)} ${(150 + 108 * Math.sin(_toRad(-28))).toFixed(2)}`,
    `A 108 108 0 0 1 ${(150 + 108).toFixed(2)} 150`,
    'Z',
  ].join(' ');

  return (
    <motion.div
      className="fmac-logo-container"
      style={{ width: size, height: size, rotateX: rX, rotateY: rY, transformStyle: 'preserve-3d' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      whileHover={{ scale: 1.03 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="fmac-logo-glow" />
      <div className="fmac-logo-glow-inner" />

      <svg viewBox="0 0 300 300" className="fmac-logo-svg" overflow="visible">
        <defs>
          {NEXUS_NODES.map(n => (
            <radialGradient key={`rg-${n.id}`} id={`nx-ng-${n.id}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%"   stopColor="#e74c3c" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#e74c3c" stopOpacity="0" />
            </radialGradient>
          ))}
          <radialGradient id="nx-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#c0392b" stopOpacity="0.6" />
            <stop offset="55%"  stopColor="#c0392b" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#c0392b" stopOpacity="0" />
          </radialGradient>
          <filter id="nx-blur" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
          <clipPath id="nx-clip">
            <rect x="-10" y="-10" width="320" height="320" />
          </clipPath>
        </defs>

        {/* ══ OUTER RING + TICK MARKS (slowest parallax) ══ */}
        <motion.g style={{ x: p1x, y: p1y }}>
          <circle cx="150" cy="150" r="140" fill="none"
            stroke="rgba(212,160,23,0.06)" strokeWidth="0.5" />

          {/* 4 glowing arc segments — one per letter */}
          {NEXUS_NODES.map(n => (
            <motion.path key={`arc-${n.id}`}
              d={_arcPath(150, 150, 136, n.arcStart, n.arcEnd)}
              fill="none" strokeLinecap="round"
              animate={{
                stroke: isActive(n.id) ? '#c0392b' : 'rgba(212,160,23,0.22)',
                strokeWidth: isActive(n.id) ? 3.5 : 2,
                opacity: isActive(n.id) ? 1 : 0.55,
              }}
              transition={{ duration: 0.32 }}
            />
          ))}

          {/* 16 tick marks */}
          {Array.from({ length: 16 }, (_, i) => {
            const a = _toRad(i * 22.5 - 90);
            const maj = i % 4 === 0;
            return (
              <line key={`tk-${i}`}
                x1={(150 + (maj ? 130 : 133) * Math.cos(a)).toFixed(2)}
                y1={(150 + (maj ? 130 : 133) * Math.sin(a)).toFixed(2)}
                x2={(150 + (maj ? 143 : 140) * Math.cos(a)).toFixed(2)}
                y2={(150 + (maj ? 143 : 140) * Math.sin(a)).toFixed(2)}
                stroke={maj ? 'rgba(212,160,23,0.55)' : 'rgba(212,160,23,0.18)'}
                strokeWidth={maj ? 1.6 : 0.7} strokeLinecap="round"
              />
            );
          })}

          {/* Slow-rotating dashed orbit ring */}
          <g className="fmac-logo-hud-outer">
            <circle cx="150" cy="150" r="118" fill="none"
              stroke="rgba(212,160,23,0.1)" strokeWidth="0.7" strokeDasharray="3 13" />
          </g>

          {/* Diamond web (adjacent node connections) */}
          {[[0,1],[1,2],[2,3],[3,0]].map(([ai, bi]) => {
            const a = NEXUS_NODES[ai], b = NEXUS_NODES[bi];
            const hot = isActive(a.id) || isActive(b.id);
            return (
              <motion.line key={`web-${ai}`}
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                strokeLinecap="round"
                animate={{
                  stroke: hot ? 'rgba(231,76,60,0.38)' : 'rgba(212,160,23,0.07)',
                  strokeWidth: hot ? 1.2 : 0.6,
                }}
                transition={{ duration: 0.4 }}
              />
            );
          })}
        </motion.g>

        {/* ══ RADAR SWEEP ══ */}
        <motion.g
          animate={{ rotate: 360 }}
          transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
          style={{ originX: '150px', originY: '150px' }}
        >
          <path d={radarPath} fill="rgba(192,57,43,0.09)" />
          <line x1="150" y1="150" x2={(150 + 108).toFixed(2)} y2="150"
            stroke="rgba(231,76,60,0.55)" strokeWidth="1" />
        </motion.g>
        <circle cx="150" cy="150" r="108" fill="none"
          stroke="rgba(192,57,43,0.12)" strokeWidth="0.8" />

        {/* ══ NEURAL LINKS + NODES + CORE (mid parallax) ══ */}
        <motion.g style={{ x: p3x, y: p3y }}>

          {/* Neural links center → each node */}
          {NEXUS_NODES.map(n => (
            <g key={`lnk-${n.id}`}>
              <line x1="150" y1="150" x2={n.x} y2={n.y}
                stroke="rgba(212,160,23,0.06)" strokeWidth="0.6" />
              <motion.line
                x1="150" y1="150" x2={n.x} y2={n.y}
                strokeDasharray="5 5" strokeLinecap="round"
                animate={{
                  opacity: isActive(n.id) ? 1 : 0,
                  stroke: '#e74c3c',
                  strokeWidth: isActive(n.id) ? 1.6 : 0,
                }}
                transition={{ duration: 0.28 }}
              />
            </g>
          ))}

          {/* ── LETTER NODES ── */}
          {NEXUS_NODES.map((n, idx) => {
            const active = isActive(n.id);
            return (
              <motion.g
                key={`nd-${n.id}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.12 + idx * 0.1 }}
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHoveredNode(n.id)}
                onMouseLeave={() => setHoveredNode(null)}
                onClick={() => toggleTap(n.id)}
              >
                {/* Outer glow halo */}
                <motion.circle cx={n.x} cy={n.y}
                  fill={`url(#nx-ng-${n.id})`}
                  animate={{ r: active ? 34 : 20, opacity: active ? 0.9 : 0.05 }}
                  transition={{ duration: 0.35 }}
                />
                {/* Outer orbit ring */}
                <motion.circle cx={n.x} cy={n.y} r="22" fill="none"
                  animate={{
                    stroke: active ? 'rgba(231,76,60,0.5)' : 'rgba(212,160,23,0.1)',
                    strokeWidth: active ? 1 : 0.5,
                  }}
                  transition={{ duration: 0.3 }}
                />
                {/* Main node ring */}
                <motion.circle cx={n.x} cy={n.y} r="16" fill="none"
                  animate={{
                    stroke: active ? '#e74c3c' : 'rgba(212,160,23,0.38)',
                    strokeWidth: active ? 2.2 : 1.2,
                  }}
                  transition={{ duration: 0.25 }}
                />
                {/* Node body */}
                <motion.circle cx={n.x} cy={n.y}
                  animate={{
                    r: active ? 15 : 13.5,
                    fill: active ? 'rgba(192,57,43,0.32)' : 'rgba(6,6,10,0.9)',
                  }}
                  transition={{ duration: 0.25 }}
                />
                {/* Letter glyph */}
                <motion.text
                  x={n.x} y={n.y}
                  fontFamily="'Barlow Condensed','Impact',sans-serif"
                  fontWeight="900" fontStyle="italic"
                  fontSize="17" textAnchor="middle" dominantBaseline="central"
                  animate={{
                    fill: active ? '#ffffff' : 'rgba(255,255,255,0.7)',
                    opacity: active ? 1 : 0.8,
                  }}
                  transition={{ duration: 0.2 }}
                >
                  {n.id}
                </motion.text>
                {/* Active indicator pip */}
                <motion.circle cx={n.x} cy={n.y}
                  animate={{ r: active ? 2.8 : 0, fill: '#ff6b6b', opacity: active ? 1 : 0 }}
                  transition={{ duration: 0.2 }}
                />
              </motion.g>
            );
          })}

          {/* ══ CENTER CORE ══ */}
          <g>
            <motion.circle cx="150" cy="150"
              fill="url(#nx-core)"
              animate={{ r: [36, 44, 36] }}
              transition={{ duration: 3.8, repeat: Infinity, ease: 'easeInOut' }}
            />
            <g className="fmac-logo-hud-inner">
              <path d={_hexPath(150, 150, 28, 0)}
                fill="none" stroke="rgba(212,160,23,0.3)" strokeWidth="0.9" />
            </g>
            <g className="fmac-logo-hud-outer">
              <path d={_hexPath(150, 150, 19, 30)}
                fill="none" stroke="rgba(192,57,43,0.45)" strokeWidth="0.9" />
            </g>
            <polygon
              points={`150,${150-13} ${150+13},150 150,${150+13} ${150-13},150`}
              fill="none" stroke="rgba(212,160,23,0.22)" strokeWidth="0.8"
            />
            <motion.circle cx="150" cy="150" fill="#c0392b"
              animate={{ r: [4.5, 6.5, 4.5], opacity: [0.9, 0.45, 0.9] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            />
            <circle cx="150" cy="150" r="1.8" fill="rgba(255,255,255,0.85)" />
          </g>
        </motion.g>

        {/* ══ AMBIENT PARTICLES ══ */}
        <motion.g style={{ x: p1x, y: p1y }}>
          {AMBIENT_PARTICLES.map((p, i) => (
            <motion.circle key={`ap-${i}`}
              cx={p.x} cy={p.y} r={p.r}
              fill={p.bright ? 'rgba(212,160,23,0.9)' : 'rgba(192,57,43,0.55)'}
              animate={{ opacity: [0.12, p.bright ? 1 : 0.7, 0.12], r: [p.r, p.r * 1.7, p.r] }}
              transition={{ duration: 2 + (i % 5) * 0.4, delay: p.delay, repeat: Infinity, ease: 'easeInOut' }}
            />
          ))}
        </motion.g>

        {/* ══ SCAN LINE ══ */}
        {scanLine && (
          <motion.rect x="-10" y="0" width="320" height="3"
            fill="rgba(231,76,60,0.18)" rx="1.5"
            clipPath="url(#nx-clip)"
            initial={{ y: -10 }} animate={{ y: 310 }}
            transition={{ duration: 1.6, ease: 'linear' }}
          />
        )}
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
          <FMACLogo size="lg" />
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
                <CustomSelect
                  value={jobTitle}
                  onChange={setJobTitle}
                  placeholder={isAr ? '— اختر المسمى الوظيفي —' : '— Select Job Title —'}
                  options={JOB_TITLES.map(title => ({ value: title, label: title }))}
                />
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
