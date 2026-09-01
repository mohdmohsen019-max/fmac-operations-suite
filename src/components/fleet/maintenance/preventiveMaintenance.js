import { canonicalFleetRegistration } from '../../../services/fleetIdentity.js'

const DAY_MS = 86400000

export const DEFAULT_MAINTENANCE_TEMPLATES = [
  { id: 'oil-service', nameEn: 'Engine oil service', nameAr: 'خدمة زيت المحرك', category: 'oil', intervalKm: 10000, intervalDays: 180, checklist: ['Engine oil', 'Oil filter (included with oil service)', 'Leak inspection'], active: true, sortOrder: 1 },
  { id: 'general-inspection', nameEn: 'General preventive inspection', nameAr: 'الفحص الوقائي العام', category: 'inspection', intervalKm: 10000, intervalDays: 90, checklist: ['Lights', 'Steering', 'Suspension', 'Brakes', 'Fluid levels'], active: true, sortOrder: 2 },
  { id: 'brake-inspection', nameEn: 'Brake system inspection', nameAr: 'فحص نظام الفرامل', category: 'brakes', intervalKm: 10000, intervalDays: 90, checklist: ['Pads', 'Discs', 'Fluid', 'Hoses'], active: true, sortOrder: 3 },
  { id: 'tires', nameEn: 'Tire inspection and rotation', nameAr: 'فحص وتدوير الإطارات', category: 'tires', intervalKm: 15000, intervalDays: 180, checklist: ['Pressure', 'Tread', 'Alignment', 'Rotation'], active: true, sortOrder: 4 },
  { id: 'air-filter', nameEn: 'Air filter service', nameAr: 'خدمة فلتر الهواء', category: 'filters', intervalKm: 20000, intervalDays: 365, checklist: ['Inspect and replace air filter when required'], active: true, sortOrder: 5 },
  { id: 'cooling-system', nameEn: 'Cooling system service', nameAr: 'خدمة نظام التبريد', category: 'fluids', intervalKm: 20000, intervalDays: 365, checklist: ['Coolant', 'Radiator', 'Hoses', 'Pressure test'], active: true, sortOrder: 6 },
  { id: 'battery', nameEn: 'Battery and charging inspection', nameAr: 'فحص البطارية والشحن', category: 'battery', intervalKm: 40000, intervalDays: 730, checklist: ['Battery test', 'Terminals', 'Alternator output'], active: true, sortOrder: 7 },
  { id: 'drive-belts', nameEn: 'Drive belt inspection', nameAr: 'فحص سيور المحرك', category: 'belts', intervalKm: 30000, intervalDays: 365, checklist: ['Condition', 'Tension', 'Pulleys'], active: true, sortOrder: 8 },
  { id: 'transmission-fluid', nameEn: 'Transmission fluid service', nameAr: 'خدمة زيت ناقل الحركة', category: 'transmission', intervalKm: 60000, intervalDays: 730, checklist: ['Fluid condition', 'Leaks', 'Shift test'], active: true, sortOrder: 9 },
]

export const PLAN_STATUSES = ['upcoming', 'due-soon', 'due', 'overdue', 'scheduled', 'completed', 'skipped', 'cancelled', 'unconfigured']

export function templateCategoryFromRecord(record = {}) {
  if (record.serviceCategory) return String(record.serviceCategory).toLowerCase()
  const text = `${record.description || ''} ${record.notes || ''}`.toLowerCase()
  if (/oil|زيت/.test(text)) return 'oil'
  if (/brake|فرامل/.test(text)) return 'brakes'
  if (/tire|tyre|إطار/.test(text)) return 'tires'
  if (/battery|بطاري/.test(text)) return 'battery'
  if (/coolant|radiator|تبريد|راديتر/.test(text)) return 'fluids'
  if (/transmission|gear|جير|ناقل/.test(text)) return 'transmission'
  if (/belt|سير/.test(text)) return 'belts'
  if (/filter|فلتر/.test(text) && !/oil filter|فلتر الزيت/.test(text)) return 'filters'
  return 'inspection'
}

const isoDate = (value) => {
  if (!value) return ''
  if (typeof value === 'string') return value.slice(0, 10)
  const date = value?.toDate ? value.toDate() : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const dateMs = (value) => {
  const iso = isoDate(value)
  return iso ? new Date(`${iso}T00:00:00`).getTime() : NaN
}

export function addDaysIso(date, days) {
  const base = dateMs(date)
  if (!Number.isFinite(base)) return ''
  return isoDate(new Date(base + Number(days || 0) * DAY_MS))
}

export function planDocumentId(registration, templateId) {
  return `${canonicalFleetRegistration(registration)}__${String(templateId).replace(/[^a-z0-9_-]/gi, '_')}`
}

function latestMatchingRecord(records, registration, template) {
  const canonical = canonicalFleetRegistration(registration)
  return records
    // Corrective invoices and generic workshop records are history, not proof
    // that a recurring preventive cycle was completed. Only an explicitly
    // preventive/linked record may establish the next date/km baseline.
    .filter((record) => record.maintenanceType === 'preventive' || record.preventivePlanId || record.planTemplateId)
    .filter((record) => canonicalFleetRegistration(record.canonicalPlate || record.plateNumber || record.registration) === canonical)
    .filter((record) => record.planTemplateId === template.id || templateCategoryFromRecord(record) === template.category)
    .sort((a, b) => `${b.completedAt || b.date || ''}`.localeCompare(`${a.completedAt || a.date || ''}`))[0] || null
}

export function calculatePlanStatus({ currentKm, lastServiceKm, lastServiceDate, intervalKm, intervalDays, scheduledFor, overrideStatus, now = new Date() }) {
  if (['skipped', 'cancelled', 'completed'].includes(overrideStatus)) return overrideStatus
  if (scheduledFor) return 'scheduled'
  const kmConfigured = lastServiceKm != null && lastServiceKm !== '' && Number(intervalKm) > 0 && Number.isFinite(Number(lastServiceKm))
  const dateConfigured = Number(intervalDays) > 0 && Number.isFinite(dateMs(lastServiceDate))
  if (!kmConfigured && !dateConfigured) return 'unconfigured'

  const nextDueKm = kmConfigured ? Number(lastServiceKm) + Number(intervalKm) : null
  const nextDueDate = dateConfigured ? addDaysIso(lastServiceDate, intervalDays) : ''
  const remainingKm = nextDueKm == null ? Infinity : nextDueKm - Number(currentKm || 0)
  const remainingDays = nextDueDate ? Math.ceil((dateMs(nextDueDate) - now.getTime()) / DAY_MS) : Infinity
  if (remainingKm < 0 || remainingDays < 0) return 'overdue'
  if (remainingKm === 0 || remainingDays === 0) return 'due'
  if (remainingKm <= Math.max(1000, Number(intervalKm || 0) * 0.1) || remainingDays <= 30) return 'due-soon'
  return 'upcoming'
}

export function buildPreventivePlanRows({ vehicles = [], templates = DEFAULT_MAINTENANCE_TEMPLATES, plans = [], records = [], now = new Date() }) {
  const planMap = new Map(plans.map((plan) => [plan.id || planDocumentId(plan.vehicleReg, plan.templateId), plan]))
  return vehicles.flatMap((vehicle) => templates.filter((template) => template.active !== false).map((template) => {
    const vehicleReg = canonicalFleetRegistration(vehicle.registration || vehicle.reg)
    const id = planDocumentId(vehicleReg, template.id)
    const stored = planMap.get(id) || {}
    const latest = latestMatchingRecord(records, vehicleReg, template)
    const lastServiceKm = Number.isFinite(Number(stored.lastServiceKm)) ? Number(stored.lastServiceKm)
      : Number.isFinite(Number(latest?.odometerKm)) ? Number(latest.odometerKm) : null
    const lastServiceDate = isoDate(stored.lastServiceDate || latest?.completedAt || latest?.date)
    const intervalKm = Number(stored.intervalKm || template.intervalKm) || 0
    const intervalDays = Number(stored.intervalDays || template.intervalDays) || 0
    const currentKm = Number(vehicle.odoKm ?? vehicle.currentKm) || 0
    const nextDueKm = lastServiceKm == null || !intervalKm ? null : lastServiceKm + intervalKm
    const nextDueDate = !lastServiceDate || !intervalDays ? '' : addDaysIso(lastServiceDate, intervalDays)
    const remainingKm = nextDueKm == null ? null : nextDueKm - currentKm
    const projectedMileageDueDate = remainingKm != null && remainingKm > 0 && Number(vehicle.avgDailyKm) > 0
      ? addDaysIso(now, Math.ceil(remainingKm / Number(vehicle.avgDailyKm))) : ''
    const controllingDueDate = [nextDueDate, projectedMileageDueDate].filter(Boolean).sort()[0] || ''
    const status = calculatePlanStatus({
      currentKm, lastServiceKm, lastServiceDate, intervalKm, intervalDays,
      scheduledFor: stored.scheduledFor, overrideStatus: stored.overrideStatus, now,
    })
    return {
      id, vehicleReg, vehicle, templateId: template.id, template, intervalKm, intervalDays,
      currentKm, lastServiceKm, lastServiceDate, nextDueKm, nextDueDate, status,
      scheduledFor: isoDate(stored.scheduledFor), notes: stored.notes || '', stored,
      remainingKm,
      remainingDays: nextDueDate ? Math.ceil((dateMs(nextDueDate) - now.getTime()) / DAY_MS) : null,
      avgDailyKm: Number(vehicle.avgDailyKm) || 0,
      projectedMileageDueDate,
      controllingDueDate,
    }
  }))
}

export function maintenanceCompliance({ records = [], rows = [], startDate, endDate }) {
  const start = isoDate(startDate)
  const end = isoDate(endDate)
  const cycles = new Map()
  const inRange = (date) => date && date >= start && date <= end

  records.filter((record) => record.maintenanceType === 'preventive' && inRange(isoDate(record.originalDueDate || record.dueDate)))
    .forEach((record) => {
      const key = record.planCycleId || `${record.preventivePlanId || record.planTemplateId}|${record.originalDueDate || record.dueDate}`
      const completed = isoDate(record.completedAt || record.date)
      cycles.set(key, { due: true, onTime: Boolean(completed && completed <= isoDate(record.originalDueDate || record.dueDate)) })
    })

  rows.filter((row) => inRange(row.nextDueDate)).forEach((row) => {
    const key = `${row.id}|${row.nextDueDate}`
    if (!cycles.has(key)) cycles.set(key, { due: true, onTime: false })
  })
  const due = cycles.size
  const onTime = [...cycles.values()].filter((cycle) => cycle.onTime).length
  return { due, onTime, value: due ? (onTime / due) * 100 : null }
}

const median = (numbers) => {
  const sorted = numbers.filter(Number.isFinite).sort((a, b) => a - b)
  if (!sorted.length) return null
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

const CATEGORY_COPY = {
  oil: { en: 'Engine oil', ar: 'زيت المحرك' },
  inspection: { en: 'Preventive inspection', ar: 'الفحص الوقائي' },
  brakes: { en: 'Brake system', ar: 'نظام الفرامل' },
  tires: { en: 'Tires', ar: 'الإطارات' },
  filters: { en: 'Air filters', ar: 'فلاتر الهواء' },
  fluids: { en: 'Cooling system and fluids', ar: 'نظام التبريد والسوائل' },
  battery: { en: 'Battery and charging', ar: 'البطارية والشحن' },
  belts: { en: 'Drive belts', ar: 'سيور المحرك' },
  transmission: { en: 'Transmission', ar: 'ناقل الحركة' },
}

const categoryCopy = (category) => CATEGORY_COPY[category] || { en: category || 'Vehicle system', ar: 'نظام المركبة' }

export function buildPreventiveInsights({ records = [], rows = [] }) {
  const insights = []
  rows.filter((row) => ['overdue', 'due', 'due-soon'].includes(row.status)).forEach((row) => {
    const category = categoryCopy(row.template.category)
    const remainingKm = row.remainingKm != null && row.remainingKm < 0 ? Math.abs(Math.round(row.remainingKm)) : null
    const remainingDays = row.remainingDays != null ? Math.max(0, row.remainingDays) : null
    const serviceEn = row.template.nameEn?.toLowerCase() || category.en.toLowerCase()
    const serviceAr = row.template.nameAr || category.ar
    const suggestedDate = row.controllingDueDate || row.nextDueDate
    insights.push({
      id: `due-${row.id}`, vehicleReg: row.vehicleReg, category: row.template.category,
      categoryEn: category.en, categoryAr: category.ar,
      severity: row.status === 'overdue' ? 'critical' : 'attention',
      evidence: remainingKm != null
        ? `${remainingKm.toLocaleString()} km overdue`
        : remainingDays != null ? `${remainingDays} days remaining` : 'Service threshold reached',
      evidenceEn: remainingKm != null
        ? `${remainingKm.toLocaleString()} km overdue`
        : remainingDays != null ? `${remainingDays} days remaining` : 'Service threshold reached',
      evidenceAr: remainingKm != null
        ? `متأخر بمقدار ${remainingKm.toLocaleString('ar-AE-u-nu-latn')} كم`
        : remainingDays != null ? `متبقي ${remainingDays.toLocaleString('ar-AE-u-nu-latn')} يوم` : 'تم بلوغ حد الصيانة',
      recommendation: `Schedule ${serviceEn}${suggestedDate ? ` by ${suggestedDate}` : ''}.`,
      recommendationEn: `Schedule ${serviceEn}${suggestedDate ? ` by ${suggestedDate}` : ''}.`,
      recommendationAr: `جدولة ${serviceAr}${suggestedDate ? ` بحلول ${suggestedDate}` : ''}.`,
      suggestedDate, suggestedOdometer: row.nextDueKm,
    })
  })

  const grouped = new Map()
  records.forEach((record) => {
    const vehicleReg = canonicalFleetRegistration(record.canonicalPlate || record.plateNumber || record.registration)
    if (!vehicleReg) return
    const category = templateCategoryFromRecord(record)
    const key = `${vehicleReg}|${category}`
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key).push({ ...record, vehicleReg, category, when: dateMs(record.completedAt || record.date), cost: Number(record.total) || 0 })
  })
  grouped.forEach((items, key) => {
    const ordered = items.filter((item) => Number.isFinite(item.when)).sort((a, b) => b.when - a.when)
    const [latest, prior] = ordered
    if (latest && prior && latest.when - prior.when <= 90 * DAY_MS && latest.maintenanceType !== 'preventive') {
      const [vehicleReg, category] = key.split('|')
      const categoryLabel = categoryCopy(category)
      const days = Math.ceil((latest.when - prior.when) / DAY_MS)
      insights.push({
        id: `repeat-${key}`, vehicleReg, category,
        categoryEn: categoryLabel.en, categoryAr: categoryLabel.ar,
        severity: 'attention',
        evidence: `${categoryLabel.en} work repeated within ${days} days`,
        evidenceEn: `${categoryLabel.en} work repeated within ${days} days`,
        evidenceAr: `تكررت أعمال ${categoryLabel.ar} خلال ${days.toLocaleString('ar-AE-u-nu-latn')} يوم`,
        recommendation: `Inspect the root cause before authorizing another ${categoryLabel.en.toLowerCase()} repair.`,
        recommendationEn: `Inspect the root cause before authorizing another ${categoryLabel.en.toLowerCase()} repair.`,
        recommendationAr: `افحص السبب الجذري قبل اعتماد إصلاح آخر في ${categoryLabel.ar}.`,
        relatedRecordIds: [latest.id, prior.id].filter(Boolean),
      })
    }
    const typical = median(ordered.slice(1).map((item) => item.cost).filter((cost) => cost > 0))
    if (latest?.cost > 0 && typical > 0 && latest.cost > typical * 1.5) {
      const categoryLabel = categoryCopy(latest.category)
      const percentage = Math.round((latest.cost / typical - 1) * 100)
      insights.push({
        id: `cost-${key}`, vehicleReg: latest.vehicleReg, category: latest.category,
        categoryEn: categoryLabel.en, categoryAr: categoryLabel.ar,
        severity: 'attention',
        evidence: `Latest cost is ${percentage}% above the historical median`,
        evidenceEn: `Latest cost is ${percentage}% above the historical median`,
        evidenceAr: `آخر تكلفة أعلى بنسبة ${percentage.toLocaleString('ar-AE-u-nu-latn')}٪ من الوسيط التاريخي`,
        recommendation: 'Review the invoice scope and inspect for repeated component failure.',
        recommendationEn: 'Review the invoice scope and inspect for repeated component failure.',
        recommendationAr: 'راجع نطاق الفاتورة وافحص احتمال تكرار عطل المكوّن.',
        relatedRecordIds: [latest.id].filter(Boolean),
      })
    }
  })

  return insights.sort((a, b) => (a.severity === 'critical' ? -1 : 1) - (b.severity === 'critical' ? -1 : 1))
}
