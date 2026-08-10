/**
 * Asset-register compliance KPI
 * نسبة الالتزام بتسجيل وتحديث كافة الأصول الثابتة والمنقولة ضمن النظام الموحد
 *
 * WHAT IT MEASURES
 * The indicator has two halves, and a compliant asset must satisfy BOTH:
 *   • تسجيل (registration) — the asset exists in the unified register with every
 *     mandatory identification field filled in. A record missing its code,
 *     location or custodian does not constitute a registered asset.
 *   • تحديث (update)      — the record is current: it was created or last
 *     changed within the register's refresh cycle as at the end of the period.
 *
 * WHY 90 DAYS
 * The Asset Management System's own published methodology states the register
 * is refreshed quarterly (`dataQuality.refreshFrequencyAr` in ams.js), so a
 * record touched within 90 days of period end is current by the club's own
 * standard. The figure is not arbitrary and is disclosed on the evidence sheet.
 *
 * POINT-IN-TIME
 * Everything is evaluated as the register stood at 23:59:59 on the last day of
 * the period. Assets created after that date are excluded — they did not exist
 * in the month being reported, and counting them would distort history.
 *
 * Disposed assets are excluded from the denominator: they are archived records,
 * not part of the live register staff are obliged to maintain. The count is
 * still reported separately so the exclusion is visible, never silent.
 */

const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

export const KPI_META = {
  ar: 'نسبة الالتزام بتسجيل وتحديث كافة الأصول الثابتة والمنقولة ضمن النظام الموحد',
  en: 'Compliance rate — registering and updating all fixed and movable assets in the unified system',
  unit: '%',
  target: 100,
  freqAr: 'شهري',
  directionAr: 'إيجابي',
  weight: 30,
}

/* Mandatory fields for an asset to count as properly registered. */
export const REQUIRED_FIELDS = [
  { key: 'asset_code',    ar: 'رقم الأصل',        en: 'Asset code' },
  { key: 'name',          ar: 'اسم الأصل',        en: 'Asset name' },
  { key: 'category',      ar: 'التصنيف',          en: 'Category' },
  { key: 'location_room', ar: 'الموقع',           en: 'Location' },
  { key: 'status',        ar: 'الحالة',           en: 'Status' },
  { key: 'custodian',     ar: 'الجهة المسؤولة',   en: 'Custodian / department' },
]

export const CURRENCY_WINDOW_DAYS = 90

const ms = (ts) => {
  if (!ts) return 0
  const d = ts?.toDate ? ts.toDate() : new Date(ts)
  const v = d.getTime()
  return Number.isNaN(v) ? 0 : v
}

/* Which mandatory fields are missing on this asset? */
export function missingFieldsOf(a) {
  const out = []
  const has = (v) => v != null && String(v).trim() !== ''
  REQUIRED_FIELDS.forEach((f) => {
    let ok
    if (f.key === 'name') ok = has(a.name_ar) || has(a.name_en)
    else if (f.key === 'custodian') ok = has(a.assigned_to) || has(a.department)
    else ok = has(a[f.key])
    if (!ok) out.push(f)
  })
  return out
}

export function periodLabel(year, month, lang = 'ar') {
  const m = lang === 'ar' ? MONTHS_AR[month] : MONTHS_EN[month]
  return `${m} ${year}`
}

/**
 * @param assets    array of asset docs
 * @param auditLog  array of asset_audit_log docs ({ asset_id, timestamp, change_type })
 * @param year, month (0-indexed)
 */
export function computeAssetRegistryKpi(assets = [], auditLog = [], year, month) {
  // Period boundaries — inclusive of the final second of the month.
  const start = new Date(year, month, 1, 0, 0, 0, 0).getTime()
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999).getTime()
  const windowStart = end - CURRENCY_WINDOW_DAYS * 86400000

  // Latest audit-log touch per asset, ignoring anything after period end so the
  // reading can be recomputed later and still produce the same number.
  const lastTouch = {}
  auditLog.forEach((e) => {
    const t = ms(e.timestamp)
    if (!t || t > end) return
    const id = e.asset_id
    if (!id) return
    if (!lastTouch[id] || t > lastTouch[id]) lastTouch[id] = t
  })

  const existing = assets.filter((a) => {
    const created = ms(a.created_at)
    // Undated legacy records are treated as pre-existing rather than dropped.
    return !created || created <= end
  })

  const disposed = existing.filter((a) => a.status === 'Disposed')
  const scope = existing.filter((a) => a.status !== 'Disposed')

  const rows = scope.map((a) => {
    const missing = missingFieldsOf(a)
    const touched = Math.max(lastTouch[a.id] || 0, ms(a.updated_at), ms(a.created_at))
    const isCurrent = touched >= windowStart
    return {
      id: a.id,
      code: a.asset_code || '',
      name: a.name_ar || a.name_en || '',
      category: a.category || '',
      status: a.status || '',
      lastUpdate: touched || null,
      registered: missing.length === 0,
      current: isCurrent,
      compliant: missing.length === 0 && isCurrent,
      missing,
    }
  })

  const total = rows.length
  const compliant = rows.filter((r) => r.compliant).length
  const registeredOk = rows.filter((r) => r.registered).length
  const currentOk = rows.filter((r) => r.current).length
  // An empty register is 0% compliant, not 100% — there is nothing evidenced.
  const pct = total ? Math.round((compliant / total) * 1000) / 10 : 0

  const failures = rows.filter((r) => !r.compliant)
  const createdInPeriod = existing.filter((a) => {
    const c = ms(a.created_at)
    return c >= start && c <= end
  }).length
  const updatedInPeriod = Object.entries(lastTouch)
    .filter(([, t]) => t >= start && t <= end).length

  return {
    year, month,
    periodStart: start, periodEnd: end,
    windowStart, windowDays: CURRENCY_WINDOW_DAYS,
    total, compliant, pct,
    registeredOk, currentOk,
    missingFieldCount: rows.filter((r) => !r.registered).length,
    staleCount: rows.filter((r) => r.registered && !r.current).length,
    disposedExcluded: disposed.length,
    createdInPeriod, updatedInPeriod,
    rows, failures,
    target: KPI_META.target,
    attainment: KPI_META.target ? Math.round((pct / KPI_META.target) * 1000) / 10 : null,
  }
}
