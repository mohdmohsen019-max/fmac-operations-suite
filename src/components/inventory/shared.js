// Shared constants and utilities for Inventory module

export const MASTER_ADMIN_EMAIL = import.meta.env.VITE_MASTER_ADMIN_EMAIL

export const DEFAULT_SPORTS = [
  { id: 'taekwondo',          en: 'Taekwondo',          ar: 'التايكوندو' },
  { id: 'judo',               en: 'Judo',               ar: 'الجودو' },
  { id: 'fencing',            en: 'Fencing',            ar: 'المبارزة' },
  { id: 'boxing',             en: 'Boxing',             ar: 'الملاكمة' },
  { id: 'archery',            en: 'Archery',            ar: 'الرماية' },
  { id: 'karate',             en: 'Karate',             ar: 'الكاراتيه' },
  { id: 'wrestling',          en: 'Wrestling',          ar: 'المصارعة' },
  { id: 'jiu_jitsu',         en: 'Jiu Jitsu',          ar: 'الجيو جيتسو' },
  { id: 'swimming_triathlon', en: 'Swimming & Triathlon', ar: 'السباحة والترياثلون' },
  { id: 'general',            en: 'General',            ar: 'عام' },
]

/* Escape hatch offered at the end of every sport picker: lets staff issue to a
   discipline that isn't on the configured list, naming it as free text on that
   record only. Deliberately NOT part of DEFAULT_SPORTS — it must never be
   saved into inventory_sports or treated as a real, selectable discipline. */
export const OTHER_SPORT = { id: 'other', en: 'Other', ar: 'أخرى' }

export const DEFAULT_CATEGORIES = [
  { id: 'equipment',    en: 'Equipment',    ar: 'معدات' },
  { id: 'uniforms',     en: 'Uniforms',     ar: 'زي رياضي' },
  { id: 'merchandise',  en: 'Merchandise',  ar: 'بضائع' },
  { id: 'other',        en: 'Other',        ar: 'أخرى' },
]

export const DEFAULT_UNITS = [
  { id: 'piece', en: 'Piece', ar: 'قطعة' },
  { id: 'pair',  en: 'Pair',  ar: 'زوج' },
  { id: 'set',   en: 'Set',   ar: 'طقم' },
]

export const DEFAULT_ROLES = [
  { id: 'coach',  en: 'Coach',  ar: 'مدرب' },
  { id: 'player', en: 'Player', ar: 'لاعب' },
  { id: 'staff',  en: 'Staff',  ar: 'موظف' },
  { id: 'other',  en: 'Other',  ar: 'أخرى' },
]

const SPORT_SHORT = {
  taekwondo:          'TKD',
  judo:               'JDO',
  fencing:            'FNC',
  boxing:             'BOX',
  archery:            'ARC',
  karate:             'KRT',
  wrestling:          'WRS',
  jiu_jitsu:         'JJT',
  swimming_triathlon: 'SWT',
  general:            'GEN',
}

const CAT_SHORT = {
  equipment: 'EQP', uniforms: 'UNI', merchandise: 'MER', other: 'OTH',
}

export function buildSKU(sport, category, count) {
  const s = SPORT_SHORT[sport] || sport.slice(0, 3).toUpperCase()
  const c = CAT_SHORT[category] || category.slice(0, 3).toUpperCase()
  return `${s}-${c}-${String(count).padStart(3, '0')}`
}

export function getSportLabel(sportId, lang, sports = DEFAULT_SPORTS) {
  const s = sports.find(x => x.id === sportId)
  return s ? (lang === 'ar' ? s.ar : s.en) : sportId
}

export function getCatLabel(catId, lang, categories = DEFAULT_CATEGORIES) {
  const c = categories.find(x => x.id === catId)
  return c ? (lang === 'ar' ? c.ar : c.en) : catId
}

export function getUnitLabel(unitId, lang, units = DEFAULT_UNITS) {
  const u = units.find(x => x.id === unitId)
  return u ? (lang === 'ar' ? u.ar : u.en) : unitId
}

export function getRoleLabel(roleId, lang) {
  const r = DEFAULT_ROLES.find(x => x.id === roleId)
  return r ? (lang === 'ar' ? r.ar : r.en) : roleId
}

export function getItemStatus(item) {
  if (!item) return 'out'
  if (item.currentStock === 0) return 'out'
  if (item.currentStock <= (item.minThreshold ?? 5)) return 'low'
  return 'ok'
}

export function fmtDate(ts) {
  if (!ts) return '—'
  const d = ts?.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function fmtDateTime(ts) {
  if (!ts) return '—'
  const d = ts?.toDate ? ts.toDate() : new Date(ts)
  return (
    d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  )
}

export function fmtTimeAgo(ts, lang) {
  if (!ts) return '—'
  const d = ts?.toDate ? ts.toDate() : new Date(ts)
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (lang === 'ar') {
    if (mins < 1) return 'الآن'
    if (mins < 60) return `منذ ${mins}د`
    if (hours < 24) return `منذ ${hours}س`
    return `منذ ${days} يوم`
  }
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

export function getCurrentMonthRange() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
  return { start, end }
}
