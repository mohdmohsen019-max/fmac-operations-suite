import React, { useEffect, useMemo, useState } from 'react'
import { Plus, Search, UserRound, UsersRound, X } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { useLanguage } from '../../contexts/LanguageContext'
import { useAuth } from '../../contexts/AuthContext'
import { useFleetScope } from './FleetScopeContext'
import {
  assignPersonToVehicle,
  subscribeExternalTransportation,
  currentAssignments,
  subscribeRidershipCounts,
  saveFleetPerson,
  subscribeFleetDriverAssignments,
  subscribeFleetPeople,
} from '../../services/fleetPeople'
import { recordActivity } from '../../services/activityLog'
import { sendNotification } from '../../utils/notify'
import { buildDriverMonthlyTrips } from './fleetTripAnalytics'
import CustomSelect from '../CustomSelect'
import CustomDateInput from '../CustomDateInput'
import './FleetPeople.css'

const emptyPerson = { nameEn: '', nameAr: '', personType: 'driver', canDrive: true, employeeId: '', phone: '', notes: '' }
const today = () => new Date().toISOString().slice(0, 10)

export default function FleetDrivers({ canEdit }) {
  const { t, lang, locale } = useLanguage()
  const { user, userProfile } = useAuth()
  const { metaMap, metaOf } = useFleetScope()
  const [searchParams, setSearchParams] = useSearchParams()
  const [people, setPeople] = useState([])
  const [assignments, setAssignments] = useState([])
  const [ridershipCounts, setRidershipCounts] = useState([])
  const [externalRecords, setExternalRecords] = useState([])
  const [tripMonth, setTripMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [query, setQuery] = useState('')
  const [personDraft, setPersonDraft] = useState(null)
  const [assignmentDraft, setAssignmentDraft] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => subscribeFleetPeople(setPeople), [])
  useEffect(() => subscribeFleetDriverAssignments(setAssignments), [])
  useEffect(() => subscribeRidershipCounts(setRidershipCounts), [])
  useEffect(() => subscribeExternalTransportation(setExternalRecords), [])

  const activeByVehicle = useMemo(() => currentAssignments(assignments), [assignments])
  const buses = useMemo(() => [...metaMap.keys()]
    .map((registration) => metaOf(registration))
    .filter((meta) => meta.clubOwned !== false && meta.vehicleClass === 'bus')
    .sort((a, b) => Number(a.busNumber || 999) - Number(b.busNumber || 999)), [metaMap, metaOf])
  const busDrivers = useMemo(() => people.filter((person) => person.active !== false && person.personType !== 'staff')
    .sort((a, b) => String(a.displayName || '').localeCompare(String(b.displayName || ''))), [people])
  const eligiblePeople = useMemo(() => busDrivers.filter((person) => person.canDrive !== false)
    .sort((a, b) => String(a.displayName || '').localeCompare(String(b.displayName || ''))), [busDrivers])
  const filteredPeople = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return busDrivers
    return busDrivers.filter((person) => [person.displayName, person.nameEn, person.nameAr, person.employeeId]
      .some((value) => String(value || '').toLowerCase().includes(term)))
  }, [busDrivers, query])
  const assignedPersonIds = new Set([...activeByVehicle.values()].map((item) => item.personId))
  const monthlyTrips = useMemo(() => buildDriverMonthlyTrips({
    people, assignments, ridershipCounts, externalRecords, month: tripMonth, driverIds: busDrivers.map((person) => person.id),
  }), [people, assignments, ridershipCounts, externalRecords, tripMonth, busDrivers])

  const actor = { uid: user?.uid, email: user?.email, name: userProfile?.displayName || userProfile?.name || user?.displayName || user?.email }

  const submitPerson = async (event) => {
    event.preventDefault()
    setSaving(true); setError('')
    try {
      const personId = await saveFleetPerson(personDraft, user?.email || '')
      await recordActivity({
        module: 'fleet', submodule: 'drivers', action: 'person_created', recordId: personId,
        titleEn: `Fleet person added · ${personDraft.nameEn || personDraft.nameAr}`,
        titleAr: `تمت إضافة شخص إلى الأسطول · ${personDraft.nameAr || personDraft.nameEn}`,
        detailEn: personDraft.personType === 'driver' ? 'Added as a fleet driver.' : 'Added as club staff authorized to drive.',
        detailAr: personDraft.personType === 'driver' ? 'تمت إضافته كسائق أسطول.' : 'تمت إضافته كموظف نادي مخول بالقيادة.',
        path: '/fleet/drivers', actor,
      })
      setPersonDraft(null)
    } catch (caught) {
      setError(caught.message || t('Could not save this person.', 'تعذر حفظ هذا الشخص.'))
    } finally { setSaving(false) }
  }

  const openAssignment = (bus) => {
    const previous = activeByVehicle.get(bus.registration)
    setAssignmentDraft({
      vehicleRegistration: bus.registration,
      busNumber: bus.busNumber || '',
      personId: previous?.personId || bus.driverId || '',
      effectiveDate: today(),
      reason: '',
      previous,
    })
    setError('')
  }

  useEffect(() => {
    const registration = searchParams.get('vehicle')
    if (!registration || !buses.length || assignmentDraft) return
    const bus = buses.find((item) => item.registration === registration)
    if (!bus) return
    openAssignment(bus)
    setSearchParams({}, { replace: true })
    // This effect intentionally reacts only when the route-supplied vehicle
    // becomes available from the live fleet registry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buses, searchParams, assignmentDraft])

  const submitAssignment = async (event) => {
    event.preventDefault()
    const person = people.find((item) => item.id === assignmentDraft.personId)
    if (!person || person.personType === 'staff') { setError(t('Choose a bus driver.', 'اختر سائق حافلة.')); return }
    setSaving(true); setError('')
    try {
      await assignPersonToVehicle({ ...assignmentDraft, person, actorEmail: user?.email || '' })
      await recordActivity({
        module: 'fleet', submodule: 'drivers', action: 'driver_assigned', recordId: assignmentDraft.vehicleRegistration,
        titleEn: `Driver changed · ${assignmentDraft.vehicleRegistration}`,
        titleAr: `تم تغيير السائق · ${assignmentDraft.vehicleRegistration}`,
        detailEn: `${person.displayName} assigned from ${assignmentDraft.effectiveDate}.`,
        detailAr: `تم تعيين ${person.displayName} اعتباراً من ${assignmentDraft.effectiveDate}.`,
        metadata: { personId: person.id, personName: person.displayName, previousPersonId: assignmentDraft.previous?.personId || '' },
        path: '/fleet/drivers', actor,
      })
      await sendNotification('fleet_driver_changed', {
        registration: assignmentDraft.vehicleRegistration,
        driverName: person.displayName,
        effectiveDate: assignmentDraft.effectiveDate,
        changedBy: actor.name || actor.email || '',
      })
      setAssignmentDraft(null)
    } catch (caught) {
      setError(caught.message || t('Could not change the driver.', 'تعذر تغيير السائق.'))
    } finally { setSaving(false) }
  }

  return (
    <section className="fleet-people-page">
      <header className="fleet-people-command">
        <div>
          <span className="fleet-people-kicker"><UsersRound size={14} />{t('Fleet register', 'سجل الأسطول')}</span>
          <h1>{t('Drivers', 'السائقون')}</h1>
          <p>{t('Current bus assignments and monthly activity for the confirmed bus-driver roster.', 'تعيينات الحافلات الحالية والنشاط الشهري لقائمة سائقي الحافلات المعتمدة.')}</p>
        </div>
        {canEdit && <button className="fleet-people-primary" onClick={() => { setPersonDraft({ ...emptyPerson }); setError('') }}><Plus size={16} />{t('Add driver', 'إضافة سائق')}</button>}
        <div className="fleet-people-pulse">
          <div><strong>{busDrivers.length.toLocaleString(locale)}</strong><span>{t('bus drivers', 'سائقي حافلات')}</span></div>
          <div><strong>{activeByVehicle.size.toLocaleString(locale)} / {buses.length.toLocaleString(locale)}</strong><span>{t('buses assigned', 'حافلات معيّنة')}</span></div>
          <div><strong>{monthlyTrips.totals.trips.toLocaleString(locale)}</strong><span>{t('trips this month', 'رحلة هذا الشهر')}</span></div>
        </div>
      </header>

      <div className="fleet-people-layout">
        <article className="fleet-people-panel fleet-assignment-board">
          <div className="fleet-people-panel-head"><div><span>{t('Current responsibility', 'المسؤولية الحالية')}</span><h2>{t('Bus assignments', 'تعيينات الحافلات')}</h2></div><small>{t('Changing a driver closes the old assignment; it does not rewrite history.', 'تغيير السائق ينهي التعيين السابق ولا يعيد كتابة التاريخ.')}</small></div>
          <div className="fleet-assignment-list">
            {buses.map((bus) => {
              const assignment = activeByVehicle.get(bus.registration)
              const name = assignment?.personName || bus.driverName || ''
              return <div className={`fleet-assignment-row${name ? '' : ' is-open'}`} key={bus.registration}>
                <div className="fleet-bus-identity"><strong>{bus.registration}</strong><span>{t(`Bus ${bus.busNumber || '—'}`, `حافلة ${bus.busNumber || '—'}`)}</span></div>
                <div className="fleet-assigned-person"><span className="fleet-person-avatar"><UserRound size={15} /></span><div><strong>{name || t('No current driver', 'لا يوجد سائق حالي')}</strong><small>{assignment?.effectiveDate ? `${t('Since', 'منذ')} ${assignment.effectiveDate}` : t('Legacy vehicle value', 'قيمة قديمة في سجل المركبة')}</small></div></div>
                {canEdit && <button onClick={() => openAssignment(bus)}>{name ? t('Change', 'تغيير') : t('Assign', 'تعيين')}</button>}
              </div>
            })}
          </div>
        </article>

        <article className="fleet-people-panel fleet-driver-trip-board">
          <div className="fleet-people-panel-head fleet-trip-head"><div><span>{t('Monthly driving activity', 'نشاط القيادة الشهري')}</span><h2>{t('Trips by driver', 'الرحلات حسب السائق')}</h2></div><label className="fleet-trip-month"><span>{t('Month', 'الشهر')}</span><input type="month" value={tripMonth} onChange={(event) => setTripMonth(event.target.value)} /></label></div>
          <div className="fleet-trip-summary"><div><strong>{monthlyTrips.totals.trips.toLocaleString(locale)}</strong><span>{t('Total trips', 'إجمالي الرحلات')}</span></div><div><strong>{monthlyTrips.totals.internalTrips.toLocaleString(locale)}</strong><span>{t('Internal', 'داخلية')}</span></div><div><strong>{monthlyTrips.totals.externalTrips.toLocaleString(locale)}</strong><span>{t('External', 'خارجية')}</span></div></div>
          <div className="fleet-trip-list">
            {monthlyTrips.rows.map((row, index) => <div className="fleet-trip-row" key={row.personId}><span className="fleet-trip-rank">{index + 1}</span><div><strong>{row.personName}</strong><small>{t('Bus driver', 'سائق حافلة')} · {row.internalSessions} {t('sessions', 'حصة')}</small></div><div className="fleet-trip-split"><span>{row.internalTrips} {t('internal', 'داخلية')}</span><span>{row.externalTrips} {t('external', 'خارجية')}</span></div><strong className="fleet-trip-total">{row.totalTrips}</strong></div>)}
            {!monthlyTrips.rows.length && <div className="fleet-people-empty">{t('No recorded trips for this month.', 'لا توجد رحلات مسجلة لهذا الشهر.')}</div>}
          </div>
          {(monthlyTrips.unassignedInternal.length || monthlyTrips.unassignedExternal.length) > 0 && <p className="fleet-trip-note">{t(`${monthlyTrips.unassignedInternal.length + monthlyTrips.unassignedExternal.length} records could not be attributed to a person.`, `${monthlyTrips.unassignedInternal.length + monthlyTrips.unassignedExternal.length} سجلات لم يتم إسنادها إلى شخص.`)}</p>}
          {monthlyTrips.rows.some((row) => row.attributedByFallback) && <p className="fleet-trip-note">{t('Where a dated driver assignment was not available, internal sessions use the current bus assignment.', 'عند عدم توفر تعيين مؤرخ للسائق، تُنسب الحصص الداخلية إلى التعيين الحالي للحافلة.')}</p>}
        </article>

        <article className="fleet-people-panel fleet-person-register">
          <div className="fleet-people-panel-head"><div><span>{t('Fleet people register', 'سجل أفراد الأسطول')}</span><h2>{t('List of drivers', 'قائمة السائقين')}</h2></div></div>
          <label className="fleet-people-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('Search name or employee ID', 'البحث بالاسم أو الرقم الوظيفي')} /></label>
          <div className="fleet-person-list">
            {filteredPeople.map((person) => <div className="fleet-person-row" key={person.id}>
              <span className="fleet-person-avatar">{String(person.displayName || '?').slice(0, 1).toUpperCase()}</span>
              <div><strong>{lang === 'ar' ? (person.nameAr || person.displayName) : (person.nameEn || person.displayName)}</strong><small>{t('Bus driver', 'سائق حافلة')}{assignedPersonIds.has(person.id) ? ` · ${t('Assigned', 'مُعيّن')}` : ''}</small></div>
              <span className={`fleet-person-state${person.canDrive ? '' : ' is-muted'}`}>{person.canDrive ? t('Can drive', 'مخول بالقيادة') : t('Not authorized', 'غير مخول')}</span>
            </div>)}
            {!filteredPeople.length && <div className="fleet-people-empty">{t('No people found.', 'لم يتم العثور على أشخاص.')}</div>}
          </div>
        </article>
      </div>

      {personDraft && <div className="fleet-people-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setPersonDraft(null)}><form className="fleet-people-modal" onSubmit={submitPerson}>
        <header><div><span>{t('Driver register', 'سجل السائقين')}</span><h2>{t('Add bus driver', 'إضافة سائق حافلة')}</h2></div><button type="button" onClick={() => setPersonDraft(null)} aria-label={t('Close', 'إغلاق')}><X size={17} /></button></header>
        <div className="fleet-people-form-grid">
          <label><span>{t('Name in English', 'الاسم بالإنجليزية')} *</span><input required value={personDraft.nameEn} onChange={(event) => setPersonDraft((draft) => ({ ...draft, nameEn: event.target.value }))} /></label>
          <label><span>{t('Name in Arabic', 'الاسم بالعربية')}</span><input dir="rtl" value={personDraft.nameAr} onChange={(event) => setPersonDraft((draft) => ({ ...draft, nameAr: event.target.value }))} /></label>
          <label><span>{t('Employee ID', 'الرقم الوظيفي')}</span><input value={personDraft.employeeId} onChange={(event) => setPersonDraft((draft) => ({ ...draft, employeeId: event.target.value }))} /></label>
          <label><span>{t('Phone', 'الهاتف')}</span><input value={personDraft.phone} onChange={(event) => setPersonDraft((draft) => ({ ...draft, phone: event.target.value }))} /></label>
          <label className="is-wide"><span>{t('Notes', 'ملاحظات')}</span><textarea value={personDraft.notes} onChange={(event) => setPersonDraft((draft) => ({ ...draft, notes: event.target.value }))} /></label>
        </div>
        {error && <p className="fleet-people-error">{error}</p>}
        <footer><button type="button" onClick={() => setPersonDraft(null)}>{t('Cancel', 'إلغاء')}</button><button className="is-primary" disabled={saving}>{saving ? t('Saving…', 'جارٍ الحفظ…') : t('Add person', 'إضافة الشخص')}</button></footer>
      </form></div>}

      {assignmentDraft && <div className="fleet-people-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setAssignmentDraft(null)}><form className="fleet-people-modal" onSubmit={submitAssignment}>
        <header><div><span>{t('Dated assignment', 'تعيين مؤرخ')}</span><h2>{assignmentDraft.vehicleRegistration} · {t(`Bus ${assignmentDraft.busNumber}`, `حافلة ${assignmentDraft.busNumber}`)}</h2></div><button type="button" onClick={() => setAssignmentDraft(null)}><X size={17} /></button></header>
        <div className="fleet-assignment-context"><UserRound size={18} /><div><span>{t('Current person', 'الشخص الحالي')}</span><strong>{assignmentDraft.previous?.personName || metaOf(assignmentDraft.vehicleRegistration).driverName || t('No current driver', 'لا يوجد سائق حالي')}</strong></div></div>
        <div className="fleet-people-form-grid">
          <label className="is-wide"><span>{t('New bus driver', 'سائق الحافلة الجديد')} *</span><CustomSelect value={assignmentDraft.personId} onChange={(value) => setAssignmentDraft((draft) => ({ ...draft, personId: value }))} options={[{ value: '', label: t('Choose a driver', 'اختر سائقاً') }, ...eligiblePeople.map((person) => ({ value: person.id, label: person.displayName }))]} /></label>
          <CustomDateInput required clearable={false} label={t('Effective date', 'تاريخ بدء التعيين')} value={assignmentDraft.effectiveDate} onChange={(effectiveDate) => setAssignmentDraft((draft) => ({ ...draft, effectiveDate }))} />
          <label><span>{t('Reason for change', 'سبب التغيير')}</span><input value={assignmentDraft.reason} onChange={(event) => setAssignmentDraft((draft) => ({ ...draft, reason: event.target.value }))} placeholder={t('Rotation, replacement, leave…', 'تدوير، بديل، إجازة…')} /></label>
        </div>
        {error && <p className="fleet-people-error">{error}</p>}
        <footer><button type="button" onClick={() => setAssignmentDraft(null)}>{t('Cancel', 'إلغاء')}</button><button className="is-primary" disabled={saving}>{saving ? t('Assigning…', 'جارٍ التعيين…') : t('Confirm assignment', 'تأكيد التعيين')}</button></footer>
      </form></div>}
    </section>
  )
}
