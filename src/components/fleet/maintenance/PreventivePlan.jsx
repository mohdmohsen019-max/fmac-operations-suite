import React, { useMemo, useState } from 'react'
import {
  AlertTriangle, CalendarClock, Check, ChevronRight, Clock3,
  Gauge, History, Plus, RefreshCw, Search, Settings2, ShieldCheck, Sparkles, X,
} from 'lucide-react'
import {
  doc, serverTimestamp, setDoc, writeBatch,
} from 'firebase/firestore'
import { auth, db } from '../../../firebase'
import { useLanguage } from '../../../contexts/LanguageContext'
import { canonicalFleetRegistration } from '../../../services/fleetIdentity'
import { recordActivity } from '../../../services/activityLog'
import { sendNotification } from '../../../utils/notify'
import {
  DEFAULT_MAINTENANCE_TEMPLATES, buildPreventiveInsights, buildPreventivePlanRows,
  planDocumentId,
} from './preventiveMaintenance'

const STATUS_COPY = {
  upcoming: ['Upcoming', 'قادمة'], 'due-soon': ['Due soon', 'مستحقة قريباً'], due: ['Due', 'مستحقة'],
  overdue: ['Overdue', 'متأخرة'], scheduled: ['Scheduled', 'مجدولة'], completed: ['Completed', 'مكتملة'],
  skipped: ['Skipped', 'متجاوزة'], cancelled: ['Cancelled', 'ملغاة'], unconfigured: ['Needs baseline', 'تحتاج خط أساس'],
}

const todayIso = () => new Date().toISOString().slice(0, 10)
const monthDay = (date, locale) => date ? new Date(`${date}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

function StatusBadge({ status, t }) {
  const copy = STATUS_COPY[status] || STATUS_COPY.upcoming
  return <span className={`fpp-status fpp-status--${status}`}>{t(copy[0], copy[1])}</span>
}

function PlanActionModal({ row, mode, onClose, onSaved }) {
  const { t } = useLanguage()
  const [date, setDate] = useState(todayIso())
  const [odometer, setOdometer] = useState(String(Math.round(row.currentKm || 0)))
  const [cost, setCost] = useState('')
  const [notes, setNotes] = useState('')
  const [parts, setParts] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async () => {
    setSaving(true); setError('')
    try {
      const actor = auth.currentUser?.email || ''
      if (mode === 'complete') {
        const km = Number(odometer)
        if (!date || !Number.isFinite(km) || km < 0) throw new Error(t('Enter a valid completion date and odometer.', 'أدخل تاريخ إكمال وقراءة عداد صحيحة.'))
        const batch = writeBatch(db)
        const cycleId = `${row.id}|${row.nextDueDate || row.nextDueKm || 'baseline'}`
        const maintenanceRef = doc(db, 'maintenance', `preventive_${cycleId.replace(/[^A-Za-z0-9_-]/g, '_')}`)
        batch.set(maintenanceRef, {
          date, completedAt: date, canonicalPlate: row.vehicleReg, plateNumber: row.vehicleReg,
          maintenanceType: 'preventive', serviceCategory: row.template.category,
          planTemplateId: row.templateId, preventivePlanId: row.id, planCycleId: cycleId,
          originalDueDate: row.nextDueDate || null, originalDueOdometerKm: row.nextDueKm,
          odometerKm: km, description: `${row.template.nameEn}${notes ? ` — ${notes}` : ''}`,
          partsInspected: row.template.checklist || [],
          partsServiced: parts.split(',').map((part) => part.trim()).filter(Boolean),
          partsReplaced: [],
          amount: Number(cost) || 0, vat: 0, total: Number(cost) || 0,
          status: 'completed', source: 'PREVENTIVE_PLAN', createdAt: serverTimestamp(),
          createdBy: actor, updatedAt: serverTimestamp(), updatedBy: actor,
        })
        batch.set(doc(db, 'fleet_maintenance_plans', row.id), {
          vehicleReg: row.vehicleReg, templateId: row.templateId,
          intervalKm: row.intervalKm, intervalDays: row.intervalDays,
          lastServiceDate: date, lastServiceKm: km, lastMaintenanceRecordId: maintenanceRef.id,
          scheduledFor: null, overrideStatus: null, updatedAt: serverTimestamp(), updatedBy: actor,
        }, { merge: true })
        if (row.template.category === 'oil') {
          batch.set(doc(db, 'fleet_oil_tracking', row.vehicleReg), {
            lastChangeDate: date, lastChangeKm: km, intervalKm: row.intervalKm,
            updatedAt: serverTimestamp(), updatedBy: actor,
          }, { merge: true })
        }
        await batch.commit()
      } else {
        await setDoc(doc(db, 'fleet_maintenance_plans', row.id), {
          vehicleReg: row.vehicleReg, templateId: row.templateId,
          intervalKm: row.intervalKm, intervalDays: row.intervalDays,
          scheduledFor: date, overrideStatus: null, notes,
          updatedAt: serverTimestamp(), updatedBy: actor,
        }, { merge: true })
      }
      await recordActivity({
        module: 'fleet', submodule: 'preventive-maintenance',
        action: mode === 'complete' ? 'preventive_maintenance_completed' : 'preventive_maintenance_scheduled',
        titleEn: `${mode === 'complete' ? 'Preventive service completed' : 'Preventive service scheduled'} · ${row.vehicleReg}`,
        titleAr: `${mode === 'complete' ? 'تم إكمال الصيانة الوقائية' : 'تمت جدولة الصيانة الوقائية'} · ${row.vehicleReg}`,
        detailEn: `${row.template.nameEn} · ${date}`,
        detailAr: `${row.template.nameAr} · ${date}`,
        recordId: row.id, path: '/fleet/maintenance',
      })
      if (mode === 'complete') await sendNotification('fleet_maintenance_completed', {
        registration: row.vehicleReg,
        service: row.template.nameEn,
        date,
        odometerKm: Number(odometer) || 0,
        costAed: Number(cost) || 0,
      })
      onSaved()
    } catch (saveError) { setError(saveError.message || String(saveError)) } finally { setSaving(false) }
  }

  return <div className="fpp-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="fpp-modal" role="dialog" aria-modal="true">
      <header><div><span>{row.vehicleReg}</span><h3>{mode === 'complete' ? t('Complete preventive service', 'إكمال الصيانة الوقائية') : t('Schedule service', 'جدولة الصيانة')}</h3><p>{t(row.template.nameEn, row.template.nameAr)}</p></div><button onClick={onClose}><X size={17} /></button></header>
      <div className="fpp-form-grid">
        <label><span>{mode === 'complete' ? t('Completion date', 'تاريخ الإكمال') : t('Scheduled date', 'التاريخ المجدول')}</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
        {mode === 'complete' && <><label><span>{t('Odometer', 'عداد المسافة')}</span><div className="fpp-input-unit"><input type="number" value={odometer} onChange={(event) => setOdometer(event.target.value)} /><small>km</small></div></label><label><span>{t('Cost', 'التكلفة')}</span><div className="fpp-input-unit"><input type="number" value={cost} onChange={(event) => setCost(event.target.value)} /><small>AED</small></div></label><label className="wide"><span>{t('Parts serviced or replaced', 'القطع التي تمت صيانتها أو استبدالها')}</span><input value={parts} onChange={(event) => setParts(event.target.value)} placeholder={t('Comma-separated; oil filter stays included in oil service', 'افصل بفاصلة؛ فلتر الزيت يبقى ضمن خدمة الزيت')} /></label></>}
        <label className="wide"><span>{t('Notes', 'ملاحظات')}</span><textarea rows="3" value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
      </div>
      {error && <div className="fpp-error">{error}</div>}
      <footer><button className="fms-btn fms-btn--ghost" onClick={onClose}>{t('Cancel', 'إلغاء')}</button><button className="fms-btn fms-btn--primary" onClick={save} disabled={saving}>{saving ? t('Saving…', 'جارٍ الحفظ…') : mode === 'complete' ? t('Complete and advance plan', 'إكمال وتحديث الخطة') : t('Save schedule', 'حفظ الجدول')}</button></footer>
    </section>
  </div>
}

function TemplateManager({ templates, onClose }) {
  const { t } = useLanguage()
  const [drafts, setDrafts] = useState(() => templates.map((template) => ({ ...template })))
  const [saving, setSaving] = useState(false)
  const update = (index, key, value) => setDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item))
  const save = async () => {
    setSaving(true)
    const batch = writeBatch(db)
    drafts.forEach((template, index) => batch.set(doc(db, 'fleet_maintenance_templates', template.id), {
      nameEn: template.nameEn, nameAr: template.nameAr || '', category: template.category || 'inspection',
      intervalKm: Math.max(0, Number(template.intervalKm) || 0), intervalDays: Math.max(0, Number(template.intervalDays) || 0),
      checklist: template.checklist || [], active: template.active !== false, sortOrder: index + 1,
      updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.email || '',
    }, { merge: true }))
    await batch.commit(); setSaving(false); onClose()
  }
  const add = () => setDrafts((current) => [...current, { id: `custom-${Date.now()}`, nameEn: 'New service', nameAr: '', category: 'inspection', intervalKm: 10000, intervalDays: 180, active: true }])
  return <div className="fpp-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="fpp-modal fpp-modal--wide"><header><div><span>{t('Plan controls', 'عناصر التحكم بالخطة')}</span><h3>{t('Preventive service templates', 'قوالب الصيانة الوقائية')}</h3><p>{t('The first mileage or calendar threshold reached makes a service due.', 'أول حد للمسافة أو التاريخ يتم بلوغه يجعل الصيانة مستحقة.')}</p></div><button onClick={onClose}><X size={17} /></button></header><div className="fpp-template-list">{drafts.map((template, index) => <div key={template.id}><input value={template.nameEn} onChange={(event) => update(index, 'nameEn', event.target.value)} /><input type="number" min="0" value={template.intervalKm} onChange={(event) => update(index, 'intervalKm', event.target.value)} /><span>km</span><input type="number" min="0" value={template.intervalDays} onChange={(event) => update(index, 'intervalDays', event.target.value)} /><span>{t('days', 'يوم')}</span><label><input type="checkbox" checked={template.active !== false} onChange={(event) => update(index, 'active', event.target.checked)} />{t('Active', 'نشط')}</label></div>)}</div><footer><button className="fms-btn fms-btn--ghost" onClick={add}><Plus size={14} />{t('Add service', 'إضافة خدمة')}</button><button className="fms-btn fms-btn--primary" onClick={save} disabled={saving}>{saving ? t('Saving…', 'جارٍ الحفظ…') : t('Save templates', 'حفظ القوالب')}</button></footer></section></div>
}

export default function PreventivePlan({ suite, records, canEdit, displayName, onRecordsChanged }) {
  const { t, locale } = useLanguage()
  const [status, setStatus] = useState('all')
  const [query, setQuery] = useState('')
  const [forecast, setForecast] = useState(90)
  const [action, setAction] = useState(null)
  const [selectedReg, setSelectedReg] = useState('')
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [initializing, setInitializing] = useState(false)
  const templates = suite.preventiveTemplates || DEFAULT_MAINTENANCE_TEMPLATES
  const rows = useMemo(() => buildPreventivePlanRows({ vehicles: suite.vehicles, templates, plans: suite.preventivePlans, records }), [suite.vehicles, suite.preventivePlans, templates, records])
  const insights = useMemo(() => buildPreventiveInsights({ records, rows }), [records, rows])
  const counts = useMemo(() => rows.reduce((result, row) => ({ ...result, [row.status]: (result[row.status] || 0) + 1 }), {}), [rows])
  const filtered = rows.filter((row) => status === 'all' || row.status === status).filter((row) => `${row.vehicleReg} ${displayName(row.vehicleReg)} ${row.template.nameEn}`.toLowerCase().includes(query.toLowerCase())).filter((row) => row.remainingDays == null || row.remainingDays <= forecast || ['overdue', 'due', 'scheduled', 'unconfigured'].includes(row.status))
  const busTimeline = selectedReg ? records.filter((record) => canonicalFleetRegistration(record.canonicalPlate || record.plateNumber || record.registration) === selectedReg).sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))) : []

  const initialize = async () => {
    setInitializing(true)
    const batch = writeBatch(db)
    if (suite.preventiveTemplatesAreSeed) DEFAULT_MAINTENANCE_TEMPLATES.forEach(({ id, ...template }) => batch.set(doc(db, 'fleet_maintenance_templates', id), { ...template, createdAt: serverTimestamp(), createdBy: auth.currentUser?.email || '' }))
    rows.forEach((row) => batch.set(doc(db, 'fleet_maintenance_plans', planDocumentId(row.vehicleReg, row.templateId)), {
      vehicleReg: row.vehicleReg, templateId: row.templateId, intervalKm: row.intervalKm, intervalDays: row.intervalDays,
      lastServiceDate: row.lastServiceDate || todayIso(), lastServiceKm: row.lastServiceKm ?? row.currentKm,
      updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.email || '',
    }, { merge: true }))
    await batch.commit()
    await recordActivity({
      module: 'fleet', submodule: 'preventive-maintenance', action: 'preventive_plan_initialized',
      titleEn: 'Preventive maintenance plan initialized',
      titleAr: 'تمت تهيئة خطة الصيانة الوقائية',
      detailEn: `${rows.length} recurring service plans synchronized`,
      detailAr: `تمت مزامنة ${rows.length} خطة خدمة دورية`,
      recordId: 'fleet-preventive-plan', path: '/fleet/maintenance',
    })
    setInitializing(false)
  }
  const changeStatus = async (row, overrideStatus) => {
    await setDoc(doc(db, 'fleet_maintenance_plans', row.id), { vehicleReg: row.vehicleReg, templateId: row.templateId, overrideStatus, scheduledFor: null, updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.email || '' }, { merge: true })
    await recordActivity({
      module: 'fleet', submodule: 'preventive-maintenance', action: `preventive_maintenance_${overrideStatus}`,
      titleEn: `Preventive service ${overrideStatus} · ${row.vehicleReg}`,
      titleAr: `${overrideStatus === 'skipped' ? 'تم تجاوز الصيانة الوقائية' : 'تم إلغاء الصيانة الوقائية'} · ${row.vehicleReg}`,
      detailEn: row.template.nameEn, detailAr: row.template.nameAr,
      recordId: row.id, path: '/fleet/maintenance',
    })
  }

  return <div className="fpp-view">
    <header className="fpp-hero"><div><span><ShieldCheck size={13} />{t('Preventive maintenance control', 'التحكم بالصيانة الوقائية')}</span><h2>{t('Bus preventive plan', 'خطة الصيانة الوقائية للحافلات')}</h2><p>{t('Every bus, every recurring service, controlled by the first mileage or calendar threshold reached.', 'كل حافلة وكل خدمة دورية محكومة بأول حد للمسافة أو التاريخ يتم بلوغه.')}</p></div>{canEdit && <div><button className="fms-btn fms-btn--ghost" onClick={() => setTemplatesOpen(true)}><Settings2 size={14} />{t('Templates', 'القوالب')}</button><button className="fms-btn fms-btn--primary" onClick={initialize} disabled={initializing}><RefreshCw size={14} className={initializing ? 'fms-spin' : ''} />{t('Initialize / repair plan', 'تهيئة / إصلاح الخطة')}</button></div>}</header>
    <section className="fpp-kpis"><article><span>{t('Overdue', 'متأخرة')}</span><strong className="risk">{counts.overdue || 0}</strong><AlertTriangle /></article><article><span>{t('Due soon', 'مستحقة قريباً')}</span><strong>{(counts['due-soon'] || 0) + (counts.due || 0)}</strong><Clock3 /></article><article><span>{t('Scheduled', 'مجدولة')}</span><strong>{counts.scheduled || 0}</strong><CalendarClock /></article><article><span>{t('Plan coverage', 'تغطية الخطة')}</span><strong>{rows.length ? Math.round(((rows.length - (counts.unconfigured || 0)) / rows.length) * 100) : '—'}<small>%</small></strong><Gauge /></article></section>
    <section className="fpp-intelligence"><header><div><Sparkles size={15} /><strong>{t('Preventive intelligence', 'الذكاء الوقائي')}</strong></div><span>{insights.length} {t('signals', 'إشارة')}</span></header>{insights.length ? <div>{insights.slice(0, 5).map((insight) => <article key={insight.id} className={insight.severity}><div><strong>{insight.vehicleReg} · {t(insight.categoryEn || insight.category, insight.categoryAr || insight.category)}</strong><p>{t(insight.evidenceEn || insight.evidence, insight.evidenceAr || insight.evidence)}</p><small>{t(insight.recommendationEn || insight.recommendation, insight.recommendationAr || insight.recommendation)}</small></div><ChevronRight size={16} /></article>)}</div> : <div className="fpp-clear"><Check size={16} />{t('No preventive exceptions detected from the available history.', 'لم يتم اكتشاف استثناءات وقائية من السجل المتاح.')}</div>}</section>
    <section className="fpp-ledger"><header><div><h3>{t('Service forecast', 'توقعات الصيانة')}</h3><p>{t('Live odometer and calendar schedule for the confirmed bus fleet.', 'جدول المسافة والتاريخ المباشر لأسطول الحافلات المعتمد.')}</p></div><div className="fpp-controls"><label><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('Search plate or service', 'ابحث باللوحة أو الخدمة')} /></label><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">{t('All statuses', 'كل الحالات')}</option>{Object.entries(STATUS_COPY).map(([value, copy]) => <option key={value} value={value}>{t(copy[0], copy[1])}</option>)}</select><select value={forecast} onChange={(event) => setForecast(Number(event.target.value))}><option value="30">30 {t('days', 'يوماً')}</option><option value="60">60 {t('days', 'يوماً')}</option><option value="90">90 {t('days', 'يوماً')}</option><option value="365">12 {t('months', 'شهراً')}</option></select></div></header><div className="fleet-table-container fpp-table-wrap"><table className="fleet-table"><thead><tr><th>{t('Plate', 'اللوحة')}</th><th>{t('Service', 'الخدمة')}</th><th>{t('Current odometer', 'العداد الحالي')}</th><th>{t('Next due', 'الاستحقاق القادم')}</th><th>{t('Status', 'الحالة')}</th><th>{t('Action', 'الإجراء')}</th></tr></thead><tbody>{filtered.length ? filtered.map((row) => <tr key={row.id}><td><button className="fpp-plate" onClick={() => setSelectedReg(row.vehicleReg)}>{row.vehicleReg}<small>{displayName(row.vehicleReg)}</small></button></td><td><strong>{t(row.template.nameEn, row.template.nameAr)}</strong><small>{row.intervalKm.toLocaleString(locale)} km · {row.intervalDays.toLocaleString(locale)} {t('days', 'يوم')}</small></td><td>{Math.round(row.currentKm).toLocaleString(locale)} km</td><td><strong>{row.nextDueKm == null ? '—' : `${Math.round(row.nextDueKm).toLocaleString(locale)} km`}</strong><small>{monthDay(row.nextDueDate, locale)}{row.projectedMileageDueDate ? ` · ${t('projected', 'متوقع')} ${monthDay(row.projectedMileageDueDate, locale)}` : ''}</small></td><td><StatusBadge status={row.status} t={t} /></td><td>{canEdit ? <div className="fpp-actions"><button onClick={() => setAction({ row, mode: 'schedule' })}>{t('Schedule', 'جدولة')}</button><button className="primary" onClick={() => setAction({ row, mode: 'complete' })}>{t('Complete', 'إكمال')}</button><button onClick={() => changeStatus(row, 'skipped')}>{t('Skip', 'تجاوز')}</button><button className="danger" onClick={() => changeStatus(row, 'cancelled')}>{t('Cancel', 'إلغاء')}</button></div> : '—'}</td></tr>) : <tr><td colSpan="6" className="fms-empty-cell">{t('No services match these filters.', 'لا توجد خدمات تطابق عوامل التصفية.')}</td></tr>}</tbody></table></div></section>
    {selectedReg && <div className="fpp-drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setSelectedReg('')}><aside className="fpp-drawer"><header><div><span>{t('Bus maintenance timeline', 'الخط الزمني لصيانة الحافلة')}</span><h3>{selectedReg}</h3><p>{displayName(selectedReg)}</p></div><button onClick={() => setSelectedReg('')}><X size={17} /></button></header><section><h4><CalendarClock size={15} />{t('Next services', 'الخدمات القادمة')}</h4>{rows.filter((row) => row.vehicleReg === selectedReg).sort((a, b) => (a.remainingDays ?? 9999) - (b.remainingDays ?? 9999)).slice(0, 6).map((row) => <article key={row.id}><div><strong>{t(row.template.nameEn, row.template.nameAr)}</strong><small>{row.nextDueDate || '—'} · {row.nextDueKm ? `${Math.round(row.nextDueKm).toLocaleString(locale)} km` : '—'}</small></div><StatusBadge status={row.status} t={t} /></article>)}</section><section><h4><History size={15} />{t('Completed history', 'السجل المكتمل')}</h4>{busTimeline.length ? busTimeline.map((record) => <article key={record.id}><div><strong>{record.description || record.serviceCategory}</strong><small>{record.date} · ${record.odometerKm ? `${Number(record.odometerKm).toLocaleString(locale)} km · ` : ''}${Number(record.total || 0).toLocaleString(locale)} AED${Array.isArray(record.partsServiced) && record.partsServiced.length ? ` · ${record.partsServiced.join(', ')}` : ''}</small></div><span>{record.invoiceNumber ? `#${record.invoiceNumber}` : ''}</span></article>) : <div className="fpp-clear">{t('No completed records found.', 'لا توجد سجلات مكتملة.')}</div>}</section></aside></div>}
    {action && <PlanActionModal {...action} onClose={() => setAction(null)} onSaved={() => { setAction(null); onRecordsChanged?.() }} />}
    {templatesOpen && <TemplateManager templates={templates} onClose={() => setTemplatesOpen(false)} />}
  </div>
}
