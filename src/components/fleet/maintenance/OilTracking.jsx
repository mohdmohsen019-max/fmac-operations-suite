/**
 * Oil-change reminders. One doc per vehicle in fleet_oil_tracking/{REG}
 * ({ lastChangeKm, lastChangeDate, intervalKm }) plus a '_default' doc that
 * carries the global interval default (10,000 km unless edited).
 */
import React, { useState } from 'react'
import {
  Droplets, X, Loader2, Pencil, Check, Gauge, AlertTriangle,
} from 'lucide-react'
import { doc, setDoc, serverTimestamp, deleteField } from 'firebase/firestore'
import { db, auth } from '../../../firebase'
import { useLanguage } from '../../../contexts/LanguageContext'
import { OIL_GLOBAL_DOC_ID } from './maintenanceSuite'

const todayISO = () => new Date().toISOString().split('T')[0]

const OIL_LABEL = {
  ok:         { en: 'OK', ar: 'سليم' },
  'due-soon': { en: 'Oil change approaching', ar: 'اقترب موعد تغيير الزيت' },
  overdue:    { en: 'Overdue', ar: 'متأخر' },
  none:       { en: 'No record', ar: 'لا يوجد سجل' },
}

function OilStatusBadge({ status }) {
  const { t } = useLanguage()
  const l = OIL_LABEL[status] || OIL_LABEL.none
  return <span className={`fms-status fms-status--${status === 'overdue' ? 'critical' : status === 'due-soon' ? 'attention' : status}`}>{t(l.en, l.ar)}</span>
}

/* ── Per-vehicle editor: last change + own interval ────────────────────── */
function OilEditModal({ row, globalInterval, onClose }) {
  const { t } = useLanguage()
  const v = row.vehicle
  const [lastKm, setLastKm] = useState(row.rec?.lastChangeKm != null ? String(row.rec.lastChangeKm) : '')
  const [lastDate, setLastDate] = useState(row.rec?.lastChangeDate || todayISO())
  const [interval, setInterval] = useState(row.hasOwnInterval ? String(row.rec.intervalKm) : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const save = async () => {
    const kmNum = parseFloat(lastKm)
    if (Number.isNaN(kmNum) || kmNum < 0) {
      setError(t('Enter a valid odometer reading.', 'أدخل قراءة عداد صحيحة.'))
      return
    }
    const intNum = parseFloat(interval)
    if (interval !== '' && (Number.isNaN(intNum) || intNum <= 0)) {
      setError(t('Interval must be a positive number of km (leave empty for the global default).',
        'يجب أن تكون الفترة رقماً موجباً بالكيلومترات (اتركها فارغة لاستخدام الافتراضي العام).'))
      return
    }
    setSaving(true)
    try {
      await setDoc(doc(db, 'fleet_oil_tracking', v.reg), {
        lastChangeKm: kmNum,
        lastChangeDate: lastDate,
        intervalKm: interval === '' ? deleteField() : intNum,
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.uid || null,
      }, { merge: true })
      onClose()
    } catch (err) {
      console.error('Oil tracking save failed:', err)
      setError(t('Save failed: ', 'فشل الحفظ: ') + err.message)
      setSaving(false)
    }
  }

  return (
    <div className="fms-modal-overlay" onClick={onClose}>
      <div className="fms-modal fms-modal--sm" onClick={(e) => e.stopPropagation()}>
        <div className="fms-modal-head">
          <h3><Droplets size={16} />{t('Edit oil tracking', 'تعديل متابعة الزيت')}</h3>
          <button type="button" className="fms-icon-btn" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="fms-modal-body">
          <p className="fms-modal-context">
            <strong>{v.reg}</strong>
            <span className="fms-hint" style={{ marginInlineStart: 8 }}>
              <Gauge size={11} /> {t('Current odometer:', 'العداد الحالي:')} {v.odoKm.toLocaleString()} {t('km', 'كم')}
            </span>
          </p>
          {error && <div className="fms-error">{error}</div>}
          <label className="fms-field">
            <span>{t('Last change at odometer (km)', 'آخر تغيير عند عداد (كم)')}</span>
            <input type="number" value={lastKm} onChange={(e) => setLastKm(e.target.value)} />
          </label>
          <label className="fms-field">
            <span>{t('Last change date', 'تاريخ آخر تغيير')}</span>
            <input type="date" value={lastDate} onChange={(e) => setLastDate(e.target.value)} />
          </label>
          <label className="fms-field">
            <span>{t(`Interval for this vehicle (km) — empty = global default (${globalInterval.toLocaleString()})`,
              `الفترة لهذه المركبة (كم) — فارغة = الافتراضي العام (${globalInterval.toLocaleString()})`)}</span>
            <input type="number" value={interval} onChange={(e) => setInterval(e.target.value)} placeholder={String(globalInterval)} />
          </label>
          <div className="fms-modal-actions">
            <button type="button" className="fms-btn" onClick={onClose}>{t('Cancel', 'إلغاء')}</button>
            <button type="button" className="fms-btn fms-btn--primary" onClick={save} disabled={saving}>
              {saving ? <Loader2 size={14} className="fms-spin" /> : <Check size={14} />}
              {t('Save', 'حفظ')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Main section ──────────────────────────────────────────────────────── */
export default function OilTracking({ suite, canEdit, displayName }) {
  const { t, locale } = useLanguage()
  const { oilRows, vehiclesLoading, vehicles, globalOilInterval } = suite
  const [editRow, setEditRow] = useState(null)
  const [stamping, setStamping] = useState(null) // reg being stamped
  const [globalDraft, setGlobalDraft] = useState(null) // null = not editing
  const [savingGlobal, setSavingGlobal] = useState(false)

  const stampNow = async (row) => {
    const v = row.vehicle
    const ok = window.confirm(t(
      `Mark oil changed now for ${v.reg} at ${v.odoKm.toLocaleString()} km (today)?`,
      `تسجيل تغيير الزيت الآن للمركبة ${v.reg} عند ${v.odoKm.toLocaleString()} كم (اليوم)؟`))
    if (!ok) return
    setStamping(v.reg)
    try {
      await setDoc(doc(db, 'fleet_oil_tracking', v.reg), {
        lastChangeKm: v.odoKm,
        lastChangeDate: todayISO(),
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.uid || null,
      }, { merge: true })
    } catch (err) {
      console.error('Oil stamp failed:', err)
    } finally {
      setStamping(null)
    }
  }

  const saveGlobal = async () => {
    const n = parseFloat(globalDraft)
    if (Number.isNaN(n) || n <= 0) return
    setSavingGlobal(true)
    try {
      await setDoc(doc(db, 'fleet_oil_tracking', OIL_GLOBAL_DOC_ID), {
        intervalKm: n,
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.uid || null,
      }, { merge: true })
      setGlobalDraft(null)
    } catch (err) {
      console.error('Global interval save failed:', err)
    } finally {
      setSavingGlobal(false)
    }
  }

  const overdue = oilRows.filter((r) => r.status === 'overdue').length
  const dueSoon = oilRows.filter((r) => r.status === 'due-soon').length

  if (vehiclesLoading && vehicles.length === 0) {
    return <div className="fms-loading"><Loader2 size={20} className="fms-spin" /> {t('Loading oil tracking...', 'جارٍ تحميل متابعة الزيت...')}</div>
  }

  return (
    <div className="fms-section">
      <div className="fms-cards">
        <div className="glass-panel fms-card">
          <div className="fms-card-head"><span>{t('Overdue', 'متأخرة')}</span><AlertTriangle size={15} className={overdue ? 'fms-t-risk' : ''} /></div>
          <div className={`fms-card-value${overdue ? ' fms-t-risk' : ''}`}>{overdue.toLocaleString(locale)}</div>
          <p>{t('Past the change-due odometer', 'تجاوزت عداد موعد التغيير')}</p>
        </div>
        <div className="glass-panel fms-card">
          <div className="fms-card-head"><span>{t('Due soon', 'قريبة الموعد')}</span><Droplets size={15} className={dueSoon ? 'fms-t-warn' : ''} /></div>
          <div className={`fms-card-value${dueSoon ? ' fms-t-warn' : ''}`}>{dueSoon.toLocaleString(locale)}</div>
          <p>{t('Within 10% of the interval', 'ضمن 10% من الفترة')}</p>
        </div>
        <div className="glass-panel fms-card">
          <div className="fms-card-head"><span>{t('Global interval', 'الفترة الافتراضية العامة')}</span><Gauge size={15} /></div>
          {globalDraft === null ? (
            <div className="fms-card-value fms-card-value--row">
              {globalOilInterval.toLocaleString(locale)}
              <span className="fms-card-unit">{t('km', 'كم')}</span>
              {canEdit && (
                <button type="button" className="fms-icon-btn" title={t('Edit', 'تعديل')} onClick={() => setGlobalDraft(String(globalOilInterval))}>
                  <Pencil size={14} />
                </button>
              )}
            </div>
          ) : (
            <div className="fms-inline-edit">
              <input
                type="number" value={globalDraft} autoFocus
                onChange={(e) => setGlobalDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveGlobal(); if (e.key === 'Escape') setGlobalDraft(null) }}
              />
              <button type="button" className="fms-icon-btn" onClick={saveGlobal} disabled={savingGlobal} title={t('Save', 'حفظ')}>
                {savingGlobal ? <Loader2 size={14} className="fms-spin" /> : <Check size={14} />}
              </button>
              <button type="button" className="fms-icon-btn" onClick={() => setGlobalDraft(null)} title={t('Cancel', 'إلغاء')}><X size={14} /></button>
            </div>
          )}
          <p>{t('Used when a vehicle has no interval of its own', 'تُستخدم عندما لا تملك المركبة فترة خاصة بها')}</p>
        </div>
      </div>

      <div className="glass-panel fms-panel">
        <div className="fms-panel-head">
          <div>
            <h3>{t('Oil change schedule', 'جدول تغيير الزيت')}</h3>
            <p>{t('Next due = last change + interval, against the live odometer', 'الموعد القادم = آخر تغيير + الفترة، مقابل العداد المباشر')}</p>
          </div>
        </div>
        <div className="fleet-table-container fms-table-wrap">
          <table className="fleet-table">
            <thead>
              <tr>
                <th>{t('Vehicle', 'المركبة')}</th>
                <th>{t('Odometer (km)', 'العداد (كم)')}</th>
                <th>{t('Last change', 'آخر تغيير')}</th>
                <th>{t('Interval (km)', 'الفترة (كم)')}</th>
                <th>{t('Next due (km)', 'الموعد القادم (كم)')}</th>
                <th>{t('Remaining (km)', 'المتبقي (كم)')}</th>
                <th>{t('Status', 'الحالة')}</th>
                {canEdit && <th></th>}
              </tr>
            </thead>
            <tbody>
              {oilRows.length === 0 && (
                <tr><td colSpan={canEdit ? 8 : 7} className="fms-empty-cell">{t('No vehicles in the current scope.', 'لا توجد مركبات ضمن النطاق الحالي.')}</td></tr>
              )}
              {oilRows.map((row) => (
                <tr key={row.vehicle.reg}>
                  <td style={{ fontWeight: 700 }}>{displayName(row.vehicle.reg, locale)}</td>
                  <td className="fms-mono">{row.vehicle.odoKm.toLocaleString(locale)}</td>
                  <td className="fms-mono">
                    {row.status === 'none'
                      ? <span className="fms-muted">{t('No record', 'لا يوجد سجل')}</span>
                      : <>{row.lastChangeKm.toLocaleString(locale)}<span className="fms-hint" style={{ marginInlineStart: 6 }}>{row.lastChangeDate || ''}</span></>}
                  </td>
                  <td className="fms-mono">
                    {row.interval.toLocaleString(locale)}
                    {!row.hasOwnInterval && <span className="fms-hint" style={{ marginInlineStart: 4 }}>{t('(global)', '(عام)')}</span>}
                  </td>
                  <td className="fms-mono">{row.status === 'none' ? '—' : row.nextDueKm.toLocaleString(locale)}</td>
                  <td className={`fms-mono${row.status === 'overdue' ? ' fms-t-risk' : row.status === 'due-soon' ? ' fms-t-warn' : ''}`}>
                    {row.status === 'none' ? '—' : row.remaining.toLocaleString(locale)}
                  </td>
                  <td><OilStatusBadge status={row.status} /></td>
                  {canEdit && (
                    <td style={{ textAlign: 'end', whiteSpace: 'nowrap' }}>
                      <button
                        type="button" className="fms-btn fms-btn--ghost"
                        onClick={() => stampNow(row)}
                        disabled={stamping === row.vehicle.reg}
                      >
                        {stamping === row.vehicle.reg ? <Loader2 size={13} className="fms-spin" /> : <Droplets size={13} />}
                        {t('Oil changed now', 'تم تغيير الزيت الآن')}
                      </button>
                      <button type="button" className="fms-icon-btn" title={t('Edit', 'تعديل')} onClick={() => setEditRow(row)}>
                        <Pencil size={14} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editRow && (
        <OilEditModal row={editRow} globalInterval={globalOilInterval} onClose={() => setEditRow(null)} />
      )}
    </div>
  )
}
