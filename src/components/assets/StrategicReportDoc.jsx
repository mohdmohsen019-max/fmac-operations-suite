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
}

const PAGE_COUNTS = { strategy: 3, linkage: 3, plan: 3, executive: 1 }

const catAr = {
  'Medical Devices': 'أجهزة طبية', 'Sport Equipment': 'معدات رياضية',
  'Electronics': 'إلكترونيات', 'Furniture': 'أثاث', 'Decorations': 'ديكورات', 'Other': 'أخرى',
}
const cAr = (c) => catAr[c] || c

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
    <div className="ast-report-page sr-page" dir="rtl">
      <div className="sr-head">
        <img src="/fmac-logo-new.png" alt="FMAC" className="sr-logo" />
        <div className="sr-head-mid">
          <div className="sr-title-ar">{ti.ar}</div>
          <div className="sr-title-en" dir="ltr">{ti.en}</div>
        </div>
        <div className="sr-head-right">
          <div className="sr-badge">
            <span>وثيقة معتمدة</span>
            <span className="sr-badge-dot">·</span>
            <span dir="ltr">APPROVED</span>
          </div>
          <div className="sr-ref" dir="ltr">{meta.ref}</div>
          <div className="sr-date">{meta.dateAr}</div>
        </div>
      </div>
      <div className="sr-rule" />

      <div className="sr-body">{children}</div>

      <div className="sr-foot">
        <span>نادي الفجيرة للفنون القتالية — قسم العمليات · إدارة الأصول الاستراتيجية</span>
        <span dir="ltr">Fujairah Martial Arts Club · Page {pageNo} / {pages}</span>
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
  return (
    <div className="sr-kpi">
      <div className="sr-kpi-val" style={color ? { color } : undefined} dir="ltr">{value}</div>
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
            <div className="sr-bar-fill" style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: r.color || '#06b6d4' }} />
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
          <Kpi value={k.totalAssets} ar="سجل أصل" en="Asset records" color="#06b6d4" />
          <Kpi value={k.totalUnits} ar="إجمالي الوحدات" en="Total units" />
          <Kpi value={fmtMoney(k.totalValue)} ar="القيمة التخطيطية (د.إ)" en="Planning value (AED)" color="#10b981" />
          <Kpi value={k.locations} ar="موقعاً / غرفة" en="Locations" />
          <Kpi value={`${k.goodShare}%`} ar="بحالة جيدة" en="Good condition" color="#10b981" />
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
        <SecTitle ar="سجل الصيانة المطلوبة" en="Maintenance Backlog" accent="#f59e0b" />
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

        <SecTitle ar="أولويات الصيانة والاستبدال" en="Renewal Priorities (balanced mix)" accent="#f43f5e" />
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
          <Kpi value={`${k.coverage}%`} ar="تغطية الربط" en="Coverage" color="#10b981" />
          <Kpi value={k.totalAssets} ar="أصل مرتبط" en="Linked assets" color="#06b6d4" />
          <Kpi value={k.goalsUsed} ar="أهداف مخدومة" en="Goals served" />
          <Kpi value={k.criticalCareCount} ar="عناية خاصة" en="Special care" color="#f43f5e" />
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
        <SecTitle ar="أصول تتطلب عناية خاصة" en="Assets Requiring Special Care" accent="#f43f5e" />
        <table className="sr-table">
          <thead>
            <tr><th className="ar">الأصل</th><th>الموقع</th><th>الفئة</th><th>الأهمية</th><th>الهدف</th></tr>
          </thead>
          <tbody>
            {data.criticalCare.map((a, i) => {
              const g = STRATEGIC_GOALS.find(x => x.code === a.goal_code)
              return (
                <tr key={i}>
                  <td>{assetDisplayName(a, 'en')}</td>
                  <td className="sr-small">{a.department || '—'}</td>
                  <td className="ar">{cAr(a.category)}</td>
                  <td><Chip label={criticalityLabel(a.criticality, 'ar')} color={CRITICALITY_META[a.criticality]?.color} /></td>
                  <td>{g ? <Chip label={g.code} color={g.color} /> : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {data.criticalCareTotal > data.criticalCare.length && (
          <p className="sr-more">و {data.criticalCareTotal - data.criticalCare.length} أصلاً آخر ضمن قائمة العناية الخاصة الكاملة.</p>
        )}

        <SecTitle ar="أصول غير مستغَلة بالكامل" en="Underutilized Assets" accent="#f59e0b" />
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
          <Kpi value={k.dueCount} ar="بند ضمن الخطة" en="Items in plan" color="#06b6d4" />
          <Kpi value={fmtMoney(k.totalPlanCost)} ar="التكلفة الإجمالية (د.إ)" en="Total (AED)" color="#10b981" />
          <Kpi value={fmtMoney(k.avgPerYear)} ar="متوسط سنوي (د.إ)" en="Avg / year" />
          <Kpi value={k.urgentCount} ar="مستحق خلال سنتين" en="Due ≤ 2 yrs" color="#f43f5e" />
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
        <Bars rows={data.byYear.map(y => ({ label: String(y.year), value: y.value, color: '#f59e0b' }))} />
      </Page>

      <Page type="plan" meta={meta} pageNo={2}>
        <SecTitle ar="مصادر التمويل" en="Funding Sources" />
        <table className="sr-table sr-mini">
          <thead><tr><th className="ar">المصدر</th><th className="num">عدد البنود</th><th className="num">القيمة (د.إ)</th><th className="num">الحصة</th></tr></thead>
          <tbody>
            {data.byFunding.map((f, i) => (
              <tr key={i}>
                <td className="ar">{f.source}</td><td className="num">{f.count}</td>
                <td className="num">{fmtMoney(f.value)}</td>
                <td className="num">{k.totalPlanCost ? Math.round((f.value / k.totalPlanCost) * 100) : 0}%</td>
              </tr>
            ))}
          </tbody>
        </table>

        <SecTitle ar="أولويات الإنفاق الرأسمالي" en="Capital Priorities (balanced mix)" accent="#f43f5e" />
        <table className="sr-table">
          <thead>
            <tr><th className="num">#</th><th className="ar">الأصل</th><th>الموقع</th><th>الفئة</th><th>الأهمية</th><th className="num">السنة</th><th className="num">التكلفة (د.إ)</th></tr>
          </thead>
          <tbody>
            {data.priorities.map((a, i) => (
              <tr key={i}>
                <td className="num">{i + 1}</td>
                <td>{assetDisplayName(a, 'en')}</td>
                <td className="sr-small">{a.department || '—'}</td>
                <td className="ar">{cAr(a.category)}</td>
                <td><Chip label={criticalityLabel(a.criticality, 'ar')} color={CRITICALITY_META[a.criticality]?.color} /></td>
                <td className="num">{a.replacement_year}</td>
                <td className="num">{fmtMoney(a.est_replacement_cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <SecTitle ar="قراءات تحليلية" en="Analytical Insights" accent="#8b5cf6" />
        <Insights items={data.insights} />
      </Page>

      <Page type="plan" meta={meta} pageNo={3}>
        <SecTitle ar="المنهجية والافتراضات" en="Methodology & Assumptions" />
        <NumberedList color="#0e7c5a" bg="#e6f7f0" items={[
          'تُحتسب سنة الاستبدال من العمر الافتراضي المعتمد لكل فئة، وتُقدَّم تلقائياً عند تدهور الحالة الفنية للأصل.',
          'التكاليف تقديرات تخطيطية متحفّظة على مستوى الفئة؛ تُستبدل بالتكلفة الفعلية فور تسجيلها وتُحدَّث الخطة لحظياً.',
          'مصدر التمويل الافتراضي هو الموازنة التشغيلية، ويُعاد توزيعه بين الموازنة والدعم والرعايات عند الاعتماد.',
          'تُراجع الخطة سنوياً مع قسم الاستراتيجية وتُواءم مع الموازنة العامة للنادي.',
        ]} />

        <SecTitle ar="المخاطر وإجراءات التخفيف" en="Risks & Mitigations" accent="#f59e0b" />
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
        <Kpi value={s.kpi.totalAssets} ar="أصل مسجّل" en="Assets" color="#06b6d4" />
        <Kpi value={s.kpi.totalUnits} ar="وحدة" en="Units" />
        <Kpi value={fmtMoney(s.kpi.totalValue)} ar="القيمة (د.إ)" en="Value (AED)" color="#10b981" />
        <Kpi value={`${l.kpi.coverage}%`} ar="ربط استراتيجي" en="Linked" color="#8b5cf6" />
        <Kpi value={fmtMoney(p.kpi.totalPlanCost)} ar="خطة ٥ سنوات (د.إ)" en="5-yr plan" color="#f59e0b" />
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

      <SecTitle ar="الإجراءات الموصى بها للإدارة" en="Recommended Executive Actions" accent="#f43f5e" />
      <NumberedList color="#be123c" bg="#ffe4e6" items={data.actions} />

      <div className="sr-exec-sign">
        <div className="sr-sign-line" style={{ width: '30%' }}><span>رئيس قسم العمليات</span></div>
        <div className="sr-sign-line" style={{ width: '30%' }}><span>قسم الاستراتيجية</span></div>
        <div className="sr-sign-line" style={{ width: '30%' }}><span>الإدارة التنفيذية</span></div>
      </div>
    </Page>
  )
}

export default function StrategicReportDoc({ type, data, meta }) {
  return (
    <div className="ast-report-root sr-root" id="ast-report-root">
      {type === 'strategy' && <StrategyPages data={data} meta={meta} />}
      {type === 'linkage' && <LinkagePages data={data} meta={meta} />}
      {type === 'plan' && <PlanPages data={data} meta={meta} />}
      {type === 'executive' && <ExecutivePage data={data} meta={meta} />}
    </div>
  )
}

export { TITLES }
