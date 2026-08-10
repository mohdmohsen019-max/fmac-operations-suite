/* ══════════════════════════════════════════════════════════════════════════
   Crisis module — Reports & Evidence (§24)
   One-click Arabic-RTL print reports + CSV exports + an evidence index that
   gathers every attachment across the module for excellence assessment.
   ════════════════════════════════════════════════════════════════════════ */
import { useState, useEffect, useMemo } from 'react'
import {
  FileText, Siren, Boxes, ShieldAlert, FlaskConical, Wrench, Gauge, Contact,
  BarChart3, Paperclip, Printer, Download,
} from 'lucide-react'
import { db } from '../../firebase'
import { doc, onSnapshot } from 'firebase/firestore'
import { Section, Select, Empty } from './CrisisShared'
import exportCsv from '../../utils/exportCsv'
import {
  COL, L, findById, computeCrisisKpis, INCIDENT_STATUSES, CRISIS_LEVELS, ACTIVE_STATUSES,
} from './crisisData'
import {
  printIncidentReport, printExecutiveSummary, printServicesRegister, printRiskRegister,
  printKpiReport, printExercisesReport, printCorrectiveReport, printContactsReport,
} from './crisisPrint'

const YEAR = new Date().getFullYear()

export default function CrisisReports(props) {
  const { lang, t, locale, incidents = [], decisions = [], actions = [], services = [],
    risks = [], plans = [], exercises = [], corrective = [], contacts = [], recovery = [] } = props

  const [incId, setIncId] = useState('')
  // Admin KPI-target overrides — so the printed KPI report matches the on-screen
  // (CrisisKpis) targets rather than the catalog defaults.
  const [targetsOverride, setTargetsOverride] = useState({})
  useEffect(() => {
    const unsub = onSnapshot(doc(db, COL.settings, 'kpi_targets'),
      snap => setTargetsOverride(snap.exists() ? (snap.data().targets || {}) : {}),
      () => setTargetsOverride({}))
    return unsub
  }, [])
  const kpis = useMemo(() => computeCrisisKpis({ incidents, services, plans, exercises, corrective, contacts, recovery }),
    [incidents, services, plans, exercises, corrective, contacts, recovery])

  /* evidence index — every attachment across the registers */
  const evidence = useMemo(() => {
    const out = []
    const push = (arr, kindEn, kindAr, refName) => (arr || []).forEach(rec => {
      const files = [...(rec.attachments || []), ...(rec.evidence || [])]
      files.forEach(f => out.push({ kindEn, kindAr, ref: refName(rec), name: f.name, url: f.url }))
    })
    push(incidents, 'Incident', 'حادث', r => r.number)
    push(corrective, 'Corrective action', 'إجراء تصحيحي', r => r.action || r.number || '—')
    push(exercises, 'Exercise', 'تمرين', r => r.title_en || r.title_ar)
    push(recovery, 'Recovery', 'تعافٍ', r => r.system_en || r.system_ar)
    push(decisions, 'Decision', 'قرار', r => r.number)
    return out
  }, [incidents, corrective, exercises, recovery, decisions])

  const report = (icon, titleEn, titleAr, descEn, descAr, onRun, disabled) => ({ icon, titleEn, titleAr, descEn, descAr, onRun, disabled })

  const reports = [
    report(Siren, 'Incident report', 'تقرير حادث', 'Full record of one incident with decisions & actions.', 'سجل كامل لحادث واحد مع القرارات والإجراءات.',
      () => { const i = incidents.find(x => x.id === incId); if (i) printIncidentReport({ incident: i, decisions, actions, services, lang, locale, t }) }, !incId),
    report(BarChart3, 'Executive crisis summary', 'الملخص التنفيذي', 'Situation at a glance for leadership.', 'الوضع باختصار للقيادة.',
      () => printExecutiveSummary({ data: { incidents, risks, services, corrective, exercises }, kpis, year: YEAR, lang, locale, t })),
    report(Siren, 'Active incident status', 'حالة الحوادث النشطة', 'Current active incidents and their stage.', 'الحوادث النشطة الحالية ومراحلها.',
      () => printActiveStatus({ incidents, lang, locale, t })),
    report(Boxes, 'Critical services register', 'سجل الخدمات الحيوية', 'All services with RTO/MTPD and readiness.', 'كل الخدمات مع زمن التعافي والجاهزية.',
      () => printServicesRegister({ services, lang, locale, t })),
    report(ShieldAlert, 'Critical risk register', 'سجل المخاطر الحرجة', 'Scored risks with levels and owners.', 'المخاطر المقيّمة بمستوياتها ومُلّاكها.',
      () => printRiskRegister({ risks, lang, locale, t })),
    report(FlaskConical, 'Exercise report', 'تقرير التمارين', 'Exercises, tests and their results.', 'التمارين والاختبارات ونتائجها.',
      () => printExercisesReport({ exercises, lang, locale, t })),
    report(Wrench, 'Corrective actions report', 'تقرير الإجراءات التصحيحية', 'Corrective actions with status and owners.', 'الإجراءات التصحيحية بحالتها ومُلّاكها.',
      () => printCorrectiveReport({ corrective, lang, locale, t })),
    report(Gauge, 'KPI report', 'تقرير مؤشرات الأداء', 'Ten indicators vs. this year’s targets.', 'عشرة مؤشرات مقابل مستهدفات العام.',
      () => printKpiReport({ kpis, year: YEAR, lang, locale, t, targetsOverride })),
    report(Contact, 'Contact directory', 'دليل جهات الاتصال', 'Protected crisis contact directory.', 'دليل جهات اتصال الأزمات المحمي.',
      () => printContactsReport({ contacts, lang, locale, t })),
    report(FileText, 'Annual readiness report', 'تقرير الجاهزية السنوي', 'Executive summary + all KPIs for the year.', 'ملخص تنفيذي + جميع المؤشرات للسنة.',
      () => printExecutiveSummary({ data: { incidents, risks, services, corrective, exercises }, kpis, year: YEAR, lang, locale, t })),
  ]

  return (
    <div>
      {/* incident picker for the per-incident report */}
      <div className="crs-report-pick">
        <span dir="auto">{t('Selected incident for the incident report:', 'الحادث المختار لتقرير الحادث:')}</span>
        <div className="crs-report-pick-sel">
          <Select value={incId} onChange={setIncId} lang={lang}
            options={[{ id: '', en: '— choose —', ar: '— اختر —' }, ...incidents.map(i => ({ id: i.id, en: `${i.number} · ${i.title_en || ''}`, ar: `${i.number} · ${i.title_ar || ''}` }))]} />
        </div>
      </div>

      <div className="crs-reports-grid">
        {reports.map((r, i) => (
          <div key={i} className="crs-report-card">
            <div className="crs-report-icon"><r.icon size={18} /></div>
            <div className="crs-report-body">
              <h3 dir="auto">{L({ en: r.titleEn, ar: r.titleAr }, lang)}</h3>
              <p dir="auto">{L({ en: r.descEn, ar: r.descAr }, lang)}</p>
            </div>
            <button className="crs-btn crs-btn-ghost crs-btn-sm" disabled={r.disabled} onClick={r.onRun}>
              <Printer size={13} />{t('Generate', 'إنشاء')}
            </button>
          </div>
        ))}
      </div>

      {/* CSV exports */}
      <Section title={t('Spreadsheet exports', 'تصدير الجداول')} sub={t('Download registers as CSV (Excel-ready).', 'تنزيل السجلات كـ CSV جاهز لإكسل.')} icon={Download}>
        <div className="crs-csv-row">
          <button className="crs-btn crs-btn-ghost crs-btn-sm" onClick={() => csvServices(services, lang)}><Download size={13} />{t('Services', 'الخدمات')}</button>
          <button className="crs-btn crs-btn-ghost crs-btn-sm" onClick={() => csvRisks(risks, lang)}><Download size={13} />{t('Risks', 'المخاطر')}</button>
          <button className="crs-btn crs-btn-ghost crs-btn-sm" onClick={() => csvIncidents(incidents, lang)}><Download size={13} />{t('Incidents', 'الحوادث')}</button>
          <button className="crs-btn crs-btn-ghost crs-btn-sm" onClick={() => csvCorrective(corrective, lang)}><Download size={13} />{t('Corrective', 'التصحيحية')}</button>
        </div>
      </Section>

      {/* evidence index */}
      <Section title={t('Evidence index', 'فهرس الأدلة')} sub={t('Every attachment across the module — for excellence assessment.', 'كل مرفق في الوحدة — لتقييم التميز.')} icon={Paperclip}>
        {evidence.length === 0 ? <Empty icon={Paperclip} title={t('No evidence attached yet', 'لا توجد أدلة مرفقة بعد')} /> : (
          <div className="crs-table-wrap">
            <table className="crs-table">
              <thead><tr><th dir="auto">{t('Record', 'السجل')}</th><th dir="auto">{t('Reference', 'المرجع')}</th><th dir="auto">{t('File', 'الملف')}</th></tr></thead>
              <tbody>
                {evidence.map((e, i) => (
                  <tr key={i}>
                    <td dir="auto">{L({ en: e.kindEn, ar: e.kindAr }, lang)}</td>
                    <td dir="auto">{e.ref}</td>
                    <td><a href={e.url} target="_blank" rel="noreferrer" className="crs-evidence-link" dir="auto"><Paperclip size={12} />{e.name}</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  )
}

/* active-status report reuses the print engine with a compact table */
function printActiveStatus({ incidents, lang, locale, t }) {
  const active = incidents.filter(i => ACTIVE_STATUSES.includes(i.status))
  import('./crisisPrint').then(({ openPrintDoc }) => {
    const rows = active.map(i => `<tr><td>${i.number}</td><td>${lang === 'ar' ? (i.title_ar || i.title_en) : i.title_en}</td><td>${L(findById(CRISIS_LEVELS, i.level), lang)}</td><td>${L(findById(INCIDENT_STATUSES, i.status), lang)}</td></tr>`).join('')
    const body = `<table><thead><tr><th>${t('No.', 'الرقم')}</th><th>${t('Title', 'العنوان')}</th><th>${t('Level', 'المستوى')}</th><th>${t('Status', 'الحالة')}</th></tr></thead><tbody>${rows || `<tr><td colspan="4">—</td></tr>`}</tbody></table>`
    openPrintDoc({ title: t('Active Incident Status', 'حالة الحوادث النشطة'), subtitle: `${active.length}`, body, lang, locale })
  })
}

/* CSV helpers */
const stamp = () => new Date().toISOString().slice(0, 10)
function csvServices(services) {
  exportCsv(`crisis-services-${stamp()}`, ['Name EN', 'Name AR', 'Unit', 'RTO', 'MTPD', 'Priority', 'Status', 'Readiness'],
    services.map(s => [s.name_en, s.name_ar, s.unit, s.rto, s.mtpd, s.priority, s.status, s.readiness]))
}
function csvRisks(risks) {
  exportCsv(`crisis-risks-${stamp()}`, ['Title EN', 'Title AR', 'Category', 'Probability', 'Impact', 'Score', 'Owner', 'Status'],
    risks.map(r => [r.title_en, r.title_ar, r.category, r.probability, r.impact, (r.probability || 0) * (r.impact || 0), r.owner, r.status]))
}
function csvIncidents(incidents) {
  exportCsv(`crisis-incidents-${stamp()}`, ['Number', 'Title EN', 'Title AR', 'Category', 'Level', 'Status', 'Kind'],
    incidents.map(i => [i.number, i.title_en, i.title_ar, i.category, i.level, i.status, i.kind || 'real']))
}
function csvCorrective(corrective) {
  exportCsv(`crisis-corrective-${stamp()}`, ['Action', 'Source', 'Owner', 'Due', 'Status'],
    corrective.map(c => [c.action, c.source, c.owner, c.dueDate, c.status]))
}
