import { useState, useEffect, useRef, lazy, Suspense, Component } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Package2, Bus, Users, LifeBuoy, LogOut, BarChart2, Package, Building2 } from 'lucide-react'
import { Routes, Route, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import './App.css'
import ThemeToggle from './components/shared/ThemeToggle'
import LanguageToggle from './components/shared/LanguageToggle'
import { useLanguage } from './contexts/LanguageContext'
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
const HelpAdminDashboard   = lazy(() => import('./components/help/admin/HelpAdminDashboard'))
const HelpAdminTicket      = lazy(() => import('./components/help/admin/HelpAdminTicket'))
const HelpLanding          = lazy(() => import('./components/help/public/HelpLanding'))
const HelpFormWizard       = lazy(() => import('./components/help/public/HelpFormWizard'))
const HelpSuccess          = lazy(() => import('./components/help/public/HelpSuccess'))

const NAV_ITEMS_DEF = [
  { id: 'fleet',     icon: Bus,      en: 'Fleet Management', ar: 'إدارة الأسطول',         path: '/fleet/dashboard' },
  { id: 'help',      icon: LifeBuoy, en: 'Help Desk',        ar: 'مركز الدعم',             path: '/help' },
  { id: 'logistics', icon: Package2, en: 'Logistics Hub',    ar: 'مركز اللوجستيات',        path: '/logistics/dashboard' },
  { id: 'users',     icon: Users,    en: 'User Management',  ar: 'إدارة المستخدمين',       path: '/users/dashboard' },
  { id: 'reports',   icon: BarChart2,en: 'Dept. Reports',    ar: 'تقارير الأقسام',         path: '/reports' },
  { id: 'inventory', icon: Package,  en: 'Inventory',        ar: 'المخزون',                path: '/inventory' },
  { id: 'assets',    icon: Building2,en: 'Assets',           ar: 'الأصول',                 path: '/assets' },
]

const SIDEBAR_COLLAPSED = 54
const SIDEBAR_EXPANDED  = 230

const labelVariants = {
  expanded:  { opacity: 1, x: 0,  maxWidth: 160 },
  collapsed: { opacity: 0, x: -6, maxWidth: 0   },
}
const labelTransition = (delay = 0) => ({
  duration: 0.18,
  delay,
  ease: [0.16, 1, 0.3, 1],
})

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

  componentDidUpdate(prevProps) {
    if (prevProps.routeKey !== this.props.routeKey && this.state.crashed) {
      sessionStorage.removeItem('chunkReloaded')
      this.setState({ crashed: false })
    }
  }

  render() {
    if (this.state.crashed) return null
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
  const { t, lang, isRTL } = useLanguage()
  const navigate  = useNavigate()
  const location  = useLocation()

  const [sidebarExpanded,    setSidebarExpanded]    = useState(false)
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false)
  const profileRef = useRef(null)

  const isMasterAdmin = user?.email === MASTER_ADMIN_EMAIL
  const NAV_ITEMS = NAV_ITEMS_DEF.map(n => ({ ...n, label: t(n.en, n.ar) }))

  useEffect(() => {
    if (!profileDropdownOpen) return
    const handler = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileDropdownOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [profileDropdownOpen])

  const getGlobalModule = () => {
    const segments = location.pathname.split('/').filter(Boolean)
    const module = segments[0]
    if (!module || module === 'dashboard') return 'dashboard'
    return module
  }
  const globalModule = getGlobalModule()

  const getThemeClass = () => {
    switch (globalModule) {
      case 'fleet':     return 'theme-fleet'
      case 'help':      return 'theme-help'
      case 'users':     return 'theme-users'
      case 'profile':   return 'theme-profile'
      case 'reports':   return 'theme-reports'
      case 'inventory': return 'theme-inventory'
      case 'assets':    return 'theme-assets'
      case 'dashboard': return 'theme-dashboard'
      case 'logistics':
      default:          return 'theme-logistics'
    }
  }

  const getModuleLabel = () => {
    if (globalModule === 'dashboard') return t('Operations Overview', 'نظرة عامة على العمليات')
    return NAV_ITEMS.find(n => n.id === globalModule)?.label ?? globalModule
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

  return (
    <div className={`ops-portal-root ${getThemeClass()}`}>
      <motion.nav
        className="ops-global-rail"
        initial={{ opacity: 0, x: -16 }}
        animate={{ opacity: 1, x: 0, width: sidebarExpanded ? SIDEBAR_EXPANDED : SIDEBAR_COLLAPSED }}
        transition={{ opacity: { duration: 0.4 }, x: { duration: 0.45, ease: [0.16, 1, 0.3, 1] }, width: { type: 'spring', stiffness: 300, damping: 32 } }}
        onHoverStart={() => setSidebarExpanded(true)}
        onHoverEnd={() => setSidebarExpanded(false)}
      >
        <div className="ops-rail-header">
          <motion.img src="/fmac-logo-new.png" alt="FMAC" className="ops-rail-logo-img" onClick={() => navigate('/dashboard')} whileHover={{ scale: 1.18, rotate: -10 }} transition={{ type: 'spring', stiffness: 280, damping: 14 }} />
          <motion.span className="ops-rail-brand-name" variants={labelVariants} animate={sidebarExpanded ? 'expanded' : 'collapsed'} transition={labelTransition(sidebarExpanded ? 0.04 : 0)}>{t('Operations Dept.', 'قسم العمليات')}</motion.span>
        </div>
        <div className="ops-rail-nav">
          {NAV_ITEMS.map(({ id, icon: Icon, label, path }, i) => (
            <motion.button key={id} className={`ops-rail-item ${globalModule === id ? 'active' : ''}`} onClick={() => navigate(path)} whileTap={{ scale: 0.96 }} transition={{ type: 'spring', stiffness: 400, damping: 24 }}>
              {globalModule === id && <motion.span layoutId="nav-indicator" className="ops-rail-indicator" transition={{ type: 'spring', bounce: 0.2, duration: 0.42 }} />}
              <div className="rail-item-icon"><Icon size={19} strokeWidth={1.75} /></div>
              <motion.span className="rail-item-label" variants={labelVariants} animate={sidebarExpanded ? 'expanded' : 'collapsed'} transition={labelTransition(sidebarExpanded ? 0.06 + i * 0.025 : 0)}>{label}</motion.span>
            </motion.button>
          ))}
        </div>
        <div className="ops-rail-footer">
          <div className="ops-rail-divider" />
          <motion.button className="ops-rail-logout" onClick={() => signOut(auth)} whileTap={{ scale: 0.96 }} transition={{ type: 'spring', stiffness: 400, damping: 24 }}>
            <div className="rail-item-icon"><LogOut size={18} strokeWidth={1.75} /></div>
            <motion.span className="rail-item-label" variants={labelVariants} animate={sidebarExpanded ? 'expanded' : 'collapsed'} transition={labelTransition(sidebarExpanded ? 0.10 : 0)}>{t('Sign Out', 'تسجيل الخروج')}</motion.span>
          </motion.button>
        </div>
      </motion.nav>

      <motion.div className="ops-main-wrapper" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay: 0.15 }}>
        <motion.header className="ops-top-bar" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}>
          <div style={{ position: 'absolute', left: isRTL ? 'auto' : '24px', right: isRTL ? '24px' : 'auto', top: '50%', transform: 'translateY(-50%)' }}>
            <AnimatePresence mode="wait">
              <motion.div key={globalModule} className="ops-module-badge" initial={{ opacity: 0, x: isRTL ? 6 : -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: isRTL ? 6 : -6 }} transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}>
                <span className="ops-badge-dot" />
                <span className="ops-badge-label">{getModuleLabel()}</span>
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="ops-status-cluster" style={{ position: 'absolute', left: isRTL ? '20px' : 'auto', right: isRTL ? 'auto' : '20px', top: '50%', transform: 'translateY(-50%)', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
            <LanguageToggle />
            <ThemeToggle />
            <div className="ops-header-divider" />
            <div className="ops-user-section" ref={profileRef}>
              <button className="ops-user-chip" onClick={() => setProfileDropdownOpen(v => !v)}>
                <div className="ops-user-chip-avatar">
                  {userProfile?.photoURL ? (
                    <img src={userProfile.photoURL} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                  ) : (
                    <span className="ops-user-chip-initials">{getInitials(displayName)}</span>
                  )}
                </div>
                <div className="ops-user-chip-text ops-user-chip-text-desktop">
                  <span className="ops-user-chip-name">{displayName}</span>
                  <span className="ops-user-chip-role">{getRoleLabel()}</span>
                </div>
              </button>
              <AnimatePresence>
                {profileDropdownOpen && (
                  <motion.div className="ops-profile-dropdown" initial={{ opacity: 0, scale: 0.95, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: -4 }} transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }} style={{ transformOrigin: isRTL ? 'top left' : 'top right' }}>
                    <button className="ops-dropdown-item" onClick={() => { setProfileDropdownOpen(false); navigate('/profile') }}>{t('My Profile', 'ملفي الشخصي')}</button>
                    <div className="ops-dropdown-divider" />
                    <button className="ops-dropdown-item ops-dropdown-item-danger" onClick={() => { setProfileDropdownOpen(false); signOut(auth) }}>{t('Sign Out', 'تسجيل الخروج')}</button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.header>

        <div className="ops-module-container">
          <AnimatePresence mode="wait">
            <motion.div key={globalModule} className="ops-module-inner" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}>
              <ChunkErrorBoundary routeKey={globalModule}>
                <Suspense fallback={<ModuleLoader />}>
                  <Outlet />
                </Suspense>
              </ChunkErrorBoundary>
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Mobile-only bottom navigation — shown via CSS only on ≤768px */}
      <nav className="ops-mobile-nav">
        {NAV_ITEMS.map(({ id, icon: Icon, path }) => (
          <button
            key={id}
            className={`ops-mobile-nav-item${globalModule === id ? ' active' : ''}`}
            onClick={() => navigate(path)}
          >
            <Icon size={21} strokeWidth={1.75} />
          </button>
        ))}
        <button className="ops-mobile-nav-item ops-mobile-nav-logout" onClick={() => signOut(auth)}>
          <LogOut size={21} strokeWidth={1.75} />
        </button>
      </nav>
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
    <Suspense fallback={null}>
      <Routes>
        {/* PUBLIC */}
        <Route path="/"                             element={<HelpLanding />} />
        <Route path="/submit/:type"                 element={<HelpFormWizard />} />
        <Route path="/submit/success/:ticketId"     element={<HelpSuccess />} />

        {/* AUTH */}
        <Route path="/login" element={<LoginPage />} />

        {/* PROTECTED */}
        <Route element={<MainAuthGuard><MainAppLayout /></MainAuthGuard>}>
          <Route path="/dashboard"    element={<OperationsDashboard userProfile={userProfile} />} />
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
