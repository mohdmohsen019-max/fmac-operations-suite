import { downloadManagementWorkbook } from '../../services/reporting/excelReportBuilder.js'
import { isArabicLocale } from '../../services/reporting/reportTheme.js'

const n = (value) => Number.isFinite(Number(value)) ? Number(value) : 0
const sum = (rows, key) => rows.reduce((total, row) => total + n(row[key]), 0)

function definition(reportData, arabic) {
  const rows = reportData?.rows || []
  if (reportData?.type === 'monthly') {
    const orders = sum(rows, 'orders')
    const quantity = sum(rows, 'totalQty')
    const top = [...rows].sort((a, b) => n(b.totalQty) - n(a.totalQty))[0]
    return {
      title: { en: 'Monthly Inventory Issuance Report', ar: 'تقرير الصرف الشهري للمخزون' },
      subtitle: { en: 'Issue-order volume and distribution by sport', ar: 'حجم أوامر الصرف وتوزيعها حسب الرياضة' },
      period: reportData.period,
      kpis: [
        { label: { en: 'Issuance orders', ar: 'أوامر الصرف' }, value: orders, excelValue: orders, format: 'number', decimals: 0, status: orders ? 'neutral' : 'unavailable' },
        { label: { en: 'Units issued', ar: 'الوحدات المصروفة' }, value: quantity, excelValue: quantity, format: 'number', decimals: 0, status: quantity ? 'neutral' : 'unavailable' },
        { label: { en: 'Sports served', ar: 'الرياضات المستفيدة' }, value: rows.length, excelValue: rows.length, format: 'number', decimals: 0, status: rows.length ? 'good' : 'unavailable' },
        { label: { en: 'Highest-demand sport', ar: 'الرياضة الأعلى طلباً' }, value: top?.sport || null, note: top ? { en: `${top.totalQty} units`, ar: `${top.totalQty} وحدة` } : null, status: top ? 'warning' : 'unavailable' },
      ],
      findings: [
        { text: { en: `${orders} issuance order(s) accounted for ${quantity} issued units during ${reportData.period}.`, ar: `بلغ عدد أوامر الصرف ${orders} بإجمالي ${quantity} وحدة مصروفة خلال ${reportData.period}.` }, status: orders ? 'neutral' : 'warning' },
        { text: top ? { en: `${top.sport} recorded the highest issue volume at ${top.totalQty} units.`, ar: `سجلت ${top.sport} أعلى حجم صرف بواقع ${top.totalQty} وحدة.` } : { en: 'No issue activity was recorded.', ar: 'لم يتم تسجيل نشاط صرف.' }, status: top ? 'warning' : 'neutral' },
      ],
      tableTitle: { en: 'Issuance by sport', ar: 'الصرف حسب الرياضة' },
      sheetName: { en: 'Issuance by Sport', ar: 'الصرف حسب الرياضة' },
      rows,
      columns: [
        { key: 'sport', label: { en: 'Sport', ar: 'الرياضة' }, excelWidth: 24 },
        { key: 'orders', label: { en: 'Issue orders', ar: 'أوامر الصرف' }, format: 'number', decimals: 0, excelWidth: 16, align: 'right' },
        { key: 'totalQty', label: { en: 'Units issued', ar: 'الوحدات المصروفة' }, format: 'number', decimals: 0, excelWidth: 18, align: 'right' },
        { key: 'topItems', label: { en: 'Most-issued items', ar: 'الأصناف الأكثر صرفاً' }, excelWidth: 48 },
      ],
    }
  }
  if (reportData?.type === 'lowstock') {
    const out = rows.filter((row) => row.status === 'out').length
    const low = rows.length - out
    const shortage = rows.reduce((total, row) => total + Math.max(0, -n(row.diff)), 0)
    return {
      title: { en: 'Low Stock and Reorder Report', ar: 'تقرير المخزون المنخفض وإعادة الطلب' },
      subtitle: { en: 'Items at or below configured minimum stock', ar: 'الأصناف التي بلغت أو انخفضت عن الحد الأدنى المحدد' },
      period: reportData.period,
      kpis: [
        { label: { en: 'Items needing action', ar: 'أصناف تتطلب إجراء' }, value: rows.length, excelValue: rows.length, format: 'number', decimals: 0, status: rows.length ? 'warning' : 'good' },
        { label: { en: 'Out of stock', ar: 'نافد المخزون' }, value: out, excelValue: out, format: 'number', decimals: 0, status: out ? 'bad' : 'good' },
        { label: { en: 'Low stock', ar: 'مخزون منخفض' }, value: low, excelValue: low, format: 'number', decimals: 0, status: low ? 'warning' : 'good' },
        { label: { en: 'Units below minimum', ar: 'وحدات أقل من الحد الأدنى' }, value: shortage, excelValue: shortage, format: 'number', decimals: 0, status: shortage ? 'bad' : 'good' },
      ],
      findings: [
        { text: rows.length ? { en: `${rows.length} item(s) require replenishment attention, including ${out} out of stock.`, ar: `يوجد ${rows.length} صنفاً يتطلب إجراءً لإعادة التوريد، منها ${out} نافد من المخزون.` } : { en: 'All items are above their configured minimum stock.', ar: 'جميع الأصناف أعلى من الحد الأدنى المحدد.' }, status: rows.length ? 'warning' : 'good' },
        { text: { en: `The aggregate gap below minimum stock is ${shortage} units.`, ar: `يبلغ إجمالي العجز عن الحد الأدنى ${shortage} وحدة.` }, status: shortage ? 'bad' : 'good' },
      ],
      tableTitle: { en: 'Replenishment register', ar: 'سجل إعادة التوريد' },
      sheetName: { en: 'Replenishment', ar: 'إعادة التوريد' },
      rows: rows.map((row) => ({ ...row, statusLabel: row.status === 'out' ? (arabic ? 'نافد' : 'Out') : (arabic ? 'منخفض' : 'Low') })),
      columns: [
        { key: 'nameAr', label: { en: 'Item (Arabic)', ar: 'الصنف (عربي)' }, excelWidth: 25 },
        { key: 'nameEn', label: { en: 'Item (English)', ar: 'الصنف (إنجليزي)' }, excelWidth: 25 },
        { key: 'sport', label: { en: 'Sport', ar: 'الرياضة' }, excelWidth: 18 },
        { key: 'category', label: { en: 'Category', ar: 'الفئة' }, excelWidth: 18 },
        { key: 'currentStock', label: { en: 'Current stock', ar: 'المخزون الحالي' }, format: 'number', decimals: 0, excelWidth: 16, align: 'right' },
        { key: 'minThreshold', label: { en: 'Minimum', ar: 'الحد الأدنى' }, format: 'number', decimals: 0, excelWidth: 14, align: 'right' },
        { key: 'diff', label: { en: 'Variance', ar: 'الانحراف' }, format: 'number', decimals: 0, excelWidth: 14, align: 'right' },
        { key: 'statusLabel', label: { en: 'Status', ar: 'الحالة' }, excelWidth: 14 },
      ],
    }
  }
  if (reportData?.type === 'stock') {
    const currentUnits = reportData.items.reduce((total, item) => total + n(item.item.currentStock), 0)
    const received = reportData.items.flatMap((item) => item.movements).filter((item) => item.type === 'stock_in').reduce((total, item) => total + n(item.quantity), 0)
    const issued = reportData.items.flatMap((item) => item.movements).filter((item) => item.type === 'stock_out').reduce((total, item) => total + n(item.quantity), 0)
    const detailRows = reportData.items.flatMap(({ item, movements }) => movements.length ? movements.map((movement) => ({
      itemAr: item.nameAr || null,
      itemEn: item.nameEn || null,
      sku: item.sku || null,
      currentStock: n(item.currentStock),
      date: reportData.formatDate(movement.createdAt),
      type: movement.type === 'stock_in' ? (arabic ? 'وارد' : 'Stock in') : movement.type === 'stock_out' ? (arabic ? 'صادر' : 'Issued') : (arabic ? 'تسوية' : 'Adjustment'),
      quantity: n(movement.quantity),
      previousStock: movement.previousStock ?? movement.stockBefore ?? null,
      newStock: movement.newStock ?? movement.stockAfter ?? null,
      actor: movement.issuedTo?.personName || movement.issuedTo?.name || movement.receivedFrom || movement.performedByName || movement.createdByName || null,
      reference: movement.deliveryNoteRef || movement.receiptId || movement.notes || null,
    })) : [{ itemAr: item.nameAr || null, itemEn: item.nameEn || null, sku: item.sku || null, currentStock: n(item.currentStock) }])
    return {
      title: { en: 'Selected Item Stock Report', ar: 'تقرير مخزون الأصناف المحددة' },
      subtitle: { en: 'Current balances and movement history for selected items', ar: 'الأرصدة الحالية وسجل الحركة للأصناف المحددة' },
      period: reportData.period,
      kpis: [
        { label: { en: 'Selected items', ar: 'الأصناف المحددة' }, value: reportData.items.length, excelValue: reportData.items.length, format: 'number', decimals: 0, status: 'neutral' },
        { label: { en: 'Current units', ar: 'الوحدات الحالية' }, value: currentUnits, excelValue: currentUnits, format: 'number', decimals: 0, status: 'neutral' },
        { label: { en: 'Units received', ar: 'الوحدات الواردة' }, value: received, excelValue: received, format: 'number', decimals: 0, status: received ? 'good' : 'neutral' },
        { label: { en: 'Units issued', ar: 'الوحدات الصادرة' }, value: issued, excelValue: issued, format: 'number', decimals: 0, status: issued ? 'neutral' : 'neutral' },
      ],
      findings: [
        { text: { en: `${reportData.items.length} selected item(s) currently hold ${currentUnits} units.`, ar: `يبلغ الرصيد الحالي لعدد ${reportData.items.length} صنفاً محدداً ${currentUnits} وحدة.` }, status: 'neutral' },
        { text: { en: `Period movement includes ${received} units received and ${issued} units issued.`, ar: `تشمل حركة الفترة ${received} وحدة واردة و${issued} وحدة صادرة.` }, status: 'neutral' },
      ],
      tableTitle: { en: 'Selected item movement detail', ar: 'تفاصيل حركة الأصناف المحددة' },
      sheetName: { en: 'Selected Item Detail', ar: 'تفاصيل الأصناف' },
      rows: detailRows,
      pdfRowsPerPage: 12,
      columns: [
        { key: 'itemAr', label: { en: 'Item (Arabic)', ar: 'الصنف (عربي)' }, excelWidth: 24 },
        { key: 'itemEn', label: { en: 'Item (English)', ar: 'الصنف (إنجليزي)' }, excelWidth: 24 },
        { key: 'sku', label: { en: 'SKU', ar: 'رمز الصنف' }, excelWidth: 16 },
        { key: 'currentStock', label: { en: 'Current', ar: 'الحالي' }, format: 'number', decimals: 0, excelWidth: 12, align: 'right' },
        { key: 'date', label: { en: 'Movement date', ar: 'تاريخ الحركة' }, excelWidth: 20 },
        { key: 'type', label: { en: 'Type', ar: 'النوع' }, excelWidth: 14 },
        { key: 'quantity', label: { en: 'Quantity', ar: 'الكمية' }, format: 'number', decimals: 0, excelWidth: 12, align: 'right' },
        { key: 'previousStock', label: { en: 'Previous', ar: 'السابق' }, format: 'number', decimals: 0, excelWidth: 12, align: 'right' },
        { key: 'newStock', label: { en: 'New stock', ar: 'الرصيد الجديد' }, format: 'number', decimals: 0, excelWidth: 12, align: 'right' },
        { key: 'actor', label: { en: 'Recipient / actor', ar: 'المستلم / المنفذ' }, excelWidth: 24 },
        { key: 'reference', label: { en: 'Reference / notes', ar: 'المرجع / الملاحظات' }, excelWidth: 30 },
      ],
    }
  }
  const stockIn = sum(rows, 'stockIn')
  const stockOut = sum(rows, 'stockOut')
  return {
    title: { en: 'Inventory Movement Summary', ar: 'ملخص حركة المخزون' },
    subtitle: { en: 'Item-level stock inflow, outflow and net movement', ar: 'حركة الوارد والصادر والصافي حسب الصنف' },
    period: reportData?.period,
    kpis: [
      { label: { en: 'Active items', ar: 'الأصناف النشطة' }, value: rows.length, excelValue: rows.length, format: 'number', decimals: 0, status: rows.length ? 'neutral' : 'unavailable' },
      { label: { en: 'Units received', ar: 'الوحدات الواردة' }, value: stockIn, excelValue: stockIn, format: 'number', decimals: 0, status: stockIn ? 'good' : 'neutral' },
      { label: { en: 'Units issued', ar: 'الوحدات الصادرة' }, value: stockOut, excelValue: stockOut, format: 'number', decimals: 0, status: stockOut ? 'neutral' : 'neutral' },
      { label: { en: 'Net movement', ar: 'صافي الحركة' }, value: stockIn - stockOut, excelValue: stockIn - stockOut, format: 'number', decimals: 0, status: stockIn - stockOut >= 0 ? 'good' : 'warning' },
    ],
    findings: [
      { text: { en: `${rows.length} item(s) moved during the selected period.`, ar: `تحرك ${rows.length} صنفاً خلال الفترة المحددة.` }, status: rows.length ? 'neutral' : 'warning' },
      { text: { en: `Recorded inflow was ${stockIn} units and outflow was ${stockOut} units.`, ar: `بلغ الوارد المسجل ${stockIn} وحدة والصادر ${stockOut} وحدة.` }, status: stockIn - stockOut >= 0 ? 'good' : 'warning' },
    ],
    tableTitle: { en: 'Movement by item', ar: 'الحركة حسب الصنف' },
    sheetName: { en: 'Movement by Item', ar: 'الحركة حسب الصنف' },
    rows: rows.map((row) => ({ ...row, net: n(row.stockIn) - n(row.stockOut) })),
    columns: [
      { key: 'nameAr', label: { en: 'Item (Arabic)', ar: 'الصنف (عربي)' }, excelWidth: 25 },
      { key: 'nameEn', label: { en: 'Item (English)', ar: 'الصنف (إنجليزي)' }, excelWidth: 25 },
      { key: 'sku', label: { en: 'SKU', ar: 'رمز الصنف' }, excelWidth: 16 },
      { key: 'stockIn', label: { en: 'Stock in', ar: 'الوارد' }, format: 'number', decimals: 0, excelWidth: 14, align: 'right' },
      { key: 'stockOut', label: { en: 'Stock out', ar: 'الصادر' }, format: 'number', decimals: 0, excelWidth: 14, align: 'right' },
      { key: 'net', label: { en: 'Net', ar: 'الصافي' }, format: 'number', decimals: 0, excelWidth: 14, align: 'right' },
    ],
  }
}

export function buildInventoryAnalyticsReport({ reportData, locale = 'en-AE' }) {
  if (!reportData) throw new Error('Inventory report data is required.')
  const arabic = isArabicLocale(locale)
  const data = definition(reportData, arabic)
  return {
    id: `inventory-${reportData.type}`,
    fileName: `FMAC-inventory-${reportData.type}-${new Date().toISOString().slice(0, 10)}`,
    locale,
    orientation: 'landscape',
    title: data.title,
    subtitle: data.subtitle,
    period: data.period || (arabic ? 'غير محدد' : 'Not specified'),
    scope: { en: 'FMAC inventory register', ar: 'سجل مخزون FMAC' },
    kpis: data.kpis,
    sections: [
      { type: 'narrative', title: { en: 'Executive findings', ar: 'أبرز النتائج التنفيذية' }, items: data.findings },
      { type: 'table', title: data.tableTitle, sheetName: data.sheetName, rows: data.rows, columns: data.columns, pdfRowsPerPage: data.pdfRowsPerPage },
      { type: 'narrative', title: { en: 'Methodology', ar: 'المنهجية' }, items: [{ text: { en: 'Figures use the inventory records and filters selected at the time of generation. Quantities are physical unit counts and are not monetary valuations.', ar: 'تستخدم الأرقام سجلات المخزون وعوامل التصفية المحددة وقت إنشاء التقرير. وتمثل الكميات عدداً فعلياً للوحدات وليست قيماً مالية.' }, status: 'neutral' }] },
    ],
    dataQuality: [],
    sourceNotes: [{ en: 'Source: FMAC inventory items and inventory_movements in Firestore.', ar: 'المصدر: أصناف مخزون FMAC وحركات inventory_movements في فايرستور.' }],
    metadata: [{ label: { en: 'Report type', ar: 'نوع التقرير' }, value: reportData.type }],
  }
}

export async function exportInventoryAnalyticsExcel(options) {
  return downloadManagementWorkbook(buildInventoryAnalyticsReport(options))
}

export async function exportInventoryAnalyticsPdf(options) {
  const [{ downloadManagementPdf }, { REPORT_PDF_ASSETS }] = await Promise.all([
    import('../../services/reporting/pdfReportBuilder.js'),
    import('../../services/reporting/reportAssets.js'),
  ])
  return downloadManagementPdf(buildInventoryAnalyticsReport(options), REPORT_PDF_ASSETS)
}
