import { downloadManagementWorkbook } from '../../services/reporting/excelReportBuilder.js'
import { isArabicLocale } from '../../services/reporting/reportTheme.js'

const rounded = (value, digits = 2) => Math.round((Number(value) || 0) * (10 ** digits)) / (10 ** digits)

const TYPE_LABELS = {
  unknown: { en: 'Not specified', ar: 'غير محدد' },
  speeding: { en: 'Speeding', ar: 'تجاوز السرعة' },
  parking: { en: 'Illegal parking', ar: 'وقوف خاطئ' },
  red_light: { en: 'Running a red light', ar: 'تجاوز إشارة' },
  phone: { en: 'Phone use', ar: 'استخدام الهاتف' },
  seatbelt: { en: 'Seatbelt', ar: 'حزام الأمان' },
  other: { en: 'Other', ar: 'أخرى' },
}

export function buildTrafficFinesManagementReport({
  fines = [], totals = {}, scope = 'all', driver = 'all', periodLabel,
  from = '', to = '', locale = 'en-AE', resolveDriver = (fine) => fine.driverName || '',
  vehicleLabel = (registration) => registration,
}) {
  const arabic = isArabicLocale(locale)
  const scopeLabel = scope === 'buses'
    ? { en: 'Buses', ar: 'الحافلات' }
    : scope === 'others'
      ? { en: 'Other vehicles', ar: 'المركبات الأخرى' }
      : { en: 'All vehicles', ar: 'جميع المركبات' }
  const rows = fines.map((fine) => {
    const type = TYPE_LABELS[fine.fineType] || TYPE_LABELS.unknown
    return {
      date: fine.date || null,
      driver: resolveDriver(fine) || null,
      vehicle: fine.vehicleReg ? vehicleLabel(fine.vehicleReg) : null,
      plate: fine.vehicleReg || null,
      violation: arabic ? type.ar : type.en,
      details: fine.details || fine.notes || null,
      amount: rounded(fine.amountAed),
      reference: fine.referenceNo || null,
      evidence: fine.evidence?.name || null,
    }
  })
  const count = Number(totals.count ?? fines.length)
  const total = rounded(totals.totalAed ?? fines.reduce((sum, fine) => sum + (Number(fine.amountAed) || 0), 0))
  const average = count ? rounded(total / count) : 0
  const period = periodLabel || (arabic ? 'كل التواريخ المسجلة' : 'All recorded dates')
  const nilText = driver !== 'all'
    ? { en: `No traffic fines were recorded for ${driver} during ${period}.`, ar: `لم تسجل أي مخالفات مرورية على ${driver} خلال ${period}.` }
    : scope === 'buses'
      ? { en: `No traffic fines were recorded against bus drivers or bus vehicles during ${period}.`, ar: `لم تسجل أي مخالفات مرورية على سائقي الحافلات أو الحافلات خلال ${period}.` }
      : scope === 'others'
        ? { en: `No traffic fines were recorded against other-vehicle drivers or vehicles during ${period}.`, ar: `لم تسجل أي مخالفات مرورية على سائقي المركبات الأخرى أو مركباتهم خلال ${period}.` }
        : { en: `No traffic fines were recorded during ${period}.`, ar: `لم تسجل أي مخالفات مرورية خلال ${period}.` }

  return {
    id: 'traffic-fines-period',
    fileName: `FMAC-traffic-fines-${scope}-${String(period).replace(/\s+/g, '-')}`,
    locale,
    orientation: 'landscape',
    title: { en: 'Traffic Fines Period Report', ar: 'تقرير المخالفات المرورية للفترة المحددة' },
    subtitle: count ? { en: 'Recorded violations, affected vehicles and management insights', ar: 'المخالفات المسجلة والمركبات المتأثرة والمؤشرات الإدارية' } : { en: 'Formal nil-return verification for the selected period', ar: 'إثبات رسمي بعدم تسجيل مخالفات للفترة المحددة' },
    period,
    scope: scopeLabel,
    kpis: [
      { label: { en: 'Recorded fines', ar: 'المخالفات المسجلة' }, value: count, excelValue: count, status: count ? 'warning' : 'good' },
      { label: { en: 'Total value', ar: 'إجمالي القيمة' }, value: total, excelValue: total, format: 'currency', unit: { en: 'AED', ar: 'درهم' }, status: count ? 'warning' : 'good' },
      { label: { en: 'Average fine', ar: 'متوسط المخالفة' }, value: average, excelValue: average, format: 'currency', unit: { en: 'AED', ar: 'درهم' }, status: count ? 'neutral' : 'good' },
      { label: { en: 'Vehicles affected', ar: 'المركبات المتأثرة' }, value: Number(totals.affectedVehicles || 0), excelValue: Number(totals.affectedVehicles || 0), status: totals.affectedVehicles ? 'warning' : 'good' },
    ],
    sections: [
      { type: 'narrative', title: count ? { en: 'Executive findings', ar: 'أبرز النتائج التنفيذية' } : { en: 'Period verification', ar: 'التحقق من الفترة' }, items: count ? [
        { text: { en: `${count} traffic fine(s) worth ${total} AED were recorded during ${period}.`, ar: `تم تسجيل ${count} مخالفة مرورية بقيمة ${total} درهم خلال ${period}.` }, status: 'warning' },
        { text: { en: `${Number(totals.affectedVehicles || 0)} vehicle(s) were affected; ${Number(totals.repeatVehicles || 0)} had repeat fines.`, ar: `تأثرت ${Number(totals.affectedVehicles || 0)} مركبة، منها ${Number(totals.repeatVehicles || 0)} مركبة عليها مخالفات متكررة.` }, status: totals.repeatVehicles ? 'bad' : 'neutral' },
        ...(totals.topVehicle ? [{ text: { en: `${vehicleLabel(totals.topVehicle[0])} recorded the highest frequency with ${totals.topVehicle[1]} fine(s).`, ar: `سجلت المركبة ${vehicleLabel(totals.topVehicle[0])} أعلى تكرار بعدد ${totals.topVehicle[1]} مخالفة.` }, status: 'warning' }] : []),
      ] : [{ text: nilText, status: 'good' }] },
      { type: 'table', title: { en: 'Traffic fines register', ar: 'سجل المخالفات المرورية' }, sheetName: { en: 'Fines Register', ar: 'سجل المخالفات' }, rows, emptyText: nilText, autoRowHeight: true, columns: [
        { key: 'date', label: { en: 'Date', ar: 'التاريخ' }, excelWidth: 14 },
        { key: 'driver', label: { en: 'Driver', ar: 'السائق' }, excelWidth: 24 },
        { key: 'vehicle', label: { en: 'Vehicle', ar: 'المركبة' }, excelWidth: 24 },
        { key: 'plate', label: { en: 'Plate', ar: 'رقم اللوحة' }, excelWidth: 16 },
        { key: 'violation', label: { en: 'Violation', ar: 'المخالفة' }, excelWidth: 20 },
        { key: 'details', label: { en: 'Details', ar: 'التفاصيل' }, excelWidth: 45 },
        { key: 'amount', label: { en: 'Amount', ar: 'المبلغ' }, format: 'currency', excelWidth: 16, align: 'right' },
        { key: 'reference', label: { en: 'Reference', ar: 'الرقم المرجعي' }, excelWidth: 18 },
        { key: 'evidence', label: { en: 'Evidence file', ar: 'ملف الإثبات' }, excelWidth: 28 },
      ], conditionalFormats: [{ key: 'amount', rules: [{ type: 'dataBar', color: { argb: 'FFC93532' }, gradient: true }] }] },
      { type: 'narrative', title: { en: 'Reporting basis', ar: 'أساس التقرير' }, items: [{ text: {
        en: 'This report uses the current FMAC Traffic Fines Register, selected fleet scope, driver filter and reporting period. Fine payment status is deliberately excluded.',
        ar: 'يستخدم هذا التقرير سجل المخالفات المرورية الحالي ونطاق الأسطول ومرشح السائق والفترة المحددة. تم استبعاد حالة سداد المخالفات عمداً.',
      }, status: 'neutral' }] },
    ],
    dataQuality: count === 0 ? [{ en: 'A nil return confirms that no matching records existed at the generation time; it does not certify external police systems.', ar: 'يثبت التقرير الصفري عدم وجود سجلات مطابقة وقت الإنشاء، ولا يعد تصديقاً على أنظمة الشرطة الخارجية.' }] : [],
    sourceNotes: [{ en: 'Source: FMAC Traffic Fines Register in Firestore.', ar: 'المصدر: سجل المخالفات المرورية في فايرستور.' }],
    metadata: [
      { label: { en: 'From', ar: 'من' }, value: from || (arabic ? 'أول تاريخ مسجل' : 'First recorded date') },
      { label: { en: 'To', ar: 'إلى' }, value: to || (arabic ? 'آخر تاريخ مسجل' : 'Latest recorded date') },
      { label: { en: 'Driver filter', ar: 'مرشح السائق' }, value: driver === 'all' ? (arabic ? 'جميع السائقين' : 'All drivers') : driver },
    ],
  }
}

export async function exportTrafficFinesExcel(options) {
  return downloadManagementWorkbook(buildTrafficFinesManagementReport(options))
}

export async function exportTrafficFinesPdf(options) {
  const [{ downloadManagementPdf }, { REPORT_PDF_ASSETS }] = await Promise.all([
    import('../../services/reporting/pdfReportBuilder.js'),
    import('../../services/reporting/reportAssets.js'),
  ])
  return downloadManagementPdf(buildTrafficFinesManagementReport(options), REPORT_PDF_ASSETS)
}
