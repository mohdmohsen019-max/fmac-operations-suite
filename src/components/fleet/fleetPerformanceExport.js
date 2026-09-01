import { downloadManagementWorkbook } from '../../services/reporting/excelReportBuilder.js'
import { isArabicLocale } from '../../services/reporting/reportTheme.js'

const finite = (value) => value == null || value === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null
const round = (value, digits = 1) => finite(value) == null ? null : Math.round(Number(value) * 10 ** digits) / 10 ** digits

const metricDefinitions = [
  ['averageVehicleScore', { en: 'Average vehicle rating', ar: 'متوسط تقييم الأسطول' }, 'vehicleSafetyTarget', false, '%'],
  ['maintenanceCompliance', { en: 'Preventive maintenance compliance', ar: 'الالتزام بالصيانة الوقائية' }, 'maintenanceComplianceTarget', false, '%'],
  ['safetyCoverage', { en: 'Fleet safety indicator', ar: 'مؤشر سلامة الأسطول' }, 'safetyCoverageTarget', false, '%'],
  ['fuelAttainment', { en: 'Fuel consumption', ar: 'استهلاك الوقود' }, 'fuelConsumptionTargetL100km', true, 'L/100 km'],
  ['speedingReduction', { en: 'Speeding reduction', ar: 'انخفاض تجاوز السرعة' }, 'speedingReductionTarget', false, '%'],
  ['fineFreeRate', { en: 'Fine-free bus rate', ar: 'نسبة الحافلات دون مخالفات' }, 'fineFreeTarget', false, '%'],
]

export function buildFleetPerformanceManagementReport({ data, snapshots = [], locale = 'en-AE', periodLabel }) {
  if (!data) throw new Error('Fleet performance data is required.')
  const arabic = isArabicLocale(locale)
  const metricRows = metricDefinitions.map(([key, label, targetKey, lowerIsBetter, unit]) => {
    const actual = finite(data.metrics?.[key]?.value)
    const target = finite(data.settings?.[targetKey])
    const variance = actual == null || target == null ? null : lowerIsBetter ? target - actual : actual - target
    return {
      indicator: arabic ? label.ar : label.en,
      actual: round(actual), target: round(target), variance: round(variance),
      weight: finite(data.metrics?.[key]?.weight), unit,
      included: data.metrics?.[key]?.subscore == null ? (arabic ? 'غير متاح' : 'Unavailable') : (arabic ? 'مدرج' : 'Included'),
    }
  })
  const ranking = (data.vehicleScores || []).slice().sort((a, b) => Number(b.score || 0) - Number(a.score || 0)).map((vehicle, index) => ({
    rank: index + 1, plate: vehicle.registration, score: round(vehicle.score), distanceKm: round(vehicle.distanceKm, 0), speedingEvents: Number(vehicle.speedingEvents || 0),
  }))
  const preventive = (data.planRows || []).filter((row) => ['overdue', 'due', 'due-soon'].includes(row.status)).map((row) => ({
    plate: row.vehicleReg,
    service: arabic ? (row.template?.nameAr || row.template?.nameEn || row.templateId) : (row.template?.nameEn || row.template?.nameAr || row.templateId),
    status: row.status,
    dueDate: row.nextDueDate || '', dueKm: round(row.nextDueKm, 0),
  }))
  const recommendations = (data.preventiveInsights || []).map((item) => ({
    plate: item.vehicleReg,
    system: arabic ? (item.categoryAr || item.category) : (item.categoryEn || item.category),
    risk: item.severity,
    evidence: arabic ? (item.evidenceAr || item.evidence) : (item.evidenceEn || item.evidence),
    recommendation: arabic ? (item.recommendationAr || item.recommendation) : (item.recommendationEn || item.recommendation),
  }))
  const history = snapshots.map((snapshot) => ({
    period: snapshot.period || snapshot.id,
    score: round(snapshot.overallScore), target: round(snapshot.overallTarget), coverage: round(snapshot.availableWeight), version: snapshot.calculationVersion || '',
  }))
  const period = periodLabel || String(data.calculatedAt || '').slice(0, 10)
  const unavailableMetrics = metricRows.filter((row) => row.actual == null).length
  const overdueCount = preventive.filter((row) => row.status === 'overdue').length
  return {
    id: 'fleet-performance', fileName: `FMAC-fleet-performance-${period}`, locale, orientation: 'landscape',
    title: { en: 'Fleet Performance Report', ar: 'تقرير أداء أسطول الحافلات' },
    subtitle: { en: 'Targets, actual results, variance, history and preventive action', ar: 'المستهدفات والنتائج الفعلية والانحراف والسجل والإجراءات الوقائية' },
    period,
    scope: { en: 'Confirmed bus fleet only', ar: 'أسطول الحافلات المعتمد فقط' },
    kpis: [
      { label: { en: 'Composite fleet score', ar: 'الدرجة المركبة للأسطول' }, value: round(data.overallScore, 0), excelValue: round(data.overallScore, 0), unit: { en: '/100', ar: '/100' }, status: data.overallScore == null ? 'unavailable' : data.overallScore >= data.overallTarget ? 'good' : 'warning', note: { en: data.provisional ? 'Provisional' : 'Verified', ar: data.provisional ? 'مؤقتة' : 'موثقة' } },
      { label: { en: 'Year-end target', ar: 'مستهدف نهاية السنة' }, value: round(data.overallTarget, 0), excelValue: round(data.overallTarget, 0), unit: { en: '/100', ar: '/100' }, status: 'neutral' },
      { label: { en: 'Weighted data coverage', ar: 'تغطية البيانات الموزونة' }, value: round(data.availableWeight), excelValue: round(data.availableWeight), unit: { en: '%', ar: '٪' }, status: data.availableWeight >= 100 ? 'good' : data.availableWeight >= 80 ? 'warning' : 'unavailable' },
      { label: { en: 'Preventive work requiring action', ar: 'أعمال وقائية تتطلب إجراء' }, value: preventive.length, excelValue: preventive.length, status: overdueCount ? 'bad' : preventive.length ? 'warning' : 'good', note: { en: `${overdueCount} overdue`, ar: `${overdueCount} متأخر` } },
    ],
    sections: [
      { type: 'narrative', title: { en: 'Executive findings', ar: 'أبرز النتائج التنفيذية' }, items: [
        { text: { en: data.overallScore == null ? 'The composite score is withheld because less than 80% of weighted KPI data is available.' : `The composite fleet score is ${round(data.overallScore, 0)} against a year-end target of ${round(data.overallTarget, 0)}.`, ar: data.overallScore == null ? 'تم حجب الدرجة المركبة لأن أقل من 80٪ من بيانات المؤشرات الموزونة متاح.' : `بلغت الدرجة المركبة للأسطول ${round(data.overallScore, 0)} مقابل مستهدف نهاية السنة البالغ ${round(data.overallTarget, 0)}.` }, status: data.overallScore == null ? 'warning' : data.overallScore >= data.overallTarget ? 'good' : 'warning' },
        { text: { en: `${data.trafficViolations?.count ?? 0} traffic violation(s) affected ${data.trafficViolations?.affectedVehicles ?? 0} bus(es) in the current half-year.`, ar: `تم تسجيل ${data.trafficViolations?.count ?? 0} مخالفة مرورية على ${data.trafficViolations?.affectedVehicles ?? 0} حافلة خلال نصف السنة الحالي.` }, status: data.trafficViolations?.count ? 'warning' : 'good' },
        { text: { en: `${preventive.length} preventive job(s) require action, including ${overdueCount} overdue.`, ar: `هناك ${preventive.length} مهمة صيانة وقائية تتطلب إجراء، منها ${overdueCount} متأخرة.` }, status: overdueCount ? 'bad' : preventive.length ? 'warning' : 'good' },
      ] },
      { type: 'table', title: { en: 'Performance against target', ar: 'الأداء مقابل المستهدف' }, sheetName: { en: 'KPI Performance', ar: 'أداء المؤشرات' }, rows: metricRows, columns: [
        { key: 'indicator', label: { en: 'Indicator', ar: 'المؤشر' }, excelWidth: 38 },
        { key: 'actual', label: { en: 'Actual', ar: 'الفعلي' }, format: 'number', excelWidth: 15, align: 'right' },
        { key: 'target', label: { en: 'Target', ar: 'المستهدف' }, format: 'number', excelWidth: 15, align: 'right' },
        { key: 'variance', label: { en: 'Variance', ar: 'الانحراف' }, format: 'number', excelWidth: 15, align: 'right' },
        { key: 'weight', label: { en: 'Weight %', ar: 'الوزن ٪' }, format: 'number', excelWidth: 13, align: 'right' },
        { key: 'included', label: { en: 'Composite status', ar: 'حالة الإدراج' }, excelWidth: 18 },
      ] },
      { type: 'table', title: { en: 'Bus ranking', ar: 'ترتيب الحافلات' }, sheetName: { en: 'Bus Ranking', ar: 'ترتيب الحافلات' }, rows: ranking, columns: [
        { key: 'rank', label: { en: '#', ar: '#' }, format: 'number', decimals: 0, excelWidth: 7, align: 'center' },
        { key: 'plate', label: { en: 'Canonical plate', ar: 'رقم اللوحة الموحد' }, excelWidth: 20 },
        { key: 'score', label: { en: 'Score', ar: 'الدرجة' }, format: 'number', excelWidth: 14, align: 'right' },
        { key: 'distanceKm', label: { en: 'Distance (km)', ar: 'المسافة (كم)' }, format: 'number', decimals: 0, excelWidth: 18, align: 'right' },
        { key: 'speedingEvents', label: { en: 'Speeding events', ar: 'تجاوزات السرعة' }, format: 'number', decimals: 0, excelWidth: 18, align: 'right' },
      ], conditionalFormats: [{ key: 'score', rules: [{ type: 'colorScale', cfvo: [{ type: 'min' }, { type: 'percentile', value: 50 }, { type: 'max' }], color: [{ argb: 'FFC93532' }, { argb: 'FFFFE39B' }, { argb: 'FF087F5B' }] }] }] },
      { type: 'table', title: { en: 'Preventive work requiring action', ar: 'أعمال الصيانة الوقائية التي تتطلب إجراء' }, sheetName: { en: 'Preventive Work', ar: 'الأعمال الوقائية' }, rows: preventive, columns: [
        { key: 'plate', label: { en: 'Plate', ar: 'رقم اللوحة' }, excelWidth: 18 },
        { key: 'service', label: { en: 'Service', ar: 'الخدمة' }, excelWidth: 34 },
        { key: 'status', label: { en: 'Status', ar: 'الحالة' }, excelWidth: 15 },
        { key: 'dueDate', label: { en: 'Due date', ar: 'تاريخ الاستحقاق' }, excelWidth: 18 },
        { key: 'dueKm', label: { en: 'Due odometer', ar: 'عداد الاستحقاق' }, format: 'number', decimals: 0, excelWidth: 18, align: 'right' },
      ] },
      { type: 'table', title: { en: 'Preventive recommendations', ar: 'التوصيات الوقائية' }, sheetName: { en: 'Recommendations', ar: 'التوصيات' }, rows: recommendations, columns: [
        { key: 'plate', label: { en: 'Plate', ar: 'رقم اللوحة' }, excelWidth: 16 },
        { key: 'system', label: { en: 'System', ar: 'النظام' }, excelWidth: 20 },
        { key: 'risk', label: { en: 'Risk', ar: 'المخاطر' }, excelWidth: 14 },
        { key: 'evidence', label: { en: 'Evidence', ar: 'الدليل' }, excelWidth: 48 },
        { key: 'recommendation', label: { en: 'Recommendation', ar: 'التوصية' }, excelWidth: 55 },
      ] },
      { type: 'table', title: { en: 'Immutable KPI history', ar: 'السجل الثابت للمؤشرات' }, sheetName: { en: 'KPI History', ar: 'سجل المؤشرات' }, rows: history, columns: [
        { key: 'period', label: { en: 'Period', ar: 'الفترة' }, excelWidth: 18 },
        { key: 'score', label: { en: 'Score', ar: 'الدرجة' }, format: 'number', excelWidth: 14, align: 'right' },
        { key: 'target', label: { en: 'Target', ar: 'المستهدف' }, format: 'number', excelWidth: 14, align: 'right' },
        { key: 'coverage', label: { en: 'Coverage %', ar: 'التغطية ٪' }, format: 'number', excelWidth: 16, align: 'right' },
        { key: 'version', label: { en: 'Calculation version', ar: 'إصدار الحساب' }, excelWidth: 20 },
      ] },
      { type: 'narrative', title: { en: 'Methodology', ar: 'المنهجية' }, items: [{ text: { en: 'All indicators use canonical bus identities. Camera aliases are telemetry sources, not additional vehicles. Scores are withheld below 80% weighted data coverage and marked provisional between 80% and 99%.', ar: 'تستخدم جميع المؤشرات هويات الحافلات الموحدة. وتُعامل أسماء الكاميرات كمصادر بيانات وليست مركبات إضافية. تُحجب الدرجة عندما تقل تغطية البيانات الموزونة عن 80٪ وتُعرض كمؤقتة بين 80٪ و99٪.' }, status: 'neutral' }] },
    ],
    dataQuality: unavailableMetrics ? [{ en: `${unavailableMetrics} KPI(s) are unavailable and excluded from the composite calculation.`, ar: `${unavailableMetrics} من المؤشرات غير متاح ومستبعد من احتساب الدرجة المركبة.` }] : [],
    sourceNotes: [{ en: `Calculation version: ${data.calculationVersion || 'not recorded'}.`, ar: `إصدار الحساب: ${data.calculationVersion || 'غير مسجل'}.` }],
    metadata: [
      { label: { en: 'Registered buses', ar: 'الحافلات المسجلة' }, value: data.coverage?.registeredBuses || 0 },
      { label: { en: 'Scored buses', ar: 'الحافلات المقيمة' }, value: data.coverage?.scoredBuses || 0 },
      { label: { en: 'Calculation version', ar: 'إصدار الحساب' }, value: data.calculationVersion || '' },
    ],
  }
}

export async function exportFleetPerformanceExcel(options) {
  return downloadManagementWorkbook(buildFleetPerformanceManagementReport(options))
}

export async function exportFleetPerformancePdf(options) {
  const [{ downloadManagementPdf }, { REPORT_PDF_ASSETS }] = await Promise.all([
    import('../../services/reporting/pdfReportBuilder.js'),
    import('../../services/reporting/reportAssets.js'),
  ])
  return downloadManagementPdf(buildFleetPerformanceManagementReport(options), REPORT_PDF_ASSETS)
}
