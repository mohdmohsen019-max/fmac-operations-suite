/**
 * Report attachment text extraction.
 *
 * Report sections accept PDF, Excel, Word and JSON. Each needs a different
 * route to get its content in front of the analyser:
 *   • PDF   → rendered to page images (handled by the caller via pdf.js)
 *   • Excel → parsed with SheetJS, already a project dependency
 *   • Word  → .docx is a ZIP; we read `word/document.xml` and inflate it with
 *             the browser's native DecompressionStream, so no extra library
 *             is pulled in just to read one file.
 *   • JSON  → validated and pretty-printed so the structure survives
 */
import * as XLSX from 'xlsx'

/** What kind of document is this? Detected by extension — Office MIME types
 *  are inconsistent across browsers and OSes, the extension is not. */
export function detectKind(file) {
  const name = String(file?.name || '').toLowerCase()
  if (name.endsWith('.pdf')) return 'pdf'
  if (/\.(xlsx|xlsm|xls|csv)$/.test(name)) return 'sheet'
  if (name.endsWith('.docx')) return 'word'
  if (name.endsWith('.json')) return 'json'
  if (name.endsWith('.doc')) return 'legacy-doc'   // old binary format
  return 'unknown'
}

export const ACCEPT_ATTR = '.pdf,.xlsx,.xlsm,.xls,.csv,.docx,.json'

/* ── Excel / CSV ──────────────────────────────────────────────────────────
   Every sheet is emitted as CSV under its own heading, so the analyser sees
   the tab structure rather than one undifferentiated blob. */
export async function extractSheetText(file) {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  const parts = []
  wb.SheetNames.forEach((nm) => {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[nm], { blankrows: false })
    if (csv.trim()) parts.push(`### Sheet: ${nm}\n${csv.trim()}`)
  })
  if (!parts.length) throw new Error('EMPTY_WORKBOOK')
  return parts.join('\n\n')
}

/* ── JSON ─────────────────────────────────────────────────────────────────
   Parsed then re-serialised with indentation: it validates the file up front
   (so a malformed export fails here with a clear message rather than confusing
   the analyser) and normalises minified exports into readable structure. */
export async function extractJsonText(file) {
  const raw = (await file.text()).trim()
  if (!raw) throw new Error('JSON_EMPTY')
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    const err = new Error('JSON_INVALID')
    err.detail = e?.message || ''
    throw err
  }
  return JSON.stringify(parsed, null, 2)
}

/* ── Word (.docx) ─────────────────────────────────────────────────────── */
export async function extractDocxText(file) {
  const u8 = new Uint8Array(await file.arrayBuffer())
  const xml = await readZipEntry(u8, 'word/document.xml')
  if (!xml) throw new Error('DOCX_NO_DOCUMENT')
  const text = docxXmlToText(xml)
  if (!text.trim()) throw new Error('DOCX_EMPTY')
  return text
}

/* Minimal ZIP reader: locate one entry via the central directory and inflate
   it. Only what a .docx needs — stored (0) and deflate (8) entries. */
async function readZipEntry(u8, targetName) {
  const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength)

  // End of Central Directory — scan back over the max comment length (64KB).
  let eocd = -1
  const floor = Math.max(0, u8.length - 66_000)
  for (let i = u8.length - 22; i >= floor; i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('ZIP_NO_EOCD')

  const count = view.getUint16(eocd + 10, true)
  let ptr = view.getUint32(eocd + 16, true)
  const dec = new TextDecoder()

  for (let n = 0; n < count; n++) {
    if (ptr + 46 > u8.length || view.getUint32(ptr, true) !== 0x02014b50) break
    const method     = view.getUint16(ptr + 10, true)
    const compSize   = view.getUint32(ptr + 20, true)
    const nameLen    = view.getUint16(ptr + 28, true)
    const extraLen   = view.getUint16(ptr + 30, true)
    const commentLen = view.getUint16(ptr + 32, true)
    const localOff   = view.getUint32(ptr + 42, true)
    const name = dec.decode(u8.subarray(ptr + 46, ptr + 46 + nameLen))

    if (name === targetName) {
      // Local header repeats the name/extra lengths — they can differ from the
      // central directory's, so read them from the local record.
      const lNameLen  = view.getUint16(localOff + 26, true)
      const lExtraLen = view.getUint16(localOff + 28, true)
      const start = localOff + 30 + lNameLen + lExtraLen
      const data = u8.subarray(start, start + compSize)
      if (method === 0) return dec.decode(data)
      if (method === 8) {
        const stream = new Blob([data]).stream()
          .pipeThrough(new DecompressionStream('deflate-raw'))
        return await new Response(stream).text()
      }
      throw new Error('ZIP_UNSUPPORTED_METHOD')
    }
    ptr += 46 + nameLen + extraLen + commentLen
  }
  return null
}

/* WordprocessingML → plain text, preserving paragraph and table structure. */
function docxXmlToText(xml) {
  return xml
    .replace(/<w:tab\b[^>]*\/?>/g, '\t')
    .replace(/<w:br\b[^>]*\/?>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<\/w:tc>/g, '\t')
    .replace(/<\/w:tr>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')          // last, so escaped entities survive
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
