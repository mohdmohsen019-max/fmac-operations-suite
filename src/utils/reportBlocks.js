/*
 * reportBlocks — block model for editable report sections
 * ----------------------------------------------------------------------------
 * A report section's `content` may carry a `blocks` array: an ordered list of
 * typed, editable, reorderable blocks. This is the single source of truth for
 * both the on-screen editor and the compiled PDF (ReportTemplate) for any
 * section that has been edited. Sections WITHOUT `blocks` (auto-generated fleet/
 * fuel/etc.) keep rendering through the original legacy path untouched.
 *
 * Block shapes:
 *   { id, type: 'heading',   text }
 *   { id, type: 'paragraph', text }
 *   { id, type: 'list',      items: [string] }
 *   { id, type: 'cards',     items: [{ label, value }] }
 *   { id, type: 'table',     title, headers: [string], rows: [[string]] }
 *   { id, type: 'image',     src, caption }      // src = data URL or storage URL
 */

let _seq = 0
export function uid() {
  return `b${Date.now().toString(36)}${(_seq++).toString(36)}`
}

// ── Block factories ─────────────────────────────────────────────────
export const newHeading = (text = '') => ({ id: uid(), type: 'heading', text })
export const newParagraph = (text = '') => ({ id: uid(), type: 'paragraph', text })
export const newList = (items = ['']) => ({ id: uid(), type: 'list', items })
export const newCards = (items = [{ label: '', value: '' }]) => ({ id: uid(), type: 'cards', items })
export const newTable = () => ({
  id: uid(),
  type: 'table',
  title: '',
  headers: ['', ''],
  rows: [['', ''], ['', '']],
})
export const newImage = (src = '') => ({ id: uid(), type: 'image', src, caption: '' })

const BLOCK_TYPES = new Set(['heading', 'paragraph', 'list', 'cards', 'table', 'image'])

// Ensure a block read from storage has a stable id and a valid shape.
function normalizeBlock(b) {
  if (!b || !BLOCK_TYPES.has(b.type)) return null
  const id = b.id || uid()
  switch (b.type) {
    case 'heading':
    case 'paragraph':
      return { id, type: b.type, text: b.text || '' }
    case 'list':
      return { id, type: 'list', items: Array.isArray(b.items) ? b.items.map(String) : [''] }
    case 'cards':
      return {
        id, type: 'cards',
        items: Array.isArray(b.items)
          ? b.items.map(it => ({ label: it?.label || '', value: it?.value != null ? String(it.value) : '' }))
          : [{ label: '', value: '' }],
      }
    case 'table':
      return {
        id, type: 'table',
        title: b.title || '',
        headers: Array.isArray(b.headers) ? b.headers.map(String) : [],
        rows: Array.isArray(b.rows) ? b.rows.map(r => (Array.isArray(r) ? r.map(c => (c != null ? String(c) : '')) : [])) : [],
      }
    case 'image':
      return { id, type: 'image', src: b.src || '', caption: b.caption || '' }
    default:
      return null
  }
}

/*
 * Build an editable block list from a section's content.
 * If content already has `blocks`, normalize and return them. Otherwise migrate
 * the legacy fields (summary / keyPoints / numbers / tables) into blocks, so the
 * very first edit of an existing section starts from its current content.
 */
export function migrateToBlocks(content) {
  if (Array.isArray(content?.blocks) && content.blocks.length) {
    return content.blocks.map(normalizeBlock).filter(Boolean)
  }

  const blocks = []
  const summary = content?.summaryAr || content?.summary
  if (summary) blocks.push(newParagraph(summary))

  const kps = (content?.keyPointsAr?.length ? content.keyPointsAr : content?.keyPoints) || []
  if (kps.length) blocks.push(newList([...kps]))

  const numEntries = Object.entries(content?.numbers || {})
  if (numEntries.length) {
    blocks.push(newCards(numEntries.map(([label, value]) => ({ label, value: value != null ? String(value) : '' }))))
  }

  for (const tbl of content?.tables || []) {
    blocks.push({
      id: uid(),
      type: 'table',
      title: tbl.title || '',
      headers: tbl.headers || [],
      rows: tbl.rows || [],
    })
  }

  return blocks
}

/*
 * Derive the legacy content fields from blocks so any consumer that still reads
 * summary/keyPoints/numbers/tables keeps working. Blocks remain the source of
 * truth; these are a best-effort projection of the primary blocks.
 */
export function blocksToLegacy(blocks) {
  const out = { summary: '', summaryAr: '', keyPoints: [], keyPointsAr: [], numbers: {}, tables: [] }

  const firstPara = blocks.find(b => b.type === 'paragraph')
  if (firstPara) { out.summary = firstPara.text; out.summaryAr = firstPara.text }

  const firstList = blocks.find(b => b.type === 'list')
  if (firstList) { out.keyPoints = [...firstList.items]; out.keyPointsAr = [...firstList.items] }

  const firstCards = blocks.find(b => b.type === 'cards')
  if (firstCards) {
    out.numbers = Object.fromEntries(
      firstCards.items.filter(i => i.label).map(i => [i.label, i.value])
    )
  }

  out.tables = blocks
    .filter(b => b.type === 'table')
    .map(b => ({ title: b.title, headers: b.headers, rows: b.rows }))

  return out
}

// ── PDF pagination ──────────────────────────────────────────────────
// Row-unit budgets (1 unit ≈ one single-line table-row, ~33px). Derived from
// the A4 geometry: 1122px page − running header − section bar − footer −
// body padding leaves ≈930–950px of content area, ≈28 row units. The budgets
// sit below that ceiling on purpose: the page body is overflow:hidden, so an
// over-estimate CLIPS rows (data silently missing from the PDF) while an
// under-estimate only leaves margin. Rows that will wrap are charged extra
// units (see rowUnits), which keeps long-text sections honest too.
const FIRST_PAGE_BUDGET = 22
const CONT_PAGE_BUDGET = 25

// Never open a table with fewer than this many rows before a page break —
// a lone orphan row followed by blank space reads as a rendering fault.
const MIN_TABLE_START_ROWS = 3

// Height of one table row, in units — wrap-aware. A cell longer than ~45
// characters wraps to a second line at this column width; charge for it.
function rowUnits(row) {
  let longest = 0
  for (const c of row || []) {
    const len = String(c ?? '').length
    if (len > longest) longest = len
  }
  return 1 + Math.min(2, Math.floor(longest / 45))
}

// Estimated height cost (in row units) of a non-table block.
function blockCost(block) {
  switch (block.type) {
    case 'heading': return 1.4
    case 'paragraph': return Math.max(1, Math.ceil((block.text || '').length / 70)) + 0.5
    case 'list': return (block.items?.length || 0) + 1
    // Stat grid: 4 cells per row (auto-fit @150px min in a 714px body), each
    // row ≈70px ≈ 2.2 row-units — charging 2 under-billed multi-row grids.
    case 'cards': return Math.ceil((block.items?.length || 0) / 4) * 2.2 + 0.5
    case 'image': return 9
    default: return 1
  }
}

/*
 * Split a section's blocks into pages of `parts`, where a part is either a
 * non-table block or a slice of a table's rows. Mirrors the legacy table-slice
 * paginator but over the full ordered block stream so reordering is honored.
 * Returns: [{ isFirst, parts: [{kind:'block', block} | {kind:'tableSlice', ...}] }]
 */
export function buildBlockPages(blocks) {
  const pages = [{ isFirst: true, parts: [] }]
  let budget = FIRST_PAGE_BUDGET

  const newPage = () => {
    pages.push({ isFirst: false, parts: [] })
    budget = CONT_PAGE_BUDGET
  }
  const current = () => pages[pages.length - 1]

  for (const block of blocks) {
    if (block.type === 'table') {
      const rows = block.rows || []
      const overhead = (block.title ? 1.2 : 0) + 1.1 // title (maybe) + header row

      /* Orphan control: starting a table needs room for its header AND a few
         rows. The old code forced "at least 1 row" into whatever space was
         left, which printed a single stranded row above a half-empty page. */
      if (current().parts.length && budget < overhead + MIN_TABLE_START_ROWS) newPage()

      // Empty table (no rows) — still show title + header once.
      if (!rows.length) {
        current().parts.push({ kind: 'tableSlice', block, start: 0, end: 0, isFirstSlice: true })
        budget -= overhead
        continue
      }

      let start = 0
      let firstSlice = true
      while (start < rows.length) {
        const lead = firstSlice ? overhead : 1.1 // continuation slices repeat the header
        // Fill greedily by measured row cost, never past the budget.
        let end = start
        let used = lead
        while (end < rows.length && used + rowUnits(rows[end]) <= budget) {
          used += rowUnits(rows[end])
          end++
        }
        if (end === start) {
          // Nothing fits here. On a page with other content, move on and retry
          // with a full budget; on an EMPTY page take one row regardless —
          // guaranteed forward progress even for a pathological mega-row.
          if (current().parts.length) { newPage(); continue }
          end = start + 1
          used = lead + rowUnits(rows[start])
        }
        current().parts.push({ kind: 'tableSlice', block, start, end, isFirstSlice: firstSlice })
        budget -= used
        start = end
        firstSlice = false
        if (start < rows.length) newPage()
      }
    } else {
      const cost = blockCost(block)
      if (cost > budget && current().parts.length) newPage()
      current().parts.push({ kind: 'block', block })
      budget -= cost
    }
  }

  return pages
}
