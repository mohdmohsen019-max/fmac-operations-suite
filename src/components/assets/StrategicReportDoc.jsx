// Offscreen A4 document renderer for the strategic asset reports.
// Rendered off-screen, then each `.ast-report-page` is captured by html2canvas
// → jsPDF. Bilingual (Arabic-primary), organizational-excellence layout:
// vision/mission strip, KPI rows, CSS bar charts, computed insights, a data-
// transparency note, and an approval/signature block on the final page.
//
// Props: { type: 'strategy'|'linkage'|'plan'|'executive', data, meta }

import {
  STRATEGIC_GOALS, CRITICALITY_META, CONDITION_META,
  criticalityLabel, conditionLabel, fmtMoney, assetDisplayName,
  CLUB_VISION, CLUB_MISSION,
} from './shared'
import { categoryAr } from './ams'

const TITLES = {
  strategy: {
    en: 'Asset & Resource Strategy',
    ar: 'استراتيجية الأصول والموارد',
    deliverable: 'استراتيجية الأصول والموارد المعتمدة',
  },
  linkage: {
    en: 'Strategic Asset-Linkage Map',
    ar: 'خريطة الربط الاستراتيجي للأصول',
    deliverable: 'خريطة الربط الاستراتيجي للأصول المعتمدة',
  },
  plan: {
    en: 'Medium-Term Asset Plan (3–5 Years)',
    ar: 'خطة الأصول متوسطة المدى (٣–٥ سنوات)',
    deliverable: 'خطة الأصول متوسطة المدى المعتمدة',
  },
  executive: {
    en: 'Executive Portfolio Summary',
    ar: 'الملخص التنفيذي لمحفظة الأصول',
    deliverable: 'الملخص التنفيذي لمحفظة الأصول',
  },
  ams: {
    en: 'Asset Management System Overview',
    ar: 'نظام إدارة الأصول',
    deliverable: 'نظام إدارة الأصول — نظرة عامة (ISO 55001)',
  },
}

const PAGE_COUNTS = { strategy: 4, linkage: 4, plan: 4, executive: 1, ams: 5 }

const catAr = {
  'Medical Devices': 'أجهزة طبية', 'Sport Equipment': 'معدات رياضية',
  'Electronics': 'إلكترونيات', 'Furniture': 'أثاث', 'Decorations': 'ديكورات', 'Other': 'أخرى',
}
const cAr = (c) => catAr[c] || c

// html2canvas cannot parse the CSS color-mix() function, so per-report accent
// tints are pre-computed here as plain rgba() strings and injected as CSS
// custom properties — never color-mix in anything under .ast-report-root.
function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '#e26a15')
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : { r: 6, g: 182, b: 212 }
}
function accentVars(color) {
  const { r, g, b } = hexToRgb(color)
  const rgba = (a) => `rgba(${r},${g},${b},${a})`
  return {
    '--sr-accent': color || '#e26a15',
    '--sr-accent-07': rgba(0.07),
    '--sr-accent-10': rgba(0.10),
    '--sr-accent-12': rgba(0.12),
    '--sr-accent-25': rgba(0.25),
    '--sr-accent-28': rgba(0.28),
    '--sr-accent-85': rgba(0.85),
  }
}

/* ── Page frame ─────────────────────────────────────────────────────── */
// dir="rtl" is set as a real HTML attribute (not just CSS `direction`) so the
// browser's Unicode Bidi Algorithm — which html2canvas reads off the DOM —
// establishes a genuine RTL base direction for the whole page. CSS-only
// `direction: rtl` doesn't reliably survive html2canvas's text-run capture,
// which is what was scrambling mixed Arabic/English/number content.
function Page({ type, meta, pageNo, children }) {
  const ti = TITLES[type]
  const pages = PAGE_COUNTS[type]
  return (
    <div className="ast-report-page sr-page" dir="rtl" style={accentVars(meta.color)}>
      <div className="sr-head">
        <img src="/fmac-ops-logo.png" alt="FMAC" className="sr-logo" />
        <div className="sr-head-mid">
          <div className="sr-title-ar">{ti.ar}</div>
          <div className="sr-title-en" dir="ltr">{ti.en}</div>
        </div>
        <div className="sr-head-right">
          <div className="sr-ref" dir="ltr">{meta.ref}</div>
          <div className="sr-date">{meta.dateAr}</div>
        </div>
      </div>
      {/* ISO 55001 controlled-document header: version / revision / review */}
      <div className="sr-metabar">
        <span><b>الإصدار:</b> <span dir="ltr">{meta.version || '1.0'}</span></span>
        <span><b>تاريخ الإصدار:</b> {meta.dateAr}</span>
        <span><b>المراجعة القادمة:</b> <span dir="ltr">{meta.reviewNext || '—'}</span></span>
        <span><b>التصنيف:</b> داخلي — معتمد</span>
      </div>
      <div className="sr-rule" />

      <div className="sr-body">{children}</div>

      <div className="sr-foot">
        <span>نادي الفجيرة للفنون القتالية — قسم العمليات · إدارة الأصول الاستراتيجية</span>
        <span dir="ltr">Fujairah MAC · ISO 55001 · Page {pageNo} / {pages}</span>
      </div>
    </div>
  )
}

function SecTitle({ ar, en, accent }) {
  return (
    <div className="sr-sec-title" style={accent ? { borderColor: accent } : undefined}>
      <span className="sr-sec-ar">{ar}</span>
      <span className="sr-sec-en" dir="ltr">{en}</span>
    </div>
  )
}

function Kpi({ value, ar, en, color }) {
  const c = color || '#e26a15'
  return (
    <div className="sr-kpi" style={{ borderTopColor: c, background: `${c}0e` }}>
      <div className="sr-kpi-val" style={{ color: c }} dir="ltr">{value}</div>
      <div className="sr-kpi-ar">{ar}</div>
      <div className="sr-kpi-en" dir="ltr">{en}</div>
    </div>
  )
}

function Chip({ label, color }) {
  return <span className="sr-chip" style={{ color, borderColor: color, background: `${color}14` }}>{label}</span>
}

// Vision & mission strip — anchors every document to the strategy house.
function VisionStrip() {
  return (
    <div className="sr-vision">
      <div className="sr-vision-row"><span className="sr-vision-tag">الرؤية</span><span>{CLUB_VISION}</span></div>
      <div className="sr-vision-row"><span className="sr-vision-tag">الرسالة</span><span>{CLUB_MISSION}</span></div>
    </div>
  )
}

// Horizontal CSS bar chart (reliable under html2canvas).
function Bars({ rows }) {
  const max = Math.max(1, ...rows.map(r => r.value))
  return (
    <div className="sr-bars">
      {rows.map((r, i) => (
        <div key={i} className="sr-bar-row">
          <span className="sr-bar-label">{r.label}</span>
          <div className="sr-bar-track">
            <div className="sr-bar-fill" style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: r.color || '#e26a15' }} />
          </div>
          <span className="sr-bar-val" dir="ltr">{r.display != null ? r.display : fmtMoney(r.value)}</span>
        </div>
      ))}
    </div>
  )
}

// Numbered list — deliberately NOT a native <ol>/<li>. html2canvas does not
// reliably render list markers/counters under an RTL base direction (this is
// what was scrambling the numbered recommendation/methodology lists); a plain
// numbered-circle + text row renders correctly every time.
function NumberedList({ items, color = '#7c3aed', bg = '#ede9fe' }) {
  return (
    <div className="sr-insights">
      {items.map((s, i) => (
        <div key={i} className="sr-insight">
          <span className="sr-insight-n" style={{ background: bg, color }}>{i + 1}</span>
          <span>{s}</span>
        </div>
      ))}
    </div>
  )
}

function Insights({ items }) {
  return <NumberedList items={items} color="#7c3aed" bg="#ede9fe" />
}

// Data-transparency note — an excellence requirement: estimates are declared.
function QualityNote({ q }) {
  return (
    <div className="sr-quality">
      <strong>شفافية البيانات:</strong>{' '}
      {q.realCost} أصلاً بتكلفة شراء فعلية مسجّلة، و{q.estimatedCost} أصلاً ({q.estimatedPct}%) بتكلفة تخطيطية مُقدّرة وفق فئة الأصل —
      تُستبدل التقديرات تلقائياً فور تسجيل التكلفة الفعلية في سجل الأصول.
    </div>
  )
}

// Status / risk-band pill.
function Pill({ label, color }) {
  return <span className="sr-pill" style={{ color, borderColor: color, background: `${color}18` }}>{label}</span>
}

// "Data pending" marker — shows the ISO gap honestly instead of hiding it.
function Pending({ label = 'قيد الإدخال' }) {
  return <span className="sr-pending">{label}</span>
}

// Target-vs-actual progress bar.
function Progress({ value }) {
  if (value == null) return <Pending label="قيد الجمع" />
  const color = value >= 100 ? '#2c9c5c' : value >= 60 ? '#e26a15' : value >= 30 ? '#d4a008' : '#de4a41'
  return (
    <div className="sr-prog">
      <div className="sr-prog-track"><div className="sr-prog-fill" style={{ width: `${Math.max(3, value)}%`, background: color }} /></div>
      <span className="sr-prog-val" dir="ltr">{value}%</span>
    </div>
  )
}

// A short labelled policy/text block (RTL body).
function TextBlock({ ar, body }) {
  return (
    <div className="sr-textblock">
      {ar && <div className="sr-textblock-h">{ar}</div>}
      <p className="sr-textblock-b">{body}</p>
    </div>
  )
}

// 5×5 risk matrix grid (likelihood × consequence), coloured by band.
function RiskMatrix({ matrix }) {
  const bandFor = (score) => (matrix.bands.find(b => score <= b.max) || matrix.bands[matrix.bands.length - 1])
  const L = matrix.likelihoodAr, C = matrix.consequenceAr
  return (
    <div className="sr-riskmatrix">
      <table className="sr-rm-table">
        <thead>
          <tr>
            <th className="sr-rm-corner"><span dir="rtl">الاحتمال ← / الأثر ↓</span></th>
            {C.map((c, i) => <th key={i}>{c}<br /><span dir="ltr">{i + 1}</span></th>)}
          </tr>
        </thead>
        <tbody>
          {L.map((l, li) => {
            const lik = L.length - li // top row = highest likelihood (5)
            return (
              <tr key={li}>
                <th className="sr-rm-row">{L[lik - 1]}<br /><span dir="ltr">{lik}</span></th>
                {C.map((_, ci) => {
                  const cons = ci + 1
                  const score = lik * cons
                  const band = bandFor(score)
                  return <td key={ci} style={{ background: band.color, color: '#fff' }} dir="ltr">{score}</td>
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="sr-rm-legend">
        {matrix.bands.map((b, i) => (
          <span key={i}><span className="sr-rm-swatch" style={{ background: b.color }} />{b.ar} (≤{b.max})</span>
        ))}
      </div>
    </div>
  )
}

// Simple multi-metric trend (needs ≥2 snapshots) rendered as labelled columns.
function TrendChart({ trend }) {
  const rows = [
    { key: 'totalValue', ar: 'قيمة المحفظة (د.إ)', fmt: (v) => fmtMoney(v) },
    { key: 'goodConditionPct', ar: 'نسبة الحالة الجيدة', fmt: (v) => `${v}%` },
    { key: 'avgRiskScore', ar: 'متوسط درجة المخاطر', fmt: (v) => v },
  ]
  const pts = trend.slice(-6)
  return (
    <table className="sr-table sr-mini">
      <thead>
        <tr>
          <th className="ar">المؤشر</th>
          {pts.map((s, i) => <th key={i} className="num" dir="ltr">{s.date?.slice(2)}</th>)}
          <th className="num">الاتجاه</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => {
          const first = pts[0]?.[r.key], last = pts[pts.length - 1]?.[r.key]
          const up = last > first, flat = last === first
          const arrow = flat ? '→' : up ? '↑' : '↓'
          const good = r.key === 'avgRiskScore' ? !up : up
          return (
            <tr key={ri}>
              <td className="ar">{r.ar}</td>
              {pts.map((s, i) => <td key={i} className="num" dir="ltr">{r.fmt(s[r.key])}</td>)}
              <td className="num" style={{ color: flat ? '#8b8b9e' : good ? '#2c9c5c' : '#de4a41', fontWeight: 800 }}>{arrow}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function ApprovalBlock() {
  const cols = [
    { role: 'أُعدّ بواسطة', roleEn: 'Prepared by', unit: 'إدارة اللوجستيات والأصول' },
    { role: 'روجِع بواسطة', roleEn: 'Reviewed by', unit: 'قسم الاستراتيجية' },
    { role: 'اعتُمد بواسطة', roleEn: 'Approved by', unit: 'الإدارة التنفيذية' },
  ]
  return (
    <div className="sr-approval">
      <SecTitle ar="الاعتماد والتصديق" en="Approval & Endorsement" />
      <div className="sr-approval-grid">
        {cols.map((c, i) => (
          <div key={i} className="sr-approval-col">
            <div className="sr-approval-role">{c.role}</div>
            <div className="sr-approval-roleen" dir="ltr">{c.roleEn}</div>
            <div className="sr-approval-unit">{c.unit}</div>
            <div className="sr-sign-line"><span>الاسم / Name</span></div>
            <div className="sr-sign-line"><span>التوقيع / Signature</span></div>
            <div className="sr-sign-line"><span>التاريخ / Date</span></div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ═══════════════ REPORT 1 — STRATEGY (3 pages) ═══════════════ */
function StrategyPages({ data, meta }) {
  const k = data.kpi
  return (
    <>
      <Page type="strategy" meta={meta} pageNo={1}>
        <VisionStrip />
        <p className="sr-intro">
          تقدّم هذه الوثيقة صورة استراتيجية شاملة لمحفظة أصول النادي: التوزيع، الحالة الفنية، درجة الأهمية،
          وأولويات الصيانة والاستبدال — بما يدعم اتخاذ القرار وترشيد الإنفاق الرأسمالي وربط الموارد بأهداف البيت الاستراتيجي.
        </p>

        <SecTitle ar="الملخص التنفيذي" en="Executive Summary" />
        <div className="sr-kpi-row">
          <Kpi value={k.totalAssets} ar="سجل أصل" en="Asset records" color="#e26a15" />
          <Kpi value={k.totalUnits} ar="إجمالي الوحدات" en="Total units" />
          <Kpi value={fmtMoney(k.totalValue)} ar="القيمة التخطيطية (د.إ)" en="Planning value (AED)" color="#2c9c5c" />
          <Kpi value={k.locations} ar="موقعاً / غرفة" en="Locations" />
          <Kpi value={`${k.goodShare}%`} ar="بحالة جيدة" en="Good condition" color="#2c9c5c" />
        </div>

        <SecTitle ar="توزيع المحفظة حسب الفئة" en="Portfolio by Category" />
        <table className="sr-table">
          <thead>
            <tr>
              <th className="ar">الفئة</th><th>Category</th>
              <th className="num">السجلات</th><th className="num">الوحدات</th>
              <th className="num">القيمة التخطيطية (د.إ)</th><th className="num">الحصة</th>
            </tr>
          </thead>
          <tbody>
            {data.byCategory.map((c, i) => (
              <tr key={i}>
                <td className="ar">{cAr(c.key)}</td><td>{c.key}</td>
                <td className="num">{c.count}</td><td className="num">{c.units}</td>
                <td className="num">{fmtMoney(c.value)}</td>
                <td className="num">{k.totalValue ? Math.round((c.value / k.totalValue) * 100) : 0}%</td>
              </tr>
            ))}
            <tr className="sr-total">
              <td className="ar">الإجمالي</td><td>Total</td>
              <td className="num">{k.totalAssets}</td><td className="num">{k.totalUnits}</td>
              <td className="num">{fmtMoney(k.totalValue)}</td><td className="num">100%</td>
            </tr>
          </tbody>
        </table>

        <SecTitle ar="القيمة حسب الفئة" en="Value Distribution" />
        <Bars rows={data.byCategory.map(c => ({ label: cAr(c.key), value: c.value }))} />
      </Page>

      <Page type="strategy" meta={meta} pageNo={2}>
        <div className="sr-two-col">
          <div>
            <SecTitle ar="الحالة الفنية" en="Condition" />
            <table className="sr-table sr-mini">
              <tbody>
                {data.byCondition.map((c, i) => (
                  <tr key={i}>
                    <td><span className="sr-dot" style={{ background: CONDITION_META[c.key]?.color || '#8b8b9e' }} /></td>
                    <td className="ar">{conditionLabel(c.key, 'ar')}</td>
                    <td>{conditionLabel(c.key, 'en')}</td>
                    <td className="num">{c.count}</td>
                    <td className="num">{k.totalAssets ? Math.round((c.count / k.totalAssets) * 100) : 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <SecTitle ar="درجة الأهمية" en="Criticality" />
            <table className="sr-table sr-mini">
              <tbody>
                {data.byCriticality.map((c, i) => (
                  <tr key={i}>
                    <td><span className="sr-dot" style={{ background: CRITICALITY_META[c.key]?.color || '#8b8b9e' }} /></td>
                    <td className="ar">{criticalityLabel(c.key, 'ar')}</td>
                    <td>{criticalityLabel(c.key, 'en')}</td>
                    <td className="num">{c.count}</td>
                    <td className="num">{k.totalAssets ? Math.round((c.count / k.totalAssets) * 100) : 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <SecTitle ar="أعلى المواقع تركّزاً للأصول" en="Top Locations by Asset Count" />
        <table className="sr-table">
          <thead>
            <tr><th className="num">#</th><th>الموقع / الغرفة</th><th className="num">السجلات</th><th className="num">الوحدات</th><th className="num">القيمة (د.إ)</th></tr>
          </thead>
          <tbody>
            {data.byLocation.map((l, i) => (
              <tr key={i}>
                <td className="num">{i + 1}</td>
                <td>{l.key}</td>
                <td className="num">{l.count}</td>
                <td className="num">{l.units}</td>
                <td className="num">{fmtMoney(l.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.locationsTotal > data.byLocation.length && (
          <p className="sr-more">و {data.locationsTotal - data.byLocation.length} موقعاً آخر ضمن السجل الكامل.</p>
        )}

        <SecTitle ar="قراءات تحليلية" en="Analytical Insights" accent="#8b5cf6" />
        <Insights items={data.insights} />
      </Page>

      <Page type="strategy" meta={meta} pageNo={3}>
        <SecTitle ar="أهداف إدارة الأصول" en="Asset Management Objectives (ISO 55001 §6.2)" accent="#e26a15" />
        <p className="sr-note-plain">أهداف قابلة للقياس ومحددة زمنياً مرتبطة بأعمدة البيت الاستراتيجي، مع القيمة المرجعية والمستهدفة والفعلية الحيّة.</p>
        <table className="sr-table">
          <thead>
            <tr>
              <th>الهدف</th><th className="ar">المؤشر</th>
              <th className="num">المرجعي</th><th className="num">المستهدف</th><th className="num">الفعلي</th>
              <th>التقدّم</th><th className="num">الموعد</th>
            </tr>
          </thead>
          <tbody>
            {data.objectives.map((o, i) => (
              <tr key={i}>
                <td>{o.goal ? <Chip label={o.goal.code} color={o.goal.color} /> : '—'}</td>
                <td className="ar sr-small">{o.metricAr}</td>
                <td className="num" dir="ltr">{o.baseline != null ? `${o.baseline}${o.unit === '%' ? '%' : ''}` : '—'}</td>
                <td className="num" dir="ltr">{o.target}{o.unit === '%' ? '%' : ''}</td>
                <td className="num" dir="ltr">{o.hasActual ? `${o.actual}${o.unit === '%' ? '%' : ''}` : <Pending label="قيد الجمع" />}</td>
                <td style={{ minWidth: 90 }}><Progress value={o.progress} /></td>
                <td className="num sr-small" dir="ltr">{o.targetDate}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <SecTitle ar="تتبّع الأداء (الاتجاه الزمني)" en="Performance Trend" accent="#8b5cf6" />
        <p className="sr-note-plain">مقارنة المؤشرات عبر لقطات أداء مؤرّخة تُحفظ تلقائياً عند كل إصدار للتقرير، لرصد اتجاه المحفظة عبر الزمن.</p>
        <TrendChart trend={data.trend} />
        <p className="sr-more">تُحدَّث سلسلة الاتجاه ذاتياً مع كل إصدار جديد للتقرير.</p>
      </Page>

      <Page type="strategy" meta={meta} pageNo={4}>
        <SecTitle ar="سجل الصيانة المطلوبة" en="Maintenance Backlog" accent="#d4a008" />
        {data.maintenance.length === 0 ? (
          <p className="sr-note">لا توجد أصول تتطلب صيانة عاجلة — جميع الأصول بحالة جيدة وفق آخر تحديث للسجل. ✔</p>
        ) : (
          <table className="sr-table">
            <thead>
              <tr><th className="ar">الأصل</th><th>الموقع</th><th>الحالة</th><th>الأهمية</th></tr>
            </thead>
            <tbody>
              {data.maintenance.slice(0, 8).map((a, i) => (
                <tr key={i}>
                  <td>{assetDisplayName(a, 'en')}</td>
                  <td>{a.department || '—'}</td>
                  <td><Chip label={conditionLabel(a.condition, 'ar')} color={CONDITION_META[a.condition]?.color} /></td>
                  <td><Chip label={criticalityLabel(a.criticality, 'ar')} color={CRITICALITY_META[a.criticality]?.color} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <SecTitle ar="أولويات الصيانة والاستبدال" en="Renewal Priorities (balanced mix)" accent="#de4a41" />
        <table className="sr-table">
          <thead>
            <tr><th className="num">#</th><th className="ar">الأصل</th><th>الفئة</th><th>الموقع</th><th>الأهمية</th><th className="num">سنة الاستبدال</th><th className="num">التكلفة (د.إ)</th></tr>
          </thead>
          <tbody>
            {data.priorities.map((a, i) => (
              <tr key={i}>
                <td className="num">{i + 1}</td>
                <td>{assetDisplayName(a, 'en')}</td>
                <td className="ar">{cAr(a.category)}</td>
                <td className="sr-small">{a.department || '—'}</td>
                <td><Chip label={criticalityLabel(a.criticality, 'ar')} color={CRITICALITY_META[a.criticality]?.color} /></td>
                <td className="num">{a.replacement_year}</td>
                <td className="num">{fmtMoney(a.est_replacement_cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <SecTitle ar="التوصيات الاستراتيجية" en="Strategic Recommendations" />
        <NumberedList color="#0e7c5a" bg="#e6f7f0" items={[
          'إعطاء الأولوية لصيانة واستبدال الأصول المرتفعة الأهمية لضمان استمرارية البرامج الرياضية والخدمات الطبية.',
          'اعتماد جدول صيانة وقائية دوري للأصول التي تقترب من نهاية عمرها الافتراضي، وتحديث الحالة الفنية ميدانياً كل ستة أشهر.',
          'تسجيل تكاليف الشراء الفعلية تدريجياً لرفع دقة القيمة التخطيطية للمحفظة.',
          'مراجعة هذه الاستراتيجية سنوياً ومواءمتها مع الموازنة الرأسمالية وأهداف البيت الاستراتيجي.',
        ]} />

        <QualityNote q={data.quality} />
        <ApprovalBlock />
      </Page>
    </>
  )
}

/* ═══════════════ REPORT 2 — LINKAGE (3 pages) ═══════════════ */
function LinkagePages({ data, meta }) {
  const k = data.kpi
  return (
    <>
      <Page type="linkage" meta={meta} pageNo={1}>
        <VisionStrip />
        <p className="sr-intro">
          تربط هذه الخريطة كل أصل من أصول النادي بالهدف الاستراتيجي الذي يخدمه ضمن أعمدة البيت الاستراتيجي الستة،
          وتُبرز الأصول عالية الأهمية التي تتطلب عناية خاصة، بما يمكّن الإدارة من توجيه الموارد نحو الأهداف الأعلى أثراً.
        </p>

        <SecTitle ar="مؤشرات الربط" en="Linkage Indicators" />
        <div className="sr-kpi-row">
          <Kpi value={`${k.coverage}%`} ar="تغطية الربط" en="Coverage" color="#2c9c5c" />
          <Kpi value={k.totalAssets} ar="أصل مرتبط" en="Linked assets" color="#e26a15" />
          <Kpi value={k.goalsUsed} ar="أهداف مخدومة" en="Goals served" />
          <Kpi value={k.criticalCareCount} ar="عناية خاصة" en="Special care" color="#de4a41" />
        </div>

        <SecTitle ar="توزيع الأصول على الأهداف" en="Distribution Across Goals" />
        <Bars rows={data.goals.map(g => ({
          label: `${g.goal.code} · ${g.goal.shortAr}`,
          value: g.count,
          display: `${g.count} (${g.sharePct}%)`,
          color: g.goal.color,
        }))} />

        <SecTitle ar="بطاقات الأهداف الاستراتيجية" en="Strategic Goal Cards" />
        <div className="sr-goals">
          {data.goals.map((g, i) => (
            <div key={i} className="sr-goal-card" style={{ borderColor: g.goal.color }}>
              <div className="sr-goal-head">
                <span className="sr-goal-code" style={{ background: g.goal.color }}>{g.goal.code}</span>
                <span className="sr-goal-short">{g.goal.shortAr}</span>
              </div>
              <div className="sr-goal-stats">
                <span><strong>{g.count}</strong> أصل</span>
                <span><strong>{g.sharePct}%</strong> من السجل</span>
                <span><strong>{fmtMoney(g.value)}</strong> د.إ</span>
              </div>
            </div>
          ))}
        </div>
      </Page>

      <Page type="linkage" meta={meta} pageNo={2}>
        <SecTitle ar="التفصيل حسب الهدف الاستراتيجي" en="Goal-by-Goal Breakdown" />
        {data.goals.map((g, i) => (
          <div key={i} className="sr-goal-block" style={{ borderColor: g.goal.color }}>
            <div className="sr-goal-block-head">
              <span className="sr-goal-code" style={{ background: g.goal.color }}>{g.goal.code}</span>
              <span className="sr-goal-block-title">{g.goal.ar}</span>
              <div className="sr-goal-block-kpis">
                <span><b dir="ltr">{g.count}</b> أصل</span>
                <span><b dir="ltr">{fmtMoney(g.value)}</b> د.إ</span>
                <span><b dir="ltr">{g.highCount}</b> عالي الأهمية</span>
              </div>
            </div>
            {g.count > 0 && (
              <div className="sr-goal-block-body">
                <span className="sr-goal-block-label">أبرز الأصول:</span>{' '}
                <span dir="ltr">{g.top.map(a => assetDisplayName(a, 'en')).join(', ')}</span>
                {g.topLocations.length > 0 && (
                  <>
                    {' · '}<span className="sr-goal-block-label">أهم المواقع:</span>{' '}
                    <span dir="ltr">{g.topLocations.map(l => `${l.key} (${l.count})`).join(', ')}</span>
                  </>
                )}
              </div>
            )}
          </div>
        ))}

        <SecTitle ar="قراءات تحليلية" en="Analytical Insights" accent="#8b5cf6" />
        <Insights items={data.insights} />
      </Page>

      <Page type="linkage" meta={meta} pageNo={3}>
        <SecTitle ar="منهجية إدارة المخاطر" en="Risk Management Methodology (ISO 55001 §6.1)" accent="#de4a41" />
        <div className="sr-two-col sr-risk-intro">
          <div>
            <p className="sr-note-plain">
              تُقيَّم مخاطر الأصول بضرب الاحتمال (١–٥) في الأثر (١–٥) لإنتاج درجة مخاطر (١–٢٥) تُصنَّف ضمن أربعة نطاقات.
              الاحتمال يُشتق من الحالة الفنية والأثر من درجة الأهمية، وكلاهما قابل للتعديل يدوياً لكل أصل.
            </p>
            <div className="sr-risk-bands">
              {data.riskBands.map((b, i) => (
                <div key={i} className="sr-risk-band-row">
                  <span className="sr-rm-swatch" style={{ background: b.color }} />
                  <span className="sr-risk-band-name">{b.ar}</span>
                  <span className="sr-risk-band-range" dir="ltr">≤{b.max}</span>
                  <span className="sr-risk-band-count"><b dir="ltr">{b.count}</b> أصل</span>
                </div>
              ))}
            </div>
          </div>
          <RiskMatrix matrix={data.riskMatrix} />
        </div>

        <SecTitle ar="سجل المخاطر" en="Risk Register" accent="#de4a41" />
        <table className="sr-table sr-risk-table">
          <thead>
            <tr>
              <th className="ar">الأصل</th><th>الموقع</th>
              <th className="num">الاحتمال</th><th className="num">الأثر</th><th className="num">الدرجة</th>
              <th>التصنيف</th><th className="ar">المالك</th><th className="ar">إجراء المعالجة</th>
            </tr>
          </thead>
          <tbody>
            {data.riskRegister.map((w, i) => (
              <tr key={i}>
                <td>{assetDisplayName(w.a, 'en')}</td>
                <td className="sr-small">{w.a.department || '—'}</td>
                <td className="num" dir="ltr">{w.risk.likelihood}</td>
                <td className="num" dir="ltr">{w.risk.consequence}</td>
                <td className="num" dir="ltr"><b>{w.risk.score}</b></td>
                <td><Pill label={w.risk.band.ar} color={w.risk.band.color} /></td>
                <td className="ar sr-small">{w.risk.owner}</td>
                <td className="ar sr-small">{w.risk.treatmentAr}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.riskTotal > data.riskRegister.length && (
          <p className="sr-more">يعرض الجدول أعلى {data.riskRegister.length} أصلاً بدرجة مخاطر؛ السجل الكامل يشمل {data.riskTotal} أصلاً.</p>
        )}
      </Page>

      <Page type="linkage" meta={meta} pageNo={4}>
        <SecTitle ar="أصول غير مستغَلة بالكامل" en="Underutilized Assets" accent="#d4a008" />
        {data.underutilized.length === 0 ? (
          <p className="sr-note">لا توجد أصول مصنّفة كغير مستغَلة حالياً — تُحدَّث هذه القائمة من سجل الأصول عند تقييم الاستغلال ميدانياً.</p>
        ) : (
          <ul className="sr-list">
            {data.underutilized.map((a, i) => (
              <li key={i}>{assetDisplayName(a, 'en')} <span className="sr-muted">— {a.department || '—'}</span></li>
            ))}
          </ul>
        )}

        <SecTitle ar="منهجية الربط" en="Linkage Methodology" />
        <NumberedList color="#0e7c5a" bg="#e6f7f0" items={[
          'يُعتمد الربط اليدوي المسجّل في سجل الأصول أولاً متى وُجد.',
          'عند غيابه يُصنَّف الأصل آلياً وفق موقعه ووظيفته: قاعات المنافسات ← استضافة البطولات، مرافق الإعداد والتأهيل ← برامج النخبة، الأجهزة الإلكترونية ← الممارسات التكنولوجية، مناطق الاستقبال ← المجتمع واستقطاب المواهب، والمرافق الإدارية ← تميز مكانة النادي.',
          'يمكن تعديل ربط أي أصل يدوياً من السجل، ويُعاد إصدار الخريطة فوراً.',
        ]} />

        <QualityNote q={data.quality} />
        <ApprovalBlock />
      </Page>
    </>
  )
}

/* ═══════════════ REPORT 3 — MEDIUM-TERM PLAN (3 pages) ═══════════════ */
function PlanPages({ data, meta }) {
  const k = data.kpi
  return (
    <>
      <Page type="plan" meta={meta} pageNo={1}>
        <VisionStrip />
        <p className="sr-intro">
          تحدّد هذه الخطة الأصول المتوقّع استبدالها أو تجديدها خلال الفترة {k.fromYear}–{k.toYear}، مع التكلفة
          التخطيطية ومصادر التمويل وترتيب الأولويات، لتمكين إعداد موازنة رأسمالية استباقية بدلاً من الاستجابة للأعطال.
        </p>

        <SecTitle ar="مؤشرات الخطة" en="Plan Indicators" />
        <div className="sr-kpi-row">
          <Kpi value={k.dueCount} ar="بند ضمن الخطة" en="Items in plan" color="#e26a15" />
          <Kpi value={fmtMoney(k.totalPlanCost)} ar="التكلفة الإجمالية (د.إ)" en="Total (AED)" color="#2c9c5c" />
          <Kpi value={fmtMoney(k.avgPerYear)} ar="متوسط سنوي (د.إ)" en="Avg / year" />
          <Kpi value={k.urgentCount} ar="مستحق خلال سنتين" en="Due ≤ 2 yrs" color="#de4a41" />
        </div>

        <SecTitle ar="جدول الاستبدال حسب السنة" en="Replacement Schedule by Year" />
        <table className="sr-table">
          <thead>
            <tr><th className="num">السنة</th><th className="num">عدد البنود</th><th className="num">التكلفة (د.إ)</th><th>تكوين السنة</th></tr>
          </thead>
          <tbody>
            {data.byYear.map((y, i) => (
              <tr key={i}>
                <td className="num sr-strong">{y.year}</td>
                <td className="num">{y.count}</td>
                <td className="num">{fmtMoney(y.value)}</td>
                <td className="sr-small ar">{y.categories.slice(0, 3).map(c => `${cAr(c.key)} (${c.count})`).join(' · ')}</td>
              </tr>
            ))}
            <tr className="sr-total">
              <td className="ar">الإجمالي</td><td className="num">{k.dueCount}</td>
              <td className="num">{fmtMoney(k.totalPlanCost)}</td><td />
            </tr>
          </tbody>
        </table>

        <SecTitle ar="منحنى الإنفاق المتوقع" en="Projected Spend Curve" />
        <Bars rows={data.byYear.map(y => ({ label: String(y.year), value: y.value, color: '#d4a008' }))} />
      </Page>

      <Page type="plan" meta={meta} pageNo={2}>
        <SecTitle ar="منهجية ترتيب أولويات الاستثمار" en="Investment Prioritisation Methodology" accent="#de4a41" />
        <div className="sr-formula">
          <span className="sr-formula-label">درجة الأولوية =</span>
          <span dir="ltr" className="sr-formula-eq">Criticality Weight × Risk Score × Goal Weight − (Cost Penalty × Cost Factor × 100)</span>
        </div>
        <div className="sr-two-col">
          <table className="sr-table sr-mini">
            <thead><tr><th className="ar">وزن الأهمية</th><th className="num">القيمة</th></tr></thead>
            <tbody>
              <tr><td className="ar">منخفضة</td><td className="num" dir="ltr">1</td></tr>
              <tr><td className="ar">متوسطة</td><td className="num" dir="ltr">2</td></tr>
              <tr><td className="ar">مرتفعة</td><td className="num" dir="ltr">3</td></tr>
              <tr><td className="ar">حرجة</td><td className="num" dir="ltr">4</td></tr>
            </tbody>
          </table>
          <table className="sr-table sr-mini">
            <thead><tr><th className="ar">وزن الهدف الاستراتيجي</th><th className="num">القيمة</th></tr></thead>
            <tbody>
              {STRATEGIC_GOALS.map((g, i) => (
                <tr key={i}>
                  <td className="ar"><Chip label={g.code} color={g.color} /> {g.shortAr}</td>
                  <td className="num" dir="ltr">{(data.investmentWeights?.goalWeights?.[g.code] ?? 0.7).toFixed(1)}</td>
                </tr>
              ))}
              <tr className="sr-total"><td className="ar">معامل عقوبة التكلفة</td><td className="num" dir="ltr">{(data.investmentWeights?.costPenalty ?? 0.15).toFixed(2)}</td></tr>
            </tbody>
          </table>
        </div>

        <SecTitle ar="أولويات الإنفاق الرأسمالي" en="Capital Priorities (method-scored)" accent="#de4a41" />
        <table className="sr-table">
          <thead>
            <tr><th className="num">#</th><th className="ar">الأصل</th><th>الفئة</th><th>الأهمية</th><th className="num">المخاطر</th><th className="num">الدرجة</th><th className="num">السنة</th><th className="num">التكلفة (د.إ)</th></tr>
          </thead>
          <tbody>
            {data.priorities.map((a, i) => (
              <tr key={i}>
                <td className="num">{i + 1}</td>
                <td>{assetDisplayName(a, 'en')}</td>
                <td className="ar sr-small">{cAr(a.category)}</td>
                <td><Chip label={criticalityLabel(a.criticality, 'ar')} color={CRITICALITY_META[a.criticality]?.color} /></td>
                <td className="num" dir="ltr">{a._risk}</td>
                <td className="num" dir="ltr"><b>{a._score}</b></td>
                <td className="num" dir="ltr">{a.replacement_year}</td>
                <td className="num" dir="ltr">{fmtMoney(a.est_replacement_cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Page>

      <Page type="plan" meta={meta} pageNo={3}>
        <SecTitle ar="التكلفة الإجمالية للملكية (دورة الحياة)" en="Whole-Life Cost / Total Cost of Ownership" accent="#2c9c5c" />
        <p className="sr-note-plain">لا يقتصر التخطيط على تكلفة الاقتناء؛ يضيف هذا القسم التكلفة التشغيلية والصيانة السنوية على مدى العمر الافتراضي لكل فئة.</p>
        <table className="sr-table">
          <thead>
            <tr>
              <th className="ar">الفئة</th><th className="num">العمر (سنة)</th>
              <th className="num">التكلفة الرأسمالية (د.إ)</th><th className="num">تشغيل سنوي (د.إ)</th>
              <th className="num">تشغيل مدى العمر (د.إ)</th><th className="num">إجمالي الملكية (د.إ)</th>
            </tr>
          </thead>
          <tbody>
            {data.wholeLife.map((w, i) => (
              <tr key={i}>
                <td className="ar">{cAr(w.category)}</td>
                <td className="num" dir="ltr">{w.life}</td>
                <td className="num" dir="ltr">{fmtMoney(w.capex)}</td>
                <td className="num" dir="ltr">{fmtMoney(w.annualOpex)}</td>
                <td className="num" dir="ltr">{fmtMoney(w.lifetimeOpex)}</td>
                <td className="num" dir="ltr"><b>{fmtMoney(w.totalCostOfOwnership)}</b></td>
              </tr>
            ))}
            <tr className="sr-total">
              <td className="ar">الإجمالي</td><td />
              <td className="num" dir="ltr">{fmtMoney(data.capexTotal)}</td><td />
              <td className="num" dir="ltr">{fmtMoney(data.lifetimeOpexTotal)}</td>
              <td className="num" dir="ltr">{fmtMoney(data.tcoTotal)}</td>
            </tr>
          </tbody>
        </table>

        <SecTitle ar="مصادر التمويل" en="Funding Sources" />
        <table className="sr-table sr-mini">
          <thead><tr><th className="ar">المصدر</th><th className="num">عدد البنود</th><th className="num">القيمة (د.إ)</th><th className="num">الحصة</th></tr></thead>
          <tbody>
            {data.byFunding.map((f, i) => (
              <tr key={i}>
                <td className="ar">{f.source}</td><td className="num" dir="ltr">{f.count}</td>
                <td className="num" dir="ltr">{fmtMoney(f.value)}</td>
                <td className="num" dir="ltr">{k.totalPlanCost ? Math.round((f.value / k.totalPlanCost) * 100) : 0}%</td>
              </tr>
            ))}
          </tbody>
        </table>

        <SecTitle ar="قراءات تحليلية" en="Analytical Insights" accent="#8b5cf6" />
        <Insights items={data.insights} />
      </Page>

      <Page type="plan" meta={meta} pageNo={4}>
        <SecTitle ar="المنهجية والافتراضات" en="Methodology & Assumptions" />
        <NumberedList color="#0e7c5a" bg="#e6f7f0" items={[
          'تُحتسب سنة الاستبدال من العمر الافتراضي المعتمد لكل فئة، وتُقدَّم تلقائياً عند تدهور الحالة الفنية للأصل.',
          'التكاليف تقديرات تخطيطية متحفّظة على مستوى الفئة؛ تُستبدل بالتكلفة الفعلية فور تسجيلها وتُحدَّث الخطة لحظياً.',
          'مصدر التمويل الافتراضي هو الموازنة التشغيلية، ويُعاد توزيعه بين الموازنة والدعم والرعايات عند الاعتماد.',
          'تُراجع الخطة سنوياً مع قسم الاستراتيجية وتُواءم مع الموازنة العامة للنادي.',
        ]} />

        <SecTitle ar="المخاطر وإجراءات التخفيف" en="Risks & Mitigations" accent="#d4a008" />
        <table className="sr-table sr-mini">
          <thead><tr><th className="ar">الخطر</th><th className="ar">الأثر</th><th className="ar">إجراء التخفيف</th></tr></thead>
          <tbody>
            <tr>
              <td className="ar">تركّز الإنفاق في سنة واحدة</td>
              <td className="ar">ضغط على الموازنة الرأسمالية</td>
              <td className="ar">إعادة جدولة البنود منخفضة الأهمية على سنتين متتاليتين</td>
            </tr>
            <tr>
              <td className="ar">تقديرات تكلفة غير محدثة</td>
              <td className="ar">انحراف الموازنة عن الفعلي</td>
              <td className="ar">تسجيل التكاليف الفعلية وربط الشراء بعروض أسعار موثقة</td>
            </tr>
            <tr>
              <td className="ar">تعطّل مبكر لأصل عالي الأهمية</td>
              <td className="ar">توقف خدمة رياضية أو طبية</td>
              <td className="ar">صيانة وقائية دورية وتحديث الحالة الفنية كل ستة أشهر</td>
            </tr>
          </tbody>
        </table>

        <QualityNote q={data.quality} />
        <ApprovalBlock />
      </Page>
    </>
  )
}

/* ═══════════════ REPORT 4 — EXECUTIVE ONE-PAGER ═══════════════ */
function ExecutivePage({ data, meta }) {
  const s = data.strategy, l = data.linkage, p = data.plan
  return (
    <Page type="executive" meta={meta} pageNo={1}>
      <VisionStrip />

      <div className="sr-kpi-row">
        <Kpi value={s.kpi.totalAssets} ar="أصل مسجّل" en="Assets" color="#e26a15" />
        <Kpi value={s.kpi.totalUnits} ar="وحدة" en="Units" />
        <Kpi value={fmtMoney(s.kpi.totalValue)} ar="القيمة (د.إ)" en="Value (AED)" color="#2c9c5c" />
        <Kpi value={`${l.kpi.coverage}%`} ar="ربط استراتيجي" en="Linked" color="#8b5cf6" />
        <Kpi value={fmtMoney(p.kpi.totalPlanCost)} ar="خطة ٥ سنوات (د.إ)" en="5-yr plan" color="#d4a008" />
      </div>

      <div className="sr-two-col">
        <div>
          <SecTitle ar="المحفظة حسب الفئة" en="By Category" />
          <Bars rows={s.byCategory.map(c => ({ label: cAr(c.key), value: c.count, display: String(c.count) }))} />
        </div>
        <div>
          <SecTitle ar="الأصول حسب الهدف" en="By Strategic Goal" />
          <Bars rows={l.goals.map(g => ({ label: `${g.goal.code} · ${g.goal.shortAr}`, value: g.count, display: String(g.count), color: g.goal.color }))} />
        </div>
      </div>

      <SecTitle ar="أبرز المؤشرات" en="Headline Readings" accent="#8b5cf6" />
      <Insights items={[
        s.insights[0],
        l.insights[1] || l.insights[0],
        p.insights[0],
      ].filter(Boolean)} />

      <SecTitle ar="الإجراءات الموصى بها للإدارة" en="Recommended Executive Actions" accent="#de4a41" />
      <NumberedList color="#be123c" bg="#ffe4e6" items={data.actions} />

      <div className="sr-exec-sign">
        <div className="sr-sign-line" style={{ width: '30%' }}><span>رئيس قسم العمليات</span></div>
        <div className="sr-sign-line" style={{ width: '30%' }}><span>قسم الاستراتيجية</span></div>
        <div className="sr-sign-line" style={{ width: '30%' }}><span>الإدارة التنفيذية</span></div>
      </div>
    </Page>
  )
}

/* ═══════════════ REPORT 5 — AMS OVERVIEW (ISO 55001, 5 pages) ═══════════════ */
function AmsPages({ data, meta }) {
  const c = data.config
  return (
    <>
      {/* P1 — Scope & Policy */}
      <Page type="ams" meta={meta} pageNo={1}>
        <p className="sr-intro">
          توثّق هذه الوثيقة نظام إدارة الأصول لنادي الفجيرة للفنون القتالية بما يتوافق مع المتطلبات الهيكلية للمواصفة
          الدولية ISO 55001، لتشكّل — إلى جانب استراتيجية الأصول وخريطة الربط والخطة متوسطة المدى — نظاماً متكاملاً وقابلاً للتدقيق.
        </p>

        <SecTitle ar="سياسة إدارة الأصول" en="Asset Management Policy" accent="#e26a15" />
        <TextBlock body={c.policy.statementAr} />
        <div className="sr-principles">
          {c.policy.principlesAr.map((p, i) => <span key={i} className="sr-principle">{p}</span>)}
        </div>

        <SecTitle ar="نطاق نظام إدارة الأصول" en="AMS Scope" />
        <TextBlock body={c.scope.statementAr} />
        <div className="sr-two-col">
          <div>
            <div className="sr-scope-h sr-scope-in">ضمن النطاق</div>
            <ul className="sr-list">{c.scope.inScopeAr.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </div>
          <div>
            <div className="sr-scope-h sr-scope-out">خارج النطاق</div>
            <ul className="sr-list">{c.scope.outOfScopeAr.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </div>
        </div>
        <div className="sr-quality">
          <strong>الأصول الرقمية:</strong> {c.scope.digitalInScope ? 'مشمولة ضمن النطاق.' : <>غير مشمولة حالياً — مستهدف إدراجها بحلول <span dir="ltr">{c.scope.digitalTargetDate}</span>.</>}
        </div>

        <SecTitle ar="سجل الإصدارات" en="Revision History" />
        <table className="sr-table sr-mini">
          <thead><tr><th className="num">الإصدار</th><th className="num">التاريخ</th><th className="ar">المُعِد</th><th className="ar">الملخص</th></tr></thead>
          <tbody>
            {c.revisionHistory.map((r, i) => (
              <tr key={i}>
                <td className="num" dir="ltr">{r.version}</td>
                <td className="num" dir="ltr">{r.date}</td>
                <td className="ar">{r.author}</td>
                <td className="ar">{r.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Page>

      {/* P2 — Roles & Objectives */}
      <Page type="ams" meta={meta} pageNo={2}>
        <SecTitle ar="الأدوار والمسؤوليات" en="Roles & Responsibilities" accent="#8b5cf6" />
        <p className="sr-note-plain">توزيع مسؤوليات الأصول لكل فئة وفق نموذج المالك / المدير / الحارس.</p>
        <table className="sr-table">
          <thead>
            <tr><th className="ar">فئة الأصل</th><th className="ar">المالك (Owner)</th><th className="ar">المدير (Manager)</th><th className="ar">الحارس (Custodian)</th></tr>
          </thead>
          <tbody>
            {c.roles.map((r, i) => (
              <tr key={i}>
                <td className="ar sr-strong">{cAr(r.category)}</td>
                <td className="ar">{r.owner || <Pending />}</td>
                <td className="ar">{r.manager || <Pending />}</td>
                <td className="ar">{r.custodian || <Pending />}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <SecTitle ar="أهداف إدارة الأصول" en="Asset Management Objectives" accent="#e26a15" />
        <table className="sr-table">
          <thead>
            <tr><th>الهدف</th><th className="ar">المؤشر</th><th className="num">المرجعي</th><th className="num">المستهدف</th><th className="num">الفعلي</th><th className="num">الموعد</th></tr>
          </thead>
          <tbody>
            {data.objectives.map((o, i) => (
              <tr key={i}>
                <td>{o.goal ? <Chip label={o.goal.code} color={o.goal.color} /> : '—'}</td>
                <td className="ar sr-small">{o.metricAr}</td>
                <td className="num" dir="ltr">{o.baseline != null ? o.baseline : '—'}</td>
                <td className="num" dir="ltr">{o.target}</td>
                <td className="num" dir="ltr">{o.hasActual ? o.actual : <Pending label="قيد الجمع" />}</td>
                <td className="num sr-small" dir="ltr">{o.targetDate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Page>

      {/* P3 — Risk methodology + Compliance */}
      <Page type="ams" meta={meta} pageNo={3}>
        <SecTitle ar="منهجية إدارة المخاطر" en="Risk Management Methodology" accent="#de4a41" />
        <div className="sr-two-col sr-risk-intro">
          <div>
            <p className="sr-note-plain">درجة المخاطر = الاحتمال (١–٥) × الأثر (١–٥)، مصنّفة ضمن أربعة نطاقات. متوسط درجة مخاطر المحفظة الحالية <b dir="ltr">{data.avgRiskScore}</b> من ٢٥.</p>
            <div className="sr-risk-bands">
              {data.riskBands.map((b, i) => (
                <div key={i} className="sr-risk-band-row">
                  <span className="sr-rm-swatch" style={{ background: b.color }} />
                  <span className="sr-risk-band-name">{b.ar}</span>
                  <span className="sr-risk-band-range" dir="ltr">≤{b.max}</span>
                  <span className="sr-risk-band-count"><b dir="ltr">{b.count}</b> أصل</span>
                </div>
              ))}
            </div>
          </div>
          <RiskMatrix matrix={c.riskMatrix} />
        </div>

        <SecTitle ar="سجل الالتزام القانوني والتنظيمي" en="Legal & Regulatory Compliance Register" accent="#d4a008" />
        <table className="sr-table">
          <thead>
            <tr><th className="ar">الفئة / النطاق</th><th className="ar">المتطلب</th><th className="ar">التكرار</th><th className="num">آخر تحقق</th><th className="num">الاستحقاق القادم</th><th>الحالة</th></tr>
          </thead>
          <tbody>
            {data.compliance.map((r, i) => (
              <tr key={i}>
                <td className="ar sr-small">{r.category === 'All' ? 'جميع الفئات' : cAr(r.category)}</td>
                <td className="ar">{r.requirementAr}</td>
                <td className="ar sr-small">{r.freqAr}</td>
                <td className="num" dir="ltr">{r.lastVerified || <Pending />}</td>
                <td className="num" dir="ltr">{r.nextDue || <Pending />}</td>
                <td><Pill label={r.status.ar} color={r.status.color} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="sr-quality">
          <strong>ملاحظة:</strong> جميع متطلبات الالتزام موثّقة بتواريخ تحقق واستحقاق، وتُحدَّث حالتها تلقائياً
          (متأخر / يستحق قريباً / مطابق) بنفس آلية تنبيهات الاستبدال. البنود المطابقة حالياً: <b dir="ltr">{data.compliance.length - data.complianceOpen}</b> من <b dir="ltr">{data.compliance.length}</b>.
        </div>
      </Page>

      {/* P4 — Maintenance strategy + Whole-life */}
      <Page type="ams" meta={meta} pageNo={4}>
        <SecTitle ar="استراتيجية الصيانة" en="Maintenance Strategy" accent="#2c9c5c" />
        <table className="sr-table">
          <thead>
            <tr><th className="ar">الفئة</th><th className="ar">أسلوب الصيانة</th><th className="ar">دورية الفحص</th><th className="ar">المعيار المرجعي</th></tr>
          </thead>
          <tbody>
            {c.maintenance.map((m, i) => (
              <tr key={i}>
                <td className="ar sr-strong">{cAr(m.category)}</td>
                <td className="ar">{m.approachAr}</td>
                <td className="ar">{m.intervalAr}</td>
                <td className="ar sr-small" dir="rtl">{m.standardAr}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <TextBlock ar="قطع الغيار الحرجة وخطة الطوارئ" body={c.criticalSparesAr} />

        <SecTitle ar="ملخص التكلفة الإجمالية للملكية" en="Whole-Life Cost Summary" accent="#2c9c5c" />
        <table className="sr-table sr-mini">
          <thead>
            <tr><th className="ar">الفئة</th><th className="num">رأسمالي (د.إ)</th><th className="num">تشغيل/سنة (د.إ)</th><th className="num">إجمالي الملكية (د.إ)</th></tr>
          </thead>
          <tbody>
            {data.wholeLife.map((w, i) => (
              <tr key={i}>
                <td className="ar">{cAr(w.category)}</td>
                <td className="num" dir="ltr">{fmtMoney(w.capex)}</td>
                <td className="num" dir="ltr">{fmtMoney(w.annualOpex)}</td>
                <td className="num" dir="ltr"><b>{fmtMoney(w.totalCostOfOwnership)}</b></td>
              </tr>
            ))}
            <tr className="sr-total">
              <td className="ar">الإجمالي</td>
              <td className="num" dir="ltr">{fmtMoney(data.capexTotal)}</td>
              <td />
              <td className="num" dir="ltr">{fmtMoney(data.tcoTotal)}</td>
            </tr>
          </tbody>
        </table>
      </Page>

      {/* P5 — Governance, nonconformity, disposal, data quality */}
      <Page type="ams" meta={meta} pageNo={5}>
        <SecTitle ar="الحوكمة ودورة المراجعة" en="Governance & Review Cycle" accent="#8b5cf6" />
        <div className="sr-two-col">
          <TextBlock ar="المراجعة الإدارية" body={c.governance.managementReviewAr} />
          <TextBlock ar="التدقيق الداخلي" body={c.governance.internalAuditAr} />
        </div>

        <SecTitle ar="سجل حالات عدم المطابقة والإجراءات التصحيحية" en="Nonconformity & Corrective Action Log" accent="#d4a008" />
        {(!c.nonconformities || c.nonconformities.length === 0) ? (
          <div className="sr-pending-box">
            <b>لا توجد حالات مسجّلة.</b> بنية السجل معتمدة ضمن النظام وجاهزة لاستقبال أي ملاحظات ناتجة عن التدقيق الداخلي أو الجرد الميداني
            (تاريخ الملاحظة، الوصف، الإجراء التصحيحي، المسؤول، الحالة).
          </div>
        ) : (
          <table className="sr-table sr-mini">
            <thead><tr><th className="num">التاريخ</th><th className="ar">الملاحظة</th><th className="ar">الإجراء التصحيحي</th><th className="ar">المسؤول</th><th>الحالة</th></tr></thead>
            <tbody>
              {c.nonconformities.map((n, i) => (
                <tr key={i}>
                  <td className="num" dir="ltr">{n.date}</td>
                  <td className="ar">{n.findingAr}</td>
                  <td className="ar">{n.actionAr}</td>
                  <td className="ar">{n.owner}</td>
                  <td className="ar">{n.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <SecTitle ar="سياسة الاستبعاد والتخلص" en="Disposal & Decommissioning Policy" />
        <TextBlock body={c.disposal.statementAr} />

        <SecTitle ar="منهجية جودة البيانات والإفصاح" en="Data Quality & Methodology Disclosure" />
        <table className="sr-table sr-mini">
          <tbody>
            <tr><td className="ar sr-strong">أسلوب الفحص</td><td className="ar">{c.dataQuality.inspectionMethodAr}</td></tr>
            <tr><td className="ar sr-strong">تاريخ الفحص</td><td className="ar" dir="ltr">{c.dataQuality.inspectionDate}</td></tr>
            <tr><td className="ar sr-strong">مستوى الثقة بالتكاليف</td><td className="ar">{c.dataQuality.costConfidenceAr}</td></tr>
            <tr><td className="ar sr-strong">دورية تحديث السجل</td><td className="ar">{c.dataQuality.refreshFrequencyAr}</td></tr>
            <tr><td className="ar sr-strong">الجهة المسؤولة عن دقة البيانات</td><td className="ar">{c.dataQuality.accountableAr}</td></tr>
          </tbody>
        </table>

        <ApprovalBlock />
      </Page>
    </>
  )
}

export default function StrategicReportDoc({ type, data, meta }) {
  return (
    <div className="ast-report-root sr-root" id="ast-report-root">
      {type === 'strategy' && <StrategyPages data={data} meta={meta} />}
      {type === 'linkage' && <LinkagePages data={data} meta={meta} />}
      {type === 'plan' && <PlanPages data={data} meta={meta} />}
      {type === 'executive' && <ExecutivePage data={data} meta={meta} />}
      {type === 'ams' && <AmsPages data={data} meta={meta} />}
    </div>
  )
}

export { TITLES }
