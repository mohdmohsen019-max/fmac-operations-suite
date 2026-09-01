import { downloadManagementWorkbook } from '../../services/reporting/excelReportBuilder.js'
import { isArabicLocale } from '../../services/reporting/reportTheme.js'
import { minutesToHours } from './overtimeCalculations.js'
import { buildOvertimeReportData } from './overtimeReportData.js'

const hours = (minutes) => minutesToHours(minutes, 2)

export function buildOvertimeManagementReport({ month, entries, staff, monthName, locale = 'en-AE' }) {
  const report = buildOvertimeReportData(month, entries, staff)
  const arabic = isArabicLocale(locale)
  const dayName = (date, fallback = '') => {
    if (!date) return fallback
    const parsed = new Date(`${date}T12:00:00`)
    return Number.isNaN(parsed.getTime()) ? fallback : new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(parsed)
  }
  const vehicleTypeLabel = (value) => {
    if (!arabic) return value || ''
    const normalized = String(value || '').trim().toLowerCase()
    if (normalized === 'bus') return 'حافلة'
    if (normalized === 'car') return 'سيارة'
    return value || ''
  }
  const activeTotals = report.totals.filter((row) => row.totalMinutes > 0)
  const topStaff = [...activeTotals].sort((a, b) => b.totalMinutes - a.totalMinutes)[0]
  const summaryRows = report.totals.map((row) => ({
    staff: row.driverName,
    role: row.employeeType === 'labor' ? (arabic ? 'عامل' : 'Labor') : (arabic ? 'سائق' : 'Driver'),
    workingHours: hours(row.workingMinutes),
    saturdayHours: hours(row.offDayMinutes),
    totalHours: hours(row.totalMinutes),
    entries: row.entryCount,
  }))
  const detailRows = report.details.map((row) => ({
    staff: row.staffName,
    role: arabic ? (row.role === 'Labor' ? 'عامل' : 'سائق') : row.role,
    vehicleType: vehicleTypeLabel(row.vehicleType),
    plate: row.registration || '',
    date: row.date,
    day: dayName(row.date, row.day),
    type: arabic
      ? (row.overtimeType === 'Saturday off day' ? 'عطلة السبت' : 'إضافي يوم عمل')
      : row.overtimeType,
    start: row.startTime,
    finish: row.finishTime,
    hours: row.hours,
    reason: row.reason,
  }))
  const insights = report.details.length ? [
    {
      text: {
        en: `${activeTotals.length} staff member(s) recorded ${hours(report.insights.totalMinutes)} total overtime hours in ${monthName}.`,
        ar: `سجّل ${activeTotals.length} موظفاً ما مجموعه ${hours(report.insights.totalMinutes)} ساعة عمل إضافي خلال ${monthName}.`,
      }, status: 'neutral',
    },
    topStaff && { text: { en: `${topStaff.driverName} recorded the highest total at ${hours(topStaff.totalMinutes)} hours.`, ar: `سجّل ${topStaff.driverName} أعلى إجمالي بواقع ${hours(topStaff.totalMinutes)} ساعة.` }, status: 'warning' },
    { text: { en: `${hours(report.insights.offDayMinutes)} hours were recorded on Saturday off-days.`, ar: `تم تسجيل ${hours(report.insights.offDayMinutes)} ساعة في أيام السبت.` }, status: report.insights.offDayMinutes > report.insights.workingMinutes ? 'warning' : 'neutral' },
  ].filter(Boolean) : [{ text: { en: `No overtime was recorded for ${monthName}.`, ar: `لم يتم تسجيل ساعات عمل إضافي خلال ${monthName}.` }, status: 'good' }]
  return {
    id: 'fleet-overtime',
    fileName: `FMAC-overtime-${month}`,
    locale,
    orientation: 'landscape',
    title: { en: 'Monthly Overtime Report', ar: 'تقرير العمل الإضافي الشهري' },
    subtitle: { en: 'Bus operations staff register and management analysis', ar: 'سجل موظفي عمليات الحافلات والتحليل الإداري' },
    period: monthName,
    scope: { en: 'Bus drivers and operations laborer', ar: 'سائقو الحافلات وعامل العمليات' },
    kpis: [
      { label: { en: 'Total overtime', ar: 'إجمالي العمل الإضافي' }, value: hours(report.insights.totalMinutes), excelValue: hours(report.insights.totalMinutes), unit: { en: 'h', ar: 'ساعة' }, status: 'neutral' },
      { label: { en: 'Working-day extra', ar: 'إضافي أيام العمل' }, value: hours(report.insights.workingMinutes), excelValue: hours(report.insights.workingMinutes), unit: { en: 'h', ar: 'ساعة' }, status: 'neutral' },
      { label: { en: 'Saturday off-day', ar: 'عطلة السبت' }, value: hours(report.insights.offDayMinutes), excelValue: hours(report.insights.offDayMinutes), unit: { en: 'h', ar: 'ساعة' }, status: report.insights.offDayMinutes ? 'warning' : 'good' },
      { label: { en: 'Staff with overtime', ar: 'الموظفون ذوو عمل إضافي' }, value: activeTotals.length, excelValue: activeTotals.length, status: 'neutral' },
    ],
    sections: [
      { type: 'narrative', title: { en: 'Executive findings', ar: 'أبرز النتائج التنفيذية' }, items: insights },
      {
        type: 'table', title: { en: 'Hours by staff member', ar: 'الساعات حسب الموظف' }, sheetName: { en: 'Staff Summary', ar: 'ملخص الموظفين' }, rows: summaryRows,
        columns: [
          { key: 'staff', label: { en: 'Staff name', ar: 'اسم الموظف' }, excelWidth: 28 },
          { key: 'role', label: { en: 'Role', ar: 'الصفة' }, excelWidth: 16 },
          { key: 'workingHours', label: { en: 'Working-day h', ar: 'ساعات أيام العمل' }, format: 'number', excelWidth: 18, align: 'right' },
          { key: 'saturdayHours', label: { en: 'Saturday h', ar: 'ساعات السبت' }, format: 'number', excelWidth: 16, align: 'right' },
          { key: 'totalHours', label: { en: 'Total h', ar: 'إجمالي الساعات' }, format: 'number', excelWidth: 16, align: 'right' },
          { key: 'entries', label: { en: 'Entries', ar: 'السجلات' }, format: 'number', decimals: 0, excelWidth: 12, align: 'right' },
        ],
        conditionalFormats: [{ key: 'totalHours', rules: [{ type: 'dataBar', color: { argb: 'FF9A7410' }, gradient: true }] }],
      },
      {
        type: 'table', title: { en: 'Overtime register', ar: 'سجل العمل الإضافي' }, sheetName: { en: 'Overtime Register', ar: 'سجل العمل الإضافي' }, rows: detailRows,
        columns: [
          { key: 'staff', label: { en: 'Staff', ar: 'الموظف' }, excelWidth: 25 },
          { key: 'role', label: { en: 'Role', ar: 'الصفة' }, excelWidth: 14 },
          { key: 'vehicleType', label: { en: 'Vehicle type', ar: 'نوع المركبة' }, excelWidth: 18 },
          { key: 'plate', label: { en: 'Plate', ar: 'رقم اللوحة' }, excelWidth: 15 },
          { key: 'date', label: { en: 'Date', ar: 'التاريخ' }, excelWidth: 14 },
          { key: 'day', label: { en: 'Day', ar: 'اليوم' }, excelWidth: 13 },
          { key: 'type', label: { en: 'Type', ar: 'النوع' }, excelWidth: 20 },
          { key: 'start', label: { en: 'Start', ar: 'البداية' }, excelWidth: 11 },
          { key: 'finish', label: { en: 'Finish', ar: 'النهاية' }, excelWidth: 11 },
          { key: 'hours', label: { en: 'Hours', ar: 'الساعات' }, format: 'number', excelWidth: 11, align: 'right' },
          { key: 'reason', label: { en: 'Reason', ar: 'السبب' }, excelWidth: 38 },
        ],
      },
      { type: 'narrative', title: { en: 'Methodology', ar: 'المنهجية' }, items: [{ text: { en: 'Hours are calculated from the recorded start and finish times. Cross-midnight entries are handled as finishing on the following day. Saturday entries are reported separately from normal working-day extra hours.', ar: 'تُحسب الساعات من أوقات البداية والنهاية المسجلة. وتُعامل السجلات العابرة لمنتصف الليل على أنها تنتهي في اليوم التالي. وتُعرض ساعات السبت بشكل منفصل عن الساعات الإضافية لأيام العمل العادية.' }, status: 'neutral' }] },
    ],
    dataQuality: report.details.length ? [] : [{ en: 'No overtime entries were present for the selected month; this report serves as a nil-return confirmation.', ar: 'لا توجد سجلات عمل إضافي للشهر المحدد؛ ويُعد هذا التقرير إثباتاً بعدم وجود ساعات مسجلة.' }],
    sourceNotes: [{ en: 'Source: Fleet overtime manual register.', ar: 'المصدر: سجل العمل الإضافي اليدوي للأسطول.' }],
    metadata: [{ label: { en: 'Register entries', ar: 'عدد السجلات' }, value: report.details.length }],
  }
}

export async function exportOvertimeExcel(options) {
  return downloadManagementWorkbook(buildOvertimeManagementReport(options))
}

export async function exportOvertimePdf(options) {
  const [{ downloadManagementPdf }, { REPORT_PDF_ASSETS }] = await Promise.all([
    import('../../services/reporting/pdfReportBuilder.js'),
    import('../../services/reporting/reportAssets.js'),
  ])
  return downloadManagementPdf(buildOvertimeManagementReport(options), REPORT_PDF_ASSETS)
}
