import React from 'react'
import { Document, Font, Image, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer'
import {
  REPORT_COLORS,
  REPORT_META,
  isArabicLocale,
  localText,
  normalizeReport,
  safeFilePart,
} from './reportTheme.js'

const h = React.createElement
let registeredFontSignature = ''

const styles = StyleSheet.create({
  page: { backgroundColor: '#ffffff', color: REPORT_COLORS.ink, fontFamily: 'Cairo', fontSize: 8.2, paddingTop: 32, paddingRight: 30, paddingBottom: 31, paddingLeft: 30 },
  rtl: { direction: 'rtl' },
  header: { position: 'absolute', top: 9, left: 30, right: 30, height: 18, borderBottomWidth: 0.5, borderBottomColor: REPORT_COLORS.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLogo: { width: 55, height: 24, objectFit: 'contain' },
  headerTitle: { fontSize: 7.5, color: REPORT_COLORS.muted, fontWeight: 700 },
  footer: { position: 'absolute', bottom: 9, left: 30, right: 30, height: 14, borderTopWidth: 0.5, borderTopColor: REPORT_COLORS.border, paddingTop: 5, color: REPORT_COLORS.muted, fontSize: 6.4 },
  footerText: { color: REPORT_COLORS.muted, fontSize: 6.4, lineHeight: 1.2 },
  pageNumber: { position: 'absolute', bottom: 14, right: 30, width: 240, color: REPORT_COLORS.muted, fontFamily: 'Cairo', fontSize: 7.2, textAlign: 'right' },
  cover: { paddingTop: 28, paddingRight: 42, paddingBottom: 28, paddingLeft: 42 },
  coverLogo: { width: 94, height: 42, objectFit: 'contain' },
  coverTitleBlock: { marginTop: 42, paddingLeft: 15, borderLeftWidth: 4, borderLeftColor: REPORT_COLORS.crimson },
  coverTitleBlockRtl: { marginTop: 42, paddingRight: 15, borderRightWidth: 4, borderRightColor: REPORT_COLORS.crimson },
  coverTitle: { fontSize: 25, lineHeight: 1.25, fontWeight: 700, color: REPORT_COLORS.ink },
  coverSubtitle: { marginTop: 8, fontSize: 11, lineHeight: 1.5, color: REPORT_COLORS.muted },
  coverMeta: { marginTop: 28, width: '74%' },
  coverMetaItem: { marginBottom: 12 },
  coverMetaLabel: { fontSize: 6.8, fontWeight: 700, color: REPORT_COLORS.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  coverMetaValue: { marginTop: 3, fontSize: 10, lineHeight: 1.4 },
  coverClassification: { position: 'absolute', left: 42, right: 42, bottom: 50, padding: 15, backgroundColor: REPORT_COLORS.subtle, borderRadius: 5 },
  classificationLabel: { color: REPORT_COLORS.gold, fontSize: 7.5, fontWeight: 700, letterSpacing: 0.4 },
  classificationValue: { marginTop: 6, color: REPORT_COLORS.muted, fontSize: 7.2 },
  kpiGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  kpiGridRtl: { flexDirection: 'row-reverse' },
  kpiCard: { width: '24%', minHeight: 67, paddingTop: 10, paddingRight: 10, paddingBottom: 9, paddingLeft: 10, backgroundColor: REPORT_COLORS.subtle, borderWidth: 0.5, borderColor: REPORT_COLORS.border, borderRadius: 4 },
  kpiLabel: { fontSize: 6.8, fontWeight: 700, color: REPORT_COLORS.muted, lineHeight: 1.35 },
  kpiValue: { marginTop: 8, fontSize: 15, fontWeight: 700, lineHeight: 1.2 },
  kpiNote: { marginTop: 5, fontSize: 6.4, color: REPORT_COLORS.muted },
  sectionHeading: { marginTop: 8, marginBottom: 7, paddingLeft: 8, borderLeftWidth: 3, borderLeftColor: REPORT_COLORS.gold, fontSize: 12, fontWeight: 700, lineHeight: 1.3 },
  sectionHeadingRtl: { paddingLeft: 0, paddingRight: 8, borderLeftWidth: 0, borderRightWidth: 3, borderRightColor: REPORT_COLORS.gold, textAlign: 'right' },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6, paddingRight: 4 },
  bulletRowRtl: { flexDirection: 'row-reverse', paddingRight: 0, paddingLeft: 4 },
  bullet: { width: 5, height: 5, borderRadius: 3, backgroundColor: REPORT_COLORS.muted, marginTop: 4, marginRight: 8 },
  bulletRtl: { marginRight: 0, marginLeft: 8 },
  bulletText: { flex: 1, fontSize: 8.2, lineHeight: 1.55 },
  table: { borderTopWidth: 0.5, borderLeftWidth: 0.5, borderColor: REPORT_COLORS.border },
  tableHeader: { flexDirection: 'row', backgroundColor: REPORT_COLORS.ink, color: '#fafafc', minHeight: 26, alignItems: 'stretch' },
  tableHeaderRtl: { flexDirection: 'row-reverse' },
  tableRow: { flexDirection: 'row', minHeight: 24, alignItems: 'stretch', backgroundColor: '#ffffff' },
  tableRowRtl: { flexDirection: 'row-reverse' },
  tableRowAlt: { backgroundColor: REPORT_COLORS.subtle },
  tableCell: { borderRightWidth: 0.5, borderBottomWidth: 0.5, borderColor: REPORT_COLORS.border, paddingTop: 5, paddingRight: 5, paddingBottom: 5, paddingLeft: 5, justifyContent: 'center' },
  tableHeaderText: { color: '#fafafc', fontSize: 6.8, lineHeight: 1.25, fontWeight: 700 },
  tableCellText: { fontSize: 7.1, lineHeight: 1.35 },
  empty: { padding: 20, borderWidth: 0.5, borderColor: REPORT_COLORS.border, backgroundColor: REPORT_COLORS.subtle, textAlign: 'center', color: REPORT_COLORS.muted },
  pageTitleMeta: { marginBottom: 7, fontSize: 6.8, color: REPORT_COLORS.muted },
  pageTitleMetaRtl: { textAlign: 'right' },
  qualityBox: { marginTop: 10, padding: 10, backgroundColor: '#fff8e6', borderLeftWidth: 3, borderLeftColor: REPORT_COLORS.amber },
  qualityBoxRtl: { borderLeftWidth: 0, borderRightWidth: 3, borderRightColor: REPORT_COLORS.amber },
  qualityTitle: { fontSize: 8, fontWeight: 700, color: REPORT_COLORS.amber, marginBottom: 5 },
  noteText: { fontSize: 7.4, lineHeight: 1.5, color: REPORT_COLORS.muted, marginBottom: 4 },
})

function ensureFonts({ fontRegularBase64, fontBoldBase64 } = {}) {
  if (!fontRegularBase64 || !fontBoldBase64) throw new Error('Actual Cairo font files are required for report generation.')
  const signature = `${fontRegularBase64.length}:${fontBoldBase64.length}`
  if (signature === registeredFontSignature) return
  Font.register({
    family: 'Cairo',
    fonts: [
      { src: `data:font/ttf;base64,${fontRegularBase64}`, fontWeight: 400 },
      { src: `data:font/ttf;base64,${fontBoldBase64}`, fontWeight: 700 },
    ],
  })
  Font.registerHyphenationCallback((word) => [word])
  registeredFontSignature = signature
}

function textAlign(arabic, explicit) {
  if (explicit === 'right') return 'right'
  if (explicit === 'center') return 'center'
  return arabic ? 'right' : 'left'
}

function statusHex(status) {
  const value = String(status || '').toLowerCase()
  if (['good', 'success', 'verified', 'available', 'on-target'].includes(value)) return REPORT_COLORS.green
  if (['warning', 'provisional', 'attention', 'due'].includes(value)) return REPORT_COLORS.amber
  if (['bad', 'danger', 'critical', 'overdue', 'unavailable'].includes(value)) return REPORT_COLORS.red
  return REPORT_COLORS.muted
}

function displayValue(item, locale) {
  if (item.display != null) return localText(item.display, locale)
  if (item.value == null || item.value === '') return isArabicLocale(locale) ? 'غير متاح' : 'Unavailable'
  return `${item.value}${item.unit ? ` ${localText(item.unit, locale)}` : ''}`
}

function Header({ report, logoDataUri }) {
  return h(View, { style: styles.header, fixed: true },
    logoDataUri ? h(Image, { style: styles.headerLogo, src: logoDataUri }) : h(View, null),
    h(Text, { style: styles.headerTitle }, localText(report.title, report.locale)),
  )
}

function Footer({ report }) {
  const arabic = isArabicLocale(report.locale)
  return h(View, { style: styles.footer, fixed: true },
    h(Text, { style: styles.footerText }, arabic ? REPORT_META.departmentAr : `${REPORT_META.organization} · ${REPORT_META.department}`),
  )
}

function PageNumber({ report }) {
  const arabic = isArabicLocale(report.locale)
  return h(Text, { fixed: true, style: styles.pageNumber, render: ({ pageNumber, totalPages }) => arabic
      ? `${REPORT_META.confidentialityAr} · صفحة ${pageNumber} من ${totalPages}`
      : `${REPORT_META.confidentiality} · Page ${pageNumber} of ${totalPages}` })
}

function ReportPage({ report, logoDataUri, children, size = 'A4', orientation = 'landscape' }) {
  const arabic = isArabicLocale(report.locale)
  return h(Page, { size, orientation, style: [styles.page, arabic && styles.rtl], wrap: true },
    h(Header, { report, logoDataUri }),
    children,
    h(Footer, { report }),
    PageNumber({ report }),
  )
}

function CoverPage({ report, logoDataUri }) {
  const arabic = isArabicLocale(report.locale)
  const meta = [
    [arabic ? 'الفترة' : 'Reporting period', report.period],
    [arabic ? 'النطاق' : 'Scope', localText(report.scope, report.locale)],
    [arabic ? 'أعده' : 'Prepared by', localText(report.preparedBy, report.locale)],
    [arabic ? 'تاريخ الإنشاء' : 'Generated', report.generatedAt],
  ]
  return h(Page, { size: 'A4', orientation: report.orientation || 'landscape', style: [styles.page, styles.cover, arabic && styles.rtl] },
    logoDataUri ? h(Image, { style: styles.coverLogo, src: logoDataUri }) : null,
    h(View, { style: arabic ? styles.coverTitleBlockRtl : styles.coverTitleBlock },
      h(Text, { style: [styles.coverTitle, arabic && { textAlign: 'right' }] }, localText(report.title, report.locale)),
      h(Text, { style: [styles.coverSubtitle, arabic && { textAlign: 'right' }] }, localText(report.subtitle, report.locale)),
    ),
    h(View, { style: [styles.coverMeta, arabic && { alignSelf: 'flex-end' }] },
      ...meta.map(([label, value], index) => h(View, { key: index, style: styles.coverMetaItem },
        h(Text, { style: [styles.coverMetaLabel, arabic && { textAlign: 'right' }] }, label),
        h(Text, { style: [styles.coverMetaValue, arabic && { textAlign: 'right' }] }, String(value ?? '—')),
      )),
    ),
    h(View, { style: styles.coverClassification },
      h(Text, { style: [styles.classificationLabel, arabic && { textAlign: 'right' }] }, arabic ? 'وثيقة إدارية' : 'MANAGEMENT DOCUMENT'),
      h(Text, { style: [styles.classificationValue, arabic && { textAlign: 'right' }] }, `${arabic ? REPORT_META.confidentialityAr : REPORT_META.confidentiality} · v${REPORT_META.version}`),
    ),
    h(Footer, { report }),
    PageNumber({ report }),
  )
}

function SectionHeading({ report, title }) {
  const arabic = isArabicLocale(report.locale)
  return h(Text, { style: [styles.sectionHeading, arabic && styles.sectionHeadingRtl] }, localText(title, report.locale))
}

function Narrative({ report, section }) {
  const arabic = isArabicLocale(report.locale)
  return h(View, { wrap: false },
    h(SectionHeading, { report, title: section.title }),
    ...(section.items || []).map((item, index) => h(View, { key: index, style: [styles.bulletRow, arabic && styles.bulletRowRtl] },
      h(View, { style: [styles.bullet, arabic && styles.bulletRtl, { backgroundColor: statusHex(item.status) }] }),
      h(Text, { style: [styles.bulletText, arabic && { textAlign: 'right' }] }, localText(item.text || item, report.locale)),
    )),
  )
}

function Kpis({ report }) {
  const arabic = isArabicLocale(report.locale)
  return h(View, { style: [styles.kpiGrid, arabic && styles.kpiGridRtl], wrap: false },
    ...report.kpis.slice(0, 4).map((item, index) => h(View, { key: index, style: [styles.kpiCard, { borderTopWidth: 3, borderTopColor: statusHex(item.status) }] },
      h(Text, { style: [styles.kpiLabel, arabic && { textAlign: 'right' }] }, localText(item.label, report.locale)),
      h(Text, { style: [styles.kpiValue, arabic && { textAlign: 'right' }] }, displayValue(item, report.locale)),
      item.note ? h(Text, { style: [styles.kpiNote, arabic && { textAlign: 'right' }] }, localText(item.note, report.locale)) : null,
    )),
  )
}

function formatCell(value, column, locale) {
  if (value == null || value === '') return '—'
  if (column.format === 'currency' && Number.isFinite(Number(value))) {
    const amount = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(Number(value))
    return isArabicLocale(locale) ? `${amount} درهم` : `${column.currency || 'AED'} ${amount}`
  }
  if (column.format === 'number' && Number.isFinite(Number(value))) return new Intl.NumberFormat(locale, { maximumFractionDigits: column.decimals ?? 2 }).format(Number(value))
  if (column.format === 'percent' && Number.isFinite(Number(value))) return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(Number(value))
  return String(value)
}

function Table({ report, section, rows }) {
  const arabic = isArabicLocale(report.locale)
  const columns = (section.columns || []).filter((column) => !column.pdfHidden && !(arabic && column.pdfHiddenArabic) && !(!arabic && column.pdfHiddenEnglish))
  const totalWeight = columns.reduce((sum, column) => sum + Number(column.pdfWeight || column.excelWidth || 18), 0)
  const cellStyle = (column) => ({ width: `${(Number(column.pdfWeight || column.excelWidth || 18) / totalWeight) * 100}%` })
  if (!rows.length) return h(View, { style: styles.empty }, h(Text, null, localText(section.emptyText || { en: 'No records for the selected period.', ar: 'لا توجد سجلات للفترة المحددة.' }, report.locale)))
  return h(View, { style: styles.table },
    h(View, { style: [styles.tableHeader, arabic && styles.tableHeaderRtl], fixed: false },
      ...columns.map((column) => h(View, { key: column.key, style: [styles.tableCell, cellStyle(column)] },
        h(Text, { style: [styles.tableHeaderText, { textAlign: textAlign(arabic, column.align) }] }, localText(column.label, report.locale)),
      )),
    ),
    ...rows.map((row, rowIndex) => h(View, { key: rowIndex, style: [styles.tableRow, arabic && styles.tableRowRtl, rowIndex % 2 && styles.tableRowAlt], wrap: false },
      ...columns.map((column) => h(View, { key: column.key, style: [styles.tableCell, cellStyle(column)] },
        h(Text, { style: [styles.tableCellText, { textAlign: textAlign(arabic, column.align) }] }, formatCell(row[column.key], column, report.locale)),
      )),
    )),
  )
}

function OverviewPage({ report, logoDataUri, executive, compactTable }) {
  return h(ReportPage, { report, logoDataUri, orientation: report.orientation || 'landscape' },
    h(Kpis, { report }),
    executive ? h(Narrative, { report, section: executive }) : null,
    compactTable ? h(View, { wrap: false }, h(SectionHeading, { report, title: compactTable.title }), h(Table, { report, section: compactTable, rows: compactTable.rows || [] })) : null,
  )
}

function TablePages({ report, logoDataUri, section }) {
  const rows = section.rows || []
  const perPage = section.pdfRowsPerPage || (section.columns?.length > 8 ? 14 : section.columns?.length > 6 ? 17 : 21)
  const chunks = rows.length ? Array.from({ length: Math.ceil(rows.length / perPage) }, (_, index) => rows.slice(index * perPage, (index + 1) * perPage)) : [[]]
  return chunks.map((chunk, index) => h(ReportPage, { key: `${localText(section.title, report.locale)}-${index}`, report, logoDataUri, orientation: report.orientation || 'landscape' },
    h(SectionHeading, { report, title: section.title }),
    h(Text, { style: [styles.pageTitleMeta, isArabicLocale(report.locale) && styles.pageTitleMetaRtl] }, `${report.period} · ${localText(report.scope, report.locale)}${chunks.length > 1 ? ` · ${index + 1}/${chunks.length}` : ''}`),
    h(Table, { report, section, rows: chunk }),
  ))
}

function NotesPage({ report, logoDataUri, narratives }) {
  const arabic = isArabicLocale(report.locale)
  return h(ReportPage, { report, logoDataUri, orientation: report.orientation || 'landscape' },
    ...narratives.map((section, index) => h(Narrative, { key: index, report, section })),
    report.dataQuality.length ? h(View, { style: [styles.qualityBox, arabic && styles.qualityBoxRtl] },
      h(Text, { style: [styles.qualityTitle, arabic && { textAlign: 'right' }] }, arabic ? 'جودة البيانات والقيود' : 'Data quality and limitations'),
      ...report.dataQuality.map((note, index) => h(Text, { key: index, style: [styles.noteText, arabic && { textAlign: 'right' }] }, `• ${localText(note, report.locale)}`)),
    ) : null,
    report.sourceNotes.length ? h(View, null,
      h(SectionHeading, { report, title: { en: 'Source notes', ar: 'ملاحظات المصدر' } }),
      ...report.sourceNotes.map((note, index) => h(Text, { key: index, style: [styles.noteText, arabic && { textAlign: 'right' }] }, `• ${localText(note, report.locale)}`)),
    ) : null,
  )
}

export function ManagementReportDocument({ input, assets }) {
  const report = normalizeReport(input)
  const logoDataUri = input.logoDataUri || assets?.logoDataUri
  const narratives = report.sections.filter((section) => section.type !== 'table')
  const executive = narratives[0]
  const tableSections = report.sections.filter((section) => section.type === 'table')
  const compactTable = tableSections[0]?.rows?.length <= 8 ? tableSections.shift() : null
  const trailingNarratives = narratives.slice(executive ? 1 : 0)
  return h(Document, {
    title: localText(report.title, report.locale),
    author: `${REPORT_META.organization} · ${REPORT_META.department}`,
    subject: `${report.period} · ${localText(report.scope, report.locale)}`,
    creator: 'FMAC Operations Suite',
    producer: 'FMAC Reporting Engine',
    language: isArabicLocale(report.locale) ? 'ar-AE' : 'en-AE',
  },
  h(CoverPage, { report, logoDataUri }),
  h(OverviewPage, { report, logoDataUri, executive, compactTable }),
  ...tableSections.flatMap((section) => TablePages({ report, logoDataUri, section })),
  (trailingNarratives.length || report.dataQuality.length || report.sourceNotes.length) ? h(NotesPage, { report, logoDataUri, narratives: trailingNarratives }) : null,
  )
}

export async function createManagementPdfBlob(input, assets = {}) {
  ensureFonts(assets)
  return pdf(h(ManagementReportDocument, { input, assets })).toBlob()
}

export async function createManagementPdfBuffer(input, assets = {}) {
  const blob = await createManagementPdfBlob(input, assets)
  return new Uint8Array(await blob.arrayBuffer())
}

export async function downloadManagementPdf(report, assets = {}) {
  const blob = await createManagementPdfBlob(report, assets)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const language = isArabicLocale(report.locale) ? 'AR' : 'EN'
  link.href = url
  link.download = `${safeFilePart(report.fileName || report.id)}-${language}.pdf`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
  return blob
}
