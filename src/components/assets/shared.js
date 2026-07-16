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

/* ══════════════════════════════════════════════════════════════════════
   STRATEGIC ASSET MANAGEMENT — register schema, condition/criticality,
   the club's 4 strategic goals, and the smart-default engine that lets the
   three approved strategic reports populate on day one (all values editable
   in the registry afterwards).
   ══════════════════════════════════════════════════════════════════════ */

// ── Physical condition ────────────────────────────────────────────────
export const CONDITIONS = ['Good', 'Fair', 'Needs Maintenance', 'Poor']
export const CONDITION_META = {
  'Good':              { en: 'Good',              ar: 'جيدة',        color: '#10b981' },
  'Fair':              { en: 'Fair',              ar: 'مقبولة',      color: '#06b6d4' },
  'Needs Maintenance': { en: 'Needs Maintenance', ar: 'تحتاج صيانة', color: '#f59e0b' },
  'Poor':              { en: 'Poor',              ar: 'ضعيفة',       color: '#f43f5e' },
}
export function conditionLabel(c, lang) {
  return CONDITION_META[c] ? (lang === 'ar' ? CONDITION_META[c].ar : CONDITION_META[c].en) : (c || '—')
}

// ── Strategic criticality ─────────────────────────────────────────────
export const CRITICALITIES = ['Critical', 'High', 'Medium', 'Low']
export const CRITICALITY_META = {
  Critical: { en: 'Critical', ar: 'حرجة',    color: '#f43f5e', rank: 4 },
  High:     { en: 'High',     ar: 'مرتفعة',  color: '#f59e0b', rank: 3 },
  Medium:   { en: 'Medium',   ar: 'متوسطة',  color: '#06b6d4', rank: 2 },
  Low:      { en: 'Low',      ar: 'منخفضة',  color: '#8b8b9e', rank: 1 },
}
export function criticalityLabel(c, lang) {
  return CRITICALITY_META[c] ? (lang === 'ar' ? CRITICALITY_META[c].ar : CRITICALITY_META[c].en) : (c || '—')
}
export function criticalityRank(c) { return CRITICALITY_META[c]?.rank || 0 }

// ── Utilization ───────────────────────────────────────────────────────
export const UTILIZATIONS = ['Well-utilized', 'Underutilized']
export const UTILIZATION_META = {
  'Well-utilized': { en: 'Well-utilized', ar: 'مُستغَل جيداً' },
  'Underutilized': { en: 'Underutilized', ar: 'غير مُستغَل بالكامل' },
}
export function utilizationLabel(u, lang) {
  return UTILIZATION_META[u] ? (lang === 'ar' ? UTILIZATION_META[u].ar : UTILIZATION_META[u].en) : (u || '—')
}

// ── The club's strategy house (from the official Strategy Office chart) ──
export const CLUB_VISION = 'الريادة في تأهيل جيل من الرياضيين القادرين على تحقيق إنجاز أولمبي'
export const CLUB_MISSION =
  'تصميم وتطوير برامج وأنشطة تستهدف المواهب الرياضية في إمارة الفجيرة والعمل على تطويرها لتمثيل دولة الإمارات العربية المتحدة في البطولات الدولية وصولاً للألعاب الأولمبية'

// The 6 strategic-goal pillars.
export const STRATEGIC_GOALS = [
  {
    code: 'G1',
    ar: 'تطبيق مبادرات وأنشطة فعالة تسهم في إنشاء مجتمع رياضي في إمارة الفجيرة',
    shortAr: 'مجتمع رياضي في الفجيرة', shortEn: 'Sports community',
    color: '#06b6d4', match: ['مجتمع رياضي'],
  },
  {
    code: 'G2',
    ar: 'تطبيق أفضل الممارسات التكنولوجية الحديثة لتأهيل وتدريب المواهب الرياضية',
    shortAr: 'أفضل الممارسات التكنولوجية', shortEn: 'Modern technology practices',
    color: '#8b5cf6', match: ['التكنولوجية الحديثة', 'الممارسات التكنولوجية'],
  },
  {
    code: 'G3',
    ar: 'تطوير آليات مستدامة لاكتشاف واستقطاب المواهب الرياضية',
    shortAr: 'اكتشاف واستقطاب المواهب', shortEn: 'Talent discovery & attraction',
    color: '#10b981', match: ['اكتشاف واستقطاب', 'آليات مستدامة'],
  },
  {
    code: 'G4',
    ar: 'تنظيم واستضافة بطولات ذات تصنيف من الاتحادات الدولية',
    shortAr: 'استضافة البطولات الدولية', shortEn: 'Hosting ranked championships',
    color: '#f59e0b', match: ['استضافة بطولات', 'تنظيم واستضافة'],
  },
  {
    code: 'G5',
    ar: 'تدعيم برامج النخبة وبرامج وأنشطة مساندة لتطوير لاعبين مؤهلين لخوض التصفيات الأولمبية وتحقيق إنجاز أولمبي',
    shortAr: 'برامج النخبة والإنجاز الأولمبي', shortEn: 'Elite Olympic programs',
    color: '#f43f5e', match: ['برامج النخبة', 'إنجاز أولمبي'],
  },
  {
    code: 'G6',
    ar: 'المشاركة وحصد الجوائز وتميز مكانة النادي على مستوى العالم',
    shortAr: 'تميز مكانة النادي عالمياً', shortEn: 'Global standing & awards',
    color: '#64748b', match: ['حصد الجوائز', 'مكانة النادي'],
  },
]
export function matchGoal(text) {
  const s = String(text || '').trim()
  if (!s) return null
  for (const g of STRATEGIC_GOALS) if (s === g.ar) return g
  for (const g of STRATEGIC_GOALS) if (g.match.some(m => s.includes(m))) return g
  return null
}
export function goalByCode(code) { return STRATEGIC_GOALS.find(g => g.code === code) || null }

// ── Automatic strategic classification ────────────────────────────────
// Assigns every asset to the pillar it serves, from its location + category.
// Deterministic and explainable (order matters — venue context wins first):
//   1. Competition venues (judo/karate/boxing/fencing)      → G4 hosting
//   2. Performance & recovery (gym/cross-fit/clinics)       → G5 elite
//   3. Sport equipment & medical devices anywhere           → G5 elite
//   4. Electronics anywhere (incl. telephone room)          → G2 technology
//   5. Player reception (athlete first touchpoint)          → G3 talent attraction
//   6. Main reception & podcast (community-facing / media)  → G1 community
//   7. Everything else (offices, VIP/meeting, staff areas)  → G6 institutional standing
export function classifyGoal(a = {}) {
  const loc = `${a.department || ''} ${a.location_code || ''}`.toUpperCase()
  const cat = normalizeCategory(a.category)
  if (/JUDO|KARATE|BOXING|FENCING/.test(loc)) return 'G4'
  if (/GYM|CROSS ?FIT|CLINIC/.test(loc)) return 'G5'
  if (cat === 'Sport Equipment' || cat === 'Medical Devices') return 'G5'
  if (cat === 'Electronics' || /TELEPHONE/.test(loc)) return 'G2'
  if (/PLAYER RECEPTION/.test(loc)) return 'G3'
  if (/PODCAST|MAIN RECEPTION/.test(loc)) return 'G1'
  return 'G6'
}
// Resolve the goal for an asset: explicit assignment wins, else auto-classify.
export function resolveGoalCode(a = {}) {
  return a.strategic_goal_code || classifyGoal(a)
}

// ── Category normalisation + lifecycle defaults ───────────────────────
export function normalizeCategory(raw) {
  const s = String(raw || '').trim().toLowerCase()
  if (!s) return 'Other'
  if (s.includes('medical')) return 'Medical Devices'
  if (s.includes('sport')) return 'Sport Equipment'
  if (s.includes('electron')) return 'Electronics'
  if (s.includes('furnitur')) return 'Furniture'
  if (s.includes('decor')) return 'Decorations'
  return String(raw).trim()
}

// Smart defaults keyed by category: criticality, useful life (yrs), est. unit cost (AED).
// Costs are deliberately conservative planning placeholders — they exist so the
// strategic reports are never blank, and are replaced the moment a real purchase
// cost is recorded on the asset. "Critical" is reserved for manual flags only.
export const CATEGORY_DEFAULTS = {
  'Medical Devices': { criticality: 'High',   life: 6,  cost: 2000 },
  'Sport Equipment': { criticality: 'High',   life: 5,  cost: 700  },
  'Electronics':     { criticality: 'Medium', life: 4,  cost: 1000 },
  'Furniture':       { criticality: 'Low',    life: 8,  cost: 400  },
  'Decorations':     { criticality: 'Low',    life: 10, cost: 150  },
  'Other':           { criticality: 'Medium', life: 5,  cost: 500  },
}
export function categoryDefault(cat) {
  return CATEGORY_DEFAULTS[normalizeCategory(cat)] || CATEGORY_DEFAULTS.Other
}

export function mapStatus(raw) {
  const s = String(raw || '').trim().toLowerCase()
  if (!s) return 'Active'
  if (s.includes('mainten')) return 'Under Maintenance'
  if (s.includes('dispos')) return 'Disposed'
  if (s.includes('missing') || s.includes('مفقود')) return 'Missing'
  return 'Active' // "In Service", "Active", blank → Active
}

export function mapCondition(raw) {
  const s = String(raw || '').trim().toLowerCase()
  if (!s) return 'Good'
  if (s.includes('poor') || s.includes('ضعيف') || s.includes('old') || s.includes('قديم')) return 'Poor'
  if (s.includes('mainten') || s.includes('صيان')) return 'Needs Maintenance'
  if (s.includes('fair') || s.includes('مقبول')) return 'Fair'
  return 'Good'
}

// Derive the lifecycle-planning fields the strategic reports need. Existing
// (staff-entered) values always win; anything missing is smart-defaulted.
export function deriveDefaults(a = {}) {
  const cd = categoryDefault(a.category)
  const condition = a.condition || 'Good'
  const criticality = a.criticality || cd.criticality
  const life = Number(a.useful_life_years) || cd.life
  const thisYear = new Date().getFullYear()

  // Condition accelerates the replacement horizon.
  let horizon = life
  if (condition === 'Poor') horizon = 1
  else if (condition === 'Needs Maintenance') horizon = 2
  else if (condition === 'Fair') horizon = Math.min(life, 3)

  const replacement_year = Number(a.replacement_year) || (thisYear + horizon)
  const qty = Number(a.quantity) || 1
  const hasRealCost = Number(a.purchase_cost) > 0
  const hasManualEstimate = a.est_replacement_cost != null && a.est_replacement_cost !== ''
  const unitCost = hasRealCost ? Number(a.purchase_cost) : cd.cost
  const est_replacement_cost = hasManualEstimate
    ? Number(a.est_replacement_cost)
    : Math.round(unitCost * qty)

  return {
    condition,
    criticality,
    useful_life_years: life,
    replacement_year,
    est_replacement_cost,
    cost_is_estimate: !hasRealCost && !hasManualEstimate,
    funding_source: a.funding_source || 'الموازنة التشغيلية',
    utilization: a.utilization || 'Well-utilized',
  }
}

// Return an asset augmented with any missing lifecycle fields (non-destructive).
export function withDefaults(a = {}) {
  return { ...deriveDefaults(a), ...a }
}

export function fmtMoney(n) {
  return (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

// Arabic names for the known functional rooms (fallback naming when a row has
// no Location Code — see resolveRoomInfo below). Person-name offices get a
// generic «مكتب» prefix instead.
export const ROOM_AR = {
  'GYM': 'الصالة الرياضية',
  'CROSS FIT': 'قاعة الكروس فت',
  'BOXING': 'قاعة الملاكمة',
  'JUDO': 'قاعة الجودو',
  'KARATE': 'قاعة الكاراتيه',
  'FENCING COURT': 'قاعة المبارزة',
  'CLINICS': 'العيادات',
  'MAIN RECEPTION': 'الاستقبال الرئيسي',
  'PLAYER RECEPTION': 'استقبال اللاعبين',
  'VIP HALL 1ST FLOOR': 'قاعة كبار الشخصيات — الطابق الأول',
  'MEETING + VIP ROOM': 'قاعة الاجتماعات وكبار الشخصيات',
  'CONFRENCE ROOM': 'قاعة المؤتمرات',
  'CONFERENCE ROOM': 'قاعة المؤتمرات',
  'PODCAST ROOM': 'غرفة البودكاست',
  'TELEPHONE ROOM': 'غرفة الهاتف',
  'BREAK ROOM': 'غرفة الاستراحة',
  'PANTRY': 'المطبخ',
  'MALE PRAYER ROOM': 'مصلى الرجال',
  'FEMALE PRAYER ROOM': 'مصلى النساء',
  'FINANCE DEPARTMENT': 'قسم المالية',
  'STRATEGY OFFICE': 'مكتب الاستراتيجية',
  'ADAA OFFICE': 'مكتب الأداء',
  'WORKSTATION AND CORRIDOR': 'محطات العمل والممر',
}
export function roomArabicName(nameEn) {
  const key = String(nameEn || '').trim().toUpperCase()
  if (ROOM_AR[key]) return ROOM_AR[key]
  return key ? `مكتب — ${String(nameEn).trim()}` : ''
}

// ── Rooms are built from the register's Location Code column ──────────
// (F1, F2… BA, CF, G, LR, VR…) — one room per code, verified against the
// real FMAC register. Codes are the source of truth; department names are
// only a display fallback for the handful of rows with no code at all.
export const LOCATION_CODE_ROOMS = {
  'BA': { en: 'Boxing Hall',                ar: 'قاعة الملاكمة' },
  'C':  { en: 'Clinics',                    ar: 'العيادات' },
  'CF': { en: 'CrossFit Hall',              ar: 'قاعة الكروس فت' },
  'F1': { en: 'CEO Office',                 ar: 'مكتب الرئيس التنفيذي' },
  'F2': { en: 'Office — Amal Alkindi',      ar: 'مكتب — أمل الكندي' },
  'F3': { en: 'Strategy & Planning Wing',   ar: 'جناح الاستراتيجية والتخطيط' },
  'F4': { en: 'Office — Anas Adarbah',      ar: 'مكتب — أنس العداربة' },
  'F5': { en: 'Office — Ihab Estatieh',     ar: 'مكتب — إيهاب استيتيه' },
  'F6': { en: 'Workstations — F6',          ar: 'محطات عمل — F6' },
  'F7': { en: 'Workstations — F7',          ar: 'محطات عمل — F7' },
  'F8': { en: 'Finance & Workstations — F8', ar: 'المالية ومحطات عمل — F8' },
  'F9': { en: 'Office — Zobaidah Alyammahi', ar: 'مكتب — زبيدة اليماحي' },
  'F10': { en: 'ADAA Office',               ar: 'مكتب الأداء الحكومي' },
  'F11': { en: 'Office — Mohamed Khaled',   ar: 'مكتب — محمد خالد' },
  'FC': { en: 'Fencing Court',              ar: 'ملعب المبارزة' },
  'G':  { en: 'Gym',                        ar: 'صالة الجيم' },
  'K':  { en: 'Pantry',                     ar: 'المطبخ' },
  'LR': { en: 'Conference Room',            ar: 'قاعة المؤتمرات' },
  'M1': { en: 'Female Prayer Room',         ar: 'مصلى النساء' },
  'M2': { en: 'Male Prayer Room',           ar: 'مصلى الرجال' },
  'RE': { en: 'Main Reception',             ar: 'الاستقبال الرئيسي' },
  'RP': { en: 'Player Reception',           ar: 'استقبال اللاعبين' },
  'RR': { en: 'Break Room',                 ar: 'غرفة الاستراحة' },
  'TR': { en: 'Telephone Room',             ar: 'غرفة الهاتف' },
  'VR': { en: 'Meeting & VIP Room',         ar: 'قاعة الاجتماعات وكبار الزوار' },
}
export function normalizeLocationCode(raw) {
  return String(raw || '').trim().toUpperCase()
}
// Resolve the room a register row belongs to: the Location Code wins (and is
// the room's `floor` field); rows with no code fall back to their department
// name (covers JUDO/KARATE/PODCAST ROOM/VIP HALL, which the register never
// codes). Returns a stable `key` used to dedupe + link assets to rooms.
export function resolveRoomInfo(a = {}) {
  const code = normalizeLocationCode(a.location_code)
  if (code) {
    const known = LOCATION_CODE_ROOMS[code]
    return {
      key: `CODE:${code}`,
      code,
      name_en: known ? known.en : (a.department || code),
      name_ar: known ? known.ar : roomArabicName(a.department || code),
    }
  }
  const dept = String(a.department || '').trim()
  if (!dept) return null
  return {
    key: `DEPT:${dept.toUpperCase()}`,
    code: '',
    name_en: dept,
    name_ar: roomArabicName(dept),
  }
}

export function assetDisplayName(a, lang) {
  if (!a) return '—'
  return lang === 'ar' ? (a.name_ar || a.name_en || '—') : (a.name_en || a.name_ar || '—')
}
