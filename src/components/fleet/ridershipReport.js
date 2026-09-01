import { downloadManagementWorkbook } from '../../services/reporting/excelReportBuilder.js'
import { isArabicLocale } from '../../services/reporting/reportTheme.js'

const round = (value, digits = 1) => Number.isFinite(Number(value)) ? Math.round(Number(value) * (10 ** digits)) / (10 ** digits) : null

export function buildRidershipManagementReport({
  periodKey,
  periodLabel,
  entries = [],
  stats,
  previousStats,
  classes = [],
  locale = 'en-AE',
}) {
  if (!stats) throw new Error('Ridership statistics are required.')
  const arabic = isArabicLocale(locale)
  const classById = new Map(classes.map((item) => [item.id, item]))
  const className = (item) => arabic
    ? (item?.nameAr || item?.nameEn || 'حصة محذوفة')
    : (item?.nameEn || item?.nameAr || 'Deleted class')
  const classRows = (stats.perClass || []).map((item) => ({
    className: className(item.cls),
    sport: item.cls?.sport || null,
    branch: item.cls?.branch || null,
    sessions: item.sessions,
    riders: item.riders,
    average: round(item.avg),
    capacity: item.capacity,
    utilization: item.utilization == null ? null : round(item.utilization / 100, 4),
  }))
  const dailyRows = entries.map((entry) => {
    const item = entry.classSnapshot || classById.get(entry.classId)
    return {
      date: entry.date || null,
      className: className(item),
      time: item?.time || null,
      riders: Number(entry.riders) || 0,
      notes: entry.notes || null,
      recordedBy: entry.recordedBy || null,
    }
  })
  const previous = Number(previousStats?.totalRiders || 0)
  const trend = previous > 0 ? ((Number(stats.totalRiders) - previous) / previous) * 100 : null
  const utilization = stats.utilization == null ? null : stats.utilization / 100
  const busiest = stats.busiest ? className(stats.busiest.cls) : null
  const quality = []
  if (utilization == null) quality.push({ en: 'Capacity utilization is unavailable because class capacity is not configured.', ar: 'نسبة استخدام السعة غير متاحة لأن سعة الحصص غير محددة.' })
  if (!entries.length) quality.push({ en: 'No ridership entries exist for the selected period.', ar: 'لا توجد سجلات ركاب للفترة المحددة.' })

  return {
    id: 'fleet-ridership',
    fileName: `FMAC-ridership-${periodKey}`,
    locale,
    orientation: 'landscape',
    title: { en: 'Bus Ridership Report', ar: 'تقرير ركاب الحافلات' },
    subtitle: { en: 'Service volume, class utilization and daily ridership register', ar: 'حجم الخدمة واستخدام الحصص والسجل اليومي للركاب' },
    period: periodLabel,
    scope: { en: 'Confirmed bus service classes', ar: 'حصص خدمة الحافلات المعتمدة' },
    kpis: [
      { label: { en: 'Total riders', ar: 'إجمالي الركاب' }, value: stats.totalRiders, excelValue: stats.totalRiders, status: entries.length ? 'neutral' : 'unavailable' },
      { label: { en: 'Recorded sessions', ar: 'الجلسات المسجلة' }, value: stats.sessions, excelValue: stats.sessions, status: entries.length ? 'neutral' : 'unavailable' },
      { label: { en: 'Average per session', ar: 'المتوسط لكل جلسة' }, value: round(stats.avgPerSession), excelValue: round(stats.avgPerSession), status: entries.length ? 'neutral' : 'unavailable' },
      { label: { en: 'Capacity utilization', ar: 'نسبة استخدام السعة' }, value: utilization == null ? null : `${round(utilization * 100, 0)}%`, excelValue: utilization, format: 'percent', status: utilization == null ? 'unavailable' : utilization >= 0.7 ? 'good' : 'warning' },
    ],
    sections: [
      { type: 'narrative', title: { en: 'Executive findings', ar: 'أبرز النتائج التنفيذية' }, items: [
        { text: { en: `${stats.totalRiders} riders were recorded across ${stats.sessions} sessions during ${periodLabel}.`, ar: `تم تسجيل ${stats.totalRiders} راكباً عبر ${stats.sessions} جلسة خلال ${periodLabel}.` }, status: entries.length ? 'neutral' : 'warning' },
        { text: busiest ? { en: `${busiest} was the busiest class, averaging ${round(stats.busiest.avg)} riders per recorded session.`, ar: `كانت ${busiest} الحصة الأكثر ازدحاماً بمتوسط ${round(stats.busiest.avg)} راكباً لكل جلسة مسجلة.` } : { en: 'No busiest-class comparison is available.', ar: 'لا تتوفر مقارنة للحصة الأكثر ازدحاماً.' }, status: busiest ? 'neutral' : 'warning' },
        { text: trend == null ? { en: 'A previous-period comparison is unavailable.', ar: 'لا تتوفر مقارنة مع الفترة السابقة.' } : { en: `Total ridership changed by ${round(trend, 0)}% versus the previous equivalent period.`, ar: `تغير إجمالي الركاب بنسبة ${round(trend, 0)}٪ مقارنة بالفترة السابقة المماثلة.` }, status: trend == null ? 'neutral' : trend >= 0 ? 'good' : 'warning' },
      ] },
      { type: 'table', title: { en: 'Class performance summary', ar: 'ملخص أداء الحصص' }, sheetName: { en: 'Class Summary', ar: 'ملخص الحصص' }, rows: classRows, columns: [
        { key: 'className', label: { en: 'Class', ar: 'الحصة' }, excelWidth: 30 },
        { key: 'sport', label: { en: 'Sport', ar: 'الرياضة' }, excelWidth: 18 },
        { key: 'branch', label: { en: 'Branch', ar: 'الفرع' }, excelWidth: 18 },
        { key: 'sessions', label: { en: 'Sessions', ar: 'الجلسات' }, format: 'number', decimals: 0, excelWidth: 14, align: 'right' },
        { key: 'riders', label: { en: 'Total riders', ar: 'إجمالي الركاب' }, format: 'number', decimals: 0, excelWidth: 16, align: 'right' },
        { key: 'average', label: { en: 'Average riders', ar: 'متوسط الركاب' }, format: 'number', excelWidth: 17, align: 'right' },
        { key: 'capacity', label: { en: 'Capacity', ar: 'السعة' }, format: 'number', decimals: 0, excelWidth: 14, align: 'right' },
        { key: 'utilization', label: { en: 'Utilization', ar: 'نسبة الاستخدام' }, format: 'percent', excelWidth: 16, align: 'right' },
      ], conditionalFormats: [{ key: 'riders', rules: [{ type: 'dataBar', color: { argb: 'FF9A7410' }, gradient: true }] }] },
      { type: 'table', title: { en: 'Daily ridership register', ar: 'السجل اليومي للركاب' }, sheetName: { en: 'Daily Register', ar: 'السجل اليومي' }, rows: dailyRows, columns: [
        { key: 'date', label: { en: 'Date', ar: 'التاريخ' }, excelWidth: 14 },
        { key: 'className', label: { en: 'Class', ar: 'الحصة' }, excelWidth: 30 },
        { key: 'time', label: { en: 'Class time', ar: 'وقت الحصة' }, excelWidth: 16 },
        { key: 'riders', label: { en: 'Riders', ar: 'عدد الركاب' }, format: 'number', decimals: 0, excelWidth: 14, align: 'right' },
        { key: 'notes', label: { en: 'Notes', ar: 'ملاحظات' }, excelWidth: 40 },
        { key: 'recordedBy', label: { en: 'Recorded by', ar: 'سجل بواسطة' }, excelWidth: 28 },
      ], pdfRowsPerPage: 14 },
      { type: 'narrative', title: { en: 'Methodology', ar: 'المنهجية' }, items: [{ text: { en: 'Totals use manually saved ridership entries for the selected period. Utilization compares recorded riders with configured class capacity only where capacity exists.', ar: 'تستخدم الإجماليات سجلات الركاب المحفوظة يدوياً للفترة المحددة. تقارن نسبة الاستخدام الركاب المسجلين بسعة الحصة المحددة فقط عند توفرها.' }, status: 'neutral' }] },
    ],
    dataQuality: quality,
    sourceNotes: [{ en: 'Source: FMAC fleet ridership counts and class schedule in Firestore.', ar: 'المصدر: سجلات أعداد ركاب الأسطول وجدول الحصص في فايرستور.' }],
    metadata: [
      { label: { en: 'Entry rows', ar: 'صفوف الإدخال' }, value: entries.length },
      { label: { en: 'Classes with activity', ar: 'الحصص ذات النشاط' }, value: classRows.length },
      { label: { en: 'Previous-period riders', ar: 'ركاب الفترة السابقة' }, value: previousStats?.totalRiders ?? null },
    ],
  }
}

export async function exportRidershipExcel(options) {
  return downloadManagementWorkbook(buildRidershipManagementReport(options))
}

export async function exportRidershipPdf(options) {
  const [{ downloadManagementPdf }, { REPORT_PDF_ASSETS }] = await Promise.all([
    import('../../services/reporting/pdfReportBuilder.js'),
    import('../../services/reporting/reportAssets.js'),
  ])
  return downloadManagementPdf(buildRidershipManagementReport(options), REPORT_PDF_ASSETS)
}
