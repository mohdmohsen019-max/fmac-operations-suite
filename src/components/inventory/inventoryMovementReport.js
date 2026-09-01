import { downloadManagementWorkbook } from '../../services/reporting/excelReportBuilder.js'
import { isArabicLocale } from '../../services/reporting/reportTheme.js'

const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0
const movementLabel = (type, arabic) => {
  if (type === 'stock_in') return arabic ? 'وارد' : 'Stock in'
  if (type === 'stock_out') return arabic ? 'صادر' : 'Issued'
  return arabic ? 'تسوية' : 'Adjustment'
}

export function buildInventoryMovementReport({
  movements = [],
  period,
  locale = 'en-AE',
  sportLabel = (value) => value,
  formatDate = (value) => String(value || ''),
}) {
  const arabic = isArabicLocale(locale)
  const received = movements.filter((item) => item.type === 'stock_in').reduce((sum, item) => sum + number(item.quantity), 0)
  const issued = movements.filter((item) => item.type === 'stock_out').reduce((sum, item) => sum + number(item.quantity), 0)
  const operational = movements.filter((item) => item.type === 'stock_in' || item.type === 'stock_out')
  const evidenced = operational.filter((item) => item.evidence?.length).length
  const evidenceCoverage = operational.length ? evidenced / operational.length : null
  const adjustments = movements.filter((item) => item.type === 'adjustment').length
  const rows = movements.map((item) => ({
    date: formatDate(item.createdAt),
    type: movementLabel(item.type, arabic),
    itemAr: item.itemNameAr || null,
    itemEn: item.itemNameEn || null,
    sku: item.itemSku || null,
    quantity: number(item.quantity),
    previousStock: item.previousStock == null ? null : number(item.previousStock),
    newStock: item.newStock == null ? null : number(item.newStock),
    sport: item.issuedTo?.sport ? sportLabel(item.issuedTo.sport) : null,
    recipient: item.issuedTo?.personName || null,
    reference: item.deliveryNoteRef || item.receiptId || null,
    performedBy: item.performedByName || null,
    evidence: (item.evidence || []).map((file) => file.name || file.url).filter(Boolean).join(' | ') || null,
    notes: item.notes || null,
  }))

  return {
    id: 'inventory-movement-history',
    fileName: `FMAC-inventory-movements-${new Date().toISOString().slice(0, 10)}`,
    locale,
    orientation: 'landscape',
    title: { en: 'Inventory Movement Report', ar: 'تقرير حركة المخزون' },
    subtitle: { en: 'Received, issued and adjusted stock with supporting evidence', ar: 'المخزون الوارد والصادر والتسويات مع المستندات المؤيدة' },
    period,
    scope: { en: 'Inventory movements matching the selected filters', ar: 'حركات المخزون المطابقة لعوامل التصفية المحددة' },
    kpis: [
      { label: { en: 'Movement records', ar: 'سجلات الحركة' }, value: movements.length, excelValue: movements.length, format: 'number', decimals: 0, status: movements.length ? 'neutral' : 'unavailable' },
      { label: { en: 'Units received', ar: 'الوحدات الواردة' }, value: received, excelValue: received, format: 'number', decimals: 0, status: received ? 'good' : 'neutral' },
      { label: { en: 'Units issued', ar: 'الوحدات الصادرة' }, value: issued, excelValue: issued, format: 'number', decimals: 0, status: issued ? 'neutral' : 'neutral' },
      { label: { en: 'Evidence coverage', ar: 'تغطية المستندات' }, value: evidenceCoverage == null ? null : `${Math.round(evidenceCoverage * 100)}%`, excelValue: evidenceCoverage, format: 'percent', status: evidenceCoverage == null ? 'unavailable' : evidenceCoverage >= 0.9 ? 'good' : 'warning' },
    ],
    sections: [
      { type: 'narrative', title: { en: 'Executive findings', ar: 'أبرز النتائج التنفيذية' }, items: [
        { text: { en: `${movements.length} movement record(s) matched the selected period and filters.`, ar: `طابق ${movements.length} سجل حركة الفترة وعوامل التصفية المحددة.` }, status: movements.length ? 'neutral' : 'warning' },
        { text: { en: `Recorded flow was ${received} units received and ${issued} units issued, a net movement of ${received - issued} units.`, ar: `بلغت الحركة المسجلة ${received} وحدة واردة و${issued} وحدة صادرة، بصافي حركة ${received - issued} وحدة.` }, status: received - issued >= 0 ? 'good' : 'warning' },
        { text: evidenceCoverage == null ? { en: 'Evidence coverage is unavailable because no stock-in or issue movements exist.', ar: 'تغطية المستندات غير متاحة لعدم وجود حركات وارد أو صادر.' } : { en: `${evidenced} of ${operational.length} stock-in or issue movements include supporting evidence.`, ar: `تتضمن ${evidenced} من أصل ${operational.length} حركة وارد أو صادر مستندات مؤيدة.` }, status: evidenceCoverage == null ? 'neutral' : evidenceCoverage >= 0.9 ? 'good' : 'warning' },
        { text: { en: `${adjustments} stock adjustment record(s) require audit-trail review.`, ar: `يوجد ${adjustments} سجل تسوية مخزون يتطلب مراجعة مسار التدقيق.` }, status: adjustments ? 'warning' : 'good' },
      ] },
      { type: 'table', title: { en: 'Movement register', ar: 'سجل حركة المخزون' }, sheetName: { en: 'Movement Register', ar: 'سجل الحركة' }, rows, pdfRowsPerPage: 10, autoRowHeight: true, columns: [
        { key: 'date', label: { en: 'Date', ar: 'التاريخ' }, excelWidth: 20, pdfWeight: 18 },
        { key: 'type', label: { en: 'Type', ar: 'النوع' }, excelWidth: 14, pdfWeight: 11 },
        { key: 'itemAr', label: { en: 'Item (Arabic)', ar: 'الصنف (عربي)' }, excelWidth: 24, pdfWeight: 23, pdfHiddenEnglish: true },
        { key: 'itemEn', label: { en: 'Item (English)', ar: 'الصنف (إنجليزي)' }, excelWidth: 24, pdfWeight: 23, pdfHiddenArabic: true },
        { key: 'sku', label: { en: 'SKU', ar: 'رمز الصنف' }, excelWidth: 16, pdfWeight: 16 },
        { key: 'quantity', label: { en: 'Quantity', ar: 'الكمية' }, format: 'number', decimals: 0, excelWidth: 12, align: 'right' },
        { key: 'previousStock', label: { en: 'Previous', ar: 'السابق' }, format: 'number', decimals: 0, excelWidth: 12, align: 'right' },
        { key: 'newStock', label: { en: 'New stock', ar: 'الرصيد الجديد' }, format: 'number', decimals: 0, excelWidth: 12, align: 'right' },
        { key: 'sport', label: { en: 'Sport', ar: 'الرياضة' }, excelWidth: 18, pdfWeight: 14 },
        { key: 'recipient', label: { en: 'Recipient', ar: 'المستلم' }, excelWidth: 22, pdfWeight: 20 },
        { key: 'reference', label: { en: 'Reference', ar: 'المرجع' }, excelWidth: 18, pdfHidden: true },
        { key: 'performedBy', label: { en: 'Recorded by', ar: 'سجل بواسطة' }, excelWidth: 22, pdfHidden: true },
        { key: 'evidence', label: { en: 'Evidence file(s)', ar: 'ملفات الإثبات' }, excelWidth: 32, pdfWeight: 22 },
        { key: 'notes', label: { en: 'Notes', ar: 'ملاحظات' }, excelWidth: 30, pdfHidden: true },
      ] },
      { type: 'narrative', title: { en: 'Methodology', ar: 'المنهجية' }, items: [
        { text: { en: 'The report includes every Firestore inventory movement loaded for the selected period, then applies the visible type, sport and item filters.', ar: 'يتضمن التقرير جميع حركات المخزون المحملة من فايرستور للفترة المحددة، ثم يطبق عوامل تصفية النوع والرياضة والصنف الظاهرة.' }, status: 'neutral' },
        { text: { en: 'Evidence coverage measures whether at least one supporting file is attached; it does not validate the content of the attachment.', ar: 'تقيس تغطية المستندات وجود ملف مؤيد واحد على الأقل، ولا تتحقق من محتوى المرفق.' }, status: 'neutral' },
      ] },
    ],
    dataQuality: [],
    sourceNotes: [{ en: 'Source: inventory_movements in FMAC Firestore.', ar: 'المصدر: مجموعة inventory_movements في فايرستور FMAC.' }],
    metadata: [
      { label: { en: 'Received units', ar: 'الوحدات الواردة' }, value: received },
      { label: { en: 'Issued units', ar: 'الوحدات الصادرة' }, value: issued },
      { label: { en: 'Adjustment records', ar: 'سجلات التسوية' }, value: adjustments },
      { label: { en: 'Evidence-backed movements', ar: 'الحركات المؤيدة بمستندات' }, value: evidenced },
    ],
  }
}

export async function exportInventoryMovementExcel(options) {
  return downloadManagementWorkbook(buildInventoryMovementReport(options))
}

export async function exportInventoryMovementPdf(options) {
  const [{ downloadManagementPdf }, { REPORT_PDF_ASSETS }] = await Promise.all([
    import('../../services/reporting/pdfReportBuilder.js'),
    import('../../services/reporting/reportAssets.js'),
  ])
  return downloadManagementPdf(buildInventoryMovementReport(options), REPORT_PDF_ASSETS)
}
