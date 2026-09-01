import React, { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Eye,
  FileCheck2,
  Fingerprint,
  Loader2,
  Paperclip,
  Pencil,
  Save,
  Search,
  ShieldAlert,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react'
import { collection, doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { auth, db } from '../../firebase'
import { useLanguage } from '../../contexts/LanguageContext'
import { useFleetScope } from './FleetScopeContext'
import { VEHICLE_REGISTRATION_ARCHIVE } from '../../services/maintenanceArchiveImport'
import { parseVehicleRegistrationCard } from '../../services/vehicleRegistrationCardParser'
import { recordActivity } from '../../services/activityLog'
import { sendNotification } from '../../utils/notify'
import './FleetVehicleRegistration.css'

const DAY_MS = 86400000
const WARNING_DAYS = 120
const MAX_CARD_SIZE = 600 * 1024
const CARD_FILE_PATTERN = /\.pdf$/i
const canonicalRegistrationOf = (record) => String(
  record?.canonicalRegistration || record?.fullRegistration || record?.registration || record?.id || '',
).toUpperCase().replace(/\s/g, '')

const fileToBase64 = async (file) => {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let index = 0; index < bytes.length; index += 32768) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 32768))
  }
  return btoa(binary)
}

const daysUntil = (iso) => {
  if (!iso) return null
  const target = new Date(`${iso}T23:59:59`)
  if (Number.isNaN(target.getTime())) return null
  return Math.ceil((target.getTime() - Date.now()) / DAY_MS)
}

const statusOf = (iso) => {
  const days = daysUntil(iso)
  if (days === null) return { id: 'missing', days }
  if (days < 0) return { id: 'expired', days }
  if (days <= 30) return { id: 'critical', days }
  if (days <= WARNING_DAYS) return { id: 'due-soon', days }
  return { id: 'valid', days }
}

const notifyRenewalIfNeeded = async (registration, details) => {
  const dayValues = [details.registrationExpiry, details.insuranceExpiry].map(daysUntil).filter((value) => value !== null)
  if (!dayValues.length || Math.min(...dayValues) > 60) return
  await sendNotification('fleet_registration_expiry', {
    registration,
    registrationExpiry: details.registrationExpiry || '',
    insuranceExpiry: details.insuranceExpiry || '',
    status: Math.min(...dayValues) < 0 ? 'Expired' : 'Due within 60 days',
  })
}

function ExpiryBadge({ iso }) {
  const { t, locale } = useLanguage()
  const status = statusOf(iso)
  const date = iso
    ? new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${iso}T12:00:00`))
    : t('Not recorded', 'غير مسجل')
  const detail = status.id === 'expired'
    ? t(`${Math.abs(status.days).toLocaleString(locale)} days overdue`, `متأخر ${Math.abs(status.days).toLocaleString(locale)} يوم`)
    : status.id === 'missing'
      ? t('Needs document', 'يحتاج مستنداً')
      : t(`${status.days.toLocaleString(locale)} days left`, `متبقي ${status.days.toLocaleString(locale)} يوم`)
  return (
    <div className="registration-expiry">
      <span className={`registration-badge is-${status.id}`}>{date}</span>
      <small>{detail}</small>
    </div>
  )
}

export default function FleetVehicleRegistration() {
  const { t, locale } = useLanguage()
  const { inScope, displayName, metaReady } = useFleetScope()
  const [liveRecords, setLiveRecords] = useState(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [uploadingRegistration, setUploadingRegistration] = useState('')
  const [attachmentMessage, setAttachmentMessage] = useState(null)
  const [editingRecord, setEditingRecord] = useState(null)
  const [editForm, setEditForm] = useState(null)
  const [savingDetails, setSavingDetails] = useState(false)
  const [viewingRegistration, setViewingRegistration] = useState('')

  useEffect(() => onSnapshot(
    collection(db, 'fleet_vehicle_registrations'),
    (snapshot) => setLiveRecords(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
    (error) => {
      console.error('Vehicle registration subscription failed:', error)
      setLiveRecords([])
    },
  ), [])

  const usingArchiveFallback = Array.isArray(liveRecords) && liveRecords.length === 0
  const sourceRecords = useMemo(() => {
    const records = new Map(VEHICLE_REGISTRATION_ARCHIVE.map((record) => [record.registration, record]))
    ;(liveRecords || []).forEach((record) => {
      const registration = record.registration || record.id
      records.set(registration, { ...(records.get(registration) || {}), ...record, registration })
    })
    return [...records.values()]
  }, [liveRecords])

  const handleRegistrationUpload = async (record, file) => {
    if (!file) return
    setAttachmentMessage(null)
    if (!CARD_FILE_PATTERN.test(file.name)) {
      setAttachmentMessage({ type: 'error', text: t('Upload the registration card as a PDF file.', 'ارفع بطاقة المركبة بصيغة PDF.') })
      return
    }
    if (file.size > MAX_CARD_SIZE) {
      setAttachmentMessage({ type: 'error', text: t('The registration PDF must be 600KB or smaller.', 'يجب ألا يتجاوز حجم ملف بطاقة المركبة 600 كيلوبايت.') })
      return
    }

    const registration = String(record.registration || record.id || '').trim()
    if (!registration) return
    setUploadingRegistration(registration)
    try {
      setAttachmentMessage({ type: 'info', text: t(`Reading ${registration} registration details…`, `جارٍ قراءة بيانات المركبة ${registration}…`) })
      const extracted = await parseVehicleRegistrationCard(file, registration)
      const extractedDetails = Object.fromEntries(Object.entries(extracted).filter(([key, value]) => key !== 'plateNumber' && value != null && value !== ''))
      const dataBase64 = await fileToBase64(file)
      await setDoc(doc(db, 'fleet_vehicle_registration_files', registration), {
        registration,
        name: file.name,
        dataBase64,
        size: file.size,
        contentType: 'application/pdf',
        uploadedBy: auth.currentUser?.uid || null,
        uploadedAt: serverTimestamp(),
      })
      await setDoc(doc(db, 'fleet_vehicle_registrations', registration), {
        ...extractedDetails,
        plateNumber: extracted.plateNumber,
        registration,
        registrationCard: {
          name: file.name,
          fileDocId: registration,
          storageMode: 'firestore',
          size: file.size,
          contentType: 'application/pdf',
          uploadedBy: auth.currentUser?.uid || null,
        },
        registrationCardUpdatedAt: serverTimestamp(),
        registrationDetailsExtractedAt: serverTimestamp(),
        registrationDetailsExtraction: 'fixed-layout-pdf-v1',
      }, { merge: true })

      await recordActivity({
        module: 'fleet', submodule: 'vehicle-registration', action: 'registration_card_attached',
        titleEn: `Registration card attached · ${registration}`,
        titleAr: `تم إرفاق بطاقة المركبة · ${registration}`,
        detailEn: `${file.name} · details extracted automatically`,
        detailAr: `${file.name} · تم استخراج البيانات تلقائياً`,
        recordId: registration, path: '/fleet/vehicle-registration',
      })
      await notifyRenewalIfNeeded(registration, extractedDetails)

      setAttachmentMessage({ type: 'success', text: t(`Card attached and details updated for ${registration}.`, `تم إرفاق البطاقة وتحديث بيانات المركبة ${registration}.`) })
    } catch (error) {
      console.error('Registration card upload failed:', error)
      setAttachmentMessage({ type: 'error', text: t(`Upload failed: ${error.message}`, `فشل الرفع: ${error.message}`) })
    } finally {
      setUploadingRegistration('')
    }
  }

  const openRegistrationCard = async (record) => {
    const registration = record.registration
    if (record.registrationCard?.url) {
      window.open(record.registrationCard.url, '_blank', 'noopener,noreferrer')
      return
    }
    if (!record.registrationCard?.fileDocId) return
    const viewer = window.open('', '_blank')
    setViewingRegistration(registration)
    try {
      const snapshot = await getDoc(doc(db, 'fleet_vehicle_registration_files', record.registrationCard.fileDocId))
      const data = snapshot.data()
      if (!snapshot.exists() || !data?.dataBase64) throw new Error('The attached registration card file is missing.')
      const binary = atob(data.dataBase64)
      const bytes = new Uint8Array(binary.length)
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
      const blobUrl = URL.createObjectURL(new Blob([bytes], { type: data.contentType || 'application/pdf' }))
      if (viewer) viewer.location.href = blobUrl
      else window.open(blobUrl, '_blank', 'noopener,noreferrer')
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60000)
    } catch (error) {
      if (viewer) viewer.close()
      console.error('Registration card open failed:', error)
      setAttachmentMessage({ type: 'error', text: t(`Could not open the card: ${error.message}`, `تعذر فتح البطاقة: ${error.message}`) })
    } finally {
      setViewingRegistration('')
    }
  }

  const openDetailsEditor = (record) => {
    setEditingRecord(record)
    setEditForm({
      make: record.make || '',
      model: record.model || '',
      year: record.year || '',
      vehicleType: record.vehicleType || '',
      passengers: record.passengers || '',
      chassisNumber: record.chassisNumber || '',
      registrationDate: record.registrationDate || '',
      registrationExpiry: record.registrationExpiry || '',
      insuranceExpiry: record.insuranceExpiry || '',
      trafficCodeNumber: record.trafficCodeNumber || '',
      policyNumber: record.policyNumber || '',
      insuranceProvider: record.insuranceProvider || '',
    })
    setAttachmentMessage(null)
  }

  const closeDetailsEditor = () => {
    if (savingDetails) return
    setEditingRecord(null)
    setEditForm(null)
  }

  const saveDetails = async (event) => {
    event.preventDefault()
    if (!editingRecord || !editForm) return
    const registration = editingRecord.registration
    setSavingDetails(true)
    try {
      await setDoc(doc(db, 'fleet_vehicle_registrations', registration), {
        ...editForm,
        year: editForm.year ? Number(editForm.year) : null,
        passengers: editForm.passengers ? Number(editForm.passengers) : null,
        registration,
        detailsUpdatedAt: serverTimestamp(),
        detailsUpdatedBy: auth.currentUser?.uid || null,
      }, { merge: true })
      await recordActivity({
        module: 'fleet', submodule: 'vehicle-registration', action: 'registration_details_updated',
        titleEn: `Registration details updated · ${registration}`,
        titleAr: `تم تحديث بيانات تسجيل المركبة · ${registration}`,
        detailEn: 'Vehicle registration details were edited manually',
        detailAr: 'تم تعديل بيانات تسجيل المركبة يدوياً',
        recordId: registration, path: '/fleet/vehicle-registration',
      })
      await notifyRenewalIfNeeded(registration, editForm)
      setAttachmentMessage({ type: 'success', text: t(`Details updated for ${registration}.`, `تم تحديث بيانات المركبة ${registration}.`) })
      setEditingRecord(null)
      setEditForm(null)
    } catch (error) {
      console.error('Registration details update failed:', error)
      setAttachmentMessage({ type: 'error', text: t(`Save failed: ${error.message}`, `فشل الحفظ: ${error.message}`) })
    } finally {
      setSavingDetails(false)
    }
  }

  const scoped = useMemo(() => sourceRecords
    .filter((record) => inScope(canonicalRegistrationOf(record)))
    .map((record) => ({
      ...record,
      displayRegistration: canonicalRegistrationOf(record),
      registrationStatus: statusOf(record.registrationExpiry),
      insuranceStatus: statusOf(record.insuranceExpiry),
    }))
    .sort((a, b) => {
      const aUrgency = Math.min(a.registrationStatus.days ?? 99999, a.insuranceStatus.days ?? 99999)
      const bUrgency = Math.min(b.registrationStatus.days ?? 99999, b.insuranceStatus.days ?? 99999)
      return aUrgency - bUrgency || String(a.displayRegistration).localeCompare(String(b.displayRegistration))
    }), [sourceRecords, inScope])

  const stats = useMemo(() => ({
    total: scoped.length,
    withCard: scoped.filter((record) => record.registrationCard?.url || record.registrationCard?.fileDocId).length,
    expired: scoped.filter((record) => record.registrationStatus.id === 'expired').length,
    renewSoon: scoped.filter((record) => ['critical', 'due-soon'].includes(record.registrationStatus.id)).length,
    insuranceAttention: scoped.filter((record) => ['expired', 'critical', 'due-soon'].includes(record.insuranceStatus.id)).length,
  }), [scoped])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return scoped.filter((record) => {
      const statusMatch = filter === 'all'
        || (filter === 'expired' && record.registrationStatus.id === 'expired')
        || (filter === 'attention' && ['expired', 'critical', 'due-soon'].includes(record.registrationStatus.id))
        || (filter === 'valid' && record.registrationStatus.id === 'valid')
      if (!statusMatch) return false
      if (!needle) return true
      return [record.registration, record.displayRegistration, record.plateNumber, record.make, record.model, record.chassisNumber, displayName(record.displayRegistration, locale)]
        .some((value) => String(value || '').toLowerCase().includes(needle))
    })
  }, [scoped, filter, query, displayName, locale])

  const attention = scoped.filter((record) => ['expired', 'critical', 'due-soon'].includes(record.registrationStatus.id))

  if (liveRecords === null || !metaReady) {
    return (
      <div className="registration-page" aria-busy="true">
        <div className="registration-hero skeleton" />
        <div className="registration-kpis">
          {[0, 1, 2, 3].map((item) => <div key={item} className="registration-kpi skeleton" />)}
        </div>
        <div className="registration-table-shell skeleton" />
      </div>
    )
  }

  return (
    <div className="registration-page">
      <header className="registration-hero">
        <div>
          <span className="registration-eyebrow">{t('Fleet compliance', 'امتثال الأسطول')}</span>
          <h1>{t('Vehicle Registration', 'تسجيل المركبات')}</h1>
          <p>{t('A verified document register with clear renewal priority for registration and insurance.', 'سجل مستندات معتمد يوضح أولوية تجديد الملكية والتأمين لكل مركبة.')}</p>
        </div>
        <div className="registration-hero-mark"><FileCheck2 size={24} /><span>{t(`${stats.withCard} cards verified · ${stats.total} vehicles`, `${stats.withCard} بطاقة موثقة · ${stats.total} مركبة`)}</span></div>
      </header>

      {usingArchiveFallback && (
        <div className="registration-source-note">
          <ShieldCheck size={15} />
          <span>{t('Showing the verified registration cards from the January–July invoice archive. They will be persisted to Firestore with the maintenance import.', 'يتم عرض بطاقات المركبات المعتمدة من أرشيف فواتير يناير–يوليو، وسيتم حفظها في فايرستور مع استيراد الصيانة.')}</span>
        </div>
      )}

      <section className="registration-kpis" aria-label={t('Registration summary', 'ملخص تسجيل المركبات')}>
        <article className="registration-kpi">
          <div><span>{t('Documents in scope', 'المستندات ضمن النطاق')}</span><FileCheck2 size={15} /></div>
          <strong>{stats.total.toLocaleString(locale)}</strong>
          <p>{t('Verified vehicle cards', 'بطاقات مركبات تم التحقق منها')}</p>
        </article>
        <article className={`registration-kpi${stats.expired ? ' has-risk' : ''}`}>
          <div><span>{t('Expired registration', 'ملكيات منتهية')}</span><ShieldAlert size={15} /></div>
          <strong>{stats.expired.toLocaleString(locale)}</strong>
          <p>{t('Renew immediately', 'تتطلب التجديد فوراً')}</p>
        </article>
        <article className={`registration-kpi${stats.renewSoon ? ' has-warning' : ''}`}>
          <div><span>{t('Renew within 120 days', 'تجديد خلال 120 يوماً')}</span><CalendarClock size={15} /></div>
          <strong>{stats.renewSoon.toLocaleString(locale)}</strong>
          <p>{t('Plan the renewal queue', 'جدولة أولوية التجديد')}</p>
        </article>
        <article className={`registration-kpi${stats.insuranceAttention ? ' has-warning' : ''}`}>
          <div><span>{t('Insurance attention', 'تأمين يحتاج متابعة')}</span><ShieldCheck size={15} /></div>
          <strong>{stats.insuranceAttention.toLocaleString(locale)}</strong>
          <p>{t('Expired or due within 120 days', 'منتهي أو مستحق خلال 120 يوماً')}</p>
        </article>
      </section>

      {attention.length > 0 && (
        <section className="registration-alert-strip">
          <div className="registration-alert-title"><AlertTriangle size={16} /><strong>{t('Renewal queue', 'قائمة التجديد')}</strong></div>
          <div className="registration-alert-items">
            {attention.slice(0, 8).map((record) => (
              <button key={record.registration} type="button" onClick={() => { setFilter('attention'); setQuery(record.registration) }}>
                <span>{displayName(record.displayRegistration, locale)}</span>
                <b>{record.registrationStatus.id === 'expired'
                  ? t('Expired', 'منتهية')
                  : t(`${record.registrationStatus.days}d`, `${record.registrationStatus.days} يوم`)}</b>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="registration-table-shell">
        <div className="registration-toolbar">
          <div>
            <h2>{t('Registration register', 'سجل تسجيل المركبات')}</h2>
            <p>{t('Chassis, vehicle details and both renewal dates from the attached cards.', 'رقم الشاسيه وبيانات المركبة وتاريخا تجديد الملكية والتأمين من البطاقات المرفقة.')}</p>
          </div>
          <div className="registration-controls">
            <div className="registration-filter" role="tablist">
              {[
                ['all', t('All', 'الكل')],
                ['attention', t('Needs attention', 'تحتاج متابعة')],
                ['expired', t('Expired', 'منتهية')],
                ['valid', t('Valid', 'سارية')],
              ].map(([id, label]) => <button key={id} className={filter === id ? 'active' : ''} onClick={() => setFilter(id)}>{label}</button>)}
            </div>
            <label className="registration-search">
              <Search size={15} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('Search plate, model or chassis…', 'ابحث باللوحة أو الطراز أو الشاسيه…')} />
            </label>
          </div>
        </div>

        <div className="registration-table-wrap">
          {attachmentMessage && (
            <div className={`registration-attachment-message is-${attachmentMessage.type}`} role="status">
              {attachmentMessage.type === 'success' ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
              <span>{attachmentMessage.text}</span>
            </div>
          )}
          <table className="registration-table">
            <thead><tr>
              <th>{t('Vehicle', 'المركبة')}</th>
              <th>{t('Vehicle details', 'بيانات المركبة')}</th>
              <th>{t('Chassis number', 'رقم الشاسيه')}</th>
              <th>{t('Registration expiry', 'انتهاء الملكية')}</th>
              <th>{t('Insurance expiry', 'انتهاء التأمين')}</th>
              <th>{t('Registration card', 'بطاقة المركبة')}</th>
            </tr></thead>
            <tbody>
              {visible.length ? visible.map((record) => (
                <tr key={record.registration}>
                  <td>
                    <div className="registration-vehicle">
                      <span className="registration-plate">{record.displayRegistration}</span>
                      <strong>{displayName(record.displayRegistration, locale)}</strong>
                    </div>
                  </td>
                  <td><strong>{record.make} {record.model}</strong><span>{record.year} · {record.vehicleType} · {record.passengers || '—'} {t('seats', 'مقاعد')}</span></td>
                  <td><code><Fingerprint size={13} />{record.chassisNumber}</code></td>
                  <td><ExpiryBadge iso={record.registrationExpiry} /></td>
                  <td><ExpiryBadge iso={record.insuranceExpiry} /></td>
                  <td>
                    <div className="registration-card-actions">
                      <button
                        type="button"
                        className="registration-card-button is-view"
                        disabled={(!record.registrationCard?.url && !record.registrationCard?.fileDocId) || Boolean(viewingRegistration)}
                        onClick={() => openRegistrationCard(record)}
                        title={record.registrationCard?.url || record.registrationCard?.fileDocId
                          ? t('Open the attached registration card', 'فتح بطاقة المركبة المرفقة')
                          : t('Attach a registration card first', 'أرفق بطاقة المركبة أولاً')}
                      >
                        {viewingRegistration === record.registration ? <Loader2 size={14} className="registration-spin" /> : <Eye size={14} />}
                        {viewingRegistration === record.registration ? t('Opening…', 'جارٍ الفتح…') : t('View registration', 'عرض البطاقة')}
                      </button>
                      <label className={`registration-card-button is-upload${uploadingRegistration === record.registration ? ' is-busy' : ''}`}>
                        <input
                          type="file"
                          accept=".pdf,application/pdf"
                          disabled={Boolean(uploadingRegistration)}
                          onChange={(event) => {
                            handleRegistrationUpload(record, event.target.files?.[0])
                            event.target.value = ''
                          }}
                        />
                        {uploadingRegistration === record.registration
                          ? <Loader2 size={14} className="registration-spin" />
                          : record.registrationCard?.url || record.registrationCard?.fileDocId ? <Upload size={14} /> : <Paperclip size={14} />}
                        {uploadingRegistration === record.registration
                          ? t('Uploading…', 'جارٍ الرفع…')
                          : record.registrationCard?.url || record.registrationCard?.fileDocId
                            ? t('Replace card', 'استبدال البطاقة')
                            : t('Attach card', 'إرفاق البطاقة')}
                      </label>
                      <button
                        type="button"
                        className="registration-card-button is-edit"
                        onClick={() => openDetailsEditor(record)}
                      >
                        <Pencil size={14} />
                        {t('Edit details', 'تعديل البيانات')}
                      </button>
                      {record.registrationCard?.name && <small title={record.registrationCard.name}>{record.registrationCard.name}</small>}
                    </div>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan="6"><div className="registration-empty"><CheckCircle2 size={26} /><strong>{t('No registration cards match this view', 'لا توجد بطاقات مركبات تطابق هذا العرض')}</strong><span>{t('Change the filter or clear the search.', 'غيّر عامل التصفية أو امسح البحث.')}</span></div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {editingRecord && editForm && (
        <div className="registration-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && closeDetailsEditor()}>
          <form className="registration-modal" onSubmit={saveDetails}>
            <header>
              <div>
                <span>{t('Manual correction', 'تصحيح يدوي')}</span>
                <h2>{t('Edit registration details', 'تعديل بيانات المركبة')}</h2>
                <p>{editingRecord.registration} · {displayName(editingRecord.registration, locale)}</p>
              </div>
              <button type="button" onClick={closeDetailsEditor} aria-label={t('Close', 'إغلاق')}><X size={17} /></button>
            </header>

            <div className="registration-form-grid">
              {[
                ['make', t('Make', 'الصانع'), 'text'],
                ['model', t('Model', 'الطراز'), 'text'],
                ['year', t('Model year', 'سنة الصنع'), 'number'],
                ['vehicleType', t('Vehicle type', 'نوع المركبة'), 'text'],
                ['passengers', t('Passenger capacity', 'عدد الركاب'), 'number'],
                ['chassisNumber', t('Chassis number', 'رقم الشاسيه'), 'text'],
                ['registrationDate', t('Registration date', 'تاريخ التسجيل'), 'date'],
                ['registrationExpiry', t('Registration expiry', 'انتهاء الملكية'), 'date'],
                ['insuranceExpiry', t('Insurance expiry', 'انتهاء التأمين'), 'date'],
                ['trafficCodeNumber', t('Traffic code number', 'الرمز المروري'), 'text'],
                ['policyNumber', t('Policy number', 'رقم الوثيقة'), 'text'],
                ['insuranceProvider', t('Insurance provider', 'شركة التأمين'), 'text'],
              ].map(([key, label, type]) => (
                <label key={key} className={key === 'insuranceProvider' ? 'is-wide' : ''}>
                  <span>{label}</span>
                  <input
                    type={type}
                    min={type === 'number' ? '0' : undefined}
                    value={editForm[key]}
                    onChange={(event) => setEditForm((current) => ({ ...current, [key]: event.target.value }))}
                  />
                </label>
              ))}
            </div>

            <footer>
              <button type="button" className="registration-modal-cancel" onClick={closeDetailsEditor}>{t('Cancel', 'إلغاء')}</button>
              <button type="submit" className="registration-modal-save" disabled={savingDetails}>
                {savingDetails ? <Loader2 size={15} className="registration-spin" /> : <Save size={15} />}
                {savingDetails ? t('Saving…', 'جارٍ الحفظ…') : t('Save details', 'حفظ البيانات')}
              </button>
            </footer>
          </form>
        </div>
      )}
    </div>
  )
}
