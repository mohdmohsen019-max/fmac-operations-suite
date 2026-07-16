import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  FileText, Target, CalendarClock, Download, RefreshCw, ShieldCheck, Info,
  Briefcase, FileSpreadsheet,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import { buildStrategy, buildLinkage, buildPlan, buildExecutive, docRef } from './reports'
import StrategicReportDoc, { TITLES } from './StrategicReportDoc'
import {
  fmtMoney, withDefaults, resolveGoalCode, goalByCode,
  criticalityLabel, conditionLabel, normalizeCategory,
} from './shared'

// One card per deliverable. The first three are the Strategy-Office documents;
// the fourth is a leadership one-pager synthesised from all three.
const REPORTS = [
  {
    type: 'strategy',
    icon: FileText,
    color: '#06b6d4',
    ar: 'استراتيجية الأصول والموارد',
    en: 'Asset & Resource Strategy',
    deliverable: 'استراتيجية الأصول والموارد المعتمدة',
    pagesAr: '٣ صفحات',
    build: buildStrategy,
    desc: 'المحفظة كاملة: التوزيع بالفئة والموقع، الحالة والأهمية، سجل الصيانة، أولويات الاستبدال، وقراءات تحليلية.',
    stats: (d) => [
      { v: d.kpi.totalAssets, l: 'أصل' },
      { v: d.kpi.locations, l: 'موقعاً' },
      { v: fmtMoney(d.kpi.totalValue), l: 'د.إ قيمة' },
      { v: `${d.kpi.goodShare}%`, l: 'حالة جيدة' },
    ],
  },
  {
    type: 'linkage',
    icon: Target,
    color: '#8b5cf6',
    ar: 'خريطة الربط الاستراتيجي للأصول',
    en: 'Strategic Asset-Linkage Map',
    deliverable: 'خريطة الربط الاستراتيجي للأصول المعتمدة',
    pagesAr: '٣ صفحات',
    build: buildLinkage,
    desc: 'كل أصل مربوط بأحد أعمدة البيت الاستراتيجي الستة، مع تفصيل لكل هدف وقوائم العناية الخاصة ومنهجية الربط.',
    stats: (d) => [
      { v: `${d.kpi.coverage}%`, l: 'تغطية' },
      { v: d.kpi.goalsUsed, l: 'أهداف' },
      { v: d.kpi.criticalCareCount, l: 'عناية خاصة' },
      { v: fmtMoney(d.kpi.totalValue), l: 'د.إ' },
    ],
  },
  {
    type: 'plan',
    icon: CalendarClock,
    color: '#f59e0b',
    ar: 'خطة الأصول متوسطة المدى (٣–٥ سنوات)',
    en: 'Medium-Term Asset Plan',
    deliverable: 'خطة الأصول متوسطة المدى المعتمدة',
    pagesAr: '٣ صفحات',
    build: (a) => buildPlan(a, 5),
    desc: 'جدول الاستبدال بالسنة ومنحنى الإنفاق، مصادر التمويل، أولويات رأسمالية متوازنة، والمخاطر وإجراءات التخفيف.',
    stats: (d) => [
      { v: d.kpi.dueCount, l: 'بند' },
      { v: fmtMoney(d.kpi.totalPlanCost), l: 'د.إ' },
      { v: fmtMoney(d.kpi.avgPerYear), l: 'سنوياً' },
      { v: d.kpi.urgentCount, l: 'عاجل' },
    ],
  },
  {
    type: 'executive',
    icon: Briefcase,
    color: '#10b981',
    ar: 'الملخص التنفيذي لمحفظة الأصول',
    en: 'Executive Portfolio Summary',
    deliverable: 'ملخص من صفحة واحدة لعرض القيادة',
    pagesAr: 'صفحة واحدة',
    build: buildExecutive,
    desc: 'صفحة واحدة للقيادة: أهم المؤشرات، توزيع المحفظة والأهداف، وخمسة إجراءات موصى بها جاهزة للاعتماد.',
    stats: (d) => [
      { v: d.strategy.kpi.totalAssets, l: 'أصل' },
      { v: fmtMoney(d.strategy.kpi.totalValue), l: 'د.إ' },
      { v: `${d.linkage.kpi.coverage}%`, l: 'ربط' },
      { v: d.actions.length, l: 'إجراءات' },
    ],
  },
]

export default function AssetReports({ assets, rooms, lang, t }) {
  const [active, setActive] = useState(null)   // { type, data, meta } while rendering offscreen
  const [busy, setBusy] = useState(null)       // report type currently generating

  // Live datasets for the on-screen preview chips.
  const datasets = useMemo(() => {
    const map = {}
    for (const r of REPORTS) {
      try { map[r.type] = r.build(assets) } catch (e) { console.error('[assets] report build failed:', r.type, e); map[r.type] = null }
    }
    return map
  }, [assets])

  const generate = async (report) => {
    if (busy) return
    const data = datasets[report.type] || report.build(assets)
    const now = new Date()
    const meta = {
      ref: docRef(report.type.slice(0, 3).toUpperCase()),
      dateEn: now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      dateAr: now.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' }),
    }
    setBusy(report.type)
    setActive({ type: report.type, data, meta })

    // Wait for the offscreen DOM + fonts.
    await new Promise(res => setTimeout(res, 450))
    try {
      await document.fonts?.ready
      const pages = Array.from(document.querySelectorAll('#ast-report-root .ast-report-page'))
      if (pages.length === 0) throw new Error('No report pages rendered')
      const pdf = new jsPDF('p', 'mm', 'a4', true)
      for (let i = 0; i < pages.length; i++) {
        const canvas = await html2canvas(pages[i], { scale: 2, useCORS: true, backgroundColor: '#ffffff', windowWidth: 794, windowHeight: 1122 })
        const img = canvas.toDataURL('image/jpeg', 0.94)
        if (i > 0) pdf.addPage()
        pdf.addImage(img, 'JPEG', 0, 0, 210, 297, undefined, 'FAST')
      }
      const fname = `FMAC-${TITLES[report.type].en.replace(/[^A-Za-z0-9]+/g, '-')}-${now.toISOString().slice(0, 10)}.pdf`
      pdf.save(fname)
    } catch (e) {
      console.error('[assets] report generation failed:', e)
      alert(t('Could not generate the report. Please try again.', 'تعذّر إنشاء التقرير. حاول مرة أخرى.'))
    } finally {
      setActive(null)
      setBusy(null)
    }
  }

  // Enriched register → Excel: every asset with its resolved goal, criticality,
  // condition and replacement plan. The "click of a button" working file.
  const exportExcel = () => {
    try {
      const roomById = Object.fromEntries((rooms || []).map(r => [r.id, r]))
      const rows = assets
        .filter(a => a.status !== 'Disposed')
        .map(a => {
          const d = withDefaults(a)
          const g = goalByCode(resolveGoalCode(d))
          const room = roomById[a.location_room]
          return {
            'Asset ID': a.asset_code || '',
            'Asset Name': a.name_en || a.name_ar || '',
            'Location / Department': a.department || room?.name_en || '',
            'Category': normalizeCategory(a.category),
            'Quantity': Number(a.quantity) || 1,
            'Unit': a.unit || 'PCS',
            'Condition': conditionLabel(d.condition, 'en'),
            'Criticality': criticalityLabel(d.criticality, 'en'),
            'Strategic Goal': g ? `${g.code} — ${g.ar}` : '',
            'Replacement Year': d.replacement_year,
            'Est. Cost (AED)': d.est_replacement_cost,
            'Cost Basis': d.cost_is_estimate ? 'Estimated' : 'Recorded',
            'Funding Source': d.funding_source,
            'Status': a.status || 'Active',
          }
        })
      const ws = XLSX.utils.json_to_sheet(rows)
      ws['!cols'] = [
        { wch: 11 }, { wch: 38 }, { wch: 26 }, { wch: 16 }, { wch: 8 }, { wch: 6 },
        { wch: 12 }, { wch: 11 }, { wch: 60 }, { wch: 14 }, { wch: 13 }, { wch: 10 },
        { wch: 18 }, { wch: 10 },
      ]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Enriched Asset Register')
      XLSX.writeFile(wb, `FMAC-Enriched-Asset-Register-${new Date().toISOString().slice(0, 10)}.xlsx`)
    } catch (e) {
      console.error('[assets] excel export failed:', e)
    }
  }

  const empty = assets.length === 0

  return (
    <div className="ast-page">
      <div className="ast-page-header">
        <div>
          <h2 className="ast-page-title">{t('Strategic Reports', 'التقارير الاستراتيجية')}</h2>
          <p className="ast-page-sub">
            {t('Board-ready deliverables generated from the live asset register — one click each.',
               'وثائق معتمدة جاهزة للعرض تُنشأ من سجل الأصول الحيّ — بضغطة زر واحدة.')}
          </p>
        </div>
        <button className="ast-btn ast-btn-ghost ast-btn-sm" onClick={exportExcel} disabled={empty}>
          <FileSpreadsheet size={14} /> {t('Export enriched register (Excel)', 'تصدير السجل المُثرى (Excel)')}
        </button>
      </div>

      <div className="ast-reports-note">
        <Info size={15} />
        <span>{t('Every asset is auto-linked to one of the 6 strategic-house pillars from its location & function. Costs are conservative planning estimates until real purchase costs are recorded — refine any asset in the Registry and reports update instantly.',
                  'يُربط كل أصل تلقائياً بأحد أعمدة البيت الاستراتيجي الستة وفق موقعه ووظيفته. التكاليف تقديرات تخطيطية متحفّظة إلى حين تسجيل تكاليف الشراء الفعلية — عدّل أي أصل في السجل وتتحدّث التقارير فوراً.')}</span>
      </div>

      {empty && (
        <div className="ast-empty" style={{ marginTop: 8 }}>
          <FileText size={40} strokeWidth={1} />
          <p>{t('Import or add assets first, then generate reports.', 'استورد أو أضف أصولاً أولاً، ثم أنشئ التقارير.')}</p>
        </div>
      )}

      <div className="ast-reports-grid">
        {REPORTS.map((r) => {
          const Icon = r.icon
          const d = datasets[r.type]
          const generating = busy === r.type
          return (
            <motion.div key={r.type} className="ast-report-card" style={{ '--rc': r.color }}
              whileHover={{ y: -3 }} transition={{ duration: 0.2 }}>
              <div className="ast-report-card-top">
                <div className="ast-report-card-icon" style={{ color: r.color, background: `${r.color}18`, borderColor: `${r.color}40` }}>
                  <Icon size={20} />
                </div>
                <span className="ast-report-card-tag"><ShieldCheck size={12} /> {r.pagesAr}</span>
              </div>

              <h3 className="ast-report-card-title" dir="rtl">{r.ar}</h3>
              <p className="ast-report-card-en">{r.en}</p>
              <p className="ast-report-card-desc" dir="rtl">{r.desc}</p>

              {d && !empty && (
                <div className="ast-report-card-stats">
                  {r.stats(d).map((s, i) => (
                    <div key={i} className="ast-report-stat">
                      <span className="ast-report-stat-v" style={{ color: r.color }}>{s.v}</span>
                      <span className="ast-report-stat-l" dir="rtl">{s.l}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="ast-report-card-deliverable" dir="rtl">
                <span>{t('Deliverable', 'الدليل المطلوب')}:</span> {r.deliverable}
              </div>

              <button className="ast-btn ast-btn-primary ast-report-card-btn" onClick={() => generate(r)} disabled={busy || empty}>
                {generating
                  ? <><RefreshCw size={15} className="ast-spin" /> {t('Generating…', 'جارٍ الإنشاء…')}</>
                  : <><Download size={15} /> {t('Generate PDF', 'إنشاء PDF')}</>}
              </button>
            </motion.div>
          )
        })}
      </div>

      {/* Offscreen document for html2canvas capture */}
      {active && (
        <div style={{ position: 'fixed', left: -99999, top: 0, zIndex: -1 }}>
          <StrategicReportDoc type={active.type} data={active.data} meta={active.meta} />
        </div>
      )}
    </div>
  )
}
