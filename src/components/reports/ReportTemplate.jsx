import './ReportTemplate.css'
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

// ── Page-split algorithm ────────────────────────────────────────────
// Returns array of page configs: [{ isFirst, tableSlices: [{table, start, end}] }]

function buildSectionPageSet(section) {
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
      if (budget <= 0) {
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

function RunningHeader({ monthName }) {
  return (
    <div className="rpt-running-header">
      <div className="rpt-running-header-title">التقرير التشغيلي الشهري — {monthName}</div>
      <img src="/fmac-logo-new.png" alt="Logo" />
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

function CoverPage({ data }) {
  return (
    <div className="report-page cover-page">
      <div className="cover-top-bar" />
      <div className="cover-left-accent" />
      <div className="cover-right-accent" />
      <div className="cover-bottom-bar" />
      <div className="cover-body">
        <img src="/fmac-logo-new.png" alt="FMAC" className="cover-logo" />
        <div className="cover-gold-line" />
        <h1 className="cover-main-title"><span>تقرير الأقسام الشهري</span></h1>
        <p className="cover-subtitle">قسم العمليات — نادي الفجيرة للفنون القتالية</p>
        <div className="cover-gold-line-thin" />
        <p className="cover-month">{data.monthName}</p>
        <div className="cover-meta">
          <p>أعده: {data.hodName}</p>
          <p>التاريخ: {data.generatedDate}</p>
          <p className="cover-confidential">سري — للاستخدام الداخلي فقط</p>
        </div>
      </div>
    </div>
  )
}

// ── TOC Page ────────────────────────────────────────────────────────

function TocPage({ sections, sectionStartPages, totalPages, monthName }) {
  return (
    <div className="report-page" style={{ display: 'flex', flexDirection: 'column' }}>
      <RunningHeader monthName={monthName} />
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

// ── Section Page ────────────────────────────────────────────────────

function SectionPage({ section, sectionNum, pageConfig, pageNum, totalPages, monthName }) {
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
      <RunningHeader monthName={monthName} />

      {pageConfig.isFirst ? (
        <>
          <div className="section-header-bar">
            <span className="section-header-name">{section.nameAr}</span>
            <span className="section-header-num">{String(sectionNum).padStart(2, '0')}</span>
          </div>
          <div className="section-gold-rule" />
        </>
      ) : (
        <>
          <div className="section-cont-bar">
            <span className="section-cont-name">{section.nameAr} — {'تابع'}</span>
            <span className="section-cont-num">{String(sectionNum).padStart(2, '0')}</span>
          </div>
          <div className="section-gold-rule" />
        </>
      )}

      <div className="section-page-body">

        {/* First-page-only content */}
        {pageConfig.isFirst && (
          <>
            {summaryAr && <p className="section-summary-text">{summaryAr}</p>}

            {kpis.length > 0 && (
              <div className="kpi-row">
                {kpis.map(kpi => (
                  <div key={kpi.key} className="kpi-card">
                    <p className="kpi-value">
                      {typeof kpi.value === 'number' ? kpi.value.toLocaleString() : kpi.value}
                      {kpi.unit && <span className="kpi-unit">{kpi.unit}</span>}
                    </p>
                    <p className="kpi-label">{kpi.label}</p>
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

      </div>

      <RunningFooter pageNum={pageNum} totalPages={totalPages} sectionName={section.nameAr} />
    </div>
  )
}

// ── Closing Page ────────────────────────────────────────────────────

function ClosingPage({ data, pageNum, totalPages }) {
  return (
    <div className="report-page" style={{ display: 'flex', flexDirection: 'column' }}>
      <RunningHeader monthName={data.monthName} />
      <div className="section-header-bar">
        <span className="section-header-name">ملاحظات ختامية</span>
        <span className="section-header-num" style={{ fontSize: 22 }}>خاتمة</span>
      </div>
      <div className="section-gold-rule" />

      <div className="closing-page-body">
        {data.notes
          ? <p className="closing-notes-text">{data.notes}</p>
          : <p className="closing-notes-text" style={{ color: '#aaa' }}>لم يتم إدخال ملاحظات ختامية لهذا التقرير.</p>
        }
        <div className="closing-signature-area">
          <div className="closing-sig-line" />
          <p className="closing-sig-title">رئيس قسم العمليات</p>
          <p className="closing-sig-name">{data.hodName}</p>
          <p className="closing-sig-date">{data.generatedDate}</p>
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
      <CoverPage data={data} />

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

      <ClosingPage data={data} pageNum={closingPageNum} totalPages={totalPages} />
    </div>
  )
}
