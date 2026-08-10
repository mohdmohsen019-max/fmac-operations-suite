/* ══════════════════════════════════════════════════════════════════════════
   Crisis & Emergency Management — module shell
   إدارة الأزمات والطوارئ

   Owns the tab navigation, deep-link routing, the permission gate, the
   real-time Firestore listeners feeding every register, and one-time seeding
   of the configurable default registers (services, response plans, recovery).
   ════════════════════════════════════════════════════════════════════════ */
import { useState, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Siren, Radio, Boxes, Activity, ShieldAlert, ClipboardList,
  Users2, Contact, Megaphone, FlaskConical, Wrench, DatabaseBackup, Gauge,
  FileText, Settings, Lock, RefreshCw,
} from 'lucide-react'
import { db } from '../firebase'
import {
  collection, onSnapshot, getDocs, setDoc, doc, query, orderBy,
} from 'firebase/firestore'
import { useLanguage } from '../contexts/LanguageContext'
import { usePermissions } from '../hooks/usePermissions'
import {
  COL, SEED_SERVICES, SEED_SCENARIOS, SEED_RECOVERY, PLAN_CHECKLIST_DEFAULTS,
} from './crisis/crisisData'
import CrisisDashboard from './crisis/CrisisDashboard'
import CrisisIncidents from './crisis/CrisisIncidents'
import CrisisEventRoom from './crisis/CrisisEventRoom'
import CrisisRegisters from './crisis/CrisisRegisters'
import CrisisRisks from './crisis/CrisisRisks'
import CrisisBIA from './crisis/CrisisBIA'
import CrisisKpis from './crisis/CrisisKpis'
import CrisisReports from './crisis/CrisisReports'
import CrisisSettings from './crisis/CrisisSettings'
import './CrisisModule.css'

const TABS = [
  { id: 'dashboard',  icon: LayoutDashboard, en: 'Command Dashboard',   ar: 'لوحة القيادة',          admin: false },
  { id: 'incidents',  icon: Siren,           en: 'Incidents & Crises',  ar: 'الحوادث والأزمات',      admin: false },
  { id: 'room',       icon: Radio,           en: 'Event Room',          ar: 'غرفة إدارة الحدث',      admin: false },
  { id: 'services',   icon: Boxes,           en: 'Critical Services',   ar: 'الخدمات الحيوية',       admin: false },
  { id: 'bia',        icon: Activity,        en: 'Impact Analysis',     ar: 'تحليل أثر الأعمال',     admin: false },
  { id: 'risks',      icon: ShieldAlert,     en: 'Critical Risks',      ar: 'سجل المخاطر الحرجة',    admin: false },
  { id: 'plans',      icon: ClipboardList,   en: 'Response Plans',      ar: 'خطط الاستجابة',         admin: false },
  { id: 'teams',      icon: Users2,          en: 'Crisis Teams',        ar: 'فرق إدارة الأزمات',     admin: false },
  { id: 'contacts',   icon: Contact,         en: 'Contact Directory',   ar: 'جهات الاتصال',          admin: false },
  { id: 'comms',      icon: Megaphone,       en: 'Communications',      ar: 'الاتصالات والتحديثات',  admin: false },
  { id: 'exercises',  icon: FlaskConical,    en: 'Exercises & Drills',  ar: 'الاختبارات والتمارين',  admin: false },
  { id: 'corrective', icon: Wrench,          en: 'Corrective Actions',  ar: 'الإجراءات التصحيحية',   admin: false },
  { id: 'recovery',   icon: DatabaseBackup,  en: 'Digital Recovery',    ar: 'التعافي الرقمي',        admin: false },
  { id: 'kpis',       icon: Gauge,           en: 'Performance (KPIs)',  ar: 'مؤشرات الأداء',         admin: false },
  { id: 'reports',    icon: FileText,        en: 'Reports & Evidence',  ar: 'التقارير والأدلة',      admin: false },
  { id: 'settings',   icon: Settings,        en: 'Settings',            ar: 'الإعدادات',             admin: true  },
]

const SLUG = TABS.map(t => t.id)

/* One live listener per register → local state. */
function useCollection(name, order) {
  const [rows, setRows] = useState([])
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let fallbackUnsub = null
    const q = order ? query(collection(db, name), orderBy(order, 'desc')) : collection(db, name)
    const unsub = onSnapshot(q, snap => {
      setRows(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setReady(true)
    }, err => {
      // ordering may need an index that isn't there yet — fall back unordered
      console.warn(`crisis ${name} listener:`, err.code)
      fallbackUnsub = onSnapshot(collection(db, name), s => {
        setRows(s.docs.map(d => ({ id: d.id, ...d.data() }))); setReady(true)
      }, e2 => { console.error(`crisis ${name} fallback:`, e2); setReady(true) })
    })
    // clean up BOTH the primary and (if created) the fallback listener
    return () => { unsub(); if (fallbackUnsub) fallbackUnsub() }
  }, [name, order])
  return [rows, ready]
}

export default function CrisisModule() {
  const { t, lang, locale } = useLanguage()
  const { can, isMasterAdmin, isHOD, userProfile, user } = usePermissions()
  const navigate = useNavigate()
  const location = useLocation()

  const canView = can('crisis', 'view')
  const canEdit = can('crisis', 'edit')   // coarse "manage" capability

  /* the URL is the single source of truth for the active tab */
  const seg = location.pathname.split('/').filter(Boolean)
  const activeTab = (seg[0] === 'crisis' && SLUG.includes(seg[1])) ? seg[1] : 'dashboard'

  /* actor identity for audit + notifications */
  const actor = useMemo(() => ({
    uid: user?.uid || '',
    email: user?.email || '',
    name: userProfile?.displayName || user?.displayName || user?.email?.split('@')[0] || 'User',
  }), [user, userProfile])

  /* live registers */
  const [incidents, incReady]   = useCollection(COL.incidents, 'createdAt')
  const [decisions]             = useCollection(COL.decisions)
  const [actions]               = useCollection(COL.actions)
  const [services]              = useCollection(COL.services)
  const [bia]                   = useCollection(COL.bia)
  const [risks]                 = useCollection(COL.risks)
  const [plans]                 = useCollection(COL.plans)
  const [teams]                 = useCollection(COL.teams)
  const [contacts]              = useCollection(COL.contacts)
  const [comms]                 = useCollection(COL.comms)
  const [exercises]             = useCollection(COL.exercises)
  const [corrective]            = useCollection(COL.corrective)
  const [recovery]              = useCollection(COL.recovery)

  /* one-time seed of the configurable defaults (admins only) */
  useEffect(() => {
    if (!isMasterAdmin && !isHOD) return
    let cancelled = false
    ;(async () => {
      try {
        const [sv, pl, rc] = await Promise.all([
          getDocs(collection(db, COL.services)),
          getDocs(collection(db, COL.plans)),
          getDocs(collection(db, COL.recovery)),
        ])
        if (cancelled) return
        if (sv.empty) {
          await Promise.all(SEED_SERVICES.map((s, i) =>
            setDoc(doc(db, COL.services, `seed_${i}`), {
              ...s, status: 'operational', readiness: 'partial', approval: 'approved',
              seeded: true, createdAt: new Date(), createdByName: 'System (seed)',
            })))
        }
        if (pl.empty) {
          await Promise.all(SEED_SCENARIOS.map((s, i) =>
            setDoc(doc(db, COL.plans, `seed_${i}`), {
              category: s.cat, name_en: s.name_en, name_ar: s.name_ar, level: s.level,
              approval: 'approved', version: '1.0',
              checklist: PLAN_CHECKLIST_DEFAULTS.map(c => ({ ...c })),
              seeded: true, createdAt: new Date(), createdByName: 'System (seed)',
            })))
        }
        if (rc.empty) {
          await Promise.all(SEED_RECOVERY.map((s, i) =>
            setDoc(doc(db, COL.recovery, `seed_${i}`), {
              system_en: s.system_en, system_ar: s.system_ar, owner: s.owner, priority: s.priority,
              rto: s.rto, rpo: s.rpo, freq: s.freq, status: 'ready',
              seeded: true, createdAt: new Date(), createdByName: 'System (seed)',
            })))
        }
      } catch (err) {
        console.warn('crisis seed skipped:', err?.code || err)
      }
    })()
    return () => { cancelled = true }
  }, [isMasterAdmin, isHOD])

  const goTab = useCallback((id) => {
    navigate(id === 'dashboard' ? '/crisis' : `/crisis/${id}`)
  }, [navigate])

  const shared = {
    lang, t, locale, canEdit, canManage: canEdit, actor,
    incidents, decisions, actions, services, bia, risks, plans, teams,
    contacts, comms, exercises, corrective, recovery,
    goTab,
  }

  const visibleTabs = TABS.filter(tab => !tab.admin || canEdit)

  if (!canView) {
    return (
      <div className="crs-denied">
        <Lock size={44} strokeWidth={1.3} />
        <p className="crs-denied-title">{t('You do not have access to Crisis Management', 'ليس لديك صلاحية الوصول لإدارة الأزمات')}</p>
        <p className="crs-denied-sub">{t('Contact your administrator to request access.', 'تواصل مع المدير لطلب الصلاحية.')}</p>
      </div>
    )
  }

  const renderTab = () => {
    switch (activeTab) {
      case 'dashboard':  return <CrisisDashboard {...shared} />
      case 'incidents':  return <CrisisIncidents {...shared} />
      case 'room':       return <CrisisEventRoom {...shared} />
      case 'services':   return <CrisisRegisters kind="services" {...shared} />
      case 'bia':        return <CrisisBIA {...shared} />
      case 'risks':      return <CrisisRisks {...shared} />
      case 'plans':      return <CrisisRegisters kind="plans" {...shared} />
      case 'teams':      return <CrisisRegisters kind="teams" {...shared} />
      case 'contacts':   return <CrisisRegisters kind="contacts" {...shared} />
      case 'comms':      return <CrisisRegisters kind="comms" {...shared} />
      case 'exercises':  return <CrisisRegisters kind="exercises" {...shared} />
      case 'corrective': return <CrisisRegisters kind="corrective" {...shared} />
      case 'recovery':   return <CrisisRegisters kind="recovery" {...shared} />
      case 'kpis':       return <CrisisKpis {...shared} />
      case 'reports':    return <CrisisReports {...shared} />
      case 'settings':   return canEdit ? <CrisisSettings {...shared} /> : (
        <div className="crs-denied">
          <Lock size={44} strokeWidth={1.3} />
          <p className="crs-denied-title">{t('You do not have access to Crisis Management', 'ليس لديك صلاحية الوصول لإدارة الأزمات')}</p>
          <p className="crs-denied-sub">{t('Contact your administrator to request access.', 'تواصل مع المدير لطلب الصلاحية.')}</p>
        </div>
      )
      default:           return null
    }
  }

  const activeMeta = TABS.find(tt => tt.id === activeTab)

  return (
    <div className="crs-module">
      <div className="crs-head">
        <div className="crs-head-titles">
          <h1 className="crs-head-title">
            <Siren size={19} />{t('Crisis & Emergency Management', 'إدارة الأزمات والطوارئ')}
          </h1>
          <p className="crs-head-sub">
            {t('Business continuity framework 2026–2028 · Operations Department',
               'إطار إدارة الأزمات واستمرارية الأعمال 2026–2028 · إدارة العمليات')}
          </p>
        </div>
      </div>

      <nav className="crs-tabs" aria-label={t('Crisis sections', 'أقسام الأزمات')}>
        {visibleTabs.map(tab => {
          const Icon = tab.icon
          return (
            <button key={tab.id} className={`crs-tab${activeTab === tab.id ? ' active' : ''}`} onClick={() => goTab(tab.id)}>
              <Icon size={14} strokeWidth={1.9} />{t(tab.en, tab.ar)}
            </button>
          )
        })}
      </nav>

      <div className="crs-body">
        {!incReady ? (
          <div className="crs-loading"><RefreshCw size={26} className="crs-spin" /><span>{t('Loading…', 'جارٍ التحميل…')}</span></div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div key={activeTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }} aria-label={activeMeta && t(activeMeta.en, activeMeta.ar)}>
              {renderTab()}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}
