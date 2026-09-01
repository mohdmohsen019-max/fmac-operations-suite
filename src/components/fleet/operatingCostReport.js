import { downloadManagementWorkbook } from '../../services/reporting/excelReportBuilder.js'
import { isArabicLocale } from '../../services/reporting/reportTheme.js'

const finite = (value) => value == null || value === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null
const rounded = (value, digits = 2) => {
  const number = finite(value)
  return number == null ? null : Math.round(number * (10 ** digits)) / (10 ** digits)
}

const categoryLabel = (category, arabic) => ({
  fuel: arabic ? 'الوقود' : 'Fuel',
  maintenance: arabic ? 'الصيانة' : 'Maintenance',
  fines: arabic ? 'المخالفات المرورية' : 'Traffic fines',
}[category] || (arabic ? 'غير متاح' : 'Unavailable'))

export function buildOperatingCostManagementReport({
  result,
  periodLabel,
  locale = 'en-AE',
  includedMonthLabels = [],
  missingMonthLabels = [],
  distanceError = false,
}) {
  if (!result?.summary || !Array.isArray(result?.rows)) throw new Error('Operating-cost result is required.')
  const arabic = isArabicLocale(locale)
  const { summary } = result
  const source = summary.primaryCostCategory
  const rankedRows = result.rows.map((row) => ({
    rank: row.rank,
    plate: row.registration,
    driver: row.driverName || null,
    distanceKm: rounded(row.distanceKm, 1),
    fuelCost: rounded(row.fuelCost),
    maintenanceCost: rounded(row.maintenanceCost),
    fineCost: rounded(row.fineCost),
    totalCost: rounded(row.totalCost),
    costPerKm: rounded(row.costPerKm, 3),
    maintenanceJobs: row.maintenanceEvents,
    fineCount: row.fineCount,
  }))
  const costMix = [
    { category: arabic ? 'الوقود' : 'Fuel', amount: rounded(summary.totalFuel), share: summary.totalCost ? rounded(summary.totalFuel / summary.totalCost, 4) : null },
    { category: arabic ? 'الصيانة' : 'Maintenance', amount: rounded(summary.totalMaintenance), share: summary.totalCost ? rounded(summary.totalMaintenance / summary.totalCost, 4) : null },
    { category: arabic ? 'المخالفات المرورية' : 'Traffic fines', amount: rounded(summary.totalFines), share: summary.totalCost ? rounded(summary.totalFines / summary.totalCost, 4) : null },
  ]
  const quality = []
  if (!summary.fuelAvailable) quality.push({
    en: 'No official per-vehicle fuel allocation exists in this period. Total operating cost and ranking are withheld.',
    ar: 'لا يتوفر توزيع رسمي للوقود حسب المركبة خلال هذه الفترة، ولذلك تم حجب إجمالي تكلفة التشغيل والترتيب.',
  })
  if (missingMonthLabels.length) quality.push({
    en: `Partial period. Missing months excluded from every cost source: ${missingMonthLabels.join(', ')}.`,
    ar: `الفترة جزئية. تم استبعاد الأشهر غير المتوفرة من جميع مصادر التكلفة: ${missingMonthLabels.join('، ')}.`,
  })
  if (distanceError || summary.distanceCoveredBusCount < summary.busCount) quality.push({
    en: `Distance coverage is ${summary.distanceCoveredBusCount} of ${summary.busCount} buses. AED/km is unavailable where mileage is missing.`,
    ar: `تغطي بيانات المسافة ${summary.distanceCoveredBusCount} من أصل ${summary.busCount} حافلة. لا تعرض تكلفة الكيلومتر عند غياب المسافة.`,
  })

  return {
    id: 'fleet-operating-cost',
    fileName: `FMAC-operating-cost-${String(periodLabel || 'period').replace(/\s+/g, '-')}`,
    locale,
    orientation: 'landscape',
    title: { en: 'Bus Operating Cost Report', ar: 'تقرير تكلفة تشغيل الحافلات' },
    subtitle: {
      en: 'Verified fuel, maintenance and traffic-fine cost by canonical bus',
      ar: 'تكلفة الوقود والصيانة والمخالفات المرورية الموثقة حسب كل حافلة',
    },
    period: periodLabel || (arabic ? 'غير محدد' : 'Not specified'),
    scope: { en: 'Confirmed bus fleet only', ar: 'أسطول الحافلات المعتمد فقط' },
    kpis: [
      { label: { en: 'Fleet operating cost', ar: 'تكلفة تشغيل الأسطول' }, value: rounded(summary.totalCost), excelValue: rounded(summary.totalCost), format: 'currency', unit: { en: 'AED', ar: 'درهم' }, status: summary.totalCost == null ? 'unavailable' : 'neutral' },
      { label: { en: 'Average per bus', ar: 'المتوسط لكل حافلة' }, value: rounded(summary.averagePerBus), excelValue: rounded(summary.averagePerBus), format: 'currency', unit: { en: 'AED', ar: 'درهم' }, status: summary.averagePerBus == null ? 'unavailable' : 'neutral' },
      { label: { en: 'Highest-cost bus', ar: 'الحافلة الأعلى تكلفة' }, value: summary.highestCostBus?.registration || null, note: summary.highestCostBus ? { en: `${rounded(summary.highestCostBus.totalCost)} AED`, ar: `${rounded(summary.highestCostBus.totalCost)} درهم` } : null, status: summary.highestCostBus ? 'warning' : 'unavailable' },
      { label: { en: 'Distance coverage', ar: 'تغطية المسافة' }, value: summary.distanceCoveredBusCount, excelValue: summary.distanceCoveredBusCount, unit: { en: `of ${summary.busCount}`, ar: `من ${summary.busCount}` }, status: summary.distanceCoveredBusCount === summary.busCount ? 'good' : 'warning' },
    ],
    sections: [
      { type: 'narrative', title: { en: 'Executive findings', ar: 'أبرز النتائج التنفيذية' }, items: [
        { text: summary.totalCost == null ? { en: 'The operating-cost total is unavailable because the official fuel allocation is missing.', ar: 'إجمالي تكلفة التشغيل غير متاح بسبب غياب التوزيع الرسمي للوقود.' } : { en: `The verified operating cost is ${rounded(summary.totalCost)} AED across ${summary.comparableBusCount} buses.`, ar: `بلغت تكلفة التشغيل الموثقة ${rounded(summary.totalCost)} درهم لعدد ${summary.comparableBusCount} حافلة.` }, status: summary.totalCost == null ? 'warning' : 'neutral' },
        { text: { en: `${categoryLabel(source?.id, false)} is the largest recorded cost source at ${rounded(source?.value) ?? 0} AED.`, ar: `${categoryLabel(source?.id, true)} هو أكبر مصدر تكلفة مسجل بقيمة ${rounded(source?.value) ?? 0} درهم.` }, status: 'neutral' },
        { text: summary.highestCostBus ? { en: `${summary.highestCostBus.registration} ranks highest at ${rounded(summary.highestCostBus.totalCost)} AED.`, ar: `تحتل الحافلة ${summary.highestCostBus.registration} المرتبة الأعلى بتكلفة ${rounded(summary.highestCostBus.totalCost)} درهم.` } : { en: 'No bus ranking is available for this period.', ar: 'لا يتوفر ترتيب للحافلات خلال هذه الفترة.' }, status: summary.highestCostBus ? 'warning' : 'neutral' },
      ] },
      { type: 'table', title: { en: 'Cost composition', ar: 'توزيع التكلفة' }, sheetName: { en: 'Cost Composition', ar: 'توزيع التكلفة' }, rows: costMix, columns: [
        { key: 'category', label: { en: 'Cost source', ar: 'مصدر التكلفة' }, excelWidth: 28 },
        { key: 'amount', label: { en: 'Amount', ar: 'المبلغ' }, format: 'currency', excelWidth: 20, align: 'right' },
        { key: 'share', label: { en: 'Share of total', ar: 'النسبة من الإجمالي' }, format: 'percent', excelWidth: 20, align: 'right' },
      ], conditionalFormats: [{ key: 'amount', rules: [{ type: 'dataBar', color: { argb: 'FF9A7410' }, gradient: true }] }] },
      { type: 'table', title: { en: 'Bus operating-cost ranking', ar: 'ترتيب تكلفة تشغيل الحافلات' }, sheetName: { en: 'Bus Ranking', ar: 'ترتيب الحافلات' }, rows: rankedRows, columns: [
        { key: 'rank', label: { en: '#', ar: '#' }, format: 'number', decimals: 0, excelWidth: 7, align: 'center' },
        { key: 'plate', label: { en: 'Plate number', ar: 'رقم اللوحة' }, excelWidth: 17 },
        { key: 'driver', label: { en: 'Current driver', ar: 'السائق الحالي' }, excelWidth: 24 },
        { key: 'distanceKm', label: { en: 'Distance (km)', ar: 'المسافة (كم)' }, format: 'number', excelWidth: 17, align: 'right' },
        { key: 'fuelCost', label: { en: 'Fuel', ar: 'الوقود' }, format: 'currency', excelWidth: 16, align: 'right' },
        { key: 'maintenanceCost', label: { en: 'Maintenance', ar: 'الصيانة' }, format: 'currency', excelWidth: 18, align: 'right' },
        { key: 'fineCost', label: { en: 'Fines', ar: 'المخالفات' }, format: 'currency', excelWidth: 16, align: 'right' },
        { key: 'totalCost', label: { en: 'Total cost', ar: 'إجمالي التكلفة' }, format: 'currency', excelWidth: 18, align: 'right' },
        { key: 'costPerKm', label: { en: 'Cost/km', ar: 'التكلفة/كم' }, format: 'number', excelWidth: 15, align: 'right' },
        { key: 'maintenanceJobs', label: { en: 'Maintenance jobs', ar: 'أعمال الصيانة' }, format: 'number', decimals: 0, excelWidth: 17, align: 'right' },
        { key: 'fineCount', label: { en: 'Fine count', ar: 'عدد المخالفات' }, format: 'number', decimals: 0, excelWidth: 15, align: 'right' },
      ], conditionalFormats: [{ key: 'totalCost', rules: [{ type: 'dataBar', color: { argb: 'FF9A7410' }, gradient: true }] }] },
      { type: 'narrative', title: { en: 'Methodology', ar: 'المنهجية' }, items: [
        { text: { en: 'Tracked operating cost equals official fuel allocation plus completed maintenance invoices plus recorded traffic-fine amounts.', ar: 'تساوي تكلفة التشغيل المتتبعة التوزيع الرسمي للوقود مضافاً إليه فواتير الصيانة المنجزة وقيم المخالفات المرورية المسجلة.' }, status: 'neutral' },
        { text: { en: 'Salaries, insurance and depreciation are outside this report.', ar: 'لا يشمل هذا التقرير الرواتب أو التأمين أو الإهلاك.' }, status: 'neutral' },
        { text: { en: 'Fine payment status is not used.', ar: 'لا تستخدم حالة سداد المخالفات.' }, status: 'neutral' },
      ] },
    ],
    dataQuality: quality,
    sourceNotes: [
      { en: 'Sources: official ADNOC statements, Firestore maintenance records, FMAC Traffic Fines Register and canonical de-duplicated Cartrack trips.', ar: 'المصادر: كشوف أدنوك الرسمية وسجلات الصيانة في فايرستور وسجل المخالفات المرورية ورحلات كارترك الموحدة بعد إزالة التكرار.' },
      { en: `Included months: ${includedMonthLabels.join(', ') || 'none'}.`, ar: `الأشهر المشمولة: ${includedMonthLabels.join('، ') || 'لا يوجد'}.` },
    ],
    metadata: [
      { label: { en: 'Registered buses', ar: 'الحافلات المسجلة' }, value: summary.busCount },
      { label: { en: 'Ranked buses', ar: 'الحافلات المرتبة' }, value: summary.comparableBusCount },
      { label: { en: 'Verified months', ar: 'الأشهر الموثقة' }, value: `${summary.includedPeriodKeys.length}/${summary.expectedPeriodKeys.length}` },
    ],
  }
}

export async function exportOperatingCostExcel(options) {
  return downloadManagementWorkbook(buildOperatingCostManagementReport(options))
}

export async function exportOperatingCostPdf(options) {
  const [{ downloadManagementPdf }, { REPORT_PDF_ASSETS }] = await Promise.all([
    import('../../services/reporting/pdfReportBuilder.js'),
    import('../../services/reporting/reportAssets.js'),
  ])
  return downloadManagementPdf(buildOperatingCostManagementReport(options), REPORT_PDF_ASSETS)
}
