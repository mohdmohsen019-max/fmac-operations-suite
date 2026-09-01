export const REPORT_COLORS = Object.freeze({
  ink: '#15151b',
  inkRgb: [21, 21, 27],
  muted: '#6f707b',
  mutedRgb: [111, 112, 123],
  border: '#dfddd6',
  borderRgb: [223, 221, 214],
  paper: '#ffffff',
  subtle: '#f6f4ef',
  subtleRgb: [246, 244, 239],
  gold: '#9a7410',
  goldRgb: [154, 116, 16],
  crimson: '#c70017',
  crimsonRgb: [199, 0, 23],
  green: '#087f5b',
  greenRgb: [8, 127, 91],
  amber: '#a56f00',
  amberRgb: [165, 111, 0],
  red: '#c93532',
  redRgb: [201, 53, 50],
  blue: '#2764ae',
  blueRgb: [39, 100, 174],
})

export const REPORT_TYPOGRAPHY = Object.freeze({
  family: 'Cairo',
  title: 24,
  section: 12,
  body: 8.5,
  small: 7.2,
  excelBody: 10,
})

export const REPORT_META = Object.freeze({
  organization: 'Fujairah Martial Arts Club',
  organizationAr: 'نادي الفجيرة للفنون القتالية',
  department: 'Operations Department',
  departmentAr: 'إدارة العمليات',
  confidentiality: 'Internal management use',
  confidentialityAr: 'للاستخدام الإداري الداخلي',
  version: '2.0',
})

export function isArabicLocale(locale = 'en') {
  return String(locale).toLowerCase().startsWith('ar')
}

export function localText(value, locale = 'en') {
  if (value == null) return ''
  if (typeof value !== 'object') return String(value)
  const arabic = isArabicLocale(locale)
  return String(arabic ? (value.ar ?? value.en ?? '') : (value.en ?? value.ar ?? ''))
}

export function safeFilePart(value) {
  return String(value || 'report')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9؀-ۿ_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'report'
}

export function formatReportNumber(value, locale = 'en-AE', options = {}) {
  const number = Number(value)
  if (!Number.isFinite(number)) return isArabicLocale(locale) ? 'غير متاح' : 'Unavailable'
  return new Intl.NumberFormat(locale, options).format(number)
}

export function reportStatus(status) {
  const key = String(status || 'neutral').toLowerCase()
  if (['good', 'success', 'verified', 'available', 'on-target'].includes(key)) return 'good'
  if (['warning', 'provisional', 'attention', 'due'].includes(key)) return 'warning'
  if (['bad', 'danger', 'critical', 'overdue', 'unavailable'].includes(key)) return 'bad'
  return 'neutral'
}

export function statusColor(status) {
  const normalized = reportStatus(status)
  if (normalized === 'good') return REPORT_COLORS.greenRgb
  if (normalized === 'warning') return REPORT_COLORS.amberRgb
  if (normalized === 'bad') return REPORT_COLORS.redRgb
  return REPORT_COLORS.mutedRgb
}

export function currentDubaiTimestamp(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dubai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date).replace(',', '') + ' GST'
}

export function normalizeReport(report = {}) {
  const generatedAt = report.generatedAt || currentDubaiTimestamp()
  return {
    id: report.id || 'management-report',
    title: report.title || { en: 'Management Report', ar: 'تقرير إداري' },
    subtitle: report.subtitle || { en: REPORT_META.department, ar: REPORT_META.departmentAr },
    period: report.period || '—',
    scope: report.scope || { en: 'All available records', ar: 'جميع السجلات المتاحة' },
    preparedBy: report.preparedBy || { en: REPORT_META.department, ar: REPORT_META.departmentAr },
    locale: report.locale || 'en-AE',
    kpis: Array.isArray(report.kpis) ? report.kpis : [],
    sections: Array.isArray(report.sections) ? report.sections : [],
    metadata: Array.isArray(report.metadata) ? report.metadata : [],
    dataQuality: Array.isArray(report.dataQuality) ? report.dataQuality : [],
    sourceNotes: Array.isArray(report.sourceNotes) ? report.sourceNotes : [],
    ...report,
    generatedAt,
  }
}
