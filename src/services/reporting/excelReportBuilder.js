import ExcelJS from 'exceljs'
import {
  REPORT_COLORS,
  REPORT_META,
  isArabicLocale,
  localText,
  normalizeReport,
  safeFilePart,
} from './reportTheme.js'

const rgb = (hex) => `FF${hex.replace('#', '').toUpperCase()}`
const COLORS = {
  ink: rgb(REPORT_COLORS.ink), muted: rgb(REPORT_COLORS.muted), border: rgb(REPORT_COLORS.border),
  subtle: rgb(REPORT_COLORS.subtle), gold: rgb(REPORT_COLORS.gold), crimson: rgb(REPORT_COLORS.crimson),
  green: rgb(REPORT_COLORS.green), amber: rgb(REPORT_COLORS.amber), red: rgb(REPORT_COLORS.red), white: 'FFFAFAFC',
}

const font = (size = 10, bold = false, color = COLORS.ink) => ({ name: 'Cairo', size, bold, color: { argb: color } })
const thinBorder = { style: 'thin', color: { argb: COLORS.border } }
const borders = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder }

const textAlignment = (arabic, options = {}) => ({
  vertical: 'middle',
  horizontal: arabic ? 'right' : 'left',
  readingOrder: arabic ? 'rtl' : 'ltr',
  ...options,
})

const containsArabic = (value) => typeof value === 'string' && /[\u0600-\u06FF]/u.test(value)
const contentAlignment = (arabic, value, options = {}) => textAlignment(arabic, {
  // Numeric values, percentages, dates, IDs and Latin plate numbers must keep
  // their own LTR character order even when the cell is positioned in an RTL sheet.
  readingOrder: arabic && containsArabic(value) ? 'rtl' : 'ltr',
  ...options,
})

function applySheetView(sheet, arabic, freezeRows = 0) {
  sheet.views = [{ rightToLeft: arabic, showGridLines: false, state: freezeRows ? 'frozen' : 'normal', ySplit: freezeRows || undefined }]
  sheet.pageSetup = {
    orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    margins: { left: 0.3, right: 0.3, top: 0.55, bottom: 0.55, header: 0.2, footer: 0.2 },
  }
  sheet.headerFooter.oddHeader = arabic
    ? `&C&"Cairo,Bold"${REPORT_META.organizationAr} — ${REPORT_META.departmentAr}`
    : `&C&"Cairo,Bold"${REPORT_META.organization} — ${REPORT_META.department}`
  sheet.headerFooter.oddFooter = arabic
    ? '&Lداخلي&Rصفحة &P من &N'
    : '&LInternal management use&RPage &P of &N'
}

function setTitleRow(sheet, rowNumber, text, span, arabic = false) {
  sheet.mergeCells(rowNumber, 1, rowNumber, span)
  const cell = sheet.getCell(rowNumber, 1)
  cell.value = text
  cell.font = font(20, true)
  cell.alignment = textAlignment(arabic)
  cell.border = { bottom: { style: 'medium', color: { argb: COLORS.crimson } } }
  sheet.getRow(rowNumber).height = 34
}

function styleHeaderRow(row, arabic = false) {
  row.height = 25
  row.eachCell((cell) => {
    cell.font = font(9, true, COLORS.white)
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.ink } }
    cell.alignment = textAlignment(arabic, { horizontal: 'center', wrapText: true })
    cell.border = borders
  })
}

function addMetadataBlock(sheet, report, startRow, span) {
  const arabic = isArabicLocale(report.locale)
  const pairs = [
    [arabic ? 'الفترة' : 'Reporting period', report.period],
    [arabic ? 'النطاق' : 'Scope', localText(report.scope, report.locale)],
    [arabic ? 'أعده' : 'Prepared by', localText(report.preparedBy, report.locale)],
    [arabic ? 'تاريخ الإنشاء' : 'Generated', report.generatedAt],
  ]
  pairs.forEach(([label, value], index) => {
    const row = startRow + index
    sheet.getCell(row, 1).value = label
    sheet.getCell(row, 1).font = font(9, true, COLORS.muted)
    sheet.getCell(row, 2).value = value
    sheet.mergeCells(row, 2, row, span)
    sheet.getCell(row, 2).font = font(10)
    sheet.getCell(row, 1).alignment = textAlignment(arabic)
    sheet.getCell(row, 2).alignment = contentAlignment(arabic, value)
  })
  return startRow + pairs.length
}

function addKpiBlock(sheet, report, startRow, span) {
  const arabic = isArabicLocale(report.locale)
  const perRow = Math.min(4, Math.max(1, report.kpis.length))
  const cardSpan = Math.max(2, Math.floor(span / perRow))
  report.kpis.forEach((item, index) => {
    const rowGroup = Math.floor(index / perRow)
    const logicalCol = (index % perRow) * cardSpan + 1
    // Excel's rightToLeft sheet view already mirrors the visual column order.
    // Reversing coordinates here would mirror the KPI order a second time.
    const startCol = logicalCol
    const endCol = Math.min(span, startCol + cardSpan - 1)
    const labelRow = startRow + rowGroup * 3
    sheet.mergeCells(labelRow, startCol, labelRow, endCol)
    sheet.mergeCells(labelRow + 1, startCol, labelRow + 1, endCol)
    const label = sheet.getCell(labelRow, startCol)
    label.value = localText(item.label, report.locale)
    label.font = font(8, true, COLORS.muted)
    label.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.subtle } }
    label.alignment = textAlignment(arabic)
    const value = sheet.getCell(labelRow + 1, startCol)
    value.value = item.excelValue ?? item.value ?? localText(item.display, report.locale)
    if (item.format === 'currency' && Number.isFinite(Number(value.value))) value.numFmt = '#,##0.00 "AED";[Red]-#,##0.00 "AED"'
    else if (item.format === 'percent' && Number.isFinite(Number(value.value))) value.numFmt = '0.0%;[Red]-0.0%'
    else if (item.format === 'number' && Number.isFinite(Number(value.value))) value.numFmt = item.decimals === 0 ? '#,##0;[Red]-#,##0' : '#,##0.00;[Red]-#,##0.00'
    value.font = font(16, true)
    value.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.subtle } }
    value.alignment = contentAlignment(arabic, value.value)
    for (let c = startCol; c <= endCol; c += 1) {
      sheet.getCell(labelRow, c).border = borders
      sheet.getCell(labelRow + 1, c).border = borders
    }
    sheet.getRow(labelRow + 1).height = 27
  })
  return startRow + Math.ceil(report.kpis.length / perRow) * 3
}

function addExecutiveSummary(workbook, report) {
  const arabic = isArabicLocale(report.locale)
  const sheet = workbook.addWorksheet(arabic ? 'الملخص التنفيذي' : 'Executive Summary', { properties: { tabColor: { argb: COLORS.crimson } } })
  const span = 12
  applySheetView(sheet, arabic)
  setTitleRow(sheet, 1, localText(report.title, report.locale), span, arabic)
  sheet.mergeCells(2, 1, 2, span)
  sheet.getCell(2, 1).value = localText(report.subtitle, report.locale)
  sheet.getCell(2, 1).font = font(11, false, COLORS.muted)
  sheet.getCell(2, 1).alignment = textAlignment(arabic)
  let row = addMetadataBlock(sheet, report, 4, span)
  row = addKpiBlock(sheet, report, row + 1, span)
  const narratives = report.sections.filter((section) => section.type !== 'table')
  if (narratives.length) {
    row += 1
    narratives.forEach((section) => {
      sheet.mergeCells(row, 1, row, span)
      sheet.getCell(row, 1).value = localText(section.title, report.locale)
      sheet.getCell(row, 1).font = font(11, true)
      sheet.getCell(row, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.subtle } }
      sheet.getCell(row, 1).alignment = textAlignment(arabic)
      row += 1
      ;(section.items || []).forEach((item) => {
        // Keep list markers in their own edge cell. Embedding a bullet in mixed
        // Arabic/Latin text lets Excel's BiDi algorithm move it to the wrong end.
        const markerColumn = 1
        const textStartColumn = 2
        sheet.getCell(row, markerColumn).value = '•'
        sheet.getCell(row, markerColumn).font = font(10, true, COLORS.crimson)
        sheet.getCell(row, markerColumn).alignment = textAlignment(arabic, {
          horizontal: arabic ? 'right' : 'left',
          vertical: 'top',
        })
        sheet.mergeCells(row, textStartColumn, row, span)
        sheet.getCell(row, textStartColumn).value = localText(item.text || item, report.locale)
        sheet.getCell(row, textStartColumn).font = font(9)
        sheet.getCell(row, textStartColumn).alignment = textAlignment(arabic, { vertical: 'top', wrapText: true })
        sheet.getRow(row).height = 27
        row += 1
      })
      row += 1
    })
  }
  sheet.columns = Array.from({ length: span }, () => ({ width: 13 }))
  sheet.pageSetup.printArea = `A1:L${Math.max(row, 20)}`
  return sheet
}

function applyDataNumberFormat(cell, column) {
  if (column.format === 'currency') cell.numFmt = '#,##0.00 "AED";[Red]-#,##0.00 "AED"'
  else if (column.format === 'number') cell.numFmt = column.decimals === 0 ? '#,##0;[Red]-#,##0' : '#,##0.00;[Red]-#,##0.00'
  else if (column.format === 'percent') cell.numFmt = '0.0%;[Red]-0.0%'
  else if (column.format === 'date') cell.numFmt = 'dd mmm yyyy'
}

function addTableSheet(workbook, report, section, sheetIndex) {
  const arabic = isArabicLocale(report.locale)
  // Keep the report's logical column order. Excel mirrors it visually for RTL
  // worksheets, so manually reversing the array produces a double reversal.
  const columns = section.columns
  const fallback = arabic ? `تفاصيل ${sheetIndex}` : `Detail ${sheetIndex}`
  const sheetName = String(localText(section.sheetName || section.title, report.locale) || fallback).slice(0, 31)
  const sheet = workbook.addWorksheet(sheetName, { properties: { tabColor: { argb: sheetIndex % 2 ? COLORS.gold : COLORS.ink } } })
  applySheetView(sheet, arabic, 4)
  const span = columns.length
  setTitleRow(sheet, 1, localText(section.title, report.locale), span, arabic)
  sheet.mergeCells(2, 1, 2, span)
  sheet.getCell(2, 1).value = `${report.period} · ${localText(report.scope, report.locale)}`
  sheet.getCell(2, 1).font = font(9, false, COLORS.muted)
  sheet.getCell(2, 1).alignment = textAlignment(arabic)
  const header = sheet.getRow(4)
  columns.forEach((column, index) => { header.getCell(index + 1).value = localText(column.label, report.locale) })
  styleHeaderRow(header, arabic)
  ;(section.rows || []).forEach((record, rowIndex) => {
    const row = sheet.getRow(5 + rowIndex)
    let estimatedHeight = section.rowHeight || 22
    columns.forEach((column, columnIndex) => {
      const cell = row.getCell(columnIndex + 1)
      const value = record[column.key]
      const unavailable = value == null || value === ''
      cell.value = unavailable ? '—' : value
      cell.font = font(9)
      cell.alignment = contentAlignment(arabic, value, {
        horizontal: column.align || (arabic ? 'right' : 'left'),
        wrapText: true,
      })
      cell.border = borders
      if (rowIndex % 2) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.subtle } }
      if (!unavailable) applyDataNumberFormat(cell, column)
      if ((section.autoRowHeight || columns.length <= 6) && typeof value === 'string') {
        const columnWidth = column.excelWidth || Math.max(12, Math.min(45, Number(column.width) || 18))
        const estimatedLines = Math.ceil(value.length / Math.max(10, columnWidth * 1.1))
        if (estimatedLines > 1) estimatedHeight = Math.max(estimatedHeight, Math.min(66, 15 * estimatedLines + 7))
      }
    })
    row.height = estimatedHeight
  })
  if (!(section.rows || []).length) {
    sheet.mergeCells(5, 1, 5, span)
    const cell = sheet.getCell(5, 1)
    cell.value = localText(section.emptyText || { en: 'No records for the selected period.', ar: 'لا توجد سجلات للفترة المحددة.' }, report.locale)
    cell.font = font(10, false, COLORS.muted)
    cell.alignment = textAlignment(arabic, { horizontal: 'center' })
    cell.border = borders
    sheet.getRow(5).height = 35
  }
  sheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: Math.max(5, 4 + (section.rows || []).length), column: span } }
  columns.forEach((column, index) => { sheet.getColumn(index + 1).width = column.excelWidth || Math.max(12, Math.min(45, Number(column.width) || 18)) })
  const dataEnd = Math.max(5, 4 + (section.rows || []).length)
  section.conditionalFormats?.forEach((format) => {
    const colIndex = columns.findIndex((column) => column.key === format.key) + 1
    if (!colIndex) return
    const rules = (format.rules || []).map((rule) => rule.type === 'dataBar'
      ? { showValue: true, gradient: true, cfvo: [{ type: 'min' }, { type: 'max' }], ...rule }
      : rule)
    sheet.addConditionalFormatting({ ref: `${sheet.getColumn(colIndex).letter}5:${sheet.getColumn(colIndex).letter}${dataEnd}`, rules })
  })
  sheet.pageSetup.printTitlesRow = '1:4'
  sheet.pageSetup.printArea = `A1:${sheet.getColumn(span).letter}${dataEnd}`
  return sheet
}

function addMetadataSheet(workbook, report) {
  const arabic = isArabicLocale(report.locale)
  const sheet = workbook.addWorksheet(arabic ? 'البيانات الوصفية' : 'Metadata')
  applySheetView(sheet, arabic, 1)
  const rows = [
    [arabic ? 'الحقل' : 'Field', arabic ? 'القيمة' : 'Value'],
    [arabic ? 'معرّف التقرير' : 'Report ID', report.id],
    [arabic ? 'الفترة' : 'Period', report.period],
    [arabic ? 'النطاق' : 'Scope', localText(report.scope, report.locale)],
    [arabic ? 'وقت الإنشاء' : 'Generated', report.generatedAt],
    [arabic ? 'أعده' : 'Prepared by', localText(report.preparedBy, report.locale)],
    [arabic ? 'لغة التقرير' : 'Language', report.locale],
    [arabic ? 'الإصدار' : 'Report version', `v${REPORT_META.version}`],
    ...(report.metadata || []).map((entry) => [localText(entry.label, report.locale), entry.value]),
    [null, null],
    [arabic ? 'جودة البيانات والقيود' : 'Data quality and limitations', null],
    ...(report.dataQuality || []).map((note) => [null, localText(note, report.locale)]),
    [null, null],
    [arabic ? 'ملاحظات المصدر' : 'Source notes', null],
    ...(report.sourceNotes || []).map((note) => [null, localText(note, report.locale)]),
  ]
  rows.forEach((values, index) => {
    const row = sheet.addRow(values)
    row.getCell(1).font = font(9, index === 0 || values[1] == null)
    row.getCell(2).font = font(9)
    row.eachCell((cell) => {
      cell.border = borders
      cell.alignment = contentAlignment(arabic, cell.value, { vertical: 'top', wrapText: true })
    })
    if (index === 0) styleHeaderRow(row, arabic)
    else if (index % 2) row.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.subtle } } })
    row.height = 24
  })
  sheet.columns = [{ width: 34 }, { width: 90 }]
  return sheet
}

export function createManagementWorkbook(input) {
  const report = normalizeReport(input)
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'FMAC Operations Suite'
  workbook.lastModifiedBy = localText(report.preparedBy, report.locale)
  workbook.created = new Date()
  workbook.modified = new Date()
  workbook.subject = `${report.period} · ${localText(report.scope, report.locale)}`
  workbook.title = localText(report.title, report.locale)
  workbook.company = REPORT_META.organization
  workbook.category = 'Management reporting'
  workbook.keywords = `FMAC, ${report.id}, operations`
  workbook.calcProperties.fullCalcOnLoad = true
  addExecutiveSummary(workbook, report)
  report.sections.filter((section) => section.type === 'table').forEach((section, index) => addTableSheet(workbook, report, section, index + 1))
  addMetadataSheet(workbook, report)
  return workbook
}

export async function downloadManagementWorkbook(report) {
  const workbook = createManagementWorkbook(report)
  const data = await workbook.xlsx.writeBuffer()
  const blob = new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const language = isArabicLocale(report.locale) ? 'AR' : 'EN'
  link.href = url
  link.download = `${safeFilePart(report.fileName || report.id)}-${language}.xlsx`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
  return workbook
}
