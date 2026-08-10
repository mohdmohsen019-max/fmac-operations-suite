import './ReportTemplate.css'
import { buildBlockPages } from '../../utils/reportBlocks'
// import { reshapeArabic } from '../../utils/arabicReshaper'

// ── Constants & mappings ────────────────────────────────────────────

// Row budgets per page — footer is now a flex child (not absolute), so no overlap risk
// We use separate budgets for 'auto' (compact) vs 'manual' (multi-line) sections
// to prevent row clipping caused by varying heights (e.g. wrapped names).
const ROWS_FIRST_PAGE_AUTO = 16
const ROWS_CONTINUATION_AUTO = 24

const ROWS_FIRST_PAGE_MANUAL = 8
const ROWS_CONTINUATION_MANUAL = 12

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
    { key: 'totalTrips', label: 'إجمالي الرحلات', unit: '' },
    { key: 'vehicleCount', label: 'عدد المركبات', unit: '' },
  ],
  maintenance: [
    { key: 'totalSpent', label: 'إجمالي التكاليف', unit: 'د.إ' },
    { key: 'taskCount', label: 'مهام الصيانة', unit: '' },
  ],
  complaints: [
    { key: 'total', label: 'إجمالي الشكاوى', unit: '' },
    { key: 'closed', label: 'تم الحل', unit: '' },
    { key: 'open', label: 'قيد الانتظار', unit: '' },
  ],
  fuel: [
    { key: 'totalCost', label: 'إجمالي التكاليف', unit: 'د.إ' },
    { key: 'totalLiters', label: 'إجمالي اللترات', unit: 'لتر' },
    { key: 'totalKm', label: 'المسافة المقطوعة', unit: 'كم' },
  ],
}

function arHeader(h) { return HEADER_AR[h] || h }

function arCell(v) {
  if (typeof v !== 'string') return v
  const replaced = v
    .replace(/AED\s?/g, 'د.إ ')
    .replace(/\s?KM/g, ' كم')
    .replace(/\s?km/g, ' كم')
    .replace(/\s?L$/g, ' لتر')
  return replaced
}

function formatLabel(key) {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()).trim()
}

/* ── Stat-value normalisation ────────────────────────────────────────
   Extracted figures often arrive as strings carrying their unit words —
   "9 units", "148 players", "+25 individuals", "114~", "July 1-31, 2026".
   Rendered raw at display size inside an RTL context, the bidi algorithm
   flips "9 units" into "units 9" and the unit words print at number size,
   overflowing the cell. Split the leading figure from its trailing words:
   the figure renders big in an isolated LTR span, the words render small. */
function splitStat(raw) {
  const s = String(raw ?? '').trim().replace(/\s+/g, ' ')
  if (!s) return { num: '', rest: '' }
  const m = s.match(/^([+\-~≈]?[0-9٠-٩][0-9٠-٩.,:%/]*)\s*(.*)$/)
  if (!m) return { num: '', rest: s }
  // Trailing tildes/dashes on the figure or its remainder are extraction noise.
  const num = m[1].replace(/[~.,]+$/, '')
  const rest = m[2].replace(/^[~\-–—]+|[~\-–—]+$/g, '').trim()
  return { num, rest }
}

/* One stat figure. Numeric-led values: big isolated-LTR figure + small unit.
   Text values (date ranges etc.): medium weight at a size that fits. */
function StatValue({ raw }) {
  const { num, rest } = splitStat(raw)
  if (num) {
    return (
      <p className="kpi-value">
        <span dir="ltr" className="kpi-num">{num}</span>
        {rest && <span className="kpi-unit" dir="auto">{rest}</span>}
      </p>
    )
  }
  return <p className="kpi-value kpi-value--text" dir="auto">{rest}</p>
}

// ── Page-split algorithm ────────────────────────────────────────────
// Returns array of page configs: [{ isFirst, tableSlices: [{table, start, end}] }]

function buildSectionPageSet(section) {
  // Block-based (edited) sections paginate through the block-stream paginator.
  const blocks = (section.parsedContent || {}).blocks
  if (Array.isArray(blocks) && blocks.length) {
    return buildBlockPages(blocks)
  }

  const tables = (section.parsedContent || {}).tables || []
  const pages = [{ isFirst: true, tableSlices: [] }]

  // Determine section type for budget selection
  // Auto sections (fleet, fuel, etc.) have short, single-line rows.
  // Manual sections (registration, media) often have long wrapped text that increases row height.
  const isAutoSection = !!KPI_DEFS[section.sectionKey]

  const firstBudget = isAutoSection ? ROWS_FIRST_PAGE_AUTO : ROWS_FIRST_PAGE_MANUAL
  const continuationBudget = isAutoSection ? ROWS_CONTINUATION_AUTO : ROWS_CONTINUATION_MANUAL

  // We use conservative budgets for manual sections because the current architecture
  // doesn't measure DOM height. If a row wraps to 3 lines (~70px), a budget of 16
  // would cause overflow:hidden to clip the bottom half of the table, skipping rows.
  let budget = firstBudget

  for (const table of tables) {
    const rows = table.rows || []
    if (!rows.length) continue
    let start = 0

    while (start < rows.length) {
      /* Orphan control: with fewer than 4 rows of budget left, break to a new
         page instead of stranding a 1–3 row sliver above the page break. The
         first-page-with-nothing-yet case keeps its budget so a section that is
         ONLY a table never opens with a pointless blank page. */
      const pageHasContent = pages.length > 1 || pages[0].tableSlices.length > 0 || start > 0
      if (budget < 4 && pageHasContent) {
        pages.push({ isFirst: false, tableSlices: [] })
        budget = continuationBudget
      }
      const end = Math.min(start + budget, rows.length)
      pages[pages.length - 1].tableSlices.push({ table, start, end })
      budget -= (end - start)
      start = end
    }
  }

  return pages
}

// ── Shared sub-components ───────────────────────────────────────────

function RunningHeader({ monthName, docRef }) {
  return (
    <div className="rpt-running-header">
      <div className="rpt-running-header-title">التقرير التشغيلي الشهري — {monthName}</div>
      {/* Document-control reference — repeated on every page like a real
          controlled document, set in mono to read as a filing code. */}
      <span className="rpt-doc-ref">{docRef}</span>
    </div>
  )
}

function RunningFooter({ pageNum, totalPages, sectionName }) {
  return (
    <div className="rpt-running-footer">
      <span>صفحة {pageNum} من {totalPages}</span>
      <span>{sectionName}</span>
      <span>سري — للاستخدام الداخلي فقط</span>
    </div>
  )
}

// ── Cover Page ──────────────────────────────────────────────────────

function CoverPage({ data, docRef }) {
  return (
    <div className="report-page cover-page">
      {/* Crimson spine on the binding edge — this is a bound file, not a flyer */}
      <div className="cover-spine" />

      <div className="cover-inner">
        {/* Top strip: identity + document-control block, like any controlled record */}
        <header className="cover-head">
          <img src="/fmac-ops-logo.png" alt="FMAC" className="cover-logo" />
          <table className="cover-doc-table">
            <tbody>
              <tr><td>رقم الوثيقة</td><td className="rpt-doc-ref">{docRef}</td></tr>
              <tr><td>التصنيف</td><td>داخلي — قسم العمليات</td></tr>
              <tr><td>دورية الإصدار</td><td>شهري</td></tr>
            </tbody>
          </table>
        </header>

        {/* Title block — start-aligned, not floating in the middle */}
        <main className="cover-main">
          <p className="cover-kicker">نادي الفجيرة للفنون القتالية — قسم العمليات</p>
          <h1 className="cover-main-title">التقرير التشغيلي الشهري</h1>
          <div className="cover-title-rule" />
          <p className="cover-month">{data.monthName}</p>
        </main>

        {/* Bottom meta ledger */}
        <footer className="cover-foot">
          <div className="cover-foot-row"><span>أعدّه</span><strong>{data.hodName}</strong></div>
          <div className="cover-foot-latin">FUJAIRAH MARTIAL ARTS CLUB — OPERATIONS DEPARTMENT</div>
        </footer>
      </div>
    </div>
  )
}

// ── TOC Page ────────────────────────────────────────────────────────

function TocPage({ sections, sectionStartPages, totalPages, monthName, docRef }) {
  return (
    <div className="report-page" style={{ display: 'flex', flexDirection: 'column' }}>
      <RunningHeader monthName={monthName} docRef={docRef} />
      <div className="toc-page-body">
        <h2 className="toc-page-title">فهرس المحتويات</h2>
        <div className="toc-gold-rule" />

        {sections.map((sec, i) => (
          <div key={sec.sectionKey || i} className="toc-row">
            <span className="toc-num">{i + 1}</span>
            <span className="toc-name">{sec.nameAr}</span>
            <span className="toc-dots" />
            <span className="toc-page-num">{sectionStartPages[i]}</span>
          </div>
        ))}

        <div className="toc-row">
          <span className="toc-num">{sections.length + 1}</span>
          <span className="toc-name">ملاحظات ختامية وتوقيع</span>
          <span className="toc-dots" />
          <span className="toc-page-num">{totalPages}</span>
        </div>
      </div>
      <RunningFooter pageNum={2} totalPages={totalPages} sectionName="فهرس المحتويات" />
    </div>
  )
}

// ── Block renderers (edited sections) ───────────────────────────────

function BlockPart({ part }) {
  if (part.kind === 'tableSlice') {
    const { block, start, end, isFirstSlice } = part
    const titleAr = TABLE_TITLE_AR[block.title] || block.title
    const rows = (block.rows || []).slice(start, end)
    return (
      <div>
        {isFirstSlice && titleAr && <p className="section-subheading">{titleAr}</p>}
        <table className="section-table">
          {(block.headers || []).length > 0 && (
            <thead>
              <tr>{block.headers.map((h, hi) => <th key={hi}>{arHeader(h)}</th>)}</tr>
            </thead>
          )}
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>{row.map((cell, ci) => <td key={ci}>{arCell(cell)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  const b = part.block
  switch (b.type) {
    case 'heading':
      return <p className="section-subheading">{b.text}</p>
    case 'paragraph':
      return <p className="section-summary-text" dir="auto">{b.text}</p>
    case 'list':
      return (
        <ul className="section-keypoints">
          {b.items.filter(Boolean).map((pt, i) => <li key={i}>{pt}</li>)}
        </ul>
      )
    case 'cards':
      return (
        <div className="kpi-row">
          {b.items.filter(it => it.label || it.value).map((it, i) => (
            <div key={i} className="kpi-card">
              <StatValue raw={arCell(it.value)} />
              <p className="kpi-label" dir="auto">{it.label}</p>
            </div>
          ))}
        </div>
      )
    case 'image':
      return b.src ? (
        <figure className="section-figure">
          <img src={b.src} alt={b.caption || ''} />
          {b.caption && <figcaption>{b.caption}</figcaption>}
        </figure>
      ) : null
    default:
      return null
  }
}

// ── Section Page ────────────────────────────────────────────────────

function SectionPage({ section, sectionNum, pageConfig, pageNum, totalPages, monthName, docRef }) {
  const c = section.parsedContent || {}
  const summaryAr = c.summaryAr || ''
  const keyPointsAr = c.keyPointsAr || []
  const numbers = c.numbers || {}

  // KPIs — predefined Arabic defs for auto-sections, compact numeric display for manual
  const kpiDefs = KPI_DEFS[section.sectionKey] || []
  const kpis = kpiDefs.length > 0
    ? kpiDefs.filter(d => numbers[d.key] !== undefined).map(d => ({ ...d, value: numbers[d.key] }))
    : Object.entries(numbers)
      .filter(([, v]) => typeof v === 'number')
      .slice(0, 6)
      .map(([k, v]) => ({ key: k, label: formatLabel(k), unit: '', value: v }))

  return (
    <div className="report-page" style={{ display: 'flex', flexDirection: 'column' }}>
      <RunningHeader monthName={monthName} docRef={docRef} />

      {/* Index tab on the binding edge — steps down per section like the
          physical tabs of a filed dossier, and repeats on continuations so a
          flip through the PDF always shows which section you are in. */}
      <div className="section-edge-tab" style={{ top: 84 + sectionNum * 46 }}>
        {String(sectionNum).padStart(2, '0')}
      </div>

      {pageConfig.isFirst ? (
        <>
          <div className="section-header-bar">
            <div className="section-head-flag">{String(sectionNum).padStart(2, '0')}</div>
            <div className="section-head-names">
              <span className="section-header-name">{section.nameAr}</span>
              {section.nameEn && <span className="section-header-en">{section.nameEn}</span>}
            </div>
          </div>
          <div className="section-gold-rule" />
        </>
      ) : (
        <>
          <div className="section-cont-bar">
            <div className="section-cont-flag">{String(sectionNum).padStart(2, '0')}</div>
            <span className="section-cont-name">{section.nameAr} — {'تابع'}</span>
          </div>
          <div className="section-gold-rule" />
        </>
      )}

      <div className="section-page-body">

        {/* Block-based (edited) sections render their ordered parts */}
        {pageConfig.parts ? (
          pageConfig.parts.map((part, pi) => <BlockPart key={pi} part={part} />)
        ) : (
        <>

        {/* First-page-only content */}
        {pageConfig.isFirst && (
          <>
            {summaryAr && <p className="section-summary-text">{summaryAr}</p>}

            {kpis.length > 0 && (
              <div className="kpi-row">
                {kpis.map(kpi => (
                  <div key={kpi.key} className="kpi-card">
                    {typeof kpi.value === 'number' ? (
                      <p className="kpi-value">
                        <span dir="ltr" className="kpi-num">{kpi.value.toLocaleString()}</span>
                        {kpi.unit && <span className="kpi-unit">{kpi.unit}</span>}
                      </p>
                    ) : (
                      <StatValue raw={kpi.value} />
                    )}
                    <p className="kpi-label" dir="auto">{kpi.label}</p>
                  </div>
                ))}
              </div>
            )}

            {keyPointsAr.length > 0 && (
              <>
                <p className="section-subheading">أبرز النقاط</p>
                <ul className="section-keypoints">
                  {keyPointsAr.map((pt, i) => <li key={i}>{pt}</li>)}
                </ul>
              </>
            )}
          </>
        )}

        {/* Table slices for this page */}
        {pageConfig.tableSlices.map(({ table, start, end }, si) => {
          const titleAr = TABLE_TITLE_AR[table.title] || table.title
          const rows = (table.rows || []).slice(start, end)
          const isFirstSlice = start === 0
          return (
            <div key={si}>
              {isFirstSlice && titleAr && (
                <p className="section-subheading">{titleAr}</p>
              )}
              <table className="section-table">
                {(isFirstSlice || !pageConfig.isFirst) && (
                  <thead>
                    <tr>
                      {(table.headers || []).map((h, hi) => (
                        <th key={hi}>{arHeader(h)}</th>
                      ))}
                    </tr>
                  </thead>
                )}
                <tbody>
                  {rows.map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td key={ci}>{arCell(cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        })}

        {pageConfig.isFirst && !summaryAr && kpis.length === 0 && keyPointsAr.length === 0 && pageConfig.tableSlices.length === 0 && (
          <p className="section-summary-text" style={{ color: '#aaa' }}>لم يتم استخراج محتوى لهذا القسم.</p>
        )}

        </>
        )}

      </div>

      <RunningFooter pageNum={pageNum} totalPages={totalPages} sectionName={section.nameAr} />
    </div>
  )
}

// ── Closing Page ────────────────────────────────────────────────────

function ClosingPage({ data, pageNum, totalPages, docRef }) {
  return (
    <div className="report-page" style={{ display: 'flex', flexDirection: 'column' }}>
      <RunningHeader monthName={data.monthName} docRef={docRef} />
      <div className="section-header-bar">
        <div className="section-head-flag">خاتمة</div>
        <div className="section-head-names">
          <span className="section-header-name">ملاحظات ختامية</span>
          <span className="section-header-en">Closing Remarks & Sign-off</span>
        </div>
      </div>
      <div className="section-gold-rule" />

      <div className="closing-page-body">
        {data.notes
          ? <p className="closing-notes-text">{data.notes}</p>
          : <p className="closing-notes-text" style={{ color: '#aaa' }}>لم يتم إدخال ملاحظات ختامية لهذا التقرير.</p>
        }
        <div className="closing-signature-area">
          {/* Pre-applied signature of the Head of Operations. If the image is
              missing the block still renders correctly, leaving a blank space
              above the rule to sign by hand. */}
          <img
            src="/hod-signature.png"
            alt=""
            className="closing-sig-image"
            onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
          />
          <div className="closing-sig-line" />
          <p className="closing-sig-title">رئيس قسم العمليات</p>
          <p className="closing-sig-name">{data.hodName}</p>
        </div>
        <p className="closing-club-footer">
          نادي الفجيرة للفنون القتالية — قسم العمليات — {data.monthName}
        </p>
      </div>

      <RunningFooter pageNum={pageNum} totalPages={totalPages} sectionName="ملاحظات ختامية" />
    </div>
  )
}

// ── Main Template ───────────────────────────────────────────────────

export default function ReportTemplate({ data }) {
  if (!data) return null

  /* Document-control reference — e.g. FMAC-OPS-MR-2026-07. Printed on the
     cover's control block and repeated in every running header. */
  const docRef = `FMAC-OPS-MR-${data.reportId || ''}`.replace(/-$/, '')

  // Build page structure: calculate how many pages each section needs
  const sectionPageSets = data.sections.map(sec => buildSectionPageSet(sec))

  // Assign page numbers
  // Page 1 = cover, page 2 = TOC, pages 3+ = sections, last = closing
  let nextPageNum = 3
  const sectionStartPages = []
  const allSectionPages = []  // [{section, sectionNum, pageConfig, pageNum}]

  sectionPageSets.forEach((pageSet, secIdx) => {
    sectionStartPages.push(nextPageNum)
    pageSet.forEach((pageConfig, pi) => {
      allSectionPages.push({
        section: data.sections[secIdx],
        sectionNum: secIdx + 1,
        pageConfig,
        pageNum: nextPageNum + pi,
      })
    })
    nextPageNum += pageSet.length
  })

  const closingPageNum = nextPageNum
  const totalPages = closingPageNum

  return (
    <div style={{ fontFamily: "'Cairo', sans-serif !important" }}>
      <CoverPage data={data} docRef={docRef} />

      <TocPage
        sections={data.sections}
        sectionStartPages={sectionStartPages}
        totalPages={totalPages}
        monthName={data.monthName}
      />

      {allSectionPages.map(({ section, sectionNum, pageConfig, pageNum }, idx) => (
        <SectionPage
          key={idx}
          section={section}
          sectionNum={sectionNum}
          pageConfig={pageConfig}
          pageNum={pageNum}
          totalPages={totalPages}
          monthName={data.monthName}
        />
      ))}

      <ClosingPage data={data} pageNum={closingPageNum} totalPages={totalPages} docRef={docRef} />
    </div>
  )
}
