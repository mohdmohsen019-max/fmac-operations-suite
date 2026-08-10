import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { CairoRegularBase64, CairoBoldBase64 } from '../utils/cairoFont'

// ── Palette (Synchronized with ReportTemplate.css) ──────────────────
const C = {
  primary:   [15,  23,  41], // Deep Navy #0f1729
  secondary: [74,  74, 106],
  gold:      [201, 168,  76], // Gold #c9a84c
  white:     [255, 255, 255],
  tblHead:   [240, 240, 247],
  tblAlt:    [248, 248, 252],
  tblBorder: [224, 224, 232],
  gray:      [190, 190, 200],
  black:     [  0,   0,   0],
}

// ── Arabic Reshaping Utility ───────────────────────────────────────
// Fixes "separated letters" in jsPDF by mapping characters to joined forms.
const ARABIC_MAP = {
  '\u0627': ['\uFE8D', '\uFE8D', '\uFE8E', '\uFE8E'], // Alif
  '\u0628': ['\uFE8F', '\uFE91', '\uFE92', '\uFE90'], // Ba
  '\u062A': ['\uFE95', '\uFE97', '\uFE98', '\uFE96'], // Ta
  '\u062B': ['\uFE99', '\uFE9B', '\uFE9C', '\uFE9A'], // Tha
  '\u062C': ['\uFE9D', '\uFE9F', '\uFEA0', '\uFE9E'], // Jeem
  '\u062D': ['\uFEA1', '\uFEA3', '\uFEA4', '\uFEA2'], // Haa
  '\u062E': ['\uFEA5', '\uFEA7', '\uFEA8', '\uFEA6'], // Khaa
  '\u062F': ['\uFEA9', '\uFEA9', '\uFEAA', '\uFEAA'], // Dal
  '\u0630': ['\uFEAB', '\uFEAB', '\uFEAC', '\uFEAC'], // Thal
  '\u0631': ['\uFEAD', '\uFEAD', '\uFEAE', '\uFEAE'], // Ra
  '\u0632': ['\uFEAF', '\uFEAF', '\uFEB0', '\uFEB0'], // Zain
  '\u0633': ['\uFEB1', '\uFEB3', '\uFEB4', '\uFEB2'], // Seen
  '\u0634': ['\uFEB5', '\uFEB7', '\uFEB8', '\uFEB6'], // Sheen
  '\u0635': ['\uFEB9', '\uFEBB', '\uFEBC', '\uFEBA'], // Sad
  '\u0636': ['\uFEBD', '\uFEBF', '\uFEC0', '\uFEBE'], // Dad
  '\u0637': ['\uFEC1', '\uFEC3', '\uFEC4', '\uFEC2'], // Tah
  '\u0638': ['\uFEC5', '\uFEC7', '\uFEC8', '\uFEC6'], // Zah
  '\u0639': ['\uFEC9', '\uFECB', '\uFECC', '\uFECA'], // Ain
  '\u063A': ['\uFECD', '\uFECF', '\uFED0', '\uFECE'], // Ghain
  '\u0641': ['\uFED1', '\uFED3', '\uFED4', '\uFED2'], // Fa
  '\u0642': ['\uFED5', '\uFED7', '\uFED8', '\uFED6'], // Qaf
  '\u0643': ['\uFED9', '\uFEDB', '\uFEDC', '\uFEDA'], // Kaf
  '\u0644': ['\uFEDD', '\uFEDF', '\uFEE0', '\uFEDE'], // Lam
  '\u0645': ['\uFEE1', '\uFEE3', '\uFEE4', '\uFEE2'], // Meem
  '\u0646': ['\uFEE5', '\uFEE7', '\uFEE8', '\uFEE6'], // Noon
  '\u0647': ['\uFEE9', '\uFEEB', '\uFEEC', '\uFEEA'], // Heh
  '\u0648': ['\uFEED', '\uFEED', '\uFEEE', '\uFEEE'], // Waw
  '\u064A': ['\uFEF1', '\uFEF3', '\uFEF4', '\uFEF2'], // Yeh
  '\u0626': ['\uFE89', '\uFE8B', '\uFE8C', '\uFE8A'], // Yeh Hamza
  '\u0649': ['\uFEEF', '\uFEEF', '\uFEF0', '\uFEF0'], // Alef Maksura
  '\u0629': ['\uFE93', '\uFE93', '\uFE94', '\uFE94'], // Teh Marbuta
  '\u0622': ['\uFE81', '\uFE81', '\uFE82', '\uFE82'], // Alif Madda
  '\u0623': ['\uFE83', '\uFE83', '\uFE84', '\uFE84'], // Alif Hamza Above
  '\u0625': ['\uFE87', '\uFE87', '\uFE88', '\uFE88'], // Alif Hamza Below
  '\u0624': ['\uFE85', '\uFE85', '\uFE86', '\uFE86'], // Waw Hamza
}

const NON_JOIN_RIGHT = new Set(['\u0627', '\u062F', '\u0630', '\u0631', '\u0632', '\u0648', '\u0622', '\u0623', '\u0625', '\u0624', '\uFE8D', '\uFE8E', '\uFEA9', '\uFEAA', '\uFEAB', '\uFEAC', '\uFEAD', '\uFEAE', '\uFEAF', '\uFEB0', '\uFEED', '\uFEEE'])

function reshape(text) {
  if (!text) return ''
  const chars = Array.from(text)
  let result = ''

  for (let i = 0; i < chars.length; i++) {
    const char = chars[i]
    const map  = ARABIC_MAP[char]
    if (!map) { result += char; continue }

    const prev = chars[i - 1]
    const next = chars[i + 1]

    const canJoinPrev = prev && ARABIC_MAP[prev] && !NON_JOIN_RIGHT.has(prev)
    const canJoinNext = next && ARABIC_MAP[next]

    if (canJoinPrev && canJoinNext) result += map[2] // Medial
    else if (canJoinPrev) result += map[3] // Final
    else if (canJoinNext) result += map[1] // Initial
    else result += map[0] // Isolated
  }
  return result
}

const ARABIC_MONTHS = [
  'يناير','فبراير','مارس','أبريل','مايو','يونيو',
  'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'
]

const TABLE_TITLE_AR = {
  'Vehicle Usage Summary': 'ملخص استخدام المركبات',
  'Maintenance Log': 'سجل الصيانة',
  'Vehicle Fuel Breakdown': 'تفاصيل الوقود لكل مركبة',
}

const HEADER_AR = {
  'Registration': 'رقم اللوحة',
  'Total Trips': 'إجمالي الرحلات',
  'Total Distance': 'المسافة الكلية',
  'Date': 'التاريخ',
  'Vehicle': 'المركبة',
  'Type': 'النوع',
  'Cost': 'التكلفة',
  'Distance': 'المسافة',
  'Volume': 'الحجم',
  'Estimated Cost': 'التكلفة التقديرية',
  'Item': 'البند',
  'Quantity': 'الكمية',
  'Amount': 'المبلغ',
  'Description': 'الوصف',
  'Status': 'الحالة',
  'Category': 'الفئة',
}

const KPI_DEFS = {
  bus_trips: [
    { key: 'totalKm',      label: 'إجمالي الكيلومترات', unit: 'كم' },
    { key: 'totalTrips',   label: 'إجمالي الرحلات',     unit: '' },
    { key: 'vehicleCount', label: 'عدد المركبات',       unit: '' },
  ],
  maintenance: [
    { key: 'totalSpent', label: 'إجمالي التكاليف', unit: 'د.إ' },
    { key: 'taskCount',  label: 'مهام الصيانة',   unit: '' },
  ],
  complaints: [
    { key: 'total',  label: 'إجمالي الشكاوى', unit: '' },
    { key: 'closed', label: 'تم الحل',        unit: '' },
    { key: 'open',   label: 'قيد الانتظار',   unit: '' },
  ],
  fuel: [
    { key: 'totalCost',   label: 'إجمالي التكاليف',   unit: 'د.إ' },
    { key: 'totalLiters', label: 'إجمالي اللترات',    unit: 'لتر' },
    { key: 'totalKm',     label: 'المسافة المقطوعة',  unit: 'كم' },
  ],
}

const AUTO_SECTIONS = new Set(['bus_trips', 'maintenance', 'complaints', 'fuel'])

// ── Helpers ────────────────────────────────────────────────────────

function arabicMonthYear(monthStr) {
  if (!monthStr) return ''
  const [yr, mo] = monthStr.split('-')
  const idx = parseInt(mo, 10) - 1
  return reshape(`${ARABIC_MONTHS[idx] ?? mo} ${yr}`)
}

function arabicDateStr(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date)
  return reshape(`${d.getDate()} ${ARABIC_MONTHS[d.getMonth()]} ${d.getFullYear()}`)
}

function translateCell(val) {
  if (val === null || val === undefined) return ''
  const s = String(val)
  return reshape(s
    .replace(/AED\s*/g, 'د.إ ')
    .replace(/\bKM\b/gi, 'كم')
    .replace(/\bkm\b/g, 'كم')
    .replace(/\bL\b(?![a-zA-Z])/g, 'لتر')
    .replace(/\bN\/A\b/g, 'غير متوفر'))
}

function parseContent(raw) {
  if (!raw) return {}
  if (typeof raw === 'object') return raw
  try { return JSON.parse(raw) } catch { return {} }
}

async function fetchLogoBase64() {
  try {
    // Every PDF logo placement (cover + running header) sits on deep navy —
    // use the white-text variant, the dark lockup vanishes there.
    const res = await fetch('/fmac-ops-logo-light.png')
    if (!res.ok) return null
    const blob = await res.blob()
    return new Promise(resolve => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

// ── Font setup ─────────────────────────────────────────────────────

function setupFont(doc) {
  doc.addFileToVFS('Cairo-Regular.ttf', CairoRegularBase64)
  doc.addFont('Cairo-Regular.ttf', 'Cairo', 'normal')
  doc.addFileToVFS('Cairo-Bold.ttf', CairoBoldBase64)
  doc.addFont('Cairo-Bold.ttf', 'Cairo', 'bold')
  doc.setFont('Cairo', 'normal')
  doc.setR2L(true)
}

// ── Cover Page ─────────────────────────────────────────────────────

function drawCoverPage(doc, { arabicMY, generatedBy, todayAr, W, H, logoBase64 }) {
  // Deep navy full-page background
  doc.setFillColor(...C.primary)
  doc.rect(0, 0, W, H, 'F')

  // Top gold band
  doc.setFillColor(...C.gold)
  doc.rect(0, 0, W, 5, 'F')

  // Bottom gold band
  doc.rect(0, H - 5, W, 5, 'F')

  // Left vertical gold accent
  doc.rect(16, 20, 1.5, H - 40, 'F')

  // Logo (centered, top area)
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', W / 2 - 16, 22, 32, 32)
    } catch { /* no-op */ }
  }

  const cx = W / 2

  // Gold horizontal divider
  doc.setDrawColor(...C.gold)
  doc.setLineWidth(0.8)
  doc.line(cx - 50, 60, cx + 50, 60)

  // Main title
  doc.setFont('Cairo', 'bold')
  doc.setFontSize(28)
  doc.setTextColor(...C.gold)
  doc.text(reshape('تقرير الأقسام الشهري'), cx, 78, { align: 'center' })

  // Subtitle
  doc.setFont('Cairo', 'normal')
  doc.setFontSize(13)
  doc.setTextColor(...C.white)
  doc.text(reshape('قسم العمليات — نادي الفجيرة للفنون القتالية'), cx, 92, { align: 'center' })

  // Second divider
  doc.setLineWidth(0.5)
  doc.line(cx - 40, 100, cx + 40, 100)

  // Month and year (large, white)
  doc.setFont('Cairo', 'bold')
  doc.setFontSize(26)
  doc.setTextColor(...C.white)
  doc.text(arabicMY, cx, 118, { align: 'center' })

  // Third thin divider
  doc.setDrawColor(80, 80, 120)
  doc.setLineWidth(0.3)
  doc.line(cx - 25, 126, cx + 25, 126)

  // Bottom metadata block
  doc.setFont('Cairo', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(160, 165, 185)
  doc.text(reshape(`أعده: ${generatedBy || 'رئيس قسم العمليات'}`), cx, 218, { align: 'center' })
  doc.text(reshape(`التاريخ: ${todayAr}`), cx, 229, { align: 'center' })

  doc.setFont('Cairo', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...C.gold)
  doc.text(reshape('سري — للاستخدام الداخلي فقط'), cx, 248, { align: 'center' })
}

// ── Running Header (all pages except cover) ────────────────────────

function drawRunningHeader(doc, { arabicMY, logoBase64, W }) {
  // Navy bar
  doc.setFillColor(...C.primary)
  doc.rect(0, 0, W, 14, 'F')

  // Report title (right side)
  doc.setFont('Cairo', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...C.white)
  doc.text(reshape(`تقرير الأقسام — ${arabicMY}`), W - 10, 9, { align: 'right' })

  // Logo or club name (left side)
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', 7, 1.5, 12, 12)
    } catch {
      _drawHeaderFallbackText(doc)
    }
  } else {
    _drawHeaderFallbackText(doc)
  }

  // Gold bottom border of header
  doc.setDrawColor(...C.gold)
  doc.setLineWidth(0.5)
  doc.line(0, 14, W, 14)
}

function _drawHeaderFallbackText(doc) {
  doc.setFont('Cairo', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(...C.gold)
  doc.text('FMAC', 10, 9, { align: 'left' })
}

// ── Running Footer (all pages except cover) ────────────────────────

function drawRunningFooter(doc, { pageNum, totalPages, sectionName, W, H }) {
  const borderY = H - 13
  const textY   = H - 7

  doc.setDrawColor(...C.gray)
  doc.setLineWidth(0.3)
  doc.line(0, borderY, W, borderY)

  doc.setFont('Cairo', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(...C.secondary)
  doc.text(reshape('سري'), 10, textY, { align: 'left' })

  doc.setFont('Cairo', 'normal')
  doc.text(reshape(`صفحة ${pageNum} من ${totalPages}`), W / 2, textY, { align: 'center' })

  if (sectionName) {
    doc.text(reshape(sectionName), W - 10, textY, { align: 'right' })
  }
}

// ── Table of Contents ──────────────────────────────────────────────

function drawTOCPage(doc, tocEntries, { margin, W, CONTENT_TOP }) {
  let y = CONTENT_TOP + 8
  const startX = W - margin.right

  // Title
  doc.setFont('Cairo', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(...C.primary)
  doc.text(reshape('فهرس المحتويات'), startX, y, { align: 'right' })
  y += 3

  doc.setDrawColor(...C.gold)
  doc.setLineWidth(1)
  doc.line(margin.left, y, W - margin.right, y)
  y += 10

  if (!tocEntries.length) return

  // TOC as a table — columns: number | page | section name
  // Visually (left→right): # | صفحة | القسم (name is rightmost = Arabic primary)
  autoTable(doc, {
    startY: y,
    head: [[reshape('#'), reshape('الصفحة'), reshape('القسم')]],
    body: tocEntries.map(e => [
      String(e.number).padStart(2, '0'),
      String(e.page),
      reshape(e.name)
    ]),
    theme: 'striped',
    styles: {
      font: 'Cairo',
      fontSize: 11,
      cellPadding: { top: 3, bottom: 3, right: 4, left: 4 },
      lineColor: C.tblBorder,
      lineWidth: 0.3,
    },
    headStyles: {
      font: 'Cairo',
      fontStyle: 'bold',
      fontSize: 11,
      fillColor: C.primary,
      textColor: C.white,
      halign: 'center',
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 14, fontStyle: 'bold', textColor: C.gold },
      1: { halign: 'center', cellWidth: 20, textColor: C.secondary },
      2: { cellWidth: 136, halign: 'right', fontStyle: 'bold', textColor: C.primary },
    },
    alternateRowStyles: { fillColor: C.tblAlt },
    tableWidth: W - margin.left - margin.right,
    margin: { left: margin.left, right: margin.right, top: CONTENT_TOP + 2, bottom: 22 },
  })
}

// ── Section Header Bar ─────────────────────────────────────────────

function drawSectionBar(doc, { num, name, W, yTop }) {
  const BAR_H = 14

  // Navy background
  doc.setFillColor(...C.primary)
  doc.rect(0, yTop, W, BAR_H, 'F')

  // Gold left accent stripe
  doc.setFillColor(...C.gold)
  doc.rect(0, yTop, 3.5, BAR_H, 'F')

  // Section number (left side)
  doc.setFont('Cairo', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(...C.gold)
  doc.text(String(num).padStart(2, '0'), 9, yTop + 10, { align: 'left' })

  // Section name (right side)
  doc.setFont('Cairo', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...C.white)
  doc.text(reshape(name), W - 10, yTop + 10, { align: 'right' })
}

// ── KPI Row ────────────────────────────────────────────────────────

function drawKPIRow(doc, kpis, { margin, contentWidth, y }) {
  const count = kpis.length
  const gap   = 4
  const boxW  = (contentWidth - gap * (count - 1)) / count

  kpis.forEach((kpi, i) => {
    const x = margin.left + i * (boxW + gap)

    // Box background
    doc.setFillColor(...C.tblHead)
    doc.roundedRect(x, y, boxW, 22, 2, 2, 'F')

    // Gold top accent bar
    doc.setFillColor(...C.gold)
    doc.rect(x, y, boxW, 2, 'F')

    // Value (large)
    doc.setFont('Cairo', 'bold')
    doc.setFontSize(20)
    doc.setTextColor(...C.primary)
    const valStr = `${(kpi.value ?? 0)}${kpi.unit ? ' ' + kpi.unit : ''}`
    doc.text(valStr, x + boxW - 5, y + 13, { align: 'right' })

    // Label
    doc.setFont('Cairo', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...C.secondary)
    doc.text(reshape(kpi.label), x + boxW - 5, y + 20, { align: 'right' })
  })

  return y + 26
}

// ── Section subheading helper ──────────────────────────────────────

function drawSubheading(doc, text, y, { W, margin, startX }) {
  doc.setFont('Cairo', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...C.primary)
  doc.text(reshape(text), startX, y, { align: 'right' })

  doc.setDrawColor(...C.gold)
  doc.setLineWidth(0.4)
  doc.line(margin.left, y + 2, W - margin.right, y + 2)

  return y + 8
}

// ── Section Content Renderer ───────────────────────────────────────

function renderSection(doc, section, num, { margin, contentWidth, startX, W, CONTENT_TOP, CONTENT_BOTTOM }) {
  const key     = section.sectionKey
  const name    = section.nameAr || key
  const content = parseContent(section.content)

  // Section bar at CONTENT_TOP
  drawSectionBar(doc, { num, name, W, yTop: CONTENT_TOP })
  let y = CONTENT_TOP + 18

  // ── SUMMARY ──────────────────────────────────────────────────────
  const summaryText = content.summaryAr || content.summary || ''
  if (summaryText) {
    if (y + 22 > CONTENT_BOTTOM) { doc.addPage(); y = CONTENT_TOP + 4 }
    y = drawSubheading(doc, 'ملخص القسم', y, { W, margin, startX })

    doc.setFont('Cairo', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(30, 30, 50)
    const lines = doc.splitTextToSize(summaryText, contentWidth)
    lines.forEach(line => {
      if (y + 7 > CONTENT_BOTTOM) { doc.addPage(); y = CONTENT_TOP + 4 }
      doc.text(line, startX, y, { align: 'right' })
      y += 6.5
    })
    y += 5
  }

  // ── KPIs ──────────────────────────────────────────────────────────
  const nums = content.numbers || {}
  let kpis = []

  const defs = KPI_DEFS[key] || []
  if (defs.length > 0) {
    kpis = defs.filter(d => nums[d.key] !== undefined).map(d => ({ ...d, value: nums[d.key] }))
  } else {
    // Generic KPI extraction for manual sections
    kpis = Object.entries(nums)
      .filter(([, v]) => typeof v === 'number')
      .slice(0, 6)
      .map(([k, v]) => ({
        key: k,
        label: k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()).trim(),
        unit: '',
        value: v
      }))
  }

  if (kpis.length > 0) {
    if (y + 30 > CONTENT_BOTTOM) { doc.addPage(); y = CONTENT_TOP + 4 }
    y = drawKPIRow(doc, kpis, { margin, contentWidth, y })
    y += 4
  }

  // ── KEY POINTS ────────────────────────────────────────────────────
  const keyPoints = content.keyPointsAr?.length
    ? content.keyPointsAr
    : (content.keyPoints || [])

  if (keyPoints.length > 0) {
    if (y + 22 > CONTENT_BOTTOM) { doc.addPage(); y = CONTENT_TOP + 4 }
    y = drawSubheading(doc, 'النقاط الرئيسية', y, { W, margin, startX })

    doc.setFont('Cairo', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(30, 30, 50)
    keyPoints.forEach(pt => {
      if (y + 7 > CONTENT_BOTTOM) { doc.addPage(); y = CONTENT_TOP + 4 }
      const ptLines = doc.splitTextToSize(reshape(`• ${pt}`), contentWidth - 5)
      ptLines.forEach(line => {
        doc.text(line, startX, y, { align: 'right' })
        y += 6.5
      })
    })
    y += 5
  }

  // ── TABLES ────────────────────────────────────────────────────────
  const tables = content.tables || []
  tables.forEach(tbl => {
    if (!tbl?.headers?.length || !tbl?.rows?.length) return
    if (y + 30 > CONTENT_BOTTOM) { doc.addPage(); y = CONTENT_TOP + 4 }

    // Use standardized Arabic headers
    const headers = tbl.headers.map(h => HEADER_AR[h] || h)
    const rows    = tbl.rows.map(row => row.map(translateCell))
    const titleAr = TABLE_TITLE_AR[tbl.title] || tbl.title

    if (titleAr) {
      doc.setFont('Cairo', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(...C.primary)
      doc.text(reshape(titleAr), startX, y, { align: 'right' })
      y += 5
    }

    autoTable(doc, {
      startY: y,
      head: [headers],
      body: rows,
      theme: 'grid',
      styles: {
        font: 'Cairo',
        fontSize: 9,
        halign: 'right',
        cellPadding: { top: 2.5, right: 4, bottom: 2.5, left: 4 },
        lineColor: C.tblBorder,
        lineWidth: 0.3,
        textColor: C.black,
        overflow: 'linebreak',
      },
      headStyles: {
        font: 'Cairo',
        fontStyle: 'bold',
        fontSize: 10,
        fillColor: C.primary,
        textColor: C.white,
        halign: 'right',
      },
      alternateRowStyles: { fillColor: C.tblAlt },
      tableWidth: contentWidth,
      margin: {
        left: margin.left,
        right: margin.right,
        top: CONTENT_TOP + 2,
        bottom: 22,
      },
    })

    y = (doc.lastAutoTable?.finalY ?? y) + 10
  })

  // ── ATTACHMENT NOTE (manual sections) ─────────────────────────────
  if (!AUTO_SECTIONS.has(key) && content.originalFileName) {
    if (y + 10 > CONTENT_BOTTOM) { doc.addPage(); y = CONTENT_TOP + 4 }
    doc.setFont('Cairo', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...C.secondary)
    doc.text(reshape(`المرفقات: ${content.originalFileName}`), startX, y, { align: 'right' })
  }
}

// ── Closing Page ───────────────────────────────────────────────────

function drawClosingPage(doc, { notes, generatedBy, todayAr, startX, margin, W, H, CONTENT_TOP }) {
  // Re-use the section bar style for the closing page header
  doc.setFillColor(...C.primary)
  doc.rect(0, CONTENT_TOP, W, 14, 'F')
  doc.setFillColor(...C.gold)
  doc.rect(0, CONTENT_TOP, 3.5, 14, 'F')
  doc.setFont('Cairo', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(...C.white)
  doc.text(reshape('ملاحظات رئيس القسم'), W - 10, CONTENT_TOP + 10, { align: 'right' })

  let y = CONTENT_TOP + 24

  // Gold underline
  doc.setDrawColor(...C.gold)
  doc.setLineWidth(0.6)
  doc.line(margin.left, y, W - margin.right, y)
  y += 10

  // HOD notes body
  const notesText = notes || 'لا توجد ملاحظات إضافية لهذا التقرير.'
  doc.setFont('Cairo', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(30, 30, 50)
  const noteLines = doc.splitTextToSize(reshape(notesText), W - margin.left - margin.right)
  noteLines.forEach(line => {
    doc.text(line, startX, y, { align: 'right' })
    y += 7
  })

  y += 28

  // Signature section
  doc.setDrawColor(...C.secondary)
  doc.setLineWidth(0.5)
  doc.line(W / 2 + 10, y, W - margin.right, y)
  y += 6

  doc.setFont('Cairo', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...C.primary)
  doc.text(reshape('رئيس قسم العمليات'), startX, y, { align: 'right' })
  y += 7

  doc.setFont('Cairo', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(30, 30, 50)
  doc.text(reshape(generatedBy || 'رئيس قسم العمليات'), startX, y, { align: 'right' })
  y += 7
  doc.text(reshape(`التاريخ: ${todayAr}`), startX, y, { align: 'right' })

  // Club name above running footer
  doc.setFont('Cairo', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...C.secondary)
  doc.text(reshape('نادي الفجيرة للفنون القتالية — قسم العمليات'), W / 2, H - 22, { align: 'center' })
}

// ── Loading progress helper ────────────────────────────────────────

function makeProgress(onProgress) {
  return (msg) => { try { onProgress?.(msg) } catch { /* no-op */ } }
}

// ── Main Export Function ───────────────────────────────────────────

export const reportExportService = {

  /**
   * Generates and downloads the final Arabic monthly report PDF.
   * @param {Object} report - monthly_reports document { notes }
   * @param {Array}  sections - enriched section docs (approved/submitted)
   * @param {Object} metadata - { reportId, monthLabel, year, generatedBy }
   * @param {Function} [onProgress] - optional callback(message) for progress updates
   */
  async exportFinalReport(report, sections, metadata, onProgress) {
    const { reportId, monthLabel, year, generatedBy } = metadata
    const emit = makeProgress(onProgress)

    const arabicMY = reportId
      ? arabicMonthYear(reportId)
      : (monthLabel || '')
    const todayAr = arabicDateStr()

    emit('جاري تحميل الشعار...')
    const logoBase64 = await fetchLogoBase64()

    emit('جاري إنشاء ملف PDF...')

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      putOnlyUsedFonts: true,
    })

    setupFont(doc)

    const W            = doc.internal.pageSize.getWidth()   // 210
    const H            = doc.internal.pageSize.getHeight()  // 297
    const margin       = { top: 18, bottom: 22, right: 20, left: 20 }
    const contentWidth = W - margin.right - margin.left     // 170
    const startX       = W - margin.right                   // 190 (RTL anchor)
    const CONTENT_TOP  = 18   // y where body starts (below running header)
    const CONTENT_BOT  = H - 22 // y where body ends (above running footer)

    // page → section name (for footer)
    const pageSectionMap = {}

    // ── PAGE 1: COVER ──────────────────────────────────────────────
    emit('جاري إعداد صفحة الغلاف...')
    drawCoverPage(doc, { arabicMY, generatedBy, todayAr, W, H, logoBase64 })

    // ── PAGE 2: TABLE OF CONTENTS ──────────────────────────────────
    doc.addPage()
    const tocPageNum = doc.internal.getCurrentPageInfo().pageNumber
    pageSectionMap[tocPageNum] = 'فهرس المحتويات'

    // ── SECTION PAGES ──────────────────────────────────────────────
    const tocEntries = []
    const approvedSections = sections
      .filter(s => s.status === 'approved' || s.status === 'submitted')
      .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))

    approvedSections.forEach((section, idx) => {
      emit(`جاري إعداد قسم: ${section.nameAr || section.sectionKey}...`)
      doc.addPage()
      const secStart  = doc.internal.getCurrentPageInfo().pageNumber
      const secName   = section.nameAr || section.sectionKey

      tocEntries.push({ name: secName, page: secStart, number: idx + 1 })

      renderSection(doc, section, idx + 1, {
        margin, contentWidth, startX, W, H, CONTENT_TOP, CONTENT_BOTTOM: CONTENT_BOT,
      })

      const secEnd = doc.internal.getCurrentPageInfo().pageNumber
      for (let p = secStart; p <= secEnd; p++) {
        pageSectionMap[p] = secName
      }
    })

    // ── CLOSING PAGE ───────────────────────────────────────────────
    emit('جاري إعداد صفحة الإغلاق...')
    doc.addPage()
    const closingPage = doc.internal.getCurrentPageInfo().pageNumber
    pageSectionMap[closingPage] = 'ملاحظات رئيس القسم'

    drawClosingPage(doc, {
      notes: report.notes || '',
      generatedBy,
      todayAr,
      startX,
      margin,
      W,
      H,
      CONTENT_TOP,
    })

    // ── FILL TOC (now we know all page numbers) ────────────────────
    emit('جاري إعداد فهرس المحتويات...')
    doc.setPage(tocPageNum)
    drawTOCPage(doc, tocEntries, { margin, W, CONTENT_TOP })

    // ── HEADERS & FOOTERS on every page except cover ───────────────
    emit('جاري إضافة الترويسة والتذييل...')
    const totalPages = doc.internal.getNumberOfPages()
    for (let p = 2; p <= totalPages; p++) {
      doc.setPage(p)
      drawRunningHeader(doc, { arabicMY, logoBase64, W })
      drawRunningFooter(doc, {
        pageNum: p,
        totalPages,
        sectionName: pageSectionMap[p] || '',
        W,
        H,
      })
    }

    // ── SAVE ───────────────────────────────────────────────────────
    emit('جاري حفظ الملف...')
    const [yr, mo] = (reportId || `${year}-01`).split('-')
    const moName   = ARABIC_MONTHS[parseInt(mo, 10) - 1] || mo
    doc.save(`تقرير-العمليات-${moName}-${yr}.pdf`)

    emit('تم بنجاح!')
  },
}
