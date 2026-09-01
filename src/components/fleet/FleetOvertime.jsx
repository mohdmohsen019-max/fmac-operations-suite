import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp, updateDoc,
} from 'firebase/firestore'
import {
  BarChart3, BriefcaseBusiness, Bus, CalendarDays, Check, Clock3,
  ChevronDown, Download, Edit3, FileSpreadsheet, FileText, Lightbulb,
  MoonStar, Plus, Search, Trash2, TrendingDown, TrendingUp, UserRound, X,
} from 'lucide-react'
import { auth, db } from '../../firebase'
import { useLanguage } from '../../contexts/LanguageContext'
import { useFleetScope } from './FleetScopeContext'
import { BUS_REGS } from '../../services/fleetMeta'
import CustomSelect from '../CustomSelect'
import {
  OVERTIME_TYPES,
  buildDriverMonthlyTotals,
  buildOvertimeInsights,
  calculateOvertimeMinutes,
  minutesToHours,
  overtimeTypeForDate,
  previousMonthKey,
} from './overtimeCalculations'
import { exportOvertimeExcel, exportOvertimePdf } from './overtimeReport'
import { recordActivity } from '../../services/activityLog'
import { sendNotification } from '../../utils/notify'
import './FleetOvertime.css'

const OVERTIME_NON_DRIVER_STAFF = Object.freeze([
  {
    driverName: 'Mohammed Israr',
    employeeType: 'labor',
    registration: '',
    sourceRegistration: '',
    branch: 'Operations',
  },
])

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function dayLabel(date, locale) {
  if (!date) return '—'
  const parsed = new Date(`${date}T12:00:00`)
  return Number.isNaN(parsed.getTime()) ? '—' : new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(parsed)
}

function monthLabel(month, locale) {
  const parsed = new Date(`${month}-01T12:00:00`)
  return Number.isNaN(parsed.getTime()) ? month : new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(parsed)
}

function weekdayFromIndex(index, locale) {
  if (index == null) return '—'
  return new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(new Date(2024, 0, 7 + Number(index)))
}

function hoursLabel(minutes, locale) {
  return `${minutesToHours(minutes).toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} h`
}

const emptyDraft = () => ({
  id: '',
  driverName: '',
  vehicleType: '',
  plateNumber: '',
  date: localDateKey(),
  startTime: '',
  finishTime: '',
  reason: '',
})

export default function FleetOvertime({ canEdit }) {
  const { t, lang } = useLanguage()
  const locale = lang === 'ar' ? 'ar-AE' : 'en-AE'
  const { metaMap, metaOf, classOf } = useFleetScope()
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [month, setMonth] = useState(localDateKey().slice(0, 7))
  const [search, setSearch] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [draft, setDraft] = useState(emptyDraft)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [pendingDelete, setPendingDelete] = useState('')
  const [reportOpen, setReportOpen] = useState(false)
  const [reportError, setReportError] = useState('')

  useEffect(() => onSnapshot(
    collection(db, 'fleet_driver_overtime'),
    (snapshot) => {
      setEntries(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })))
      setLoading(false)
      setLoadError('')
    },
    (error) => {
      console.error('[fleet overtime] subscription failed:', error)
      setLoadError(lang === 'ar' ? 'تعذر تحميل سجلات العمل الإضافي.' : 'Overtime records could not be loaded.')
      setLoading(false)
    },
  ), [lang])

  const buses = useMemo(() => {
    const registrations = new Set(BUS_REGS)
    metaMap.forEach((_, registration) => {
      if (classOf(registration) === 'bus') registrations.add(registration)
    })
    return [...registrations]
      .map((registration) => {
        const meta = metaOf(registration)
        return {
          registration: meta.plateNumber || registration,
          sourceRegistration: registration,
          busNumber: meta.busNumber || '',
          driverName: String(meta.driverName || '').trim(),
          branch: meta.branch || '',
          employeeType: 'driver',
        }
      })
      .filter((bus) => bus.driverName)
      .filter((bus, index, rows) => rows.findIndex((candidate) => candidate.registration === bus.registration) === index)
      .sort((a, b) => Number(a.busNumber || 999) - Number(b.busNumber || 999))
  }, [classOf, metaMap, metaOf])

  const drivers = useMemo(() => buses
    .filter((bus, index, rows) => rows.findIndex((candidate) => candidate.driverName.toLowerCase() === bus.driverName.toLowerCase()) === index)
    .sort((a, b) => a.driverName.localeCompare(b.driverName)), [buses])

  const overtimeStaff = useMemo(() => [...drivers, ...OVERTIME_NON_DRIVER_STAFF]
    .filter((person, index, rows) => rows.findIndex((candidate) => candidate.driverName.toLowerCase() === person.driverName.toLowerCase()) === index)
    .sort((a, b) => a.driverName.localeCompare(b.driverName)), [drivers])

  const staffOptions = useMemo(() => overtimeStaff.map((person) => ({
    value: person.driverName,
    label: person.driverName,
  })), [overtimeStaff])

  const monthEntries = useMemo(() => entries
    .filter((entry) => String(entry.date || '').startsWith(month))
    .sort((a, b) => `${b.date || ''} ${b.startTime || ''}`.localeCompare(`${a.date || ''} ${a.startTime || ''}`)), [entries, month])

  const previousEntries = useMemo(() => {
    const previous = previousMonthKey(month)
    return entries.filter((entry) => String(entry.date || '').startsWith(previous))
  }, [entries, month])

  const filteredEntries = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return monthEntries
    return monthEntries.filter((entry) => [entry.driverName, entry.vehicleType, entry.registration, entry.reason]
      .some((value) => String(value || '').toLowerCase().includes(needle)))
  }, [monthEntries, search])

  const driverTotals = useMemo(() => buildDriverMonthlyTotals(monthEntries, overtimeStaff), [monthEntries, overtimeStaff])
  const insights = useMemo(() => buildOvertimeInsights(monthEntries), [monthEntries])
  const previousInsights = useMemo(() => buildOvertimeInsights(previousEntries), [previousEntries])
  const activeDrivers = driverTotals.filter((driver) => driver.totalMinutes > 0)
  const averageMinutes = activeDrivers.length ? insights.totalMinutes / activeDrivers.length : 0
  const monthDelta = previousInsights.totalMinutes
    ? ((insights.totalMinutes - previousInsights.totalMinutes) / previousInsights.totalMinutes) * 100
    : null
  const topDriver = activeDrivers[0] || null
  const topDriverShare = topDriver && insights.totalMinutes ? (topDriver.totalMinutes / insights.totalMinutes) * 100 : 0

  const selectedStaff = overtimeStaff.find((person) => person.driverName === draft.driverName)
  const isLabor = selectedStaff?.employeeType === 'labor'
  const durationMinutes = calculateOvertimeMinutes(draft.startTime, draft.finishTime)
  const overtimeType = overtimeTypeForDate(draft.date)

  const setDraftField = (key, value) => {
    setDraft((current) => ({ ...current, [key]: value }))
    setFormError('')
  }

  const selectStaff = (value) => {
    const person = overtimeStaff.find((candidate) => candidate.driverName === value)
    setDraft((current) => ({
      ...current,
      driverName: value,
      ...(person?.employeeType === 'labor' ? { vehicleType: '', plateNumber: '' } : {}),
    }))
    setFormError('')
  }

  const openNew = () => {
    setDraft(emptyDraft())
    setFormError('')
    setFormOpen(true)
  }

  const openEdit = (entry) => {
    const matchingBus = buses.find((bus) => bus.sourceRegistration === entry.sourceRegistration
      || bus.registration === entry.registration)
    setDraft({
      id: entry.id,
      driverName: entry.driverName || matchingBus?.driverName || '',
      vehicleType: entry.vehicleType || entry.vehicleName || '',
      plateNumber: entry.registration || '',
      date: entry.date || localDateKey(),
      startTime: entry.startTime || '',
      finishTime: entry.finishTime || '',
      reason: entry.reason || '',
    })
    setFormError('')
    setFormOpen(true)
  }

  const closeForm = (force = false) => {
    if (saving && !force) return
    setFormOpen(false)
    setDraft(emptyDraft())
    setFormError('')
  }

  const saveEntry = async () => {
    if (!canEdit) {
      setFormError(t('You do not have permission to edit Fleet records.', 'ليس لديك صلاحية تعديل سجلات الأسطول.'))
      return
    }
    if (!selectedStaff) {
      setFormError(t('Select a staff member.', 'اختر الموظف.'))
      return
    }
    if (!isLabor && (!draft.vehicleType.trim() || !draft.plateNumber.trim())) {
      setFormError(t('Vehicle type and plate number are required.', 'نوع المركبة ورقم اللوحة مطلوبان.'))
      return
    }
    if (!draft.date || !draft.startTime || !draft.finishTime) {
      setFormError(t('Date, start time and finish time are required.', 'التاريخ ووقت البداية ووقت الانتهاء مطلوبة.'))
      return
    }
    if (!draft.reason.trim()) {
      setFormError(t('Add the reason for this overtime.', 'أضف سبب العمل الإضافي.'))
      return
    }
    if (!durationMinutes) {
      setFormError(t('Start and finish time cannot be the same.', 'لا يمكن أن يكون وقت البداية والانتهاء متطابقين.'))
      return
    }
    if (durationMinutes > 16 * 60) {
      setFormError(t('An overtime entry cannot exceed 16 hours. Check the times.', 'لا يمكن أن يتجاوز سجل العمل الإضافي 16 ساعة. تحقق من الأوقات.'))
      return
    }

    setSaving(true)
    setFormError('')
    try {
      const actor = auth.currentUser
      const payload = {
        driverName: selectedStaff.driverName,
        employeeType: selectedStaff.employeeType || 'driver',
        vehicleType: draft.vehicleType.trim(),
        registration: draft.plateNumber.trim().toUpperCase(),
        sourceRegistration: selectedStaff.sourceRegistration || '',
        branch: selectedStaff.branch || '',
        date: draft.date,
        day: dayLabel(draft.date, 'en-AE'),
        dayAr: dayLabel(draft.date, 'ar-AE'),
        startTime: draft.startTime,
        finishTime: draft.finishTime,
        durationMinutes,
        overtimeType,
        reason: draft.reason.trim(),
        updatedAt: serverTimestamp(),
        updatedBy: actor?.email || actor?.uid || 'unknown',
      }
      let recordId = draft.id
      if (draft.id) {
        await updateDoc(doc(db, 'fleet_driver_overtime', draft.id), payload)
      } else {
        const created = await addDoc(collection(db, 'fleet_driver_overtime'), {
          ...payload,
          createdAt: serverTimestamp(),
          createdBy: actor?.email || actor?.uid || 'unknown',
        })
        recordId = created.id
      }
      await recordActivity({
        module: 'fleet', submodule: 'overtime', action: draft.id ? 'overtime_updated' : 'overtime_created',
        titleEn: `${draft.id ? 'Overtime updated' : 'Overtime added'} · ${selectedStaff.driverName}`,
        titleAr: `${draft.id ? 'تم تحديث العمل الإضافي' : 'تمت إضافة عمل إضافي'} · ${selectedStaff.driverName}`,
        detailEn: `${draft.date} · ${minutesToHours(durationMinutes)} h · ${draft.reason.trim()}`,
        detailAr: `${draft.date} · ${minutesToHours(durationMinutes)} ساعة · ${draft.reason.trim()}`,
        recordId, path: '/fleet/overtime',
      })
      if (!draft.id) await sendNotification('fleet_overtime_logged', {
        personName: selectedStaff.driverName,
        date: draft.date,
        hours: minutesToHours(durationMinutes),
        reason: draft.reason.trim(),
      })
      setMonth(draft.date.slice(0, 7))
      closeForm(true)
    } catch (error) {
      console.error('[fleet overtime] save failed:', error)
      setFormError(error?.message || t('Unable to save this overtime entry.', 'تعذر حفظ سجل العمل الإضافي.'))
    } finally {
      setSaving(false)
    }
  }

  const removeEntry = async (entry) => {
    if (!canEdit) return
    if (pendingDelete !== entry.id) {
      setPendingDelete(entry.id)
      return
    }
    try {
      await deleteDoc(doc(db, 'fleet_driver_overtime', entry.id))
      await recordActivity({
        module: 'fleet', submodule: 'overtime', action: 'overtime_deleted',
        titleEn: `Overtime deleted · ${entry.driverName || '—'}`,
        titleAr: `تم حذف العمل الإضافي · ${entry.driverName || '—'}`,
        detailEn: `${entry.date || '—'} · ${entry.reason || ''}`,
        detailAr: `${entry.date || '—'} · ${entry.reason || ''}`,
        recordId: entry.id, path: '/fleet/overtime',
      })
      setPendingDelete('')
    } catch (error) {
      console.error('[fleet overtime] delete failed:', error)
      setLoadError(error?.message || t('Unable to delete this entry.', 'تعذر حذف هذا السجل.'))
    }
  }

  const exportMonthlyReport = async (format) => {
    setReportError('')
    try {
      const options = {
        month,
        entries: monthEntries,
        staff: overtimeStaff,
        monthName: monthLabel(month, locale),
        locale,
      }
      if (format === 'excel') await exportOvertimeExcel(options)
      else await exportOvertimePdf(options)
      setReportOpen(false)
    } catch (error) {
      console.error('[fleet overtime] report export failed:', error)
      setReportError(t('The monthly report could not be created. Please try again.', 'تعذر إنشاء التقرير الشهري. يرجى المحاولة مرة أخرى.'))
    }
  }

  return (
    <section className="fot-page">
      <header className="fot-header">
        <div>
          <span className="fot-eyebrow"><Clock3 size={13} /> {t('Bus operations · manual register', 'عمليات الحافلات · سجل يدوي')}</span>
          <h1>{t('Staff Overtime', 'العمل الإضافي للموظفين')}</h1>
          <p>{t('Record extra hours for bus drivers and the operations laborer, then review monthly totals for each staff member.', 'سجّل الساعات الإضافية لسائقي الحافلات وعامل العمليات، ثم راجع الإجماليات الشهرية لكل موظف.')}</p>
        </div>
        <div className="fot-header-actions">
          <label className="fot-month-picker">
            <CalendarDays size={15} />
            <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
          </label>
          <div className="fot-report-menu">
            <button type="button" className="fot-secondary-btn fot-report-trigger" onClick={() => setReportOpen((open) => !open)} aria-expanded={reportOpen}>
              <Download size={15} /> {t('Monthly report', 'التقرير الشهري')} <ChevronDown size={14} />
            </button>
            <AnimatePresence>
              {reportOpen && <motion.div className="fot-report-popover" initial={{ opacity: 0, y: -5, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98 }} transition={{ duration: 0.15 }}>
                <button type="button" onClick={() => exportMonthlyReport('excel')}><FileSpreadsheet size={16} /><span><strong>{t('Excel workbook', 'ملف إكسل')}</strong><small>{t('Summary and detailed entries', 'الملخص والسجلات التفصيلية')}</small></span></button>
                <button type="button" onClick={() => exportMonthlyReport('pdf')}><FileText size={16} /><span><strong>{t('PDF report', 'تقرير PDF')}</strong><small>{t('Print-ready monthly register', 'سجل شهري جاهز للطباعة')}</small></span></button>
              </motion.div>}
            </AnimatePresence>
          </div>
          {canEdit && <button type="button" className="fot-primary-btn" onClick={openNew}><Plus size={16} /> {t('Add overtime', 'إضافة عمل إضافي')}</button>}
        </div>
      </header>

      <div className="fot-bus-only"><Bus size={15} /><span>{t('Bus drivers come from current Fleet assignments. Mohammed Israr is included separately as Operations Labor.', 'يتم جلب سائقي الحافلات من تعيينات الأسطول الحالية، وتمت إضافة محمد إسرار بشكل منفصل كعامل عمليات.')}</span></div>
      {reportError && <div className="fot-error">{reportError}</div>}

      <div className="fot-kpi-grid">
        <article className="fot-kpi fot-kpi--primary"><div><span>{t('Total overtime', 'إجمالي العمل الإضافي')}</span><Clock3 size={16} /></div><strong>{hoursLabel(insights.totalMinutes, locale)}</strong><small>{monthLabel(month, locale)}</small></article>
        <article className="fot-kpi"><div><span>{t('Working-day extra', 'إضافي أيام العمل')}</span><BriefcaseBusiness size={16} /></div><strong>{hoursLabel(insights.workingMinutes, locale)}</strong><small>{monthEntries.filter((entry) => entry.overtimeType !== OVERTIME_TYPES.OFF_DAY).length.toLocaleString(locale)} {t('entries', 'سجلات')}</small></article>
        <article className="fot-kpi"><div><span>{t('Saturday off-day', 'يوم عطلة السبت')}</span><MoonStar size={16} /></div><strong>{hoursLabel(insights.offDayMinutes, locale)}</strong><small>{insights.weekendShare.toLocaleString(locale, { maximumFractionDigits: 1 })}% {t('of monthly hours', 'من ساعات الشهر')}</small></article>
        <article className="fot-kpi"><div><span>{t('Staff with overtime', 'الموظفون بساعات إضافية')}</span><UserRound size={16} /></div><strong>{activeDrivers.length.toLocaleString(locale)}</strong><small>{t('Average', 'المتوسط')} {hoursLabel(averageMinutes, locale)} / {t('staff member', 'موظف')}</small></article>
      </div>

      <div className="fot-insight-grid">
        <article className="fot-insight-panel">
          <div className="fot-section-heading"><div><Lightbulb size={17} /><span>{t('Monthly insights', 'رؤى شهرية')}</span></div><small>{monthLabel(month, locale)}</small></div>
          <div className="fot-insight-list">
            <div><span className="fot-insight-icon"><UserRound size={15} /></span><p><strong>{topDriver ? topDriver.driverName : t('No overtime recorded', 'لا يوجد عمل إضافي مسجل')}</strong><small>{topDriver ? `${t('Highest total', 'أعلى إجمالي')}: ${hoursLabel(topDriver.totalMinutes, locale)} · ${topDriverShare.toLocaleString(locale, { maximumFractionDigits: 1 })}% ${t('of all hours', 'من جميع الساعات')}` : t('Add an entry to start the monthly analysis.', 'أضف سجلاً لبدء التحليل الشهري.')}</small></p></div>
            <div><span className="fot-insight-icon"><CalendarDays size={15} /></span><p><strong>{insights.busiestDay ? weekdayFromIndex(insights.busiestDay[0], locale) : '—'}</strong><small>{insights.busiestDay ? `${t('Busiest overtime day', 'أكثر الأيام عملاً إضافياً')} · ${hoursLabel(insights.busiestDay[1], locale)}` : t('No day pattern yet', 'لا يوجد نمط للأيام بعد')}</small></p></div>
            <div><span className="fot-insight-icon"><BarChart3 size={15} /></span><p><strong>{monthDelta == null ? t('No prior-month baseline', 'لا توجد مقارنة للشهر السابق') : `${Math.abs(monthDelta).toLocaleString(locale, { maximumFractionDigits: 1 })}%`}</strong><small>{monthDelta == null ? t('Previous month has no overtime records.', 'لا توجد سجلات عمل إضافي في الشهر السابق.') : monthDelta >= 0 ? t('More overtime than the previous month', 'زيادة عن الشهر السابق') : t('Less overtime than the previous month', 'انخفاض عن الشهر السابق')}</small></p>{monthDelta != null && (monthDelta >= 0 ? <TrendingUp size={17} className="fot-trend-up" /> : <TrendingDown size={17} className="fot-trend-down" />)}</div>
            <div><span className="fot-insight-icon"><BriefcaseBusiness size={15} /></span><p><strong>{insights.topReason?.[0] || '—'}</strong><small>{insights.topReason ? `${t('Largest reason category', 'أكبر فئة أسباب')} · ${hoursLabel(insights.topReason[1], locale)}` : t('Reasons will be summarized here.', 'سيتم تلخيص الأسباب هنا.')}</small></p></div>
          </div>
        </article>

        <article className="fot-driver-totals">
          <div className="fot-section-heading"><div><UserRound size={17} /><span>{t('Hours by staff', 'الساعات حسب الموظف')}</span></div><small>{driverTotals.length.toLocaleString(locale)} {t('eligible staff', 'موظفاً مؤهلاً')}</small></div>
          <div className="fot-driver-table-wrap">
            <table>
              <thead><tr><th>{t('Staff member', 'الموظف')}</th><th>{t('Working days', 'أيام العمل')}</th><th>{t('Saturday', 'السبت')}</th><th>{t('Total', 'الإجمالي')}</th><th>{t('Entries', 'السجلات')}</th></tr></thead>
              <tbody>{driverTotals.map((driver) => (
                <tr key={driver.driverName} className={driver.totalMinutes ? '' : 'is-zero'}>
                  <td><strong>{driver.driverName}</strong><small>{driver.employeeType === 'labor' ? t('Operations Labor', 'عامل عمليات') : (driver.registrations.join(' · ') || '—')}</small></td>
                  <td>{hoursLabel(driver.workingMinutes, locale)}</td>
                  <td>{hoursLabel(driver.offDayMinutes, locale)}</td>
                  <td><b>{hoursLabel(driver.totalMinutes, locale)}</b></td>
                  <td>{driver.entryCount.toLocaleString(locale)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </article>
      </div>

      <article className="fot-ledger">
        <div className="fot-ledger-head">
          <div><span>{t('Overtime register', 'سجل العمل الإضافي')}</span><small>{filteredEntries.length.toLocaleString(locale)} {t('records in view', 'سجلات معروضة')}</small></div>
          <label><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('Search staff, plate or reason', 'ابحث عن موظف أو لوحة أو سبب')} /></label>
        </div>
        {loadError && <div className="fot-error">{loadError}</div>}
        {loading ? <div className="fot-loading"><i /><i /><i /></div> : filteredEntries.length ? (
          <div className="fot-ledger-table-wrap"><table><thead><tr><th>{t('Staff member', 'الموظف')}</th><th>{t('Date & day', 'التاريخ واليوم')}</th><th>{t('Type', 'النوع')}</th><th>{t('Time', 'الوقت')}</th><th>{t('Hours', 'الساعات')}</th><th>{t('Reason', 'السبب')}</th>{canEdit && <th aria-label={t('Actions', 'الإجراءات')} />}</tr></thead><tbody>
            {filteredEntries.map((entry) => <tr key={entry.id}>
              <td><strong>{entry.driverName}</strong><small>{entry.vehicleType ? `${entry.vehicleType} · ` : ''}{entry.registration || '—'}</small></td>
              <td><strong>{new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${entry.date}T12:00:00`))}</strong><small>{dayLabel(entry.date, locale)}</small></td>
              <td><span className={`fot-type-badge ${entry.overtimeType === OVERTIME_TYPES.OFF_DAY ? 'off-day' : 'workday'}`}>{entry.overtimeType === OVERTIME_TYPES.OFF_DAY ? t('Saturday off day', 'عطلة السبت') : t('Working-day extra', 'إضافي يوم عمل')}</span></td>
              <td className="fot-time-cell">{entry.startTime} <span>→</span> {entry.finishTime}</td>
              <td><b>{hoursLabel(entry.durationMinutes, locale)}</b></td>
              <td className="fot-reason-cell">{entry.reason}</td>
              {canEdit && <td><div className="fot-row-actions"><button type="button" onClick={() => openEdit(entry)} aria-label={t('Edit entry', 'تعديل السجل')}><Edit3 size={14} /></button><button type="button" className={pendingDelete === entry.id ? 'confirm-delete' : ''} onClick={() => removeEntry(entry)} onBlur={() => setPendingDelete('')} aria-label={t('Delete entry', 'حذف السجل')}>{pendingDelete === entry.id ? <Check size={14} /> : <Trash2 size={14} />}</button></div></td>}
            </tr>)}
          </tbody></table></div>
        ) : <div className="fot-empty"><Clock3 size={32} /><strong>{t('No overtime recorded for this month', 'لا يوجد عمل إضافي مسجل لهذا الشهر')}</strong><span>{t('Choose another month or add the first overtime entry.', 'اختر شهراً آخر أو أضف أول سجل عمل إضافي.')}</span>{canEdit && <button type="button" onClick={openNew}><Plus size={14} /> {t('Add overtime', 'إضافة عمل إضافي')}</button>}</div>}
      </article>

      <AnimatePresence>
        {formOpen && <motion.div className="fot-modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget) closeForm() }}>
          <motion.section className="fot-modal" role="dialog" aria-modal="true" aria-labelledby="fot-modal-title" initial={{ opacity: 0, scale: 0.96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: 5 }} transition={{ duration: 0.2 }}>
            <header><div><span>{draft.id ? t('Update register', 'تحديث السجل') : t('New register entry', 'سجل جديد')}</span><h2 id="fot-modal-title">{draft.id ? t('Edit overtime', 'تعديل العمل الإضافي') : t('Add staff overtime', 'إضافة عمل إضافي للموظف')}</h2></div><button type="button" onClick={() => closeForm()}><X size={18} /></button></header>
            <div className="fot-modal-body">
              <div className="fot-field fot-field--full"><label>{t('Staff name', 'اسم الموظف')} *</label><CustomSelect value={draft.driverName} onChange={selectStaff} options={[{ value: '', label: t('Select staff', 'اختر الموظف') }, ...staffOptions]} /></div>
              {isLabor && <div className="fot-labor-note"><BriefcaseBusiness size={15} /><span>{t('Operations Labor · vehicle details are not required.', 'عامل عمليات · بيانات المركبة غير مطلوبة.')}</span></div>}
              <div className="fot-field"><label>{t('Vehicle type', 'نوع المركبة')} {!isLabor && '*'}</label><input type="text" value={draft.vehicleType} onChange={(event) => setDraftField('vehicleType', event.target.value)} placeholder={isLabor ? t('Optional', 'اختياري') : t('Type the car or vehicle', 'اكتب نوع السيارة أو المركبة')} /></div>
              <div className="fot-field"><label>{t('Plate number', 'رقم اللوحة')} {!isLabor && '*'}</label><input type="text" value={draft.plateNumber} onChange={(event) => setDraftField('plateNumber', event.target.value)} placeholder={isLabor ? t('Optional', 'اختياري') : t('Type the plate number', 'اكتب رقم اللوحة')} autoCapitalize="characters" /></div>
              <div className="fot-field"><label>{t('Date', 'التاريخ')} *</label><input type="date" value={draft.date} onChange={(event) => setDraftField('date', event.target.value)} /></div>
              <div className="fot-day-preview"><span>{t('Day', 'اليوم')}</span><strong>{dayLabel(draft.date, locale)}</strong><small className={overtimeType === OVERTIME_TYPES.OFF_DAY ? 'is-off-day' : ''}>{overtimeType === OVERTIME_TYPES.OFF_DAY ? t('Saturday · off day', 'السبت · يوم عطلة') : t('Normal working day', 'يوم عمل عادي')}</small></div>
              <div className="fot-field"><label>{t('Start time', 'وقت البداية')} *</label><input type="time" value={draft.startTime} onChange={(event) => setDraftField('startTime', event.target.value)} /></div>
              <div className="fot-field"><label>{t('Finish time', 'وقت الانتهاء')} *</label><input type="time" value={draft.finishTime} onChange={(event) => setDraftField('finishTime', event.target.value)} /></div>
              <div className="fot-duration-preview"><Clock3 size={17} /><div><span>{t('Calculated overtime', 'العمل الإضافي المحتسب')}</span><strong>{durationMinutes ? hoursLabel(durationMinutes, locale) : '—'}</strong></div>{draft.startTime && draft.finishTime && draft.finishTime < draft.startTime && <small>{t('Finishes after midnight', 'ينتهي بعد منتصف الليل')}</small>}</div>
              <div className="fot-field fot-field--full"><label>{t('Reason', 'السبب')} *</label><textarea rows={4} value={draft.reason} onChange={(event) => setDraftField('reason', event.target.value)} placeholder={t('Explain why the overtime was required…', 'اشرح سبب الحاجة إلى العمل الإضافي…')} /></div>
              {formError && <div className="fot-form-error">{formError}</div>}
            </div>
            <footer><button type="button" className="fot-secondary-btn" onClick={() => closeForm()}>{t('Cancel', 'إلغاء')}</button><button type="button" className="fot-primary-btn" onClick={saveEntry} disabled={saving}>{saving ? <span className="fot-spinner" /> : <Check size={15} />}{draft.id ? t('Save changes', 'حفظ التعديلات') : t('Add to register', 'إضافة إلى السجل')}</button></footer>
          </motion.section>
        </motion.div>}
      </AnimatePresence>
    </section>
  )
}
