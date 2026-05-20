import re
import os

target_file = r"c:\Users\mohdm\Desktop\Projects\FMAC Logistics Hub\src\App.jsx"

content = """import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Package2, Bus, Users, LifeBuoy, LogOut, BarChart2, Package } from 'lucide-react'
import { Routes, Route, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import './App.css'
import ThemeToggle from './components/shared/ThemeToggle'
import LanguageToggle from './components/shared/LanguageToggle'
import { useLanguage } from './contexts/LanguageContext'
import { auth, db } from './firebase'
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'

import LoginPage from './components/LoginPage'
import LogisticsModule from './components/LogisticsModule'
import FleetModule from './components/FleetModule'
import UserManagementModule from './components/UserManagementModule'
import ProfileModule from './components/ProfileModule'
import ReportsModule from './components/ReportsModule'
import InventoryModule from './components/InventoryModule'
import OperationsDashboard from './components/OperationsDashboard'

import HelpLanding from './components/help/public/HelpLanding'
import HelpFormWizard from './components/help/public/HelpFormWizard'
import HelpSuccess from './components/help/public/HelpSuccess'
import HelpAdminLogin from './components/help/admin/HelpAdminLogin'
import HelpAdminDashboard from './components/help/admin/HelpAdminDashboard'
import HelpAdminTicket from './components/help/admin/HelpAdminTicket'

const NAV_ITEMS_DEF = [
  { id: 'fleet', icon: Bus, en: 'Fleet Management', ar: 'إدارة الأسطول', path: '/fleet/dashboard' },
  { id: 'help', icon: LifeBuoy, en: 'Help Desk', ar: 'مركز الدعم', path: '/' },
  { id: 'logistics', icon: Package2, en: 'Logistics Hub', ar: 'مركز اللوجستيات', path: '/logistics/dashboard' },
  { id: 'users', icon: Users, en: 'User Management', ar: 'إدارة المستخدمين', path: '/users/dashboard' },
  { id: 'reports', icon: BarChart2, en: 'Dept. Reports', ar: 'تقارير الأقسام', path: '/reports' },
  { id: 'inventory', icon: Package, en: 'Inventory', ar: 'المخزون', path: '/inventory' },
]

const SIDEBAR_COLLAPSED = 54
const SIDEBAR_EXPANDED = 230

const labelVariants = {
  expanded: { opacity: 1, x: 0, maxWidth: 160 },
  collapsed: { opacity: 0, x: -6, maxWidth: 0 },
}
const labelTransition = (delay = 0) => ({
  duration: 0.18,
  delay,
  ease: [0.16, 1, 0.3, 1],
})

function App() {
  const { t, lang, isRTL } = useLanguage()
  const NAV_ITEMS = NAV_ITEMS_DEF.map(n => ({ ...n, label: t(n.en, n.ar) }))

  const [user, setUser] = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [initializing, setInitializing] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser)
      if (currentUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', currentUser.uid))
          if (userDoc.exists()) {
            setUserProfile(userDoc.data())
          } else {
            const newProfile = {
              email: currentUser.email,
              role: 'admin',
              status: 'active',
              createdAt: serverTimestamp()
            }
            await setDoc(doc(db, 'users', currentUser.uid), newProfile)
            setUserProfile(newProfile)
          }
        } catch (err) {
          console.error('Profile fetch failed:', err)
        }
      } else {
        setUserProfile(null)
      }
      setInitializing(false)
    })
    return () => unsubscribe()
  }, [])

  const handleLogin = async (email, password) => {
    return signInWithEmailAndPassword(auth, email, password)
  }

  const handleSignUp = async (email, password, displayName) => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password)
    const user = userCredential.user
    const profile = {
      email,
      displayName: displayName || email.split('@')[0],
      role: 'pending',
      status: 'pending',
      createdAt: serverTimestamp()
    }
    await setDoc(doc(db, 'users', user.uid), profile)
    return userCredential
  }

  if (initializing) {
    return (
      <motion.div className="initializing-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
        <motion.div className="jumping-logo-container" initial={{ opacity: 0, scale: 0.88, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}>
          <img src="/fmac-logo-new.png" alt="Loading" className="jumping-logo" />
          <span className="jumping-text">{t('Initializing Operations...', 'جاري تهيئة العمليات...')}</span>
        </motion.div>
      </motion.div>
    )
  }

  const HelpAdminGuard = ({ children }) => {
    if (!user) return <Navigate to="/admin/login" replace />
    return children
  }

  const MainAuthGuard = ({ children }) => {
    if (!user) return <Navigate to="/login" replace />
    if (userProfile?.role === 'pending' || userProfile?.status === 'pending') {
      return (
        <motion.div className="initializing-overlay" style={{ background: 'var(--theme-bg)' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
          <motion.div className="jumping-logo-container" style={{ textAlign: 'center', maxWidth: '400px' }} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
            <img src="/fmac-logo-new.png" alt="Pending" className="jumping-logo" style={{ marginBottom: '24px' }} />
            <h1 style={{ color: 'var(--theme-text-main)', fontSize: '1.5rem', marginBottom: '12px' }}>{t('Access Pending Approval', 'الوصول بانتظار الموافقة')}</h1>
            <p style={{ color: 'var(--theme-text-muted)', lineHeight: 1.6 }}>
              {t('Your account', 'حسابك')} <strong>({user.email})</strong> {t('has been registered successfully. An administrator must approve your access before you can enter the Logistics Hub.', 'تم تسجيله بنجاح. يجب على المسؤول الموافقة على وصولك قبل الدخول.')}
            </p>
            <button onClick={() => signOut(auth)} style={{ marginTop: '32px', background: 'transparent', border: '1px solid var(--theme-accent)', color: 'var(--theme-accent)', padding: '10px 24px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>
              {t('Sign Out', 'تسجيل الخروج')}
            </button>
          </motion.div>
        </motion.div>
      )
    }
    return children
  }

  const MainAppLayout = () => {
    const navigate = useNavigate()
    const location = useLocation()
    const [sidebarExpanded, setSidebarExpanded] = useState(false)
    const [profileDropdownOpen, setProfileDropdownOpen] = useState(false)
    const profileRef = useRef(null)

    useEffect(() => {
      if (!profileDropdownOpen) return
      const handler = (e) => {
        if (profileRef.current && !profileRef.current.contains(e.target)) setProfileDropdownOpen(false)
      }
      document.addEventListener('mousedown', handler)
      return () => document.removeEventListener('mousedown', handler)
    }, [profileDropdownOpen])

    const getGlobalModule = () => {
      const path = location.pathname
      const segments = path.split('/').filter(Boolean)
      const module = segments[0]
      if (!module || module === 'dashboard') return 'dashboard'
      return module
    }
    const globalModule = getGlobalModule()

    const getThemeClass = () => {
      switch (globalModule) {
        case 'fleet': return 'theme-fleet'
        case 'help': return 'theme-help'
        case 'users': return 'theme-users'
        case 'profile': return 'theme-profile'
        case 'reports': return 'theme-reports'
        case 'inventory': return 'theme-inventory'
        case 'dashboard': return 'theme-dashboard'
        case 'logistics':
        default: return 'theme-logistics'
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
      const role = userProfile?.role
      if (!role || role === 'pending') return t('Pending', 'معلق')
      if (role === 'admin') return t('Administrator', 'مسؤول')
      return role.charAt(0).toUpperCase() + role.slice(1)
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
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    )
  }

  return (
    <Routes>
      {/* PUBLIC ROUTES (no sidebar, no auth) */}
      <Route path="/" element={<HelpLanding />} />
      <Route path="/admin/login" element={user ? <Navigate to="/admin/dashboard" replace /> : <HelpAdminLogin onLogin={handleLogin} />} />
      
      <Route path="/admin/dashboard" element={<HelpAdminGuard><HelpAdminDashboard /></HelpAdminGuard>} />
      <Route path="/admin/requests/:ticketId" element={<HelpAdminGuard><HelpAdminTicket /></HelpAdminGuard>} />
      
      <Route path="/submit/:type" element={<HelpFormWizard />} />
      <Route path="/submit/success/:ticketId" element={<HelpSuccess />} />

      {/* MAIN APP ROUTES */}
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <LoginPage onLogin={handleLogin} />} />
      
      <Route element={<MainAuthGuard><MainAppLayout /></MainAuthGuard>}>
        <Route path="/dashboard" element={<OperationsDashboard userProfile={userProfile} />} />
        <Route path="/logistics/*" element={<LogisticsModule />} />
        <Route path="/fleet/*" element={<FleetModule />} />
        <Route path="/inventory/*" element={<InventoryModule />} />
        <Route path="/reports/*" element={<ReportsModule user={user} userProfile={userProfile} />} />
        <Route path="/users/*" element={<UserManagementModule />} />
        <Route path="/profile/*" element={<ProfileModule user={user} userProfile={userProfile} onUpdateProfile={setUserProfile} />} />
      </Route>

      {/* CATCH ALL */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
"""

with open(target_file, "w", encoding="utf-8") as f:
    f.write(content)
