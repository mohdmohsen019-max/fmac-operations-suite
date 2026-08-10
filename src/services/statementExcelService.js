/**
 * Garage statement-of-account parsing — Excel / CSV.
 *
 * Mirrors the contract of pdfService.parseStatement so the maintenance upload
 * modal can treat both sources identically:
 *   { success, records[], statementPeriod, validation }
 *
 * A spreadsheet is read directly rather than sent to the vision model: the
 * figures are already machine-readable, so parsing them is exact, instant and
 * free — no OCR risk on an invoice total.
 *
 * Expected shape (Abu Tuhoon monthly statement):
 *   STATEMENT OF ACCOUNT (01.07.2026 - 31.07.2026)
 *   DATE | INVOICE NUMBER | AMOUNT (AED) | VAT (AED) | TOTAL (AED)
 *   01/07/2026 | 002902 (37074 FUJ) | 860.00 | 43.00 | 903.00
 *   ...
 *   TOTAL |  | 7,102.98 | 355.16 | 7,458.14
 *
 * Columns are located by header text, not fixed index, so added or reordered
 * columns do not break the import.
 */
import * as XLSX from 'xlsx'

/* "1,234.56" · "AED 1,234.56" · 1234.56 → 1234.56 */
export function toNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const cleaned = String(v ?? '').replace(/[^\d.-]/g, '')
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : 0
}

/* Excel serial, Date, or a d/m/y-ish string → DD/MM/YYYY (the app's format). */
export function toDateStr(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return fmt(v)
  if (typeof v === 'number' && v > 20000 && v < 60000) {
    // Excel serial date → JS date (epoch 1899-12-30).
    return fmt(new Date(Math.round((v - 25569) * 86400 * 1000)))
  }
  const s = String(v ?? '').trim()
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/)
  if (m) {
    const [, d, mo, y] = m
    const yr = y.length === 2 ? `20${y}` : y
    return `${d.padStart(2, '0')}/${mo.padStart(2, '0')}/${yr}`
  }
  const parsed = new Date(s)
  return Number.isNaN(parsed.getTime()) ? s : fmt(parsed)
}
const fmt = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`

/* "002902 (37074 FUJ)" → { invoiceNumber: '002902', plateNumber: '37074' }
   Also tolerates a bare "002902" or a plate in a separate column. */
export function splitInvoiceCell(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return { invoiceNumber: '', plateNumber: '' }
  const bracket = s.match(/\(([^)]*)\)/)
  const invoiceNumber = s.replace(/\([^)]*\)/, '').trim()
  let plateNumber = ''
  if (bracket) {
    // The plate is the digit run inside the brackets, before the emirate code.
    const digits = bracket[1].match(/\d{3,6}/)
    plateNumber = digits ? digits[0] : bracket[1].trim()
  }
  return { invoiceNumber, plateNumber }
}

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z]/g, '')

/* Locate the header row and map the columns we need. */
function findColumns(rows) {
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const cells = (rows[i] || []).map(norm)
    const idx = {
      date: cells.findIndex(c => c.startsWith('date') || c.includes('التاريخ')),
      invoice: cells.findIndex(c => c.includes('invoice') || c.includes('bill')),
      amount: cells.findIndex(c => c.startsWith('amount') || c.includes('subtotal') || c.includes('net')),
      vat: cells.findIndex(c => c.startsWith('vat') || c.includes('tax')),
      total: cells.findIndex(c => c.startsWith('total') || c.includes('grand')),
    }
    // A real header row identifies at least the invoice and a money column.
    if (idx.invoice !== -1 && (idx.total !== -1 || idx.amount !== -1)) {
      const plate = (rows[i] || []).map(norm)
        .findIndex(c => c.includes('plate') || c.includes('vehicle') || c.includes('لوحة'))
      return { headerRow: i, ...idx, plate }
    }
  }
  return null
}

/* "STATEMENT OF ACCOUNT (01.07.2026 - 31.07.2026)" → "01.07.2026 - 31.07.2026" */
function findPeriod(rows, headerRow) {
  for (let i = 0; i < headerRow; i++) {
    const line = (rows[i] || []).filter(Boolean).join(' ')
    const m = line.match(/\(([^)]*\d{4}[^)]*)\)/)
    if (m) return m[1].trim()
    if (/statement/i.test(line)) return line.replace(/statement of account/i, '').trim() || line.trim()
  }
  return ''
}

export const statementExcelService = {
  /**
   * @param file  a .xlsx/.xlsm/.xls/.csv File
   * @returns { success, records, statementPeriod, validation } | { success:false, error }
   */
  async parseStatement(file, onProgress) {
    try {
      onProgress?.('Reading spreadsheet…')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array', cellDates: true })
      const sheetName = wb.SheetNames[0]
      if (!sheetName) return { success: false, error: 'The workbook has no sheets.' }

      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
        header: 1, blankrows: false, raw: false, defval: '',
      })
      const cols = findColumns(rows)
      if (!cols) {
        return {
          success: false,
          error: 'Could not find a header row with DATE / INVOICE NUMBER / AMOUNT / VAT / TOTAL. Check the sheet layout.',
        }
      }

      onProgress?.('Extracting invoice rows…')
      const records = []
      let statedTotals = null

      for (let i = cols.headerRow + 1; i < rows.length; i++) {
        const row = rows[i] || []
        const cell = (n) => (n >= 0 ? row[n] : '')
        const firstCol = String(row[0] ?? '').trim()

        // The trailing TOTAL row states the garage's own figures — captured for
        // reconciliation rather than imported as an invoice.
        if (/^(total|grand\s*total|الإجمالي|المجموع)/i.test(firstCol)) {
          statedTotals = {
            amount: toNumber(cell(cols.amount)),
            vat: toNumber(cell(cols.vat)),
            total: toNumber(cell(cols.total)),
          }
          continue
        }

        const invoiceRaw = cell(cols.invoice)
        const dateRaw = cell(cols.date)
        if (!String(invoiceRaw ?? '').trim() && !String(dateRaw ?? '').trim()) continue

        const { invoiceNumber, plateNumber } = splitInvoiceCell(invoiceRaw)
        // An explicit plate column wins over one parsed out of the invoice cell.
        const explicitPlate = cols.plate >= 0 ? String(cell(cols.plate) ?? '').trim() : ''
        const plate = explicitPlate
          ? (explicitPlate.match(/\d{3,6}/)?.[0] || explicitPlate)
          : plateNumber

        const amount = toNumber(cell(cols.amount))
        const vat = toNumber(cell(cols.vat))
        const total = toNumber(cell(cols.total))
        // Skip decorative/blank rows that carry no invoice and no money.
        if (!invoiceNumber && !amount && !total) continue

        records.push({
          date: toDateStr(dateRaw),
          invoiceNumber,
          plateNumber: plate,
          description: '',
          amount,
          vat,
          // Fall back to amount+VAT when the sheet omits a total column.
          total: total || amount + vat,
        })
      }

      if (records.length === 0) {
        return { success: false, error: 'No invoice rows were found in the sheet.' }
      }

      const sum = (k) => records.reduce((s, r) => s + (parseFloat(r[k]) || 0), 0)
      const actualTotal = Math.round(sum('total') * 100) / 100
      const actualVAT = Math.round(sum('vat') * 100) / 100

      /* Reconciled against the sheet's OWN stated totals — not a hard-coded
         expectation — so any statement reconciles correctly. */
      const validation = {
        actualCount: records.length,
        actualTotal,
        actualVAT,
        statedTotal: statedTotals?.total ?? null,
        statedVAT: statedTotals?.vat ?? null,
        isCountValid: records.length > 0,
        isTotalValid: statedTotals?.total == null
          ? true
          : Math.abs(actualTotal - statedTotals.total) < 0.05,
        isVatValid: statedTotals?.vat == null
          ? true
          : Math.abs(actualVAT - statedTotals.vat) < 0.05,
      }

      return {
        success: true,
        records,
        statementPeriod: findPeriod(rows, cols.headerRow) || 'Unknown',
        validation,
      }
    } catch (err) {
      console.error('[statement/excel] parse failed:', err)
      return { success: false, error: err?.message || 'Could not read the spreadsheet.' }
    }
  },
}

export default statementExcelService
