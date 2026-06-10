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
// Row-unit budgets (1 unit ≈ one table-row height). A page's body fits a fixed
// number of units; the first page is smaller because of the section header bar.
const FIRST_PAGE_BUDGET = 11
const CONT_PAGE_BUDGET = 15

// Estimated height cost (in row units) of a non-table block.
function blockCost(block) {
  switch (block.type) {
    case 'heading': return 1.4
    case 'paragraph': return Math.max(1, Math.ceil((block.text || '').length / 70)) + 0.5
    case 'list': return (block.items?.length || 0) + 1
    case 'cards': return Math.ceil((block.items?.length || 0) / 4) * 2 + 0.5
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
      // Title + header cost ride with the first slice.
      let start = 0
      let firstSlice = true
      const overhead = (block.title ? 1 : 0) + 1 // title (maybe) + header row
      // If even the header doesn't fit and the page already has content, break.
      if (budget < overhead + 1 && current().parts.length) newPage()
      while (start < rows.length) {
        const lead = firstSlice ? overhead : 1 // continuation slices still show a header
        const avail = Math.max(1, Math.floor(budget - lead))
        const end = Math.min(start + avail, rows.length)
        current().parts.push({ kind: 'tableSlice', block, start, end, isFirstSlice: firstSlice })
        budget -= lead + (end - start)
        start = end
        firstSlice = false
        if (start < rows.length) newPage()
      }
      // Handle an empty table (no rows) — still show title + header once.
      if (!rows.length) {
        current().parts.push({ kind: 'tableSlice', block, start: 0, end: 0, isFirstSlice: true })
        budget -= overhead
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
