import { createManagementWorkbook, downloadManagementWorkbook } from '../../services/reporting/excelReportBuilder.js'
import { isArabicLocale } from '../../services/reporting/reportTheme.js'
import { getCatLabel, getItemStatus, getSportLabel } from './shared'

export const STOCK_EXPORT_HEADERS = [
  'Barcode', 'SKU', 'Name (EN)', 'Name (AR)', 'Sport', 'Category', 'Size', 'Current Stock', 'Minimum Stock', 'Status',
]

const STATUS_LABELS = {
  en: { ok: 'Available', low: 'Low stock', out: 'Out of stock' },
  ar: { ok: 'متوفر', low: 'مخزون منخفض', out: 'نفد المخزون' },
}

export function buildStockExportRows(items, { categories = [], sports = [], lang = 'en' } = {}) {
  const labels = STATUS_LABELS[lang] || STATUS_LABELS.en
  return items.map((item) => {
    const status = getItemStatus(item)
    return [
      String(item.barcode || ''), String(item.sku || ''), item.nameEn || '', item.nameAr || '',
      getSportLabel(item.sport, lang, sports), getCatLabel(item.category, lang, categories), item.size || '',
      Number(item.currentStock ?? 0), Number(item.minThreshold ?? 5), labels[status] || status,
    ]
  })
}

export function buildStockManagementReport(items, options = {}) {
  const { categories = [], sports = [], lang = 'en', locale = lang === 'ar' ? 'ar-AE' : 'en-AE', filters = {} } = options
  const arabic = isArabicLocale(locale)
  const statusCounts = { ok: 0, low: 0, out: 0 }
  const rows = items.map((item) => {
    const status = getItemStatus(item)
    statusCounts[status] = (statusCounts[status] || 0) + 1
    return {
      barcode: String(item.barcode || ''), sku: String(item.sku || ''), nameEn: item.nameEn || '', nameAr: item.nameAr || '',
      sport: getSportLabel(item.sport, lang, sports), category: getCatLabel(item.category, lang, categories), size: item.size || '',
      currentStock: Number(item.currentStock ?? 0), minimumStock: Number(item.minThreshold ?? 5), status: STATUS_LABELS[arabic ? 'ar' : 'en'][status] || status,
    }
  })
  const totalUnits = rows.reduce((sum, row) => sum + row.currentStock, 0)
  const scopeParts = [filters.search, filters.category, filters.sport, filters.status].filter(Boolean)
  return {
    id: 'inventory-stock', fileName: `FMAC-inventory-stock-${new Date().toISOString().slice(0, 10)}`, locale, orientation: 'landscape',
    title: { en: 'Inventory Stock Report', ar: 'تقرير مخزون المستودع' },
    subtitle: { en: 'Availability, thresholds and replenishment exceptions', ar: 'التوفر والحدود الدنيا واستثناءات إعادة الطلب' },
    period: new Date().toLocaleDateString(locale, { dateStyle: 'long' }),
    scope: scopeParts.length ? { en: `Filtered view: ${scopeParts.join(' · ')}`, ar: `عرض مفلتر: ${scopeParts.join(' · ')}` } : { en: 'Current stock view · all matching items', ar: 'عرض المخزون الحالي · جميع الأصناف المطابقة' },
    kpis: [
      { label: { en: 'Items', ar: 'الأصناف' }, value: rows.length, excelValue: rows.length, status: 'neutral' },
      { label: { en: 'Units on hand', ar: 'الوحدات المتوفرة' }, value: totalUnits, excelValue: totalUnits, status: 'neutral' },
      { label: { en: 'Low stock', ar: 'مخزون منخفض' }, value: statusCounts.low, excelValue: statusCounts.low, status: statusCounts.low ? 'warning' : 'good' },
      { label: { en: 'Out of stock', ar: 'نفد المخزون' }, value: statusCounts.out, excelValue: statusCounts.out, status: statusCounts.out ? 'bad' : 'good' },
    ],
    sections: [
      { type: 'narrative', title: { en: 'Management summary', ar: 'الملخص الإداري' }, items: [
        { text: { en: `${statusCounts.out} item(s) are out of stock and require immediate replenishment review.`, ar: `يوجد ${statusCounts.out} صنفاً نافد المخزون ويتطلب مراجعة فورية لإعادة الطلب.` }, status: statusCounts.out ? 'bad' : 'good' },
        { text: { en: `${statusCounts.low} item(s) are at or below their minimum threshold.`, ar: `يوجد ${statusCounts.low} صنفاً عند أو دون الحد الأدنى للمخزون.` }, status: statusCounts.low ? 'warning' : 'good' },
      ] },
      { type: 'table', title: { en: 'Stock detail', ar: 'تفاصيل المخزون' }, sheetName: { en: 'Stock Detail', ar: 'تفاصيل المخزون' }, rows, autoRowHeight: true, columns: [
        { key: 'barcode', label: { en: 'Barcode', ar: 'الباركود' }, excelWidth: 17 },
        { key: 'sku', label: { en: 'SKU', ar: 'رمز الصنف' }, excelWidth: 18 },
        { key: 'nameEn', label: { en: 'Name (EN)', ar: 'الاسم (إنجليزي)' }, excelWidth: 30 },
        { key: 'nameAr', label: { en: 'Name (AR)', ar: 'الاسم (عربي)' }, excelWidth: 30 },
        { key: 'sport', label: { en: 'Sport', ar: 'الرياضة' }, excelWidth: 20 },
        { key: 'category', label: { en: 'Category', ar: 'الفئة' }, excelWidth: 20 },
        { key: 'size', label: { en: 'Size', ar: 'المقاس' }, excelWidth: 12 },
        { key: 'currentStock', label: { en: 'Current stock', ar: 'المخزون الحالي' }, format: 'number', decimals: 0, excelWidth: 15, align: 'right' },
        { key: 'minimumStock', label: { en: 'Minimum', ar: 'الحد الأدنى' }, format: 'number', decimals: 0, excelWidth: 14, align: 'right' },
        { key: 'status', label: { en: 'Status', ar: 'الحالة' }, excelWidth: 18 },
      ], conditionalFormats: [{ key: 'currentStock', rules: [{ type: 'dataBar', color: { argb: 'FF9A7410' }, gradient: true }] }] },
      { type: 'narrative', title: { en: 'Methodology', ar: 'المنهجية' }, items: [{ text: { en: 'Status is calculated against the configured minimum stock threshold for each item. The export contains the exact filtered rows visible at export time.', ar: 'تُحسب الحالة مقارنة بالحد الأدنى المحدد لكل صنف. ويحتوي التصدير على نفس الصفوف المفلترة الظاهرة وقت التصدير.' }, status: 'neutral' }] },
    ],
    sourceNotes: [{ en: 'Source: Inventory stock register.', ar: 'المصدر: سجل مخزون المستودع.' }],
    metadata: [{ label: { en: 'Filtered row count', ar: 'عدد الصفوف المفلترة' }, value: rows.length }],
  }
}

export function createStockWorkbook(items, options) {
  return createManagementWorkbook(buildStockManagementReport(items, options))
}

export async function downloadStockWorkbook(items, options) {
  return downloadManagementWorkbook(buildStockManagementReport(items, options))
}
