import React, { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowUpRight, BarChart3, CalendarRange, ClipboardList, Download, Plus, Search, Trophy, UserRound, X } from 'lucide-react'
import * as XLSX from 'xlsx'
import { useLanguage } from '../../contexts/LanguageContext'
import { useAuth } from '../../contexts/AuthContext'
import { useFleetScope } from './FleetScopeContext'
import {
  createExternalTransportationRecord,
  subscribeExternalTransportation,
  subscribeFleetPeople,
} from '../../services/fleetPeople'
import { recordActivity } from '../../services/activityLog'
import { sendNotification } from '../../utils/notify'
import { buildExternalTransportationInsights } from './fleetTripAnalytics'
import CustomSelect from '../CustomSelect'
import CustomDateInput from '../CustomDateInput'
import './FleetExternalTransportation.css'

const emptyDraft = {
  date: new Date().toISOString().slice(0, 10), personId: '', vehicleRegistration: '',
  responsibleParty: '', reason: '', details: '', notes: '',
}
const REASONS = [
  { value: 'السفر', en: 'Travel', ar: 'السفر' },
  { value: 'المنتخب', en: 'National team', ar: 'المنتخب' },
  { value: 'البطولات المحلية', en: 'Local competitions', ar: 'البطولات المحلية' },
  { value: 'العلاج', en: 'Medical treatment', ar: 'العلاج' },
  { value: 'أخرى', en: 'Other', ar: 'أخرى' },
]

const cleanReason = (value) => String(value || '').replace(/\s*,\s*/g, ' + ').trim()

function InsightRank({ title, icon: Icon, rows, empty, type = 'default' }) {
  return <article className="external-insight-card">
    <header><span className={`external-insight-icon is-${type}`}><Icon size={16} /></span><div><span>{title}</span><small>{rows.reduce((sum, row) => sum + row.count, 0)} {rows.length === 1 ? 'request' : 'requests'}</small></div></header>
    <div className="external-insight-rankings">
      {rows.map((row, index) => <div key={row.key} className="external-insight-row"><span className="external-insight-place">{index + 1}</span><strong>{row.label}</strong><b>{row.count}</b></div>)}
      {!rows.length && <p>{empty}</p>}
    </div>
  </article>
}

export default function FleetExternalTransportation({ canEdit }) {
  const { t, lang, locale } = useLanguage()
  const { user, userProfile } = useAuth()
  const { metaMap, metaOf } = useFleetScope()
  const [records, setRecords] = useState([])
  const [people, setPeople] = useState([])
  const [query, setQuery] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [driverFilter, setDriverFilter] = useState('all')
  const [staffFilter, setStaffFilter] = useState('all')
  const [reasonFilter, setReasonFilter] = useState('all')
  const [activeView, setActiveView] = useState('register')
  const [visibleCount, setVisibleCount] = useState(50)
  const [draft, setDraft] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => subscribeExternalTransportation(setRecords), [])
  useEffect(() => subscribeFleetPeople(setPeople), [])

  const vehicles = useMemo(() => [...metaMap.keys()].map((registration) => metaOf(registration))
    .filter((meta) => meta.clubOwned !== false)
    .sort((a, b) => String(a.plateNumber || a.registration).localeCompare(String(b.plateNumber || b.registration))), [metaMap, metaOf])
  const peopleById = useMemo(() => new Map(people.map((person) => [person.id, person])), [people])
  const vehicleByReg = useMemo(() => new Map(vehicles.map((vehicle) => [vehicle.registration, vehicle])), [vehicles])
  const reasonOptions = useMemo(() => [...new Set(records.map((record) => cleanReason(record.reason)).filter(Boolean))].sort(), [records])

  const filtered = useMemo(() => records.filter((record) => {
    const term = query.trim().toLowerCase()
    if (from && record.date < from) return false
    if (to && record.date > to) return false
    if (driverFilter !== 'all' && record.personId !== driverFilter && record.personName !== driverFilter) return false
    if (staffFilter !== 'all' && record.personId !== staffFilter && record.personName !== staffFilter) return false
    if (reasonFilter !== 'all' && cleanReason(record.reason) !== reasonFilter) return false
    if (term && ![record.personName, record.responsibleParty, record.reason, record.details, record.vehicleRegistration, record.sourcePlate]
      .some((value) => String(value || '').toLowerCase().includes(term))) return false
    return true
  }).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || Number(b.sourceRow || 0) - Number(a.sourceRow || 0)), [records, query, from, to, driverFilter, staffFilter, reasonFilter])

  useEffect(() => setVisibleCount(50), [query, from, to, driverFilter, staffFilter, reasonFilter])

  const stats = useMemo(() => {
    const matched = filtered.filter((item) => item.plateMatchStatus !== 'unmatched' && item.vehicleRegistration)
    const uniquePeople = new Set(filtered.map((item) => item.personId || item.personName).filter(Boolean))
    const uniqueVehicles = new Set(matched.map((item) => item.vehicleRegistration))
    const staffTrips = filtered.filter((item) => (peopleById.get(item.personId)?.personType || item.personType) === 'staff').length
    return { trips: filtered.length, people: uniquePeople.size, vehicles: uniqueVehicles.size, staffTrips, exceptions: filtered.length - matched.length }
  }, [filtered, peopleById])
  const insights = useMemo(() => buildExternalTransportationInsights({ records, people, vehicles, from, to }), [records, people, vehicles, from, to])

  const actor = { uid: user?.uid, email: user?.email, name: userProfile?.displayName || userProfile?.name || user?.displayName || user?.email }

  const submit = async (event) => {
    event.preventDefault()
    const person = peopleById.get(draft.personId)
    if (!person) { setError(t('Choose a driver or staff member.', 'اختر سائقاً أو موظفاً.')); return }
    setSaving(true); setError('')
    try {
      const created = await createExternalTransportationRecord({
        ...draft,
        personName: person.displayName,
        personType: person.personType,
      }, user?.email || '')
      await recordActivity({
        module: 'fleet', submodule: 'externalTransportation', action: 'trip_created', recordId: created.id,
        titleEn: `External transport logged · ${draft.vehicleRegistration}`,
        titleAr: `تم تسجيل نقل خارجي · ${draft.vehicleRegistration}`,
        detailEn: `${person.displayName} · ${draft.date} · ${draft.reason}`,
        detailAr: `${person.displayName} · ${draft.date} · ${draft.reason}`,
        path: '/fleet/external-transportation', actor,
      })
      await sendNotification('fleet_external_transport', {
        registration: draft.vehicleRegistration,
        personName: person.displayName,
        date: draft.date,
        reason: draft.reason,
      })
      setDraft(null)
    } catch (caught) {
      setError(caught.message || t('Could not save this trip.', 'تعذر حفظ هذه الرحلة.'))
    } finally { setSaving(false) }
  }

  const exportExcel = () => {
    const headers = lang === 'ar'
      ? ['التاريخ', 'السائق / الموظف', 'الصفة', 'المركبة', 'رقم اللوحة في المصدر', 'المعني بالتوصيل', 'السبب', 'الوقت والمكان', 'ملاحظات المطابقة']
      : ['Date', 'Driver / staff', 'Role', 'Vehicle', 'Source plate', 'Transported person / group', 'Reason', 'Time and place', 'Matching note']
    const rows = filtered.map((record) => {
      const person = peopleById.get(record.personId)
      return [record.date, record.personName, (person?.personType || record.personType) === 'staff' ? t('Club staff', 'موظف في النادي') : t('Driver', 'سائق'), record.vehicleRegistration || t('Unmatched', 'غير مطابق'), record.sourcePlate || '', record.responsibleParty || '', record.reason || '', record.details || '', record.plateMatchStatus === 'unmatched' ? t('Plate does not match the current fleet register', 'اللوحة لا تطابق سجل الأسطول الحالي') : '']
    })
    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows])
    worksheet['!cols'] = [{ wch: 12 }, { wch: 22 }, { wch: 15 }, { wch: 14 }, { wch: 14 }, { wch: 30 }, { wch: 24 }, { wch: 44 }, { wch: 36 }]
    worksheet['!views'] = [{ rightToLeft: lang === 'ar' }]
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, lang === 'ar' ? 'النقل الخارجي' : 'External Transportation')
    XLSX.writeFile(workbook, `FMAC-external-transportation-${from || 'all'}-${to || 'all'}.xlsx`)
  }

  return <section className="external-transport-page">
    <header className="external-command">
      <div className="external-command-copy"><span><ArrowUpRight size={14} />{t('Non-routine movement register', 'سجل التحركات غير اليومية')}</span><h1>{t('External Transportation', 'النقل الخارجي')}</h1><p>{t('Competitions, national-team duties, airport transfers, treatment and other transport outside everyday club routes.', 'البطولات ومهام المنتخب وتوصيلات المطارات والعلاج وأي نقل خارج المسارات اليومية للنادي.')}</p></div>
      <div className="external-command-actions"><button onClick={exportExcel} disabled={!filtered.length}><Download size={15} />{t('Excel report', 'تقرير إكسل')}</button>{canEdit && <button className="is-primary" onClick={() => { setDraft({ ...emptyDraft }); setError('') }}><Plus size={15} />{t('Log trip', 'تسجيل رحلة')}</button>}</div>
      <div className="external-command-metrics">
        <div><span>{t('Trips in view', 'الرحلات المعروضة')}</span><strong>{stats.trips.toLocaleString(locale)}</strong></div>
        <div><span>{t('People who drove', 'الأشخاص الذين قادوا')}</span><strong>{stats.people.toLocaleString(locale)}</strong></div>
        <div><span>{t('Vehicles used', 'المركبات المستخدمة')}</span><strong>{stats.vehicles.toLocaleString(locale)}</strong></div>
        <div><span>{t('Staff-driven trips', 'رحلات قادها موظفون')}</span><strong>{stats.staffTrips.toLocaleString(locale)}</strong></div>
      </div>
    </header>

    <div className="external-mode-tabs" role="tablist"><button role="tab" aria-selected={activeView === 'register'} className={activeView === 'register' ? 'is-active' : ''} onClick={() => setActiveView('register')}><ClipboardList size={15} />{t('Register', 'السجل')}</button><button role="tab" aria-selected={activeView === 'insights'} className={activeView === 'insights' ? 'is-active' : ''} onClick={() => setActiveView('insights')}><BarChart3 size={15} />{t('Insights', 'المؤشرات')}</button></div>

    {activeView === 'register' && <>
      {stats.exceptions > 0 && <div className="external-quality-note"><AlertTriangle size={16} /><div><strong>{t(`${stats.exceptions} source rows need plate review`, `${stats.exceptions} سجلات مصدر تحتاج مراجعة اللوحة`)}</strong><span>{t('They are preserved exactly as supplied and are not attached to the wrong vehicle.', 'تم حفظها كما وردت دون ربطها بمركبة غير صحيحة.')}</span></div></div>}

      <div className="external-register">
      <div className="external-register-head"><div><span>{t('Historical and live register', 'السجل التاريخي والحالي')}</span><h2>{t('External movements', 'التحركات الخارجية')}</h2></div><small>{records.length.toLocaleString(locale)} {t('records loaded', 'سجلاً محملاً')}</small></div>
      <div className="external-filters">
        <label className="external-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('Search person, plate, destination or purpose', 'ابحث بالشخص أو اللوحة أو الوجهة أو الغرض')} /></label>
        <CustomDateInput label={t('From', 'من')} value={from} onChange={setFrom} className="external-date-control" />
        <CustomDateInput label={t('To', 'إلى')} value={to} onChange={setTo} className="external-date-control" />
        <label><span>{t('Driver', 'السائق')}</span><CustomSelect value={driverFilter} onChange={setDriverFilter} options={[{ value: 'all', label: t('All drivers', 'جميع السائقين') }, ...people.filter((person) => person.personType !== 'staff').map((person) => ({ value: person.id, label: person.displayName }))]} /></label>
        <label><span>{t('Club staff', 'موظفو النادي')}</span><CustomSelect value={staffFilter} onChange={setStaffFilter} options={[{ value: 'all', label: t('All staff', 'جميع الموظفين') }, ...people.filter((person) => person.personType === 'staff').map((person) => ({ value: person.id, label: person.displayName }))]} /></label>
        <label><span>{t('Purpose', 'الغرض')}</span><CustomSelect value={reasonFilter} onChange={setReasonFilter} options={[{ value: 'all', label: t('All purposes', 'جميع الأغراض') }, ...reasonOptions.map((reason) => ({ value: reason, label: reason }))]} /></label>
      </div>
      <div className="external-table-wrap"><table className="external-table"><thead><tr><th>{t('Date', 'التاريخ')}</th><th>{t('Person driving', 'الشخص الذي قاد')}</th><th>{t('Vehicle', 'المركبة')}</th><th>{t('Transported', 'المعني بالتوصيل')}</th><th>{t('Purpose', 'الغرض')}</th><th>{t('Time and place', 'الوقت والمكان')}</th></tr></thead><tbody>
        {filtered.slice(0, visibleCount).map((record) => {
          const person = peopleById.get(record.personId)
          const vehicle = vehicleByReg.get(record.vehicleRegistration)
          return <tr key={record.id} className={record.plateMatchStatus === 'unmatched' ? 'has-exception' : ''}>
            <td><strong>{record.date || '—'}</strong><small>{record.source === 'historical_import' ? t('Imported record', 'سجل مستورد') : t('Manual record', 'سجل يدوي')}</small></td>
            <td><div className="external-person"><span><UserRound size={13} /></span><div><strong>{record.personName || '—'}</strong><small>{(person?.personType || record.personType) === 'staff' ? t('Club staff', 'موظف في النادي') : t('Driver', 'سائق')}</small></div></div></td>
            <td><strong className="external-plate">{record.vehicleRegistration || record.sourcePlate || '—'}</strong><small>{record.plateMatchStatus === 'external_non_club' ? t('External vehicle — not in club fleet', 'مركبة خارجية — ليست ضمن أسطول النادي') : (vehicle?.vehicleClass === 'bus' ? t(`Bus ${vehicle.busNumber || '—'}`, `حافلة ${vehicle.busNumber || '—'}`) : (vehicle?.label || t('Other vehicle', 'مركبة أخرى')))}{record.plateMatchStatus === 'unmatched' ? ` · ${t('Needs review', 'تحتاج مراجعة')}` : ''}</small></td>
            <td>{record.responsibleParty || '—'}</td><td><span className="external-reason">{cleanReason(record.reason) || '—'}</span></td><td className="external-details">{record.details || '—'}</td>
          </tr>
        })}
        {!filtered.length && <tr><td colSpan="6" className="external-empty"><CalendarRange size={24} />{t('No external trips match this period and filter.', 'لا توجد رحلات خارجية تطابق الفترة والفلاتر.')}</td></tr>}
      </tbody></table></div>
      {visibleCount < filtered.length && <button className="external-load-more" onClick={() => setVisibleCount((count) => count + 50)}>{t('Load 50 more', 'تحميل 50 سجلاً إضافياً')} · {(filtered.length - visibleCount).toLocaleString(locale)} {t('remaining', 'متبقي')}</button>}
      </div>
    </>}

    {activeView === 'insights' && <section className="external-insights">
      <header className="external-insights-head"><div><span>{t('Request intelligence', 'ذكاء الطلبات')}</span><h2>{t('External transportation insights', 'مؤشرات النقل الخارجي')}</h2><p>{t('A request is one recorded external transportation activity. Filter the period below to compare demand.', 'الطلب هو نشاط نقل خارجي مسجل. قم بتحديد الفترة أدناه لمقارنة الطلب.')}</p></div><div className="external-insights-period"><CustomDateInput label={t('From', 'من')} value={from} onChange={setFrom} className="external-date-control" /><CustomDateInput label={t('To', 'إلى')} value={to} onChange={setTo} className="external-date-control" /></div></header>
      <div className="external-insight-hero"><div><span>{t('Requests in period', 'الطلبات خلال الفترة')}</span><strong>{insights.records.length.toLocaleString(locale)}</strong><small>{t(`${new Set(insights.records.map((item) => item.date)).size} calendar days had requests`, `${new Set(insights.records.map((item) => item.date)).size} أيام تقويمية تضمّنت طلبات`)}</small></div><div><span>{t('Most requested vehicle', 'المركبة الأكثر طلباً')}</span><strong>{insights.vehicles[0]?.label || '—'}</strong><small>{insights.vehicles[0] ? t(`${insights.vehicles[0].count} requests`, `${insights.vehicles[0].count} طلب`) : t('No requests', 'لا توجد طلبات')}</small></div><div><span>{t('Most active driver', 'السائق الأكثر نشاطاً')}</span><strong>{insights.drivers[0]?.label || '—'}</strong><small>{insights.drivers[0] ? t(`${insights.drivers[0].count} requests`, `${insights.drivers[0].count} طلب`) : t('No requests', 'لا توجد طلبات')}</small></div><div className={insights.unmatched ? 'is-review' : 'is-clear'}><span>{t('Plate matching', 'مطابقة اللوحات')}</span><strong>{insights.unmatched ? insights.unmatched.toLocaleString(locale) : t('Clear', 'سليم')}</strong><small>{insights.unmatched ? t('Open review list below', 'افتح قائمة المراجعة أدناه') : t('all requests matched', 'جميع الطلبات مطابقة')}</small></div></div>
      {insights.unmatchedRows.length > 0 && <article className="external-source-review"><header><div><span><AlertTriangle size={16} />{t('Source-plate review', 'مراجعة لوحات المصدر')}</span><h3>{t(`${insights.unmatchedRows.length} imported rows need a plate decision`, `${insights.unmatchedRows.length} سجلات مستوردة تحتاج قراراً بشأن اللوحة`)}</h3><p>{t('These rows were not counted against any vehicle. They remain here exactly as imported until you confirm the correct plate.', 'لم تُحتسب هذه السجلات على أي مركبة. تبقى هنا كما تم استيرادها حتى تؤكد اللوحة الصحيحة.')}</p></div></header><div className="external-source-review-table"><div className="external-source-review-heading"><span>{t('Source row', 'صف المصدر')}</span><span>{t('Date', 'التاريخ')}</span><span>{t('Source plate', 'لوحة المصدر')}</span><span>{t('Driver / staff', 'السائق / الموظف')}</span><span>{t('Purpose and details', 'الغرض والتفاصيل')}</span></div>{insights.unmatchedRows.map((row) => <div className="external-source-review-row" key={row.id}><strong>#{row.sourceRow || row.id}</strong><span>{row.date || '—'}</span><b>{row.sourcePlate || '—'}</b><span>{row.personName || '—'}</span><span><strong>{cleanReason(row.reason) || '—'}</strong><small>{row.details || '—'}</small></span></div>)}</div></article>}
      <div className="external-insight-grid"><InsightRank title={t('Vehicles used', 'المركبات المستخدمة')} icon={Trophy} rows={insights.vehicles} empty={t('No vehicle activity in this period.', 'لا يوجد نشاط للمركبات خلال هذه الفترة.')} type="vehicle" /><InsightRank title={t('Drivers and staff', 'السائقون والموظفون')} icon={UserRound} rows={insights.drivers} empty={t('No driver activity in this period.', 'لا يوجد نشاط للسائقين خلال هذه الفترة.')} type="driver" /><InsightRank title={t('All request reasons', 'جميع أسباب الطلبات')} icon={BarChart3} rows={insights.reasons} empty={t('No request reasons in this period.', 'لا توجد أسباب طلبات خلال هذه الفترة.')} type="reason" /></div>
    </section>}

    {draft && <div className="external-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setDraft(null)}><form className="external-modal" onSubmit={submit}>
      <header><div><span>{t('New external movement', 'تحرك خارجي جديد')}</span><h2>{t('Log transportation activity', 'تسجيل نشاط نقل')}</h2></div><button type="button" onClick={() => setDraft(null)}><X size={17} /></button></header>
      <div className="external-form-grid">
        <CustomDateInput required clearable={false} label={t('Date', 'التاريخ')} value={draft.date} onChange={(date) => setDraft((value) => ({ ...value, date }))} className="external-form-date" />
        <label><span>{t('Driver or staff member', 'السائق أو الموظف')} *</span><CustomSelect value={draft.personId} onChange={(value) => setDraft((item) => ({ ...item, personId: value }))} options={[{ value: '', label: t('Choose a person', 'اختر شخصاً') }, ...people.filter((person) => person.active !== false && person.canDrive !== false).map((person) => ({ value: person.id, label: `${person.displayName} · ${person.personType === 'staff' ? t('Staff', 'موظف') : t('Driver', 'سائق')}` }))]} /></label>
        <label><span>{t('Vehicle plate', 'لوحة المركبة')} *</span><CustomSelect value={draft.vehicleRegistration} onChange={(value) => setDraft((item) => ({ ...item, vehicleRegistration: value }))} options={[{ value: '', label: t('Choose a club vehicle', 'اختر مركبة النادي') }, ...vehicles.map((vehicle) => ({ value: vehicle.registration, label: `${vehicle.registration} · ${vehicle.vehicleClass === 'bus' ? t(`Bus ${vehicle.busNumber || '—'}`, `حافلة ${vehicle.busNumber || '—'}`) : (vehicle.label || t('Other vehicle', 'مركبة أخرى'))}` }))]} /></label>
        <label><span>{t('Purpose', 'الغرض')} *</span><CustomSelect value={draft.reason} onChange={(value) => setDraft((item) => ({ ...item, reason: value }))} options={[{ value: '', label: t('Choose purpose', 'اختر الغرض') }, ...REASONS.map((reason) => ({ value: reason.value, label: t(reason.en, reason.ar) }))]} /></label>
        <label className="is-wide"><span>{t('Person or group transported', 'المعني بالتوصيل')} *</span><input required value={draft.responsibleParty} onChange={(event) => setDraft((item) => ({ ...item, responsibleParty: event.target.value }))} /></label>
        <label className="is-wide"><span>{t('Time, destination and movement details', 'الوقت والوجهة وتفاصيل التحرك')} *</span><textarea required value={draft.details} onChange={(event) => setDraft((item) => ({ ...item, details: event.target.value }))} /></label>
        <label className="is-wide"><span>{t('Internal notes', 'ملاحظات داخلية')}</span><textarea value={draft.notes} onChange={(event) => setDraft((item) => ({ ...item, notes: event.target.value }))} /></label>
      </div>
      {error && <p className="external-error">{error}</p>}
      <footer><button type="button" onClick={() => setDraft(null)}>{t('Cancel', 'إلغاء')}</button><button className="is-primary" disabled={saving}>{saving ? t('Saving…', 'جارٍ الحفظ…') : t('Save trip', 'حفظ الرحلة')}</button></footer>
    </form></div>}
  </section>
}
