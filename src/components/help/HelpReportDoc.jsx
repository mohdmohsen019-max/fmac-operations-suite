/* ══════════════════════════════════════════════════════════════════════════
   Help Desk — offscreen A4 strategic report document
   تقرير تجربة المتعامل الاستراتيجي

   Rendered off-screen, then each `.ast-report-page` is captured by html2canvas
   → jsPDF (identical pipeline to the Assets strategic reports). Arabic-primary
   RTL, organizational-excellence layout.

   The `.sr-*` / `.ast-report-page` document styles are shared design
   infrastructure that already lives in AssetsModule.css — imported here so the
   layout is byte-identical to the Assets reports rather than re-implemented.
   ════════════════════════════════════════════════════════════════════════ */
import '../AssetsModule.css'
import { CLUB_VISION, CLUB_MISSION } from '../assets/shared'
import { fmtDuration } from './helpConfig'

const TITLE = {
  ar: 'تقرير تجربة المتعامل',
  en: 'Customer Experience Report',
}
const PAGES = 4

/* html2canvas cannot parse color-mix(); accent tints are pre-computed rgba. */
function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '#2563eb')
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : { r: 37, g: 99, b: 235 }
}
function accentVars(color) {
  const { r, g, b } = hexToRgb(color)
  const rgba = (a) => `rgba(${r},${g},${b},${a})`
  return {
    '--sr-accent': color || '#2563eb',
    '--sr-accent-07': rgba(0.07), '--sr-accent-10': rgba(0.10), '--sr-accent-12': rgba(0.12),
    '--sr-accent-25': rgba(0.25), '--sr-accent-28': rgba(0.28), '--sr-accent-85': rgba(0.85),
  }
}

function Page({ meta, pageNo, children }) {
  return (
    <div className="ast-report-page sr-page" dir="rtl" style={accentVars(meta.color)}>
      <div className="sr-head">
        <img src="/fmac-ops-logo.png" alt="FMAC" className="sr-logo" />
        <div className="sr-head-mid">
          <div className="sr-title-ar">{TITLE.ar}</div>
          <div className="sr-title-en" dir="ltr">{TITLE.en}</div>
        </div>
        <div className="sr-head-right">
          <div className="sr-ref" dir="ltr">{meta.ref}</div>
          <div className="sr-date">{meta.dateAr}</div>
        </div>
      </div>
      <div className="sr-metabar">
        <span><b>الإصدار:</b> <span dir="ltr">{meta.version || '1.0'}</span></span>
        <span><b>تاريخ الإصدار:</b> {meta.dateAr}</span>
        <span><b>فترة التغطية:</b> <span dir="ltr">{meta.period}</span></span>
        <span><b>التصنيف:</b> داخلي — معتمد</span>
      </div>
      <div className="sr-rule" />
      <div className="sr-body">{children}</div>
      <div className="sr-foot">
        <span>نادي الفجيرة للفنون القتالية — قسم العمليات · إدارة الشكاوى والاستفسارات</span>
        <span dir="ltr">Fujairah MAC · Customer Experience · Page {pageNo} / {PAGES}</span>
      </div>
    </div>
  )
}

const SecTitle = ({ ar, en, accent }) => (
  <div className="sr-sec-title" style={accent ? { borderColor: accent } : undefined}>
    <span className="sr-sec-ar">{ar}</span>
    <span className="sr-sec-en" dir="ltr">{en}</span>
  </div>
)

const Kpi = ({ value, ar, en, color }) => {
  const c = color || '#2563eb'
  return (
    <div className="sr-kpi" style={{ borderTopColor: c, background: `${c}0e` }}>
      <div className="sr-kpi-val" style={{ color: c }} dir="ltr">{value}</div>
      <div className="sr-kpi-ar">{ar}</div>
      <div className="sr-kpi-en" dir="ltr">{en}</div>
    </div>
  )
}

const Pending = ({ label = 'قيد الجمع' }) => <span className="sr-pending">{label}</span>

const VisionStrip = () => (
  <div className="sr-vision">
    <div className="sr-vision-row"><span className="sr-vision-tag">الرؤية</span><span>{CLUB_VISION}</span></div>
    <div className="sr-vision-row"><span className="sr-vision-tag">الرسالة</span><span>{CLUB_MISSION}</span></div>
  </div>
)

function Bars({ rows }) {
  const max = Math.max(1, ...rows.map(r => r.value))
  return (
    <div className="sr-bars">
      {rows.map((r, i) => (
        <div key={i} className="sr-bar-row">
          <span className="sr-bar-label">{r.label}</span>
          <div className="sr-bar-track">
            <div className="sr-bar-fill" style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: r.color || '#2563eb' }} />
          </div>
          <span className="sr-bar-val" dir="ltr">{r.display != null ? r.display : r.value}</span>
        </div>
      ))}
    </div>
  )
}

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

function Progress({ value }) {
  if (value == null) return <Pending />
  const color = value >= 90 ? '#2c9c5c' : value >= 75 ? '#d4a008' : '#de4a41'
  return (
    <div className="sr-prog">
      <div className="sr-prog-track"><div className="sr-prog-fill" style={{ width: `${Math.max(3, value)}%`, background: color }} /></div>
      <span className="sr-prog-val" dir="ltr">{value}%</span>
    </div>
  )
}

const ApprovalBlock = () => {
  const cols = [
    { role: 'أُعدّ بواسطة', roleEn: 'Prepared by', unit: 'إدارة الشكاوى والاستفسارات' },
    { role: 'روجِع بواسطة', roleEn: 'Reviewed by', unit: 'رئيس قسم العمليات' },
    { role: 'اعتُمد بواسطة', roleEn: 'Approved by', unit: 'المدير' },
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

/* ═══════════════════════════ the document ═══════════════════════════ */
export default function HelpReportDoc({ data, meta }) {
  const k = data.kpi
  const q = data.quality
  const dur = (m) => (m == null ? '—' : fmtDuration(m, 'ar'))

  return (
    <div className="ast-report-root sr-root" id="hc-report-root">

      {/* ─────────── P1 · Executive summary ─────────── */}
      <Page meta={meta} pageNo={1}>
        <VisionStrip />
        <p className="sr-intro">
          يقدّم هذا التقرير قراءة استراتيجية لتجربة المتعامل في نادي الفجيرة للفنون القتالية، مبنية بالكامل على
          الطلبات المسجّلة في منصة الشكاوى والاقتراحات: حجم الطلب وتوزيعه، زمن الإنجاز الفعلي، مدى الالتزام
          بمستويات الخدمة المعتمدة، وتحليل احتياجات وتوقعات المتعاملين وفرص تحسين وإعادة تصميم الخدمات.
        </p>

        <SecTitle ar="المؤشرات الرئيسية" en="Headline Indicators" />
        <div className="sr-kpi-row">
          <Kpi value={k.total} ar="إجمالي الطلبات" en="Total requests" color="#2563eb" />
          <Kpi value={`${k.closedPct}%`} ar="نسبة الإغلاق" en="Closure rate" color="#2c9c5c" />
          <Kpi value={dur(k.avgResolution)} ar="متوسط زمن الإنجاز" en="Avg resolution" color="#e26a15" />
          <Kpi value={k.slaCompliance == null ? '—' : `${k.slaCompliance}%`} ar="الالتزام بمستوى الخدمة" en="SLA compliance" color="#2c9c5c" />
          <Kpi value={k.csat == null ? '—' : `${k.csat}/5`} ar="رضا المتعامل" en="Satisfaction" color="#8b5cf6" />
        </div>

        <SecTitle ar="توزيع الطلبات حسب نوع الخدمة" en="Requests by Service Type" />
        <table className="sr-table">
          <thead>
            <tr>
              <th className="ar">نوع الخدمة</th><th>Service</th>
              <th className="num">العدد</th><th className="num">الحصة</th>
              <th className="num">المستهدف (ساعة)</th><th className="num">متوسط الإنجاز</th>
            </tr>
          </thead>
          <tbody>
            {data.byType.map((r, i) => (
              <tr key={i}>
                <td className="ar">{r.ar}</td><td>{r.en}</td>
                <td className="num" dir="ltr">{r.count}</td>
                <td className="num" dir="ltr">{r.sharePct}%</td>
                <td className="num" dir="ltr">{r.targetH}</td>
                <td className="num">{dur(r.avgRes)}</td>
              </tr>
            ))}
            <tr className="sr-total">
              <td className="ar">الإجمالي</td><td>Total</td>
              <td className="num" dir="ltr">{k.total}</td><td className="num" dir="ltr">100%</td>
              <td /><td className="num">{dur(k.avgResolution)}</td>
            </tr>
          </tbody>
        </table>

        <SecTitle ar="حجم الطلب حسب النوع" en="Volume by Type" />
        <Bars rows={data.byType.map(r => ({ label: r.ar, value: r.count, display: `${r.count} (${r.sharePct}%)` }))} />

        <SecTitle ar="التوزيع حسب الفرع" en="By Branch" />
        <table className="sr-table sr-mini">
          <thead><tr><th className="ar">الفرع</th><th className="num">الطلبات</th><th className="num">الحصة</th><th className="num">متوسط الإنجاز</th></tr></thead>
          <tbody>
            {data.byBranch.map((b, i) => (
              <tr key={i}>
                <td className="ar">{b.branch}</td>
                <td className="num" dir="ltr">{b.count}</td>
                <td className="num" dir="ltr">{b.sharePct}%</td>
                <td className="num">{dur(b.avgRes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Page>

      {/* ─────────── P2 · SLA compliance mechanism ─────────── */}
      <Page meta={meta} pageNo={2}>
        <SecTitle ar="آلية الالتزام بمستويات الخدمة" en="Service Level Compliance Mechanism" accent="#2563eb" />
        <p className="sr-note-plain">
          يعتمد النادي مستوى خدمة معلناً لكل نوع طلب، ويُحتسب زمن الإنجاز آلياً من لحظة استلام الطلب حتى إغلاقه،
          ثم تُقارن النتيجة بالمستهدف لتحديد مدى الالتزام. تُقاس النسبة على الطلبات المُنجزة فقط.
        </p>

        <table className="sr-table">
          <thead>
            <tr>
              <th className="ar">نوع الخدمة</th><th className="num">المستهدف (ساعة)</th>
              <th className="num">الطلبات المقيسة</th><th className="num">متوسط الإنجاز</th>
              <th className="num">ضمن المستهدف</th><th>نسبة الالتزام</th>
            </tr>
          </thead>
          <tbody>
            {data.byType.map((r, i) => (
              <tr key={i}>
                <td className="ar sr-strong">{r.ar}</td>
                <td className="num" dir="ltr">{r.targetH}</td>
                <td className="num" dir="ltr">{r.resolvedCount}</td>
                <td className="num">{dur(r.avgRes)}</td>
                <td className="num" dir="ltr">{r.within} / {r.resolvedCount}</td>
                <td style={{ minWidth: 100 }}><Progress value={r.compliance} /></td>
              </tr>
            ))}
          </tbody>
        </table>

        <SecTitle ar="مستويات الخدمة المعتمدة (جميع الخدمات)" en="Approved Service Levels" />
        <table className="sr-table sr-mini">
          <thead><tr><th className="ar">الخدمة</th><th>Service</th><th className="num">زمن الإنجاز المستهدف</th><th className="ar">الحالة</th></tr></thead>
          <tbody>
            {data.slaTable.map((s, i) => (
              <tr key={i}>
                <td className="ar">{s.ar}</td><td>{s.en}</td>
                <td className="num" dir="ltr">{s.targetH} ساعة</td>
                <td className="ar sr-small">{s.used ? 'مُفعّلة وقيد القياس' : 'معتمدة — لا طلبات بعد'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <SecTitle ar="الالتزام حسب النوع" en="Compliance by Type" />
        <Bars rows={data.byType.filter(r => r.compliance != null).map(r => ({
          label: r.ar, value: r.compliance, display: `${r.compliance}%`,
          color: r.compliance >= 90 ? '#2c9c5c' : r.compliance >= 75 ? '#d4a008' : '#de4a41',
        }))} />

        <SecTitle ar="قراءات تحليلية" en="Analytical Insights" accent="#8b5cf6" />
        <NumberedList items={data.insights} />
      </Page>

      {/* ─────────── P3 · Needs & expectations analysis ─────────── */}
      <Page meta={meta} pageNo={3}>
        <SecTitle ar="تحليل احتياجات وتوقعات المتعاملين" en="Customer Needs & Expectations Analysis" accent="#8b5cf6" />
        <p className="sr-note-plain">
          تُصنَّف الطلبات آلياً إلى موضوعات خدمية عبر تحليل نص الطلب ومطابقته بمعجم المصطلحات التشغيلية للنادي.
          يجوز أن ينتمي الطلب الواحد لأكثر من موضوع. نسبة التغطية الحالية للتصنيف: <b dir="ltr">{data.themeCoverage ?? 0}%</b>.
        </p>

        <table className="sr-table">
          <thead>
            <tr><th className="num">#</th><th className="ar">الموضوع</th><th>Theme</th><th className="num">عدد الطلبات</th><th className="num">الحصة</th></tr>
          </thead>
          <tbody>
            {data.themes.map((th, i) => (
              <tr key={i}>
                <td className="num" dir="ltr">{i + 1}</td>
                <td className="ar sr-strong">{th.ar}</td>
                <td>{th.en}</td>
                <td className="num" dir="ltr">{th.count}</td>
                <td className="num" dir="ltr">{th.sharePct}%</td>
              </tr>
            ))}
          </tbody>
        </table>

        <SecTitle ar="ترتيب الموضوعات حسب التكرار" en="Themes by Frequency" />
        <Bars rows={data.themes.slice(0, 8).map(th => ({ label: th.ar, value: th.count, display: `${th.count}`, color: '#8b5cf6' }))} />

        <div className="sr-two-col">
          <div>
            <SecTitle ar="اتجاه الطلب عبر السنوات" en="Demand Trend" />
            <table className="sr-table sr-mini">
              <thead><tr><th className="num">السنة</th><th className="num">الطلبات</th><th className="num">متوسط الإنجاز</th><th className="num">الالتزام</th></tr></thead>
              <tbody>
                {data.byYear.map((y, i) => (
                  <tr key={i}>
                    <td className="num sr-strong" dir="ltr">
                      {y.year}{y.partial && <span className="sr-small" style={{ fontWeight: 400 }}> *</span>}
                    </td>
                    <td className="num" dir="ltr">{y.count}</td>
                    <td className="num">{dur(y.avgRes)}</td>
                    <td className="num" dir="ltr">{y.compliance == null ? '—' : `${y.compliance}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.byYear.some(y => y.partial) && (
              <p className="sr-more">* عام جارٍ — البيانات جزئية حتى تاريخ إصدار التقرير ولا تُقارن بالأعوام المكتملة.</p>
            )}
          </div>
          <div>
            <SecTitle ar="الموسمية (ذروة الطلب)" en="Seasonality" />
            <Bars rows={data.byMonth.filter(m => m.count > 0).map(m => ({ label: m.ar, value: m.count, display: `${m.count}`, color: '#e26a15' }))} />
          </div>
        </div>
      </Page>

      {/* ─────────── P4 · Improvement, recommendations, methodology ─────────── */}
      <Page meta={meta} pageNo={4}>
        <SecTitle ar="فرص تحسين وإعادة تصميم الخدمة" en="Service Improvement & Redesign Opportunities" accent="#2c9c5c" />
        <table className="sr-table">
          <thead>
            <tr><th className="num">#</th><th className="ar">المجال</th><th className="num">حجم الطلب</th><th className="ar">إجراء التحسين المقترح</th></tr>
          </thead>
          <tbody>
            {data.improvements.map((im, i) => (
              <tr key={i}>
                <td className="num" dir="ltr">{i + 1}</td>
                <td className="ar sr-strong">{im.themeAr}</td>
                <td className="num" dir="ltr">{im.volume}</td>
                <td className="ar sr-small">{im.actionAr}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <SecTitle ar="التوصيات الاستراتيجية" en="Strategic Recommendations" accent="#0e7c5a" />
        <NumberedList color="#0e7c5a" bg="#e6f7f0" items={data.recommendations} />

        <SecTitle ar="المنهجية" en="Methodology" />
        <NumberedList color="#2563eb" bg="#e8f0fd" items={[
          'يُحتسب زمن الإنجاز آلياً بالفارق بين تاريخ استلام الطلب وتاريخ إغلاقه، ويُسجَّل مع كل طلب في قاعدة البيانات.',
          'يُقارن زمن الإنجاز بمستوى الخدمة المعتمد لنوع الطلب لتحديد الالتزام؛ ولا تُحتسب الطلبات غير المُنجزة ضمن النسبة.',
          'تُصنَّف الموضوعات آلياً بمطابقة نص الطلب مع معجم مصطلحات تشغيلي معتمد، وتُراجع دورياً لإضافة مصطلحات جديدة.',
          'يُسجَّل رضا المتعامل عبر مكالمة متابعة بعد إغلاق الطلب على مقياس من ١ إلى ٥، ويُوثَّق اسم المُسجِّل وتاريخ التسجيل.',
          'جميع الأرقام في هذا التقرير محسوبة لحظة الإصدار من السجل الحي، ولا تُخزَّن نتائج مسبقة.',
        ]} />

        <div className="sr-quality">
          <strong>شفافية البيانات:</strong>{' '}
          يغطي التقرير <b dir="ltr">{q.total}</b> طلباً، منها <b dir="ltr">{q.withResolution}</b> طلباً بزمن إنجاز مقيس
          (<b dir="ltr">{q.resolutionPct}%</b>)، و<b dir="ltr">{q.distinctDescriptions}</b> نصاً وصفياً مميزاً استُخدم في تحليل الموضوعات.
          {q.withSatisfaction === 0
            ? ' لم تُسجَّل بعد أي قراءة لرضا المتعامل — الآلية مُفعّلة وتُجمع النتائج تِباعاً مع إغلاق الطلبات، وتظهر في هذا التقرير فور توفرها.'
            : ` وسُجّلت قراءات رضا لعدد ${q.withSatisfaction} طلباً (${q.satisfactionPct}% من الطلبات المغلقة).`}
        </div>

        <ApprovalBlock />
      </Page>
    </div>
  )
}

export { TITLE as HELP_REPORT_TITLE }
