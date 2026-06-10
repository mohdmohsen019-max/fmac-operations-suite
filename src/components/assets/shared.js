// Shared constants, helpers and Firestore wiring for the Assets module.
// Standalone — no relation to any other module.
//
// Firestore collections (created implicitly on first write — never dropped/recreated):
//   assets          — one doc per physical asset
//   asset_rooms     — one doc per room/area
//   asset_audit_log — one doc per change event
//
// NOTE (Firestore indexes): the Audit Log tab orders asset_audit_log by `timestamp desc`.
// A single-field index on `timestamp` is automatic. The Registry/audit subqueries use
// where('asset_id','==',x) + orderBy('timestamp','desc') which MAY require a composite
// index — Firestore will print a console link to create it if so. All listeners here have
// a client-side-sort fallback so the UI never hard-fails on a missing index.

import { db } from '../../firebase'
import {
  collection, addDoc, serverTimestamp,
} from 'firebase/firestore'

export const ASSET_STATUSES = ['Active', 'Under Maintenance', 'Disposed', 'Missing']

export const STATUS_META = {
  Active:              { en: 'Active',            ar: 'نشط',          color: '#10b981', bg: 'rgba(16,185,129,0.12)',  border: 'rgba(16,185,129,0.30)' },
  'Under Maintenance': { en: 'Under Maintenance', ar: 'تحت الصيانة',  color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.30)' },
  Disposed:            { en: 'Disposed',          ar: 'مُستبعد',       color: '#8b8b9e', bg: 'rgba(139,139,158,0.12)', border: 'rgba(139,139,158,0.30)' },
  Missing:             { en: 'Missing',           ar: 'مفقود',        color: '#f43f5e', bg: 'rgba(244,63,94,0.12)',   border: 'rgba(244,63,94,0.30)' },
}

export const CHANGE_TYPE_META = {
  created:         { en: 'Created',          ar: 'تم الإنشاء' },
  edited:          { en: 'Edited',           ar: 'تم التعديل' },
  status_change:   { en: 'Status Change',    ar: 'تغيير الحالة' },
  reassigned:      { en: 'Reassigned',       ar: 'إعادة تعيين' },
  location_change: { en: 'Location Change',  ar: 'تغيير الموقع' },
}

export function statusLabel(status, lang) {
  return STATUS_META[status] ? (lang === 'ar' ? STATUS_META[status].ar : STATUS_META[status].en) : status
}

export function changeTypeLabel(type, lang) {
  return CHANGE_TYPE_META[type] ? (lang === 'ar' ? CHANGE_TYPE_META[type].ar : CHANGE_TYPE_META[type].en) : type
}

export function fmtDate(ts) {
  if (!ts) return '—'
  const d = ts?.toDate ? ts.toDate() : new Date(ts)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function fmtDateTime(ts) {
  if (!ts) return '—'
  const d = ts?.toDate ? ts.toDate() : new Date(ts)
  if (isNaN(d.getTime())) return '—'
  return (
    d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  )
}

export function toMillis(ts) {
  if (!ts) return 0
  const d = ts?.toDate ? ts.toDate() : new Date(ts)
  const ms = d.getTime()
  return isNaN(ms) ? 0 : ms
}

// Days since a timestamp (used by the 90-day Missing audit).
export function daysSince(ts) {
  const ms = toMillis(ts)
  if (!ms) return Infinity
  return (Date.now() - ms) / 86400000
}

// Write a single audit-log event. Best-effort — never throws into the caller's flow.
export async function logAudit({ asset_id, asset_name_en, changed_by, changed_by_name, change_type, previous_value, new_value }) {
  try {
    await addDoc(collection(db, 'asset_audit_log'), {
      asset_id: asset_id || '',
      asset_name_en: asset_name_en || '',
      changed_by: changed_by || '',
      changed_by_name: changed_by_name || '',
      change_type: change_type || 'edited',
      previous_value: previous_value != null ? String(previous_value) : '',
      new_value: new_value != null ? String(new_value) : '',
      timestamp: serverTimestamp(),
    })
  } catch (e) {
    console.error('[assets] audit log write failed:', e)
  }
}

export function roomLabel(room, lang) {
  if (!room) return '—'
  return lang === 'ar' ? (room.name_ar || room.name_en || '—') : (room.name_en || room.name_ar || '—')
}
