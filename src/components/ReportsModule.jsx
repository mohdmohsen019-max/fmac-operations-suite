import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BarChart2, Plus, ChevronLeft, Check, X, RefreshCw,
  Truck, Wrench, Users, Package, Route, Clock3, ShieldAlert, IdCard,
  Image, Fuel, Receipt, FolderOpen, FileText, AlertCircle,
  GripVertical, RotateCcw, BookOpen, Download, BellRing
} from 'lucide-react'
import { sendNotification } from '../utils/notify'
import ConfirmModal from './ConfirmModal'
import { db } from '../firebase'
import { reportGenerationService } from '../services/reportGenerationService'
import {
  collection, doc, setDoc, getDocs, getDoc, updateDoc,
  query, where, serverTimestamp
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { useLanguage } from '../contexts/LanguageContext'
import { usePermissions } from '../hooks/usePermissions'
import { reshapeArabic } from '../utils/arabicReshaper'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import './ReportsModule.css'

// Phase 2 — PDF Upload + AI Extraction
import ReportSectionUpload from './reports/ReportSectionUpload'

// Phase 5 — Final Report Template
import ReportTemplate from './reports/ReportTemplate'
import CustomSelect from './CustomSelect'

const MANUAL_SECTIONS = new Set(['player_registration', 'admin_costs', 'media', 'inventory', 'projects'])

// ── Constants ──────────────────────────────────────────────────────
const HOD_EMAIL = import.meta.env.VITE_HOD_EMAIL

/* Head of Operations — the post-holder who signs off the monthly report.
   Kept here (not read from the signed-in account) so the signature block is
   the department's, not whoever happened to compile the file. */
const HOD_NAME_AR = 'ايهاب استيته'

const ICON_MAP = { Truck, Wrench, Users, Package, Route, Clock3, ShieldAlert, IdCard, Image, Fuel, Receipt, FolderOpen }

const REPORT_SECTIONS = [
  { key: 'bus_trips',           nameAr: 'حركة الحافلات',   nameEn: 'Bus Odometers & Trips',  type: 'auto',   required: true,  icon: 'Truck' },
  { key: 'maintenance',         nameAr: 'صيانة الحافلات',  nameEn: 'Bus Maintenance',        type: 'auto',   required: true,  icon: 'Wrench' },
  { key: 'player_registration', nameAr: 'تسجيل اللاعبين', nameEn: 'Player Registration',    type: 'manual', required: true,  icon: 'Users' },
  { key: 'inventory',           nameAr: 'المخازن',          nameEn: 'Inventory',              type: 'manual', required: true,  icon: 'Package' },
  { key: 'media',               nameAr: 'ميديا',            nameEn: 'Media',                  type: 'manual', required: true,  icon: 'Image' },
  { key: 'fuel',                nameAr: 'بترول',            nameEn: 'Fuel Consumption',       type: 'auto',   required: true,  icon: 'Fuel' },
  { key: 'ridership',           nameAr: 'تشغيل الحافلات والركاب', nameEn: 'Bus Ridership & Sessions', type: 'auto', required: true, icon: 'Users' },
  { key: 'external_transport',  nameAr: 'النقل الخارجي', nameEn: 'External Transportation', type: 'auto', required: true, icon: 'Route' },
  { key: 'driver_overtime',     nameAr: 'العمل الإضافي للسائقين', nameEn: 'Driver Overtime', type: 'auto', required: true, icon: 'Clock3' },
  { key: 'traffic_fines',       nameAr: 'المخالفات المرورية', nameEn: 'Traffic Fines', type: 'auto', required: true, icon: 'ShieldAlert' },
  { key: 'registration_compliance', nameAr: 'صلاحية تسجيل المركبات', nameEn: 'Vehicle Registration Compliance', type: 'auto', required: true, icon: 'IdCard' },
  { key: 'admin_costs',         nameAr: 'تكاليف ادارية',   nameEn: 'Administrative Costs',   type: 'manual', required: true,  icon: 'Receipt' },
  { key: 'projects',            nameAr: 'مشاريع',           nameEn: 'Projects',               type: 'manual', required: false, icon: 'FolderOpen' },
]

const MONTHS_EN = ['January','February','March','April','May','June','July','August','September','October','November','December']
const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']

const RS = {
  draft:       { en: 'Draft',       ar: 'مسودة',       color: 'var(--theme-text-ghost)', bg: 'var(--theme-surface-hover)' },
  in_progress: { en: 'In Progress', ar: 'قيد التنفيذ', color: 'var(--status-warn)',                 bg: 'rgba(245,158,11,0.12)' },
  ready:       { en: 'Ready',       ar: 'جاهز',        color: 'var(--theme-accent)',      bg: 'var(--theme-accent-soft)' },
  published:   { en: 'Published',   ar: 'منشور',       color: 'var(--status-safe)',                 bg: 'rgba(16,185,129,0.12)' },
}

const SS = {
  pending:   { en: 'Pending',   ar: 'قيد الانتظار', color: 'var(--theme-text-ghost)', bg: 'var(--theme-surface-hover)',  dot: 'var(--theme-border-strong)' },
  submitted: { en: 'Submitted', ar: 'مُقدَّم',       color: 'var(--status-warn)',                 bg: 'rgba(245,158,11,0.12)',      dot: 'var(--status-warn)' },
  approved:  { en: 'Approved',  ar: 'معتمد',         color: 'var(--status-safe)',                 bg: 'rgba(16,185,129,0.12)',      dot: 'var(--status-safe)' },
  rejected:  { en: 'Rejected',  ar: 'مرفوض',         color: 'var(--status-risk)',                 bg: 'rgba(244,63,94,0.12)',       dot: 'var(--status-risk)' },
}

function monthLabel(monthStr, lang) {
  if (!monthStr) return '—'
  const [yr, mo] = monthStr.split('-')
  const idx = parseInt(mo, 10) - 1
  if (idx < 0 || idx > 11) return monthStr
  return lang === 'ar' ? `${MONTHS_AR[idx]} ${yr}` : `${MONTHS_EN[idx]} ${yr}`
}

function fmtDate(ts) {
  if (!ts) return '—'
  const d = ts?.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

/* Is this section part of the final compiled report?
   Sections created before the include/exclude switch existed have no `included`
   field — those count as included, so nothing silently drops out of a report
   that was already being prepared. Only an explicit `false` excludes. */
const isIncluded = (sec) => sec?.included !== false

function computeStatus(sections) {
  if (!sections?.length) return 'draft'
  const requiredKeys = REPORT_SECTIONS.filter(r => r.required).map(r => r.key)
  // Excluded sections are not part of the report, so they can never hold it back.
  const reqSecs = sections.filter(s => requiredKeys.includes(s.sectionKey) && isIncluded(s))
  if (reqSecs.length && reqSecs.every(s => s.status === 'approved')) return 'ready'
  if (sections.some(s => isIncluded(s) && (s.status === 'submitted' || s.status === 'approved'))) return 'in_progress'
  return 'draft'
}

// ── Root module ────────────────────────────────────────────────────
export default function ReportsModule({ user }) {
  const { t, lang } = useLanguage()
  const { isMasterAdmin, isHOD: isHODPerms, userProfile } = usePermissions()
  const [view, setView] = useState('dashboard')
  const [activeId, setActiveId] = useState(null)

  const isHOD = isHODPerms || isMasterAdmin || user?.email === HOD_EMAIL

  const canExportFinal = isMasterAdmin || isHOD;

  const openReport = (id) => { setActiveId(id); setView('detail') }
  const goBack = () => { setActiveId(null); setView('dashboard') }

  return (
    <div className="rpt-root">
      <AnimatePresence mode="wait">
        {view === 'dashboard' ? (
          <motion.div key="dash" className="rpt-page"
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}>
            <DashboardView user={user} isHOD={isHOD} lang={lang} t={t} onOpen={openReport} />
          </motion.div>
        ) : (
          <motion.div key="detail" className="rpt-page"
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}>
            <DetailView
              reportId={activeId}
              user={user}
              isMasterAdmin={isMasterAdmin}
              isHOD={isHOD}
              lang={lang}
              t={t}
              onBack={goBack}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Dashboard ──────────────────────────────────────────────────────
function DashboardView({ user, isHOD, lang, t, onOpen }) {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [filter, setFilter] = useState('all')
  const [nudgeOpen, setNudgeOpen] = useState(false)
  const [nudgeState, setNudgeState] = useState('idle') // idle | sending | sent

  useEffect(() => { load() }, [])

  /* Current month with unapproved sections → one-click reminder email */
  const currentMonthId = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
  const currentReport = reports.find(r => (r.month || r.id) === currentMonthId)
  const unapprovedNow = currentReport
    ? (currentReport._sections || []).filter(s => s.status !== 'approved').length
    : 0

  const sendNudge = async () => {
    setNudgeOpen(false)
    setNudgeState('sending')
    try {
      await sendNotification('monthly_report_reminder', {
        monthLabel: monthLabel(currentMonthId, lang),
      })
      setNudgeState('sent')
    } catch {
      setNudgeState('idle')
    }
    setTimeout(() => setNudgeState('idle'), 4000)
  }

  const load = async () => {
    setLoading(true)
    try {
      const snap = await getDocs(collection(db, 'monthly_reports'))
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.month || '').localeCompare(a.month || ''))
      const withSecs = await Promise.all(list.map(async r => {
        const ss = await getDocs(query(collection(db, 'report_sections'), where('reportId', '==', r.id)))
        return { ...r, _sections: ss.docs.map(d => ({ id: d.id, ...d.data() })) }
      }))
      setReports(withSecs)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const uniqueMonths = [...new Set(reports.map(r => r.month))].sort().reverse()
  const filtered = filter === 'all' ? reports : reports.filter(r => r.month === filter)

  return (
    <>
      <div className="rpt-header">
        <div>
          <h1 className="rpt-title">{t('Department Reports', 'تقارير الأقسام')}</h1>
          <p className="rpt-subtitle">{t('Monthly operational reports overview', 'نظرة عامة على التقارير التشغيلية الشهرية')}</p>
        </div>
        {isHOD && (
          <button className="rpt-btn-primary" onClick={() => setShowModal(true)}>
            <Plus size={15} strokeWidth={2.5} />
            {t('New Report', 'تقرير جديد')}
          </button>
        )}
      </div>

      <div className="rpt-filter-row">
        <div style={{ minWidth: 160 }}>
          <CustomSelect value={filter} onChange={setFilter}
            options={[{ value: 'all', label: t('All Months', 'كل الأشهر') }, ...uniqueMonths.map(m => ({ value: m, label: monthLabel(m, lang) }))]} />
        </div>
        <button className="rpt-btn-ghost rpt-btn-sm" onClick={load}>
          <RefreshCw size={13} /> {t('Refresh', 'تحديث')}
        </button>
        {unapprovedNow > 0 && (
          <button
            className="rpt-btn-ghost rpt-btn-sm"
            onClick={() => setNudgeOpen(true)}
            disabled={nudgeState !== 'idle'}
            title={t('Email the configured recipients a reminder for this month', 'إرسال تذكير بالبريد للمستلمين المحددين لهذا الشهر')}
          >
            <BellRing size={13} />
            {nudgeState === 'sending'
              ? t('Sending…', 'جارٍ الإرسال…')
              : nudgeState === 'sent'
                ? t('Reminder sent', 'تم إرسال التذكير')
                : `${t('Send reminder', 'إرسال تذكير')} · ${unapprovedNow}`}
          </button>
        )}
      </div>

      <ConfirmModal
        isOpen={nudgeOpen}
        onClose={() => setNudgeOpen(false)}
        onConfirm={sendNudge}
        title={t('Send approval reminder?', 'إرسال تذكير بالاعتماد؟')}
        message={t(
          `Emails the configured recipients that ${unapprovedNow} section(s) of the ${monthLabel(currentMonthId, lang)} report still need approval. The send is recorded in the notification log.`,
          `سيتم إرسال بريد للمستلمين المحددين بأن ${unapprovedNow} قسمًا من تقرير ${monthLabel(currentMonthId, lang)} لا يزال بانتظار الاعتماد. يُسجَّل الإرسال في سجل الإشعارات.`
        )}
        confirmText={t('Send', 'إرسال')}
        cancelText={t('Cancel', 'إلغاء')}
      />

      {loading ? (
        <div className="rpt-center"><RefreshCw size={22} className="rpt-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="rpt-center rpt-empty">
          <BarChart2 size={44} />
          <p>{t('No reports found. Create the first monthly report.', 'لا توجد تقارير. أنشئ أول تقرير شهري.')}</p>
        </div>
      ) : (
        <div className="rpt-list">
          {filtered.map((r, i) => (
            <motion.div key={r.id}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, delay: i * 0.04 }}>
              <ReportCard report={r} lang={lang} t={t} onOpen={onOpen} />
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showModal && (
          <NewReportModal
            user={user} lang={lang} t={t}
            existingIds={reports.map(r => r.id)}
            onClose={() => setShowModal(false)}
            onCreated={(id) => { load(); onOpen(id) }}
          />
        )}
      </AnimatePresence>
    </>
  )
}

// ── Report card ────────────────────────────────────────────────────
function ReportCard({ report, lang, t, onOpen }) {
  const secs = report._sections || []
  // Progress is measured against the sections actually going into this report.
  const included = secs.filter(isIncluded)
  const submitted = included.filter(s => s.status === 'submitted' || s.status === 'approved').length
  const total = included.length || REPORT_SECTIONS.length
  const pct = total > 0 ? Math.round((submitted / total) * 100) : 0
  const status = computeStatus(secs)
  const si = RS[status] || RS.draft

  return (
    <div className="rpt-card">
      <div className="rpt-card-top">
        <div className="rpt-card-left">
          <h2 className="rpt-card-month">{monthLabel(report.month || report.id, lang)}</h2>
          <span className="rpt-meta-text">{t('Created', 'أُنشئ')} {fmtDate(report.createdAt)}</span>
        </div>
        <span className="rpt-badge" style={{ color: si.color, background: si.bg }}>
          {lang === 'ar' ? si.ar : si.en}
        </span>
      </div>
      <div className="rpt-prog-row">
        <div className="rpt-prog-bar">
          <div className="rpt-prog-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="rpt-prog-label">{submitted}/{total} {t('sections', 'أقسام')}</span>
      </div>
      <div className="rpt-dots">
        {REPORT_SECTIONS.map(def => {
          const sec = secs.find(s => s.sectionKey === def.key)
          if (!isIncluded(sec)) return null
          return (
            <div key={def.key} className="rpt-dot"
              style={{ background: SS[sec?.status || 'pending']?.dot }}
              title={lang === 'ar' ? def.nameAr : def.nameEn} />
          )
        })}
      </div>
      <div className="rpt-card-footer">
        <button className="rpt-btn-outline" onClick={() => onOpen(report.id)}>
          {t('Open Report', 'فتح التقرير')}
        </button>
      </div>
    </div>
  )
}

// ── New report modal ───────────────────────────────────────────────
function NewReportModal({ user, lang, t, existingIds, onClose, onCreated }) {
  const now = new Date()
  const [year, setYear] = useState(String(now.getFullYear()))
  const [month, setMonth] = useState(String(now.getMonth() + 1).padStart(2, '0'))
  const [creating, setCreating] = useState(false)
  const [err, setErr] = useState('')

  const rid = `${year}-${month}`
  const isDup = existingIds.includes(rid)

  const create = async () => {
    if (isDup) return
    setCreating(true); setErr('')
    try {
      const idx = parseInt(month, 10) - 1
      const monthName = lang === 'ar' ? `${MONTHS_AR[idx]} ${year}` : `${MONTHS_EN[idx]} ${year}`
      await setDoc(doc(db, 'monthly_reports', rid), {
        reportId: rid, month: rid, year: parseInt(year),
        monthName, status: 'draft',
        createdAt: serverTimestamp(), createdBy: user?.uid || '',
        sections: REPORT_SECTIONS.map(s => s.key), notes: '',
      })
      await Promise.all(REPORT_SECTIONS.map((sec, i) =>
        setDoc(doc(db, 'report_sections', `${rid}_${sec.key}`), {
          sectionId: `${rid}_${sec.key}`, reportId: rid,
          sectionKey: sec.key, sectionNameAr: sec.nameAr, sectionNameEn: sec.nameEn,
          type: sec.type, status: 'pending',
          submittedBy: null, submittedAt: null,
          approvedBy: null, approvedAt: null,
          content: {}, attachments: [],
          employeeNotes: '', hodNotes: '',
          order: i, isIncluded: true,
        })
      ))
      onCreated(rid); onClose()
    } catch (e) {
      console.error(e)
      setErr(t('Failed to create report.', 'فشل إنشاء التقرير.'))
    }
    setCreating(false)
  }

  return (
    <div className="rpt-overlay" onClick={onClose}>
      <motion.div className="rpt-modal"
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        onClick={e => e.stopPropagation()}>
        <div className="rpt-modal-hd">
          <h2>{t('New Monthly Report', 'تقرير شهري جديد')}</h2>
          <button className="rpt-icon-btn" onClick={onClose}><X size={17} /></button>
        </div>
        <div className="rpt-modal-bd">
          <div className="rpt-field-row">
            <div className="rpt-field">
              <label className="rpt-label">{t('Year', 'السنة')}</label>
              <CustomSelect value={year} onChange={setYear}
                options={[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => ({ value: String(y), label: String(y) }))} />
            </div>
            <div className="rpt-field">
              <label className="rpt-label">{t('Month', 'الشهر')}</label>
              <CustomSelect value={month} onChange={setMonth}
                options={MONTHS_EN.map((m, i) => ({ value: String(i + 1).padStart(2, '0'), label: lang === 'ar' ? MONTHS_AR[i] : m }))} />
            </div>
          </div>
          {isDup && (
            <div className="rpt-warn">
              <AlertCircle size={13} />
              {t('A report for this month already exists.', 'يوجد تقرير لهذا الشهر مسبقاً.')}
            </div>
          )}
          {err && <div className="rpt-err">{err}</div>}
          <p className="rpt-modal-info">
            {t('Creates a new report and initializes', 'ينشئ تقريراً جديداً ويهيّئ')}{' '}
            <strong>9 {t('sections', 'أقسام')}</strong>{' '}
            {t('ready for submission.', 'جاهزة للتقديم.')}
          </p>
        </div>
        <div className="rpt-modal-ft">
          <button className="rpt-btn-ghost" onClick={onClose}>{t('Cancel', 'إلغاء')}</button>
          <button className="rpt-btn-primary" onClick={create} disabled={creating || isDup}>
            {creating ? <RefreshCw size={13} className="rpt-spin" /> : <Plus size={13} />}
            {creating ? t('Creating…', 'جارٍ الإنشاء…') : t('Create Report', 'إنشاء التقرير')}
          </button>
        </div>
      </motion.div>
    </div>
  )
}

// ── Detail view ────────────────────────────────────────────────────
function DetailView({ reportId, user, isMasterAdmin, isHOD, lang, t, onBack }) {
  const { canSubmitReport } = usePermissions()
  const [report, setReport] = useState(null)
  const [sections, setSections] = useState([])
  const [loading, setLoading] = useState(true)
  const [reportNotes, setReportNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [isCompiling, setIsCompiling] = useState(false)
  const [importingSecId, setImportingSecId] = useState(null)
  const [toast, setToast] = useState('')
  const [dragIdx, setDragIdx] = useState(null)
  const [dragOverIdx, setDragOverIdx] = useState(null)

  const canExportFinal = isMasterAdmin || isHOD;

  // Phase 5 — template preview state
  const [templateData, setTemplateData] = useState(null)
  const [showTemplatePreview, setShowTemplatePreview] = useState(false)

  // Phase 2 — active form modal state
  const [activeFormKey, setActiveFormKey] = useState(null)
  const [activeFormSection, setActiveFormSection] = useState(null)

  const openForm = (sectionKey, sectionDoc) => {
    setActiveFormKey(sectionKey)
    setActiveFormSection(sectionDoc)
  }

  const closeForm = () => {
    setActiveFormKey(null)
    setActiveFormSection(null)
  }

  const handleFormSubmitted = () => {
    closeForm()
    loadDetail()
    popToast(t('Section submitted', 'تم تقديم القسم'))
  }

  useEffect(() => { if (reportId) loadDetail() }, [reportId])

  /* Preview overlay: close on Escape and stop the page behind it scrolling. */
  useEffect(() => {
    if (!showTemplatePreview) return
    const onKey = (e) => { if (e.key === 'Escape') setShowTemplatePreview(false) }
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [showTemplatePreview])

  const reshapeRecursive = (obj) => {
    // Disabled reshaping to rely on native Cairo font shaping
    return obj
  }

  const buildTemplateData = (shouldReshape = false) => {
    const [yr, mo] = reportId.split('-')
    const idx = parseInt(mo, 10) - 1
    const monthName = `${MONTHS_AR[idx]} ${yr}`
    const today = new Date()
    const generatedDate = `${today.getDate()} ${MONTHS_AR[today.getMonth()]} ${today.getFullYear()}`

    const rawData = {
      monthName,
      /* The report is issued by the Head of Operations, whoever happens to be
         compiling it — so the signature block carries the post-holder's name,
         never the logged-in account (which fell back to a raw email address). */
      hodName: HOD_NAME_AR,
      generatedDate,
      reportId,
      notes: reportNotes,
      sections: sections
        .filter(isIncluded)
        .filter(s => s.status === 'approved' || s.status === 'submitted')
        .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
        .map(s => {
          const def = REPORT_SECTIONS.find(d => d.key === s.sectionKey)
          let parsedContent = {}
          try { parsedContent = typeof s.content === 'string' ? JSON.parse(s.content) : (s.content || {}) } catch { parsedContent = {} }
          return { ...s, nameAr: def?.nameAr || s.sectionKey, nameEn: def?.nameEn, parsedContent }
        }),
    }
    return shouldReshape ? reshapeRecursive(rawData) : rawData
  }

  const loadDetail = async () => {
    setLoading(true)
    try {
      const rSnap = await getDoc(doc(db, 'monthly_reports', reportId))
      if (rSnap.exists()) {
        const d = rSnap.data()
        setReport({ id: rSnap.id, ...d })
        setReportNotes(d.notes || '')
      }
      const sSnap = await getDocs(query(collection(db, 'report_sections'), where('reportId', '==', reportId)))
      const secs = sSnap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      setSections(secs)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  // displaySections: REPORT_SECTIONS defs merged with Firestore data, sorted by stored order
  const displaySections = REPORT_SECTIONS.map(def => ({
    def,
    sec: sections.find(s => s.sectionKey === def.key),
  })).sort((a, b) => {
    const ao = a.sec?.order ?? REPORT_SECTIONS.findIndex(r => r.key === a.def.key)
    const bo = b.sec?.order ?? REPORT_SECTIONS.findIndex(r => r.key === b.def.key)
    return ao - bo
  })

  const popToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  /* Include / exclude a section from the final compiled report. Presentation
     only — the section keeps its content, status and history either way, so
     re-including it restores everything exactly as it was. */
  const handleToggleIncluded = async (sectionDocId, def, next) => {
    try {
      // setDoc+merge (not updateDoc) so this still works for a section whose
      // doc was never created, without clobbering existing fields.
      await setDoc(doc(db, 'report_sections', sectionDocId), {
        reportId, sectionKey: def.key, included: next,
      }, { merge: true })

      const exists = sections.some(s => s.id === sectionDocId)
      const nextSecs = exists
        ? sections.map(s => s.id === sectionDocId ? { ...s, included: next } : s)
        : [...sections, { id: sectionDocId, reportId, sectionKey: def.key, status: 'pending', included: next }]
      setSections(nextSecs)
      // Any previously built preview no longer matches the selection.
      setTemplateData(null)

      const newStatus = computeStatus(nextSecs)
      if (newStatus !== report?.status) {
        await updateDoc(doc(db, 'monthly_reports', reportId), { status: newStatus })
        setReport(r => ({ ...r, status: newStatus }))
      }
      popToast(next
        ? t('Section added to the final report', 'تمت إضافة القسم إلى التقرير النهائي')
        : t('Section removed from the final report', 'تم استثناء القسم من التقرير النهائي'))
    } catch (e) {
      console.error('[reports] toggle include failed:', e)
      popToast(t('Could not update the section.', 'تعذّر تحديث القسم.'))
    }
  }

  const handleAction = async (sectionDocId, action) => {
    try {
      const updates = { status: action }
      if (action === 'approved' || action === 'rejected') {
        updates.approvedBy = user?.uid || ''; updates.approvedAt = serverTimestamp()
      }
      if (action === 'submitted') {
        updates.submittedBy = user?.uid || ''; updates.submittedAt = serverTimestamp()
      }
      await updateDoc(doc(db, 'report_sections', sectionDocId), updates)
      const next = sections.map(s => s.id === sectionDocId ? { ...s, ...updates } : s)
      setSections(next)
      const newStatus = computeStatus(next)
      if (newStatus !== report?.status) {
        await updateDoc(doc(db, 'monthly_reports', reportId), { status: newStatus })
        setReport(r => ({ ...r, status: newStatus }))
      }
      popToast(
        action === 'approved' ? t('Section approved', 'تم اعتماد القسم') :
        action === 'rejected' ? t('Section rejected', 'تم رفض القسم') :
        t('Section submitted', 'تم تقديم القسم')
      )
    } catch (e) { console.error(e); popToast(t('Error', 'خطأ')) }
  }

  const handleHodNotes = async (secId, notes) => {
    try { await updateDoc(doc(db, 'report_sections', secId), { hodNotes: notes }) }
    catch (e) { console.error(e) }
  }

  const handleImport = async (secId, sectionKey) => {
    if (!report?.month) return
    setImportingSecId(secId)
    try {
      let data = null
      if (sectionKey === 'bus_trips') data = await reportGenerationService.generateBusTrips(report.month)
      else if (sectionKey === 'maintenance') data = await reportGenerationService.generateMaintenance(report.month)
      else if (sectionKey === 'fuel') data = await reportGenerationService.generateFuel(report.month)
      else if (sectionKey === 'ridership') data = await reportGenerationService.generateRidership(report.month)
      else if (sectionKey === 'external_transport') data = await reportGenerationService.generateExternalTransportation(report.month)
      else if (sectionKey === 'driver_overtime') data = await reportGenerationService.generateDriverOvertime(report.month)
      else if (sectionKey === 'traffic_fines') data = await reportGenerationService.generateTrafficFines(report.month)
      else if (sectionKey === 'registration_compliance') data = await reportGenerationService.generateRegistrationCompliance(report.month)

      if (!data) throw new Error('No data generated')

      const updates = {
        content: JSON.stringify(data),
        status: 'submitted',
        submittedBy: user?.uid || '',
        submittedAt: serverTimestamp()
      }

      const sectionDef = REPORT_SECTIONS.find((item) => item.key === sectionKey)
      await setDoc(doc(db, 'report_sections', secId), {
        reportId,
        sectionKey,
        sectionNameAr: sectionDef?.nameAr || sectionKey,
        sectionNameEn: sectionDef?.nameEn || sectionKey,
        type: sectionDef?.type || 'auto',
        included: true,
        ...updates,
      }, { merge: true })
      
      // Update local state
      const next = sections.some(s => s.id === secId)
        ? sections.map(s => s.id === secId ? { ...s, ...updates } : s)
        : [...sections, { id: secId, reportId, sectionKey, included: true, ...updates }]
      setSections(next)
      
      const newStatus = computeStatus(next)
      if (newStatus !== report?.status) {
        await updateDoc(doc(db, 'monthly_reports', reportId), { status: newStatus })
        setReport(r => ({ ...r, status: newStatus }))
      }

      popToast(t('Data imported successfully', 'تم استيراد البيانات بنجاح'))
    } catch (e) {
      console.error('Import error:', e)
      popToast(t('Import failed', 'فشل الاستيراد'))
    } finally {
      setImportingSecId(null)
    }
  }

  const saveReportNotes = async () => {
    setSavingNotes(true)
    try {
      await updateDoc(doc(db, 'monthly_reports', reportId), { notes: reportNotes })
      popToast(t('Notes saved', 'تم حفظ الملاحظات'))
    } catch (e) { console.error(e) }
    setSavingNotes(false)
  }

  const handleDrop = async (toIdx) => {
    if (dragIdx === null || dragIdx === toIdx) {
      setDragIdx(null); setDragOverIdx(null); return
    }
    const next = [...displaySections]
    const [moved] = next.splice(dragIdx, 1)
    next.splice(toIdx, 0, moved)

    const updatedSections = sections.map(sec => {
      const newIdx = next.findIndex(item => item.sec?.id === sec.id)
      return newIdx >= 0 ? { ...sec, order: newIdx } : sec
    })
    setSections(updatedSections)
    setDragIdx(null); setDragOverIdx(null)

    try {
      await Promise.all(
        updatedSections.filter(s => s.id)
          .map(s => updateDoc(doc(db, 'report_sections', s.id), { order: s.order }))
      )
      popToast(t('Order saved', 'تم حفظ الترتيب'))
    } catch (e) { console.error(e) }
  }

  const handlePublish = async () => {
    try {
      await updateDoc(doc(db, 'monthly_reports', reportId), {
        status: 'published', publishedAt: serverTimestamp()
      })
      setReport(r => ({ ...r, status: 'published' }))
      popToast(t('Report published', 'تم نشر التقرير'))
    } catch (e) { console.error(e) }
  }

  const handleExportPDF = async () => {
    const data = templateData || buildTemplateData()
    setTemplateData(data)
    setIsCompiling(true)
    popToast(t('Generating high-fidelity PDF...', 'جاري إنشاء ملف PDF عالي الجودة...'))

    // Ensure fonts and layout are fully ready before capture
    setTimeout(async () => {
      try {
        await document.fonts.ready

        // Priority: 1. On-screen preview, 2. Off-screen template
        const root = document.getElementById('report-preview-container') || document.getElementById('pdf-report-root')
        if (!root) throw new Error('PDF Root not found')

        const pages = root.querySelectorAll('.report-page')
        if (!pages.length) throw new Error('No pages found')

        // A4 Dimensions: 210mm x 297mm
        const pdf = new jsPDF('p', 'mm', 'a4', true)
        const imgWidth = 210
        const imgHeight = 297

        for (let i = 0; i < pages.length; i++) {
          const canvas = await html2canvas(pages[i], {
            scale: 2, // 2x scale for print-quality sharpness
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff',
            windowWidth: 794,
            windowHeight: 1122,
            onclone: (clonedDoc) => {
              // Final Font Enforcement
              const style = clonedDoc.createElement('style')
              style.innerHTML = `
                @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800;900&display=swap');
                * { font-family: 'Cairo', sans-serif !important; }
              `
              clonedDoc.head.appendChild(style)
            }
          })

          const imgData = canvas.toDataURL('image/jpeg', 0.95)

          if (i > 0) pdf.addPage()
          pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight, undefined, 'FAST')
        }

        const [yr, mo] = reportId.split('-')
        const moName = MONTHS_AR[parseInt(mo, 10) - 1] || mo
        pdf.save(`تقرير-العمليات-${moName}-${yr}.pdf`)

        popToast(t('PDF downloaded successfully', 'تم تحميل ملف PDF بنجاح'))
      } catch (e) {
        console.error('High-fidelity PDF export failed:', e)
        popToast(t('Export failed', 'فشل التصدير'))
      } finally {
        setIsCompiling(false)
      }
    }, 600)
  }

  if (loading) return <div className="rpt-center"><RefreshCw size={22} className="rpt-spin" /></div>
  if (!report) return <div className="rpt-center rpt-empty"><p>{t('Report not found.', 'التقرير غير موجود.')}</p></div>

  const status = report.status || 'draft'
  const si = RS[status] || RS.draft
  /* Every count below is scoped to the sections actually included in this
     report — an excluded section is not part of the deliverable, so it must
     not appear in the progress figures nor block compiling. */
  const includedSecs = sections.filter(isIncluded)
  const approved  = includedSecs.filter(s => s.status === 'approved').length
  const submitted = includedSecs.filter(s => s.status === 'submitted').length
  const rejected  = includedSecs.filter(s => s.status === 'rejected').length
  const pending   = includedSecs.filter(s => s.status === 'pending').length
  const includedDefs = REPORT_SECTIONS.filter(def =>
    isIncluded(sections.find(s => s.sectionKey === def.key))
  )
  const excludedCount = REPORT_SECTIONS.length - includedDefs.length
  const total = includedDefs.length
  const pct = total > 0 ? Math.round(((approved + submitted) / total) * 100) : 0

  const requiredIncluded = includedDefs.filter(r => r.required)
  const pendingRequired = requiredIncluded.filter(def =>
    sections.find(s => s.sectionKey === def.key)?.status !== 'approved'
  ).length
  // A report with nothing in it is not "ready" — guard the empty case, since
  // `every` on an empty list would otherwise report true.
  const allReqApproved = total > 0 && pendingRequired === 0

  return (
    <>
      <div className="rpt-detail-bar">
        <button className="rpt-back-btn" onClick={onBack}>
          <ChevronLeft size={16} strokeWidth={2.5} />
          {t('All Reports', 'جميع التقارير')}
        </button>
        <div className="rpt-detail-title-group">
          <h1 className="rpt-title rpt-title-sm">
            {monthLabel(reportId, lang)} — {t('Monthly Operations Report', 'التقرير التشغيلي الشهري')}
          </h1>
          <span className="rpt-badge" style={{ color: si.color, background: si.bg }}>
            {lang === 'ar' ? si.ar : si.en}
          </span>
        </div>
      </div>

      <div className="rpt-detail-grid">

        {/* LEFT: sections */}
        <div className="rpt-sections-col">
          {isHOD && (
            <p className="rpt-drag-hint">
              <GripVertical size={12} style={{ display: 'inline', verticalAlign: 'middle' }} />
              {' '}{t('Drag sections to reorder for the final report', 'اسحب الأقسام لإعادة الترتيب في التقرير النهائي')}
            </p>
          )}
          {displaySections.map(({ def, sec }, i) => {
            const secDocId = sec?.id || `${reportId}_${def.key}`
            return (
              <div
                key={def.key}
                draggable={isHOD}
                onDragStart={() => isHOD && setDragIdx(i)}
                onDragOver={e => { e.preventDefault(); isHOD && setDragOverIdx(i) }}
                onDrop={() => isHOD && handleDrop(i)}
                onDragEnd={() => { setDragIdx(null); setDragOverIdx(null) }}
                className={[
                  'rpt-drag-wrapper',
                  isHOD && dragOverIdx === i && dragIdx !== i ? 'rpt-drag-over' : '',
                  isHOD && dragIdx === i ? 'rpt-dragging' : '',
                ].filter(Boolean).join(' ')}
              >
                <SectionCard
                  def={def} sec={sec} lang={lang} t={t}
                  isHOD={isHOD}
                  isImporting={importingSecId === secDocId}
                  onAction={(action) => handleAction(secDocId, action)}
                  onToggleIncluded={(next) => handleToggleIncluded(secDocId, def, next)}
                  onImport={(sectionKey) => handleImport(secDocId, sectionKey)}
                  onHodNotesBlur={(notes) => handleHodNotes(secDocId, notes)}
                  onOpenForm={(sectionKey) => openForm(sectionKey, sec ? { ...sec, type: def.type } : { id: secDocId, sectionKey: def.key, sectionNameAr: def.nameAr, sectionNameEn: def.nameEn, type: def.type, content: {}, status: 'pending' })}
                />
              </div>
            )
          })}
        </div>

        {/* RIGHT: summary */}
        <div className="rpt-summary-col">
          <div className="rpt-summary-card">
            <div className="rpt-summary-hd">
              {t('Report Progress', 'تقدم التقرير')}
            </div>

            <div className="rpt-big-prog">
              <div className="rpt-big-prog-bar">
                <div className="rpt-big-prog-fill" style={{ width: `${pct}%` }} />
              </div>
              <span className="rpt-big-prog-num">{approved + submitted}/{total}</span>
            </div>

            <div className="rpt-stat-list">
              {[
                { key: 'approved',  label: t('Approved','معتمد'),       val: approved,  dot: SS.approved.dot  },
                { key: 'submitted', label: t('Submitted','مُقدَّم'),     val: submitted, dot: SS.submitted.dot },
                { key: 'pending',   label: t('Pending','قيد الانتظار'), val: pending,   dot: SS.pending.dot   },
                { key: 'rejected',  label: t('Rejected','مرفوض'),       val: rejected,  dot: SS.rejected.dot  },
              ].map(row => (
                <div key={row.key} className="rpt-stat-row">
                  <span className="rpt-stat-dot" style={{ background: row.dot }} />
                  <span className="rpt-stat-label">{row.label}</span>
                  <span className="rpt-stat-val">{row.val}</span>
                </div>
              ))}
            </div>

            {excludedCount > 0 && (
              <p className="rpt-excluded-note" dir="auto">
                {t(`${excludedCount} section(s) left out of this report.`,
                   `${excludedCount} قسم مستثنى من هذا التقرير.`)}
              </p>
            )}

            {isHOD && (
              <>
                <div className="rpt-divider" />
                <div className="rpt-notes-group">
                  <label className="rpt-label">{t('Report Notes', 'ملاحظات التقرير')}</label>
                  <textarea className="rpt-textarea" rows={3}
                    value={reportNotes} onChange={e => setReportNotes(e.target.value)}
                    onBlur={saveReportNotes}
                    placeholder={t('General notes for this report…', 'ملاحظات عامة لهذا التقرير…')}
                  />
                  <button className="rpt-btn-ghost rpt-btn-sm" onClick={saveReportNotes} disabled={savingNotes}>
                    {savingNotes ? <RefreshCw size={11} className="rpt-spin" /> : <Check size={11} />}
                    {t('Save Notes', 'حفظ الملاحظات')}
                  </button>
                </div>

                <div className="rpt-divider" />

                {canExportFinal && (
                  <>
                    <button
                      className={`rpt-btn-primary rpt-btn-full${allReqApproved ? ' rpt-compile-ready' : ''}`}
                      disabled={!allReqApproved || isCompiling}
                      title={
                        allReqApproved
                          ? t('All required sections approved — ready to compile', 'جميع الأقسام المطلوبة معتمدة')
                          : `${pendingRequired} ${t('required section(s) still need approval', 'قسم/أقسام مطلوبة لا تزال تنتظر الاعتماد')}`
                      }
                      onClick={() => {
                        setTemplateData(buildTemplateData())
                        setShowTemplatePreview(true)
                      }}
                    >
                      <FileText size={14} />
                      {allReqApproved
                        ? t('Preview Final Report', 'معاينة التقرير النهائي')
                        : `${t('Compile', 'تجميع')} (${pendingRequired} ${t('pending', 'قيد الانتظار')})`
                      }
                    </button>

                    {allReqApproved && (
                      <button 
                        className="rpt-btn-outline rpt-btn-full"
                        style={{ marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                        onClick={handleExportPDF}
                        disabled={isCompiling}
                      >
                        {isCompiling ? <RefreshCw size={14} className="rpt-spin" /> : <Download size={14} />}
                        {isCompiling ? t('Generating...', 'جاري الإنشاء...') : t('Download PDF', 'تحميل ملف PDF')}
                      </button>
                    )}

                    {(status === 'ready' || status === 'published') && (
                      <button
                        className={`rpt-btn-publish rpt-btn-full${status === 'published' ? ' rpt-published' : ''}`}
                        disabled={status === 'published'}
                        onClick={handlePublish}
                      >
                        <BookOpen size={14} />
                        {status === 'published'
                          ? t('Published', 'تم النشر')
                          : t('Mark as Published', 'نشر التقرير')
                        }
                      </button>
                    )}
                  </>
                )}
              </>
            )}

            <div className="rpt-last-upd">
              {t('Created', 'أُنشئ')} {fmtDate(report.createdAt)}
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div className="rpt-toast"
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }} transition={{ duration: 0.18 }}>
            <Check size={13} strokeWidth={2.5} /> {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Phase 2 — PDF Upload + AI Extraction Modal (Universal Viewer) */}
      <AnimatePresence>
        {activeFormKey && (
          <ReportSectionUpload
            key={activeFormKey}
            section={activeFormSection}
            reportId={reportId}
            user={user}
            lang={lang}
            t={t}
            isHOD={isHOD}
            canEdit={!!activeFormSection?.sectionKey && canSubmitReport(activeFormSection.sectionKey)}
            onClose={closeForm}
            onSubmitted={handleFormSubmitted}
          />
        )}
      </AnimatePresence>

      {/* ── Template preview overlay ──
          Rendered through a portal to <body>. The module tree sits inside a
          framer-motion transform, and a transformed ancestor becomes the
          containing block for position:fixed — which trapped this overlay
          inside the module panel, letting the sidebar and header sit on top
          of it. The portal escapes that stacking context entirely. */}
      {showTemplatePreview && templateData && createPortal(
        /* `theme-reports` is re-applied here: the portal mounts on <body>,
           outside the shell that normally scopes the module's accent tokens. */
        <div className="rpt-preview-overlay theme-reports">
          <div className="rpt-preview-bar">
            <div className="rpt-preview-heading">
              <FileText size={16} />
              <div>
                <span className="rpt-preview-title">{t('Final Report Preview', 'معاينة التقرير النهائي')}</span>
                <span className="rpt-preview-sub">{monthLabel(reportId, lang)}</span>
              </div>
            </div>
            <div className="rpt-preview-actions">
              <button className="rpt-btn-primary" onClick={handleExportPDF} disabled={isCompiling}>
                {isCompiling ? <RefreshCw size={14} className="rpt-spin" /> : <Download size={14} />}
                {isCompiling ? t('Generating…', 'جاري التحميل…') : t('Download PDF', 'تحميل PDF')}
              </button>
              <button className="rpt-btn-outline" onClick={() => setShowTemplatePreview(false)}>
                <X size={14} /> {t('Close', 'إغلاق')}
              </button>
            </div>
          </div>

          <div className="rpt-preview-scroll">
            <div id="report-preview-container" className="rpt-preview-doc">
              <ReportTemplate data={templateData} />
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* ── Phase 5: Off-screen template for high-fidelity PDF capture ── */}
      {templateData && (
        <div
          id="pdf-report-root"
          style={{
            position: 'fixed', bottom: 0, right: 0,
            width: '794px', zIndex: -100,
            opacity: 0.001, pointerEvents: 'none',
            backgroundColor: 'white'
          }}
        >
          <ReportTemplate data={templateData} />
        </div>
      )}
    </>
  )
}

// ── Section card ───────────────────────────────────────────────────
function SectionCard({ def, sec, lang, t, isHOD, onAction, onToggleIncluded, onHodNotesBlur, onOpenForm, onImport, isImporting }) {
  const { canSubmitReport, isMasterAdmin } = usePermissions()
  const Icon = ICON_MAP[def.icon] || FileText
  const status = sec?.status || 'pending'
  const si = SS[status] || SS.pending
  const [hodNotes, setHodNotes] = useState(sec?.hodNotes || '')

  const canEdit = canSubmitReport(def.key);
  // Whoever compiles the report decides what goes into it.
  const canChooseSections = isHOD || isMasterAdmin
  const included = isIncluded(sec)

  useEffect(() => { setHodNotes(sec?.hodNotes || '') }, [sec?.id, sec?.hodNotes])

  return (
    <div className={`rpt-sec-card rpt-sec-${status} ${!canEdit ? 'rpt-sec-locked' : ''}${included ? '' : ' rpt-sec-excluded'}`}>
      <div className="rpt-sec-main">

        {/* Drag handle — HOD only, purely visual (drag is on wrapper) */}
        {isHOD && (
          <div className="rpt-drag-handle" title={t('Drag to reorder', 'اسحب لإعادة الترتيب')}>
            <GripVertical size={15} />
          </div>
        )}

        {/* Icon */}
        <div className="rpt-sec-icon">
          <Icon size={17} strokeWidth={1.75} />
        </div>

        {/* Info */}
        <div className="rpt-sec-info">
          <div className="rpt-sec-names">
            <span className="rpt-sec-name-ar">{def.nameAr}</span>
            <span className="rpt-sec-name-en">{def.nameEn}</span>
            {!canEdit && <span style={{ fontSize: '10px', color: 'var(--theme-accent)', fontWeight: 800, marginLeft: '8px', opacity: 0.7 }}>[LOCKED]</span>}
          </div>
          <div className="rpt-sec-badges">
            <span className={`rpt-type-badge rpt-type-${def.type}`}>
              {def.type === 'auto' ? 'AUTO' : 'MANUAL'}
            </span>
            <span className="rpt-badge rpt-badge-sm" style={{ color: si.color, background: si.bg }}>
              {lang === 'ar' ? si.ar : si.en}
            </span>
            {!def.required && (
              <span className="rpt-optional">{t('Optional', 'اختياري')}</span>
            )}

            {/* Include in the final report — the compiler's choice. */}
            {canChooseSections ? (
              <button
                type="button"
                role="switch"
                aria-checked={included}
                className={`rpt-inc${included ? ' on' : ''}`}
                onClick={() => onToggleIncluded?.(!included)}
                title={included
                  ? t('This section is included in the final report — click to leave it out',
                      'هذا القسم مُدرج في التقرير النهائي — اضغط لاستثنائه')
                  : t('This section is left out of the final report — click to include it',
                      'هذا القسم مستثنى من التقرير النهائي — اضغط لتضمينه')}
              >
                <span className="rpt-inc-track"><span className="rpt-inc-knob" /></span>
                <span className="rpt-inc-text">
                  {included ? t('In final report', 'في التقرير النهائي') : t('Not included', 'غير مُدرج')}
                </span>
              </button>
            ) : !included && (
              /* Everyone else still needs to know it will not be submitted. */
              <span className="rpt-inc-static">{t('Not in final report', 'غير مُدرج في التقرير')}</span>
            )}
          </div>

          {/* Status context lines */}
          {status === 'submitted' && sec?.submittedAt && (
            <div className="rpt-sec-meta">
              {t('Submitted', 'قُدِّم')} {fmtDate(sec.submittedAt)}
            </div>
          )}
          {status === 'approved' && (
            <div className="rpt-sec-meta rpt-sec-state-approved">
              <Check size={11} strokeWidth={3} />
              {t('Approved', 'معتمد')}{sec?.approvedAt ? ` — ${fmtDate(sec.approvedAt)}` : ''}
            </div>
          )}
          {status === 'rejected' && (
            <div className="rpt-sec-meta rpt-sec-state-rejected">
              <X size={11} strokeWidth={3} />
              {t('Rejected', 'مرفوض')}{sec?.approvedAt ? ` — ${fmtDate(sec.approvedAt)}` : ''}
            </div>
          )}

          {/* HOD note displayed read-only to employees on rejected/approved sections */}
          {!isHOD && sec?.hodNotes && (status === 'rejected' || status === 'approved') && (
            <div className={`rpt-hod-note-ro rpt-hod-note-${status}`}>
              <span className="rpt-hod-note-label">{t('Note:', 'ملاحظة:')}</span>
              {sec.hodNotes}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="rpt-sec-actions">
          {canEdit ? (
            <>
              {/* Submit / fill form — available to BOTH employees and HOD for manual sections */}
              {def.type === 'manual' && status === 'pending' && (
                <button className="rpt-btn-outline rpt-btn-sm" onClick={() => onOpenForm?.(def.key)}>
                  {t('Submit', 'تقديم')}
                </button>
              )}
              {def.type === 'manual' && status === 'rejected' && (
                <button className="rpt-btn-outline rpt-btn-sm" onClick={() => onOpenForm?.(def.key)}>
                  {t('Resubmit', 'إعادة التقديم')}
                </button>
              )}
              {/* View / Edit — available for any submitted content (manual or auto) */}
              {(status === 'submitted' || status === 'approved') && (
                <button className="rpt-btn-ghost rpt-btn-sm" onClick={() => onOpenForm?.(def.key)}>
                  {t('View / Edit', 'عرض / تعديل')}
                </button>
              )}
              {(status === 'pending' || status === 'rejected') && def.type === 'auto' && (
                <button className="rpt-btn-import rpt-btn-sm" onClick={() => onImport(def.key)} disabled={isImporting}>
                  {isImporting ? <RefreshCw size={11} className="rpt-spin" /> : <Download size={11} />}
                  {t('Import System Data', 'استيراد من النظام')}
                </button>
              )}
            </>
          ) : (
            <div style={{ fontSize: '11px', color: 'var(--theme-text-muted)', fontWeight: 600 }}>{t('Read Only', 'للقراءة فقط')}</div>
          )}

          {/* HOD: approve + reject on submitted */}
          {isHOD && status === 'submitted' && (
            <>
              <button className="rpt-btn-approve rpt-btn-sm" onClick={() => onAction('approved')}>
                <Check size={11} strokeWidth={2.5} /> {t('Approve', 'اعتماد')}
              </button>
              <button className="rpt-btn-reject rpt-btn-sm" onClick={() => onAction('rejected')}>
                <X size={11} strokeWidth={2.5} /> {t('Reject', 'رفض')}
              </button>
            </>
          )}

          {/* HOD: revoke on approved */}
          {isHOD && status === 'approved' && (
            <button className="rpt-btn-revoke rpt-btn-sm" onClick={() => onAction('submitted')}>
              <RotateCcw size={11} /> {t('Revoke', 'إلغاء الاعتماد')}
            </button>
          )}
        </div>
      </div>

      {/* HOD notes — always visible inline for HOD */}
      {isHOD && (
        <div className="rpt-sec-notes">
          <textarea
            className="rpt-textarea rpt-textarea-sm"
            rows={2}
            value={hodNotes}
            onChange={e => setHodNotes(e.target.value)}
            onBlur={() => onHodNotesBlur(hodNotes)}
            placeholder={t('Add note for this section…', 'أضف ملاحظة لهذا القسم…')}
          />
        </div>
      )}
    </div>
  )
}
