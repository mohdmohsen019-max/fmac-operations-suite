import { useState, useEffect, useRef, lazy, Suspense, Component } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Package2, Bus, Users, LifeBuoy, LogOut, BarChart2, Package, Building2, History, TrendingUp, Target, Siren, LayoutGrid, X } from 'lucide-react'
import { Routes, Route, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import './App.css'
import ThemeToggle from './components/shared/ThemeToggle'
import LanguageToggle from './components/shared/LanguageToggle'
import CommandPalette from './components/shared/CommandPalette'
import AttentionBell from './components/shared/AttentionBell'
import ShortcutLayer from './components/shared/ShortcutLayer'
import { useLanguage } from './contexts/LanguageContext'
import { useModuleVisibility } from './hooks/useModuleVisibility'
import { useAuth } from './contexts/AuthContext'
import { auth, db } from './firebase'
import { signOut, updatePassword } from 'firebase/auth'
import { doc, updateDoc } from 'firebase/firestore'
import { MASTER_ADMIN_EMAIL } from './utils/jobTitlePermissions'

import LoginPage from './components/LoginPage'
import LogisticsModule from './components/LogisticsModule'

// Lazy-load heavy modules so they're code-split and don't block the main thread
const FleetModule          = lazy(() => import('./components/FleetModule'))
const UserManagementModule = lazy(() => import('./components/UserManagementModule'))
const ProfileModule        = lazy(() => import('./components/ProfileModule'))
const ReportsModule        = lazy(() => import('./components/ReportsModule'))
const InventoryModule      = lazy(() => import('./components/InventoryModule'))
const AssetsModule         = lazy(() => import('./components/AssetsModule'))
const OperationsDashboard  = lazy(() => import('./components/OperationsDashboard'))
const ActivityModule       = lazy(() => import('./components/ActivityModule'))
const InsightsModule       = lazy(() => import('./components/InsightsModule'))
const StrategyModule       = lazy(() => import('./components/StrategyModule'))
const CrisisModule         = lazy(() => import('./components/CrisisModule'))
const WallboardModule      = lazy(() => import('./components/WallboardModule'))
const HelpAdminDashboard   = lazy(() => import('./components/help/admin/HelpAdminDashboard'))
const HelpAdminTicket      = lazy(() => import('./components/help/admin/HelpAdminTicket'))

const NAV_ITEMS_DEF = [
  { id: 'fleet',     icon: Bus,      en: 'Fleet Management', ar: 'إدارة الأسطول',         path: '/fleet/dashboard' },
  { id: 'help',      icon: LifeBuoy, en: 'Help Desk',        ar: 'مركز الدعم',             path: '/help' },
  { id: 'inventory', icon: Package,  en: 'Inventory',        ar: 'المخزون',                path: '/inventory' },
  { id: 'assets',    icon: Building2,en: 'Assets',           ar: 'الأصول',                 path: '/assets' },
  { id: 'strategy',  icon: Target,   en: 'Strategy & Excellence', ar: 'الاستراتيجية والتميز', path: '/strategy' },
  { id: 'crisis',    icon: Siren,    en: 'Crisis & Emergency', ar: 'إدارة الأزمات والطوارئ', path: '/crisis' },
  { id: 'logistics', icon: Package2, en: 'Logistics Hub',    ar: 'مركز اللوجستيات',        path: '/logistics/dashboard' },
  { id: 'reports',   icon: BarChart2,en: 'Dept. Reports',    ar: 'تقارير الأقسام',         path: '/reports' },
  { id: 'insights',  icon: TrendingUp, en: 'Insights',        ar: 'الرؤى',                  path: '/insights' },
  { id: 'activity',  icon: History,  en: 'Activity Log',     ar: 'سجل النشاط',             path: '/activity' },
  { id: 'users',     icon: Users,    en: 'User Management',  ar: 'إدارة المستخدمين',       path: '/users/dashboard' },
]

// Arabic labels for the job titles defined in jobTitlePermissions (English-only there).
const JOB_TITLE_AR = {
  'Head of Operations':            'رئيس العمليات',
  'Sports Activities Specialist':  'أخصائي الأنشطة الرياضية',
  'Logistics Specialist':          'أخصائي اللوجستيات',
  'Warehouse/Store Manager':       'مدير المخزن',
  'Customer Happiness Specialist': 'أخصائي سعادة المتعاملين',
  'Media Coordinator':             'منسق إعلامي',
  'Manager':                       'مدير',
  'Admin':                         'مسؤول',
}

/* ── Catches failed chunk loads (stale hashes after deploy) and reloads once ── */
class ChunkErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { crashed: false }
  }

  static getDerivedStateFromError(error) {
    const isChunkError =
      error?.name === 'ChunkLoadError' ||
      /Failed to fetch dynamically imported module|Loading chunk \d+ failed/i.test(error?.message ?? '')
    if (isChunkError && !sessionStorage.getItem('chunkReloaded')) {
      sessionStorage.setItem('chunkReloaded', '1')
      window.location.reload()
      return null
    }
    return { crashed: true }
  }

  componentDidCatch(error, info) {
    console.error('ChunkErrorBoundary caught:', error, info?.componentStack)
  }

  componentDidMount() {
    // Successful mount: re-arm the one-shot auto-reload for the next deploy.
    if (!this.state.crashed) sessionStorage.removeItem('chunkReloaded')
  }

  componentDidUpdate(prevProps) {
    if (prevProps.routeKey !== this.props.routeKey && this.state.crashed) {
      sessionStorage.removeItem('chunkReloaded')
      this.setState({ crashed: false })
    }
  }

  render() {
    if (this.state.crashed) {
      // Never render a silent blank — always give the user a way out.
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '14px', textAlign: 'center', padding: '24px' }}>
          <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--theme-text-main)' }}>
            Something went wrong loading this module &middot; حدث خطأ أثناء تحميل هذه الوحدة
          </p>
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--theme-text-muted)' }}>
            This can happen right after an update is published &middot; قد يحدث هذا بعد نشر تحديث جديد
          </p>
          <button className="btn-premium" style={{ marginTop: '6px' }} onClick={() => window.location.reload()}>
            Reload &middot; إعادة التحميل
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

/* ── Suspense fallback used inside the module viewport ── */
function ModuleLoader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div className="app-loader"><span /><span /><span /><span /><span /></div>
    </div>
  )
}

/* ── Full-viewport fallback for the top-level route Suspense ── */
function RouteLoader() {
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--theme-bg)' }}>
      <div className="app-loader"><span /><span /><span /><span /><span /></div>
    </div>
  )
}

/* ── Force password change modal (shown when forcePasswordReset flag is set) ── */
function ForcePasswordChangeModal({ user, lang }) {
  const [newPass,     setNewPass]     = useState('')
  const [confirmPass, setConfirmPass] = useState('')
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')
  const isAr = lang === 'ar'

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (newPass !== confirmPass) { setError(isAr ? 'كلمتا المرور غير متطابقتين.' : 'Passwords do not match.'); return }
    if (newPass.length < 6)      { setError(isAr ? 'يجب أن تكون كلمة المرور 6 أحرف على الأقل.' : 'Password must be at least 6 characters.'); return }
    setLoading(true)
    setError('')
    try {
      await updatePassword(user, newPass)
      await updateDoc(doc(db, 'users', user.uid), { forcePasswordReset: false })
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'var(--theme-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        style={{ background: 'var(--theme-surface)', border: '1px solid var(--theme-border)', borderRadius: '20px', padding: '40px', width: '100%', maxWidth: '420px', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}
      >
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <img src="/fmac-logo-new.png" alt="FMAC" style={{ width: '52px', marginBottom: '16px' }} />
          <h2 style={{ margin: '0 0 8px', fontSize: '1.3rem', color: 'var(--theme-text-main)', fontWeight: 800 }}>
            {isAr ? 'تعيين كلمة مرور جديدة' : 'Set a New Password'}
          </h2>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--theme-text-muted)', lineHeight: 1.6 }}>
            {isAr
              ? 'تم إعادة تعيين كلمة مرورك بواسطة المدير. يرجى تعيين كلمة مرور جديدة للمتابعة.'
              : 'Your password was reset by an admin. Please set a new password to continue.'}
          </p>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--theme-text-muted)', marginBottom: '6px', letterSpacing: '0.04em' }}>
              {isAr ? 'كلمة المرور الجديدة' : 'New Password'}
            </label>
            <input type="password" value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="••••••••" required
              style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--theme-border)', background: 'var(--theme-surface-hover)', color: 'var(--theme-text-main)', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--theme-text-muted)', marginBottom: '6px', letterSpacing: '0.04em' }}>
              {isAr ? 'تأكيد كلمة المرور' : 'Confirm Password'}
            </label>
            <input type="password" value={confirmPass} onChange={e => setConfirmPass(e.target.value)} placeholder="••••••••" required
              style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--theme-border)', background: 'var(--theme-surface-hover)', color: 'var(--theme-text-main)', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          {error && <p style={{ margin: 0, fontSize: '0.82rem', color: '#e11d48', textAlign: 'center' }}>{error}</p>}
          <button type="submit" disabled={loading} className="btn-premium" style={{ padding: '14px', fontSize: '0.9rem', marginTop: '4px' }}>
            {loading ? (isAr ? 'جارٍ الحفظ...' : 'Saving...') : (isAr ? 'حفظ كلمة المرور الجديدة' : 'Save New Password')}
          </button>
        </form>
      </motion.div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   MainAuthGuard — defined OUTSIDE App to keep a stable identity
   ══════════════════════════════════════════════════════════════ */
function MainAuthGuard({ children }) {
  const { user, userProfile } = useAuth()
  const { lang } = useLanguage()

  if (!user) return <Navigate to="/login" replace />
  if (!userProfile) return null

  if (userProfile.status === 'pending') {
    return (
      <motion.div className="initializing-overlay" style={{ background: 'var(--theme-bg)' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
        <motion.div className="jumping-logo-container" style={{ textAlign: 'center', maxWidth: '420px' }} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
          <img src="/fmac-logo-new.png" alt="Pending" className="jumping-logo" style={{ marginBottom: '24px' }} />
          <h1 style={{ color: 'var(--theme-text-main)', fontSize: '1.4rem', marginBottom: '12px' }}>
            {lang === 'ar' ? 'الوصول بانتظار الموافقة' : 'Access Pending Approval'}
          </h1>
          <p style={{ color: 'var(--theme-text-muted)', lineHeight: 1.7 }}>
            {lang === 'ar' ? 'حسابك' : 'Your account'} <strong>({user.email})</strong>{' '}
            {lang === 'ar' ? 'تم تقديمه. يجب على المسؤول الموافقة عليه قبل الدخول.' : 'has been submitted. An administrator must approve it before you can access the system.'}
          </p>
          <button onClick={() => signOut(auth)} style={{ marginTop: '32px', background: 'transparent', border: '1px solid var(--theme-accent)', color: 'var(--theme-accent)', padding: '10px 24px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>
            {lang === 'ar' ? 'تسجيل الخروج' : 'Sign Out'}
          </button>
        </motion.div>
      </motion.div>
    )
  }

  if (userProfile.status === 'rejected') {
    return (
      <motion.div className="initializing-overlay" style={{ background: 'var(--theme-bg)' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
        <motion.div className="jumping-logo-container" style={{ textAlign: 'center', maxWidth: '420px' }} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <img src="/fmac-logo-new.png" alt="Rejected" className="jumping-logo" style={{ marginBottom: '24px' }} />
          <h1 style={{ color: '#e11d48', fontSize: '1.4rem', marginBottom: '12px' }}>
            {lang === 'ar' ? 'تم رفض الطلب' : 'Access Denied'}
          </h1>
          <p style={{ color: 'var(--theme-text-muted)', lineHeight: 1.7 }}>
            {lang === 'ar' ? 'تم رفض طلبك. يرجى التواصل مع الإدارة.' : 'Your request has been rejected. Please contact your administrator.'}
          </p>
          <button onClick={() => signOut(auth)} style={{ marginTop: '32px', background: 'transparent', border: '1px solid #e11d48', color: '#e11d48', padding: '10px 24px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>
            {lang === 'ar' ? 'تسجيل الخروج' : 'Sign Out'}
          </button>
        </motion.div>
      </motion.div>
    )
  }

  if (userProfile.forcePasswordReset === true) {
    return <ForcePasswordChangeModal user={user} lang={lang} />
  }

  return children
}

/* ══════════════════════════════════════════════════════════════
   MainAppLayout — defined OUTSIDE App to keep a stable identity
   ══════════════════════════════════════════════════════════════ */
function MainAppLayout() {
  const { user, userProfile } = useAuth()
  const { t } = useLanguage()
  const navigate  = useNavigate()
  const location  = useLocation()

  const [profileFlyoutOpen, setProfileFlyoutOpen] = useState(false)
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false)
  const profileRef = useRef(null)

  const isMasterAdmin = user?.email === MASTER_ADMIN_EMAIL
  // Suite-wide module switches (master-admin controlled, live).
  const { isHidden } = useModuleVisibility()
  const NAV_ITEMS = NAV_ITEMS_DEF
    .filter(n => !isHidden(n.id))
    .map(n => ({ ...n, label: t(n.en, n.ar) }))

  useEffect(() => {
    if (!profileFlyoutOpen) return
    const handler = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileFlyoutOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [profileFlyoutOpen])

  const getGlobalModule = () => {
    const segments = location.pathname.split('/').filter(Boolean)
    const module = segments[0]
    if (!module || module === 'dashboard') return 'dashboard'
    return module
  }
  const globalModule = getGlobalModule()

  /* A hidden module must not stay reachable by URL or bookmark — bounce to the
     dashboard. Runs as an effect (never during render) so the redirect happens
     after the visibility snapshot has settled. */
  useEffect(() => {
    if (globalModule !== 'dashboard' && isHidden(globalModule)) {
      navigate('/dashboard', { replace: true })
    }
  }, [globalModule, isHidden, navigate])

  const getThemeClass = () => {
    switch (globalModule) {
      case 'fleet':     return 'theme-fleet'
      case 'help':      return 'theme-help'
      case 'users':     return 'theme-users'
      case 'profile':   return 'theme-profile'
      case 'reports':   return 'theme-reports'
      case 'inventory': return 'theme-inventory'
      case 'assets':    return 'theme-assets'
      case 'activity':  return 'theme-activity'
      case 'insights':  return 'theme-insights'
      case 'strategy':  return 'theme-strategy'
      case 'crisis':    return 'theme-crisis'
      case 'wallboard': return 'theme-dashboard'
      case 'dashboard': return 'theme-dashboard'
      case 'logistics':
      default:          return 'theme-logistics'
    }
  }

  const displayName = user?.displayName || userProfile?.displayName || user?.email?.split('@')[0] || 'Admin'

  const getInitials = (name) => {
    if (!name) return 'A'
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
    return parts[0].slice(0, 2).toUpperCase()
  }

  const getRoleLabel = () => {
    if (isMasterAdmin) return t('Master Admin', 'المسؤول العام')
    // Prefer the specific job title (what User Management shows) over the
    // generic role bucket, so the chip reads e.g. "Sports Activities Specialist".
    const jobTitle = userProfile?.jobTitle
    if (jobTitle) return t(jobTitle, JOB_TITLE_AR[jobTitle] || jobTitle)
    const role = userProfile?.role
    if (!role) return t('Pending', 'معلق')
    const roleMap = {
      hod:          t('Head of Operations', 'رئيس العمليات'),
      staff:        t('Staff', 'موظف'),
      store_manager:t('Store Manager', 'مدير المخزن'),
      chr:          t('Customer Happiness', 'سعادة العميل'),
      media:        t('Media', 'ميديا'),
      manager:      t('Manager', 'مدير'),
      admin_viewer: t('Admin', 'مسؤول'),
    }
    return roleMap[role] || role
  }

  if (globalModule === 'wallboard') {
    return (
      <div className="ops-portal-root theme-dashboard">
        <ChunkErrorBoundary routeKey="wallboard">
          <Suspense fallback={<ModuleLoader />}>
            <Outlet />
          </Suspense>
        </ChunkErrorBoundary>
        <ShortcutLayer />
      </div>
    )
  }

  return (
    <div className={`ops-portal-root ${getThemeClass()}`}>
      {/* Single rounded dark frame — the sidebar is its left portion showing
          through; the content panel floats inside it as a rounded card. */}
      <div className="ops-frame">
      <motion.nav
        className="ops-global-rail"
        initial={{ opacity: 0, x: -16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="ops-rail-header">
          <motion.button className="ops-rail-logo-tile" data-tip={t('Operations Overview', 'نظرة عامة على العمليات')} aria-label={t('Operations Overview', 'نظرة عامة على العمليات')} onClick={() => navigate('/dashboard')} whileTap={{ scale: 0.94 }}>
            <span className="ops-rail-wordmark-window" aria-hidden="true">
              <img src="/fmac-ops-logo-light.png" alt="" className="ops-rail-logo-img ops-rail-logo-img--dark-rail" />
              <img src="/fmac-ops-logo.png" alt="" className="ops-rail-logo-img ops-rail-logo-img--light-rail" />
            </span>
            <span className="ops-rail-logo-rule" aria-hidden="true" />
          </motion.button>
        </div>
        <div className="ops-rail-nav">
          {NAV_ITEMS.map(({ id, icon: Icon, label, path }) => (
            <motion.button key={id} data-tip={label} aria-label={label} className={`ops-rail-item ${globalModule === id ? 'active' : ''}`} onClick={() => navigate(path)} whileTap={{ scale: 0.92 }} transition={{ type: 'spring', stiffness: 400, damping: 24 }}>
              <Icon size={20} strokeWidth={1.75} />
              <span className="ops-rail-label">{label}</span>
            </motion.button>
          ))}
        </div>
        <div className="ops-rail-footer" ref={profileRef}>
          <motion.button className="ops-rail-avatar" aria-label={t('Profile menu', 'قائمة الملف الشخصي')} onClick={() => setProfileFlyoutOpen(v => !v)} whileTap={{ scale: 0.94 }}>
            {userProfile?.photoURL ? (
              <img src={userProfile.photoURL} alt="" />
            ) : (
              <span className="ops-rail-avatar-initials">{(displayName || 'A').trim().charAt(0).toUpperCase()}</span>
            )}
          </motion.button>
          <AnimatePresence>
            {profileFlyoutOpen && (
              <motion.div className="ops-rail-flyout" initial={{ opacity: 0, scale: 0.95, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 6 }} transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}>
                <div className="ops-flyout-header">
                  <span className="ops-flyout-name">{displayName}</span>
                  <span className="ops-flyout-role">{getRoleLabel()}</span>
                </div>
                <div className="ops-dropdown-divider" />
                <button className="ops-dropdown-item" onClick={() => { setProfileFlyoutOpen(false); navigate('/profile') }}>{t('My Profile', 'ملفي الشخصي')}</button>
                <button className="ops-dropdown-item ops-dropdown-item-danger" onClick={() => { setProfileFlyoutOpen(false); signOut(auth) }}>{t('Sign Out', 'تسجيل الخروج')}</button>
              </motion.div>
            )}
          </AnimatePresence>
          <motion.button className="ops-rail-item" data-tip={t('Sign Out', 'تسجيل الخروج')} aria-label={t('Sign Out', 'تسجيل الخروج')} onClick={() => signOut(auth)} whileTap={{ scale: 0.92 }}>
            <LogOut size={20} strokeWidth={1.75} />
            <span className="ops-rail-label">{t('Sign Out', 'تسجيل الخروج')}</span>
          </motion.button>
        </div>
      </motion.nav>

      <motion.div className="ops-main-wrapper" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay: 0.15 }}>
        <div className="ops-module-container">
          {/* Enter-only animation. Do NOT wrap the router Outlet in
              AnimatePresence mode="wait": React Router v7 navigations run
              inside startTransition, and when a lazy module chunk suspends
              mid-transition, AnimatePresence's exit bookkeeping is corrupted —
              the old module unmounts but the new one never mounts (blank
              screen until a hard reload). A keyed div with no exit phase
              cannot deadlock. */}
          <motion.div key={globalModule} className={`ops-module-inner${globalModule === 'dashboard' ? ' ops-module-inner--dash' : ''}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}>
            <ChunkErrorBoundary routeKey={globalModule}>
              <Suspense fallback={<ModuleLoader />}>
                <Outlet />
              </Suspense>
            </ChunkErrorBoundary>
          </motion.div>
        </div>
      </motion.div>
      </div>

      {/* Global command palette — Ctrl/⌘+K, or the dashboard search button */}
      <CommandPalette />
      {/* Keyboard layer: "g then key" navigation + "?" cheat sheet */}
      <ShortcutLayer />

      {/* Floating controls — hidden on /dashboard, whose header hosts
          its own restyled toggles (spec §5 amendment) */}
      {globalModule !== 'dashboard' && (
        <motion.div className="ops-float-cluster" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}>
          <AttentionBell />
          <LanguageToggle />
          <ThemeToggle />
        </motion.div>
      )}

      {/* Mobile-only bottom navigation — shown via CSS only on ≤768px.
          Eleven modules can't share one 58px row, so the bar keeps the four
          primary modules (labelled) and everything else lives in a slide-up
          "More" sheet with roomy, labelled tiles. */}
      {(() => {
        const primary = NAV_ITEMS.slice(0, 4)
        const overflow = NAV_ITEMS.slice(4)
        const overflowActive = overflow.some(n => n.id === globalModule) || globalModule === 'profile'
        const go = (path) => { setMobileMoreOpen(false); navigate(path) }
        return (
          <>
            <nav className="ops-mobile-nav">
              {primary.map(({ id, icon: Icon, label, path }) => (
                <button
                  key={id}
                  className={`ops-mobile-nav-item${globalModule === id && !mobileMoreOpen ? ' active' : ''}`}
                  onClick={() => go(path)}
                >
                  <Icon size={20} strokeWidth={1.75} />
                  <span className="ops-mobile-nav-label">{label}</span>
                </button>
              ))}
              <button
                className={`ops-mobile-nav-item${mobileMoreOpen || overflowActive ? ' active' : ''}`}
                onClick={() => setMobileMoreOpen(v => !v)}
              >
                <LayoutGrid size={20} strokeWidth={1.75} />
                <span className="ops-mobile-nav-label">{t('More', 'المزيد')}</span>
              </button>
            </nav>

            <AnimatePresence>
              {mobileMoreOpen && (
                <>
                  <motion.div
                    className="ops-mobile-sheet-backdrop"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    onClick={() => setMobileMoreOpen(false)}
                  />
                  <motion.div
                    className="ops-mobile-sheet"
                    initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                    transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <div className="ops-mobile-sheet-head">
                      <span>{t('All modules', 'جميع الوحدات')}</span>
                      <button className="ops-mobile-sheet-close" onClick={() => setMobileMoreOpen(false)}>
                        <X size={17} />
                      </button>
                    </div>
                    <div className="ops-mobile-sheet-grid">
                      {overflow.map(({ id, icon: Icon, label, path }) => (
                        <button
                          key={id}
                          className={`ops-mobile-tile${globalModule === id ? ' active' : ''}`}
                          onClick={() => go(path)}
                        >
                          <Icon size={21} strokeWidth={1.75} />
                          <span>{label}</span>
                        </button>
                      ))}
                    </div>
                    <div className="ops-mobile-sheet-footer">
                      <button className={`ops-mobile-tile ops-mobile-tile--row${globalModule === 'profile' ? ' active' : ''}`} onClick={() => go('/profile')}>
                        <span className="ops-mobile-avatar">
                          {userProfile?.photoURL
                            ? <img src={userProfile.photoURL} alt="Profile" />
                            : getInitials(displayName)}
                        </span>
                        <span>{t('My Profile', 'ملفي الشخصي')}</span>
                      </button>
                      <button className="ops-mobile-tile ops-mobile-tile--row ops-mobile-tile--logout" onClick={() => signOut(auth)}>
                        <LogOut size={19} strokeWidth={1.75} />
                        <span>{t('Sign out', 'تسجيل الخروج')}</span>
                      </button>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </>
        )
      })()}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   App — only handles routes; MainAuthGuard / MainAppLayout are
   stable top-level components (not recreated on each render)
   ══════════════════════════════════════════════════════════════ */
function App() {
  const { user, userProfile, loading } = useAuth()
  const isMasterAdmin = user?.email === MASTER_ADMIN_EMAIL

  if (loading) {
    return (
      <motion.div className="initializing-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
        <motion.div className="jumping-logo-container" initial={{ opacity: 0, scale: 0.88, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}>
          <img src="/fmac-logo-new.png" alt="Loading" className="jumping-logo" />
          <span className="jumping-text">Initializing Operations...</span>
        </motion.div>
      </motion.div>
    )
  }

  return (
    <Suspense fallback={<RouteLoader />}>
      <Routes>
        {/* PUBLIC */}
        <Route path="/"                             element={<Navigate to="/login" replace />} />
        <Route path="/submit/*"                     element={<Navigate to="/login" replace />} />
        <Route path="/track"                        element={<Navigate to="/login" replace />} />

        {/* AUTH */}
        <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <LoginPage />} />

        {/* PROTECTED */}
        <Route element={<MainAuthGuard><MainAppLayout /></MainAuthGuard>}>
          <Route path="/dashboard"    element={<OperationsDashboard userProfile={userProfile} />} />
          <Route path="/activity"     element={<ActivityModule />} />
          <Route path="/insights"     element={<InsightsModule />} />
          <Route path="/strategy"     element={<StrategyModule />} />
          <Route path="/strategy/:tab" element={<StrategyModule />} />
          <Route path="/crisis"       element={<CrisisModule />} />
          <Route path="/crisis/:tab"  element={<CrisisModule />} />
          <Route path="/wallboard"    element={<WallboardModule />} />
          <Route path="/logistics/*"  element={<LogisticsModule />} />
          <Route path="/fleet/*"      element={<FleetModule />} />
          <Route path="/inventory/*"  element={<InventoryModule />} />
          <Route path="/assets/*"     element={<AssetsModule />} />
          <Route path="/reports/*"    element={<ReportsModule user={user} userProfile={userProfile} />} />
          <Route path="/users/*"      element={<UserManagementModule isMasterAdmin={isMasterAdmin} />} />
          <Route path="/profile/*"    element={<ProfileModule user={user} userProfile={userProfile} onUpdateProfile={() => {}} />} />
          <Route path="/help"         element={<HelpAdminDashboard />} />
          <Route path="/help/requests/:ticketId" element={<HelpAdminTicket userProfile={userProfile} />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

export default App
