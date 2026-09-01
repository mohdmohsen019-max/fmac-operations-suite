import { downloadManagementWorkbook } from '../../../services/reporting/excelReportBuilder.js'
import { formatReportNumber, isArabicLocale } from '../../../services/reporting/reportTheme.js'

const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']

const finite = (value) => value == null || value === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null
const rounded = (value, digits = 2) => {
  const parsed = finite(value)
  return parsed == null ? null : Math.round(parsed * (10 ** digits)) / (10 ** digits)
}

const scopeLabel = (scope) => ({
  buses: { en: 'Confirmed bus fleet', ar: 'أسطول الحافلات المعتمد' },
  others: { en: 'Other club vehicles', ar: 'مركبات النادي الأخرى' },
  all: { en: 'All club vehicles', ar: 'جميع مركبات النادي' },
})[scope] || { en: 'Selected fleet scope', ar: 'نطاق الأسطول المحدد' }

const deltaDisplay = (delta, locale, suffix = '%') => {
  const value = finite(delta)
  if (value == null) return isArabicLocale(locale) ? 'غير متاح' : 'Unavailable'
  return `${value > 0 ? '+' : ''}${formatReportNumber(value, locale, { maximumFractionDigits: 1 })}${suffix}`
}

export function buildFuelManagementReport({
  month, year, fleet, vehicles = [], decomposition, insights = [], trend = [],
  locale = 'en-AE', scope = 'buses', currency = 'AED', preparedBy,
}) {
  const arabic = isArabicLocale(locale)
  const current = fleet?.current || {}
  const previous = fleet?.previous || null
  const deltas = fleet?.deltas || {}
  const monthLabel = `${arabic ? MONTHS_AR[month - 1] : MONTHS_EN[month - 1]} ${year}`
  const availableDistanceRows = vehicles.filter((vehicle) => finite(vehicle.km) > 0)
  const totalRows = vehicles.length
  const distanceCoverage = totalRows ? Math.round((availableDistanceRows.length / totalRows) * 100) : 0
  const quality = []
  if (!previous) quality.push({ en: 'A prior-period statement was not available; period-over-period variances are withheld.', ar: 'لم يتوفر بيان للفترة السابقة؛ لذلك لم يتم عرض فروقات المقارنة.' })
  if (distanceCoverage < 100) quality.push({
    en: `Distance coverage is ${distanceCoverage}% (${availableDistanceRows.length} of ${totalRows} vehicles). Efficiency indicators exclude vehicles without verified distance.`,
    ar: `تغطية بيانات المسافة ${distanceCoverage}٪ (${availableDistanceRows.length} من أصل ${totalRows} مركبة). مؤشرات الكفاءة تستبعد المركبات التي لا تتوفر لها مسافة موثقة.`,
  })
  const reportInsights = insights.slice(0, 7).map((item) => ({
    text: { en: item.en || item.ar || String(item), ar: item.ar || item.en || String(item) },
    status: item.type === 'positive' ? 'good' : item.type === 'warning' ? 'warning' : 'neutral',
  }))
  if (decomposition?.priceEffect != null) {
    reportInsights.unshift({
      text: {
        en: `The total fuel bill changed by ${rounded(decomposition.totalDelta, 0)?.toLocaleString('en-AE')} AED: ${rounded(decomposition.priceEffect, 0)?.toLocaleString('en-AE')} AED from price movement and ${rounded(decomposition.volumeEffect, 0)?.toLocaleString('en-AE')} AED from volume movement.`,
        ar: `تغيرت فاتورة الوقود الإجمالية بمقدار ${rounded(decomposition.totalDelta, 0)?.toLocaleString('ar-AE')} درهم: منها ${rounded(decomposition.priceEffect, 0)?.toLocaleString('ar-AE')} درهم بسبب تغير السعر و${rounded(decomposition.volumeEffect, 0)?.toLocaleString('ar-AE')} درهم بسبب تغير الكمية.`,
      },
      status: finite(decomposition.totalDelta) > 0 ? 'warning' : 'good',
    })
  }

  const vehicleRows = vehicles.map((vehicle, index) => ({
    rank: index + 1,
    plate: vehicle.plate,
    distanceKm: rounded(vehicle.km, 0),
    litres: rounded(vehicle.litres, 1),
    consumption: finite(vehicle.km) > 0 ? rounded(vehicle.litresPer100km, 1) : null,
    cost: rounded(vehicle.cost, 2),
    costPerKm: finite(vehicle.km) > 0 ? rounded(vehicle.costPerKm, 2) : null,
    change: finite(vehicle.deltaL100?.pct),
    assessment: vehicle.verdict === 'improving'
      ? (arabic ? 'تحسن' : 'Improving')
      : vehicle.verdict === 'worsening' ? (arabic ? 'تراجع' : 'Worsening') : (arabic ? 'مستقر / غير متاح' : 'Stable / unavailable'),
  }))
  const trendRows = trend.map((entry) => ({
    period: `${arabic ? MONTHS_AR[entry.month - 1] : MONTHS_EN[entry.month - 1]} ${entry.year}`,
    cost: rounded(entry.totalCost, 2),
    litres: rounded(entry.totalLitres, 1),
    price: finite(entry.pricePerLitre) > 0
      ? rounded(entry.pricePerLitre, 3)
      : finite(entry.totalLitres) > 0 ? rounded(Number(entry.totalCost) / Number(entry.totalLitres), 3) : null,
  }))
  const comparisonRows = [
    ['totalCost', { en: 'Total fuel cost', ar: 'إجمالي تكلفة الوقود' }, current.totalCost, previous?.totalCost, deltas.totalCost?.pct, 'currency'],
    ['totalLitres', { en: 'Fuel volume', ar: 'كمية الوقود' }, current.totalLitres, previous?.totalLitres, deltas.totalLitres?.pct, 'number'],
    ['totalKm', { en: 'Verified distance', ar: 'المسافة الموثقة' }, current.totalKm, previous?.totalKm, deltas.totalKm?.pct, 'number'],
    ['costPerKm', { en: 'Cost per kilometre', ar: 'التكلفة لكل كيلومتر' }, current.costPerKm, previous?.costPerKm, deltas.costPerKm?.pct, 'currency'],
    ['litresPer100km', { en: 'Consumption', ar: 'الاستهلاك' }, current.litresPer100km, previous?.litresPer100km, deltas.litresPer100km?.pct, 'number'],
    ['pricePerLitre', { en: 'Price per litre', ar: 'سعر اللتر' }, current.pricePerLitre, previous?.pricePerLitre, deltas.pricePerLitre?.pct, 'currency'],
  ].map(([key, label, actual, prior, change, format]) => ({ key, metric: arabic ? label.ar : label.en, actual: rounded(actual, 2), previous: rounded(prior, 2), change: finite(change), changeDisplay: deltaDisplay(change, locale), format }))

  return {
    id: 'fuel-performance',
    fileName: `FMAC-fuel-${year}-${String(month).padStart(2, '0')}-${scope}`,
    locale,
    orientation: 'landscape',
    title: { en: 'Fuel Performance Report', ar: 'تقرير أداء الوقود' },
    subtitle: { en: 'Cost, consumption, efficiency and period movement', ar: 'التكلفة والاستهلاك والكفاءة وحركة الفترة' },
    period: monthLabel,
    scope: scopeLabel(scope),
    preparedBy: preparedBy || { en: 'Operations Department', ar: 'إدارة العمليات' },
    kpis: [
      { label: { en: 'Total fuel cost', ar: 'إجمالي تكلفة الوقود' }, value: rounded(current.totalCost, 2), excelValue: rounded(current.totalCost, 2), display: { en: `${formatReportNumber(current.totalCost, locale, { maximumFractionDigits: 0 })} ${currency}`, ar: `${formatReportNumber(current.totalCost, locale, { maximumFractionDigits: 0 })} درهم` }, status: finite(deltas.totalCost?.pct) > 0 ? 'warning' : 'good', note: { en: deltaDisplay(deltas.totalCost?.pct, locale), ar: deltaDisplay(deltas.totalCost?.pct, locale) } },
      { label: { en: 'Fuel volume', ar: 'كمية الوقود' }, value: rounded(current.totalLitres, 1), excelValue: rounded(current.totalLitres, 1), display: { en: `${formatReportNumber(current.totalLitres, locale, { maximumFractionDigits: 0 })} L`, ar: `${formatReportNumber(current.totalLitres, locale, { maximumFractionDigits: 0 })} لتر` }, status: 'neutral', note: { en: deltaDisplay(deltas.totalLitres?.pct, locale), ar: deltaDisplay(deltas.totalLitres?.pct, locale) } },
      { label: { en: 'Verified distance', ar: 'المسافة الموثقة' }, value: rounded(current.totalKm, 0), excelValue: rounded(current.totalKm, 0), display: { en: finite(current.totalKm) > 0 ? `${formatReportNumber(current.totalKm, locale, { maximumFractionDigits: 0 })} km` : 'Unavailable', ar: finite(current.totalKm) > 0 ? `${formatReportNumber(current.totalKm, locale, { maximumFractionDigits: 0 })} كم` : 'غير متاح' }, status: finite(current.totalKm) > 0 ? 'good' : 'unavailable', note: { en: `${distanceCoverage}% vehicle coverage`, ar: `تغطية المركبات ${distanceCoverage}٪` } },
      { label: { en: 'Consumption', ar: 'الاستهلاك' }, value: rounded(current.litresPer100km, 1), excelValue: rounded(current.litresPer100km, 1), display: { en: finite(current.litresPer100km) > 0 ? `${formatReportNumber(current.litresPer100km, locale, { maximumFractionDigits: 1 })} L/100 km` : 'Unavailable', ar: finite(current.litresPer100km) > 0 ? `${formatReportNumber(current.litresPer100km, locale, { maximumFractionDigits: 1 })} لتر/100 كم` : 'غير متاح' }, status: finite(deltas.litresPer100km?.pct) > 0 ? 'warning' : 'good', note: { en: deltaDisplay(deltas.litresPer100km?.pct, locale), ar: deltaDisplay(deltas.litresPer100km?.pct, locale) } },
    ],
    sections: [
      { type: 'narrative', title: { en: 'Executive findings', ar: 'أبرز النتائج التنفيذية' }, items: reportInsights.length ? reportInsights : [{ text: { en: 'No material exception was identified in the selected period.', ar: 'لم يتم رصد استثناء جوهري في الفترة المحددة.' }, status: 'neutral' }] },
      {
        type: 'table', title: { en: 'Period comparison', ar: 'مقارنة الفترة' }, sheetName: { en: 'Period Comparison', ar: 'مقارنة الفترة' }, rows: comparisonRows,
        columns: [
          { key: 'metric', label: { en: 'Metric', ar: 'المؤشر' }, excelWidth: 28 },
          { key: 'actual', label: { en: 'Current', ar: 'الحالي' }, format: 'number', excelWidth: 17, align: 'right' },
          { key: 'previous', label: { en: 'Previous', ar: 'السابق' }, format: 'number', excelWidth: 17, align: 'right' },
          { key: 'changeDisplay', label: { en: 'Change', ar: 'التغير' }, excelWidth: 15, align: 'right' },
        ],
      },
      {
        type: 'table', title: { en: 'Vehicle efficiency and cost detail', ar: 'تفاصيل كفاءة وتكلفة المركبات' }, sheetName: { en: 'Vehicle Detail', ar: 'تفاصيل المركبات' }, rows: vehicleRows,
        emptyText: { en: 'No vehicle fuel allocations match the selected filters.', ar: 'لا توجد تخصيصات وقود للمركبات مطابقة للفلاتر المحددة.' },
        columns: [
          { key: 'rank', label: { en: '#', ar: '#' }, format: 'number', decimals: 0, excelWidth: 7, align: 'center' },
          { key: 'plate', label: { en: 'Plate', ar: 'رقم اللوحة' }, excelWidth: 16 },
          { key: 'distanceKm', label: { en: 'Distance (km)', ar: 'المسافة (كم)' }, format: 'number', decimals: 0, excelWidth: 16, align: 'right' },
          { key: 'litres', label: { en: 'Litres', ar: 'اللترات' }, format: 'number', excelWidth: 14, align: 'right' },
          { key: 'consumption', label: { en: 'L/100 km', ar: 'لتر/100 كم' }, format: 'number', excelWidth: 15, align: 'right' },
          { key: 'cost', label: { en: 'Fuel cost', ar: 'تكلفة الوقود' }, format: 'currency', excelWidth: 17, align: 'right' },
          { key: 'costPerKm', label: { en: 'Cost/km', ar: 'التكلفة/كم' }, format: 'currency', excelWidth: 15, align: 'right' },
          { key: 'assessment', label: { en: 'Assessment', ar: 'التقييم' }, excelWidth: 20 },
        ],
        conditionalFormats: [{ key: 'cost', rules: [{ type: 'dataBar', color: { argb: 'FF9A7410' }, gradient: true }] }],
      },
      {
        type: 'table', title: { en: 'Monthly fuel trend', ar: 'اتجاه الوقود الشهري' }, sheetName: { en: 'Monthly Trend', ar: 'الاتجاه الشهري' }, rows: trendRows,
        columns: [
          { key: 'period', label: { en: 'Period', ar: 'الفترة' }, excelWidth: 18 },
          { key: 'cost', label: { en: 'Fuel cost', ar: 'تكلفة الوقود' }, format: 'currency', excelWidth: 18, align: 'right' },
          { key: 'litres', label: { en: 'Litres', ar: 'اللترات' }, format: 'number', excelWidth: 16, align: 'right' },
          { key: 'price', label: { en: 'Price/litre', ar: 'سعر اللتر' }, format: 'currency', excelWidth: 16, align: 'right' },
        ],
      },
      { type: 'narrative', title: { en: 'Methodology', ar: 'المنهجية' }, items: [{ text: { en: 'Fuel cost and volume come from the selected ADNOC statement. Distance uses canonical, de-duplicated vehicle telemetry. Cost and consumption KPIs are withheld where required inputs are unavailable.', ar: 'تأتي تكلفة وكمية الوقود من بيان أدنوك المحدد. وتستخدم المسافة بيانات المركبات الموحدة بعد إزالة التكرار. يتم حجب مؤشرات التكلفة والاستهلاك عند عدم توفر المدخلات المطلوبة.' }, status: 'neutral' }] },
    ],
    dataQuality: quality,
    sourceNotes: [
      { en: `Source: ADNOC fuel statement and canonical Cartrack telemetry for ${monthLabel}.`, ar: `المصدر: بيان وقود أدنوك وبيانات كارتراك الموحدة لشهر ${monthLabel}.` },
      { en: 'The report reflects the fleet scope and period selected at export time.', ar: 'يعكس التقرير نطاق الأسطول والفترة المحددين وقت التصدير.' },
    ],
    metadata: [
      { label: { en: 'Vehicle rows', ar: 'عدد المركبات' }, value: totalRows },
      { label: { en: 'Distance coverage', ar: 'تغطية المسافة' }, value: `${distanceCoverage}%` },
      { label: { en: 'Currency', ar: 'العملة' }, value: currency },
    ],
  }
}

export async function exportFuelExcel(payload) {
  return downloadManagementWorkbook(buildFuelManagementReport(payload))
}

export async function exportFuelPdf(payload) {
  const [{ downloadManagementPdf }, { REPORT_PDF_ASSETS }] = await Promise.all([
    import('../../../services/reporting/pdfReportBuilder.js'),
    import('../../../services/reporting/reportAssets.js'),
  ])
  return downloadManagementPdf(buildFuelManagementReport(payload), REPORT_PDF_ASSETS)
}
