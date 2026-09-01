/**
 * Asset-register compliance KPI — calculation + evidence pack.
 *
 * Produces the monthly reading for
 * "نسبة الالتزام بتسجيل وتحديث كافة الأصول الثابتة والمنقولة ضمن النظام الموحد"
 * together with the documentation needed to defend it: the method, the exact
 * counts, and a line-by-line list of every asset that failed and why.
 *
 * The evidence is what makes the reading auditable — a bare percentage with no
 * traceable basis is exactly what the Strategy module's evidence slot exists to
 * prevent. Attach the exported file to the reading in Strategy → Scorecard.
 */
import { useEffect, useMemo, useState } from 'react'
import {
  Gauge, Download, Printer, RefreshCw, AlertTriangle, CheckCircle2, Info,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { db } from '../../firebase'
import { collection, getDocs } from 'firebase/firestore'
import {
  computeAssetRegistryKpi, periodLabel, KPI_META, REQUIRED_FIELDS, CURRENCY_WINDOW_DAYS,
} from './assetKpi'

const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']

const fmtDate = (msVal) => {
  if (!msVal) return '—'
  return new Date(msVal).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

const esc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

export default function AssetKpiEvidence({ assets = [], lang = 'ar' }) {
  const now = new Date()
  const [year, setYear] = useState(2026)
  const [month, setMonth] = useState(6)          // July (0-indexed)
  const [auditLog, setAuditLog] = useState(null) // null = loading
  const [showFailures, setShowFailures] = useState(false)

  useEffect(() => {
    let alive = true
    getDocs(collection(db, 'asset_audit_log'))
      .then(s => { if (alive) setAuditLog(s.docs.map(d => ({ id: d.id, ...d.data() }))) })
      .catch(() => { if (alive) setAuditLog([]) })
    return () => { alive = false }
  }, [])

  const k = useMemo(
    () => (auditLog === null ? null : computeAssetRegistryKpi(assets, auditLog, year, month)),
    [assets, auditLog, year, month],
  )

  const label = periodLabel(year, month, 'ar')
  const years = [2025, 2026, 2027]

  /* ── Evidence workbook ── */
  const exportXlsx = () => {
    if (!k) return
    const summary = [
      { البند: 'المؤشر', القيمة: KPI_META.ar },
      { البند: 'الفترة', القيمة: label },
      { البند: 'المستهدف', القيمة: `${KPI_META.target}%` },
      { البند: 'القراءة المحققة', القيمة: `${k.pct}%` },
      { البند: 'نسبة الإنجاز', القيمة: `${k.attainment}%` },
      { البند: '', القيمة: '' },
      { البند: 'إجمالي الأصول في السجل (نطاق القياس)', القيمة: k.total },
      { البند: 'أصول مطابقة (مسجلة ومحدثة)', القيمة: k.compliant },
      { البند: 'مستوفية بيانات التسجيل', القيمة: k.registeredOk },
      { البند: 'محدثة خلال دورة التحديث', القيمة: k.currentOk },
      { البند: 'غير مطابقة — نقص في بيانات التسجيل', القيمة: k.missingFieldCount },
      { البند: 'غير مطابقة — لم تُحدَّث خلال الدورة', القيمة: k.staleCount },
      { البند: '', القيمة: '' },
      { البند: 'أصول أضيفت خلال الفترة', القيمة: k.createdInPeriod },
      { البند: 'أصول جرى تحديثها خلال الفترة', القيمة: k.updatedInPeriod },
      { البند: 'أصول مستبعدة (مُستبعد/Disposed) خارج النطاق', القيمة: k.disposedExcluded },
      { البند: '', القيمة: '' },
      { البند: 'المنهجية', القيمة: `الأصل مطابق إذا استوفى كامل حقول التسجيل الإلزامية (${REQUIRED_FIELDS.map(f => f.ar).join('، ')}) وجرى إنشاؤه أو تحديثه خلال ${CURRENCY_WINDOW_DAYS} يوماً حتى نهاية الفترة.` },
      { البند: 'أساس دورة التحديث', القيمة: 'دورية تحديث السجل المعتمدة في نظام إدارة الأصول (ربع سنوي)' },
      { البند: 'تاريخ الاحتساب', القيمة: new Date().toLocaleString('en-GB') },
    ]

    const detail = k.rows.map(r => ({
      'رقم الأصل': r.code,
      'اسم الأصل': r.name,
      'التصنيف': r.category,
      'الحالة': r.status,
      'آخر تحديث': fmtDate(r.lastUpdate),
      'بيانات التسجيل مكتملة': r.registered ? 'نعم' : 'لا',
      'محدَّث ضمن الدورة': r.current ? 'نعم' : 'لا',
      'مطابق': r.compliant ? 'نعم' : 'لا',
      'الحقول الناقصة': r.missing.map(f => f.ar).join('، '),
    }))

    const failures = k.failures.map(r => ({
      'رقم الأصل': r.code,
      'اسم الأصل': r.name,
      'سبب عدم المطابقة': [
        r.registered ? null : `نقص بيانات: ${r.missing.map(f => f.ar).join('، ')}`,
        r.current ? null : `لم يُحدَّث منذ ${fmtDate(r.lastUpdate)}`,
      ].filter(Boolean).join(' | '),
      'الإجراء التصحيحي المطلوب': r.registered ? 'مراجعة وتحديث السجل' : 'استكمال بيانات التسجيل',
    }))

    const wb = XLSX.utils.book_new()
    wb.Workbook = { Views: [{ RTL: true }] }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), 'ملخص القياس')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detail.length ? detail : [{ '—': 'لا توجد أصول' }]), 'تفصيل الأصول')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(failures.length ? failures : [{ '—': 'لا توجد حالات عدم مطابقة' }]), 'حالات عدم المطابقة')
    XLSX.writeFile(wb, `KPI-Asset-Register-Compliance-${year}-${String(month + 1).padStart(2, '0')}.xlsx`)
  }

  /* ── Printable evidence sheet (A4, Arabic RTL) ── */
  const printSheet = () => {
    if (!k) return
    const w = window.open('', '_blank', 'width=900,height=760')
    if (!w) return
    const failRows = k.failures.slice(0, 40).map((r, i) => `
      <tr>
        <td style="text-align:center">${i + 1}</td>
        <td>${esc(r.code)}</td>
        <td>${esc(r.name)}</td>
        <td>${r.registered ? '—' : esc(r.missing.map(f => f.ar).join('، '))}</td>
        <td style="text-align:center">${r.current ? 'نعم' : 'لا'}</td>
        <td style="text-align:center">${esc(fmtDate(r.lastUpdate))}</td>
      </tr>`).join('')

    w.document.write(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
      <title>دليل احتساب المؤشر — ${esc(label)}</title>
      <style>
        @page { size: A4; margin: 14mm; }
        body { font-family: 'Cairo','Segoe UI',sans-serif; color:#111114; }
        h1 { font-size:19px; margin:0 0 4px; }
        .sub { color:#666; font-size:12px; margin-bottom:16px; }
        .band { background:#f6f4ef; border:1px solid #e3e1dc; border-radius:10px; padding:14px 16px; margin-bottom:16px; }
        .big { font-size:40px; font-weight:800; color:#0c7a58; margin:0; }
        .big small { font-size:14px; font-weight:600; color:#666; }
        table { width:100%; border-collapse:collapse; font-size:11.5px; margin-bottom:14px; }
        th,td { border:1px solid #ddd; padding:6px 8px; }
        th { background:#f2f0eb; font-weight:700; }
        .kv { width:100%; border-collapse:collapse; font-size:12.5px; }
        .kv td { border:none; padding:4px 0; }
        .kv td:first-child { color:#666; width:58%; }
        .kv td:last-child { font-weight:700; text-align:left; }
        .note { font-size:11px; color:#555; line-height:1.7; border-top:1px solid #e3e1dc; padding-top:10px; }
        .sig { margin-top:26px; display:flex; justify-content:space-between; font-size:12px; }
      </style></head><body>
      <h1>دليل احتساب مؤشر الأداء</h1>
      <div class="sub">${esc(KPI_META.ar)} — ${esc(label)}</div>

      <div class="band">
        <p class="big">${k.pct}% <small>من مستهدف ${KPI_META.target}%</small></p>
        <table class="kv">
          <tr><td>إجمالي الأصول ضمن نطاق القياس</td><td>${k.total}</td></tr>
          <tr><td>أصول مطابقة (مسجّلة بالكامل ومحدَّثة)</td><td>${k.compliant}</td></tr>
          <tr><td>غير مطابقة — نقص في بيانات التسجيل</td><td>${k.missingFieldCount}</td></tr>
          <tr><td>غير مطابقة — لم تُحدَّث خلال الدورة</td><td>${k.staleCount}</td></tr>
          <tr><td>أصول أضيفت خلال الفترة</td><td>${k.createdInPeriod}</td></tr>
          <tr><td>أصول جرى تحديثها خلال الفترة</td><td>${k.updatedInPeriod}</td></tr>
          <tr><td>أصول مُستبعدة خارج النطاق</td><td>${k.disposedExcluded}</td></tr>
        </table>
      </div>

      <h3 style="font-size:13px;margin:0 0 8px">حالات عدم المطابقة${k.failures.length > 40 ? ` (أول 40 من ${k.failures.length})` : ''}</h3>
      <table>
        <thead><tr><th style="width:34px">#</th><th>رقم الأصل</th><th>اسم الأصل</th><th>الحقول الناقصة</th><th style="width:60px">محدَّث</th><th style="width:90px">آخر تحديث</th></tr></thead>
        <tbody>${failRows || '<tr><td colspan="6" style="text-align:center">لا توجد حالات عدم مطابقة</td></tr>'}</tbody>
      </table>

      <div class="note">
        <b>المنهجية:</b> يُعدّ الأصل مطابقاً عند استيفائه شرطين معاً:
        (١) اكتمال حقول التسجيل الإلزامية: ${esc(REQUIRED_FIELDS.map(f => f.ar).join('، '))}؛
        (٢) إنشاؤه أو تحديثه خلال ${CURRENCY_WINDOW_DAYS} يوماً حتى نهاية الفترة، استناداً إلى دورية تحديث السجل المعتمدة في نظام إدارة الأصول (ربع سنوي).
        <br><b>نطاق القياس:</b> جميع أصول السجل الموحد باستثناء الأصول المُستبعدة (Disposed) لكونها سجلات مؤرشفة، وقد أُدرج عددها أعلاه للشفافية.
        <br><b>المصدر:</b> السجل الموحد للأصول وسجل التدقيق (asset_audit_log) في منظومة عمليات نادي الفجيرة للفنون القتالية — احتُسب آلياً بتاريخ ${esc(new Date().toLocaleString('en-GB'))}.
      </div>

      <div class="sig">
        <span>مسؤول القياس: محمد عبدالله عمايره</span>
        <span>رئيس قسم العمليات: ايهاب استيته</span>
      </div>
      <script>window.onload=()=>{window.print()}</${''}script>
      </body></html>`)
    w.document.close()
  }

  const loading = auditLog === null
  const ok = k && k.pct >= 100

  return (
    <div className="akpi">
      <div className="akpi-head">
        <div className="akpi-head-icon"><Gauge size={17} /></div>
        <div className="akpi-head-txt">
          <h3 dir="rtl">قياس مؤشر الالتزام بسجل الأصول</h3>
          <p dir="rtl">{KPI_META.ar}</p>
        </div>
      </div>

      <div className="akpi-controls">
        <select className="akpi-sel" value={month} onChange={e => setMonth(Number(e.target.value))} dir="rtl">
          {MONTHS_AR.map((m, i) => <option key={i} value={i}>{m}</option>)}
        </select>
        <select className="akpi-sel" value={year} onChange={e => setYear(Number(e.target.value))} dir="ltr">
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <div className="akpi-spacer" />
        <button className="ast-btn ast-btn-ghost" onClick={exportXlsx} disabled={loading || !k}>
          <Download size={13} /> تصدير الدليل (Excel)
        </button>
        <button className="ast-btn ast-btn-primary" onClick={printSheet} disabled={loading || !k}>
          <Printer size={13} /> طباعة دليل الاحتساب
        </button>
      </div>

      {loading ? (
        <div className="akpi-loading"><RefreshCw size={15} className="ast-spin" /> جارٍ قراءة سجل التدقيق…</div>
      ) : (
        <>
          <div className="akpi-result">
            <div className={`akpi-big ${ok ? 'is-ok' : 'is-under'}`}>
              <span className="akpi-pct">{k.pct}%</span>
              <span className="akpi-target">المستهدف {KPI_META.target}%</span>
            </div>
            <div className="akpi-stats">
              {[
                { l: 'إجمالي الأصول (نطاق القياس)', v: k.total },
                { l: 'مطابقة', v: k.compliant, good: true },
                { l: 'نقص بيانات تسجيل', v: k.missingFieldCount, bad: k.missingFieldCount > 0 },
                { l: 'لم تُحدَّث خلال الدورة', v: k.staleCount, bad: k.staleCount > 0 },
                { l: 'أضيفت خلال الفترة', v: k.createdInPeriod },
                { l: 'حُدِّثت خلال الفترة', v: k.updatedInPeriod },
              ].map((s, i) => (
                <div key={i} className="akpi-stat">
                  <span className={`akpi-stat-v${s.good ? ' good' : ''}${s.bad ? ' bad' : ''}`}>{s.v}</span>
                  <span className="akpi-stat-l" dir="rtl">{s.l}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="akpi-method" dir="rtl">
            <Info size={13} />
            <span>
              الأصل مطابق عند اكتمال حقول التسجيل الإلزامية ({REQUIRED_FIELDS.map(f => f.ar).join('، ')})
              <b> و</b> إنشائه أو تحديثه خلال {CURRENCY_WINDOW_DAYS} يوماً حتى نهاية الفترة.
              {k.disposedExcluded > 0 && ` استُبعد ${k.disposedExcluded} أصلاً مُستبعداً من النطاق.`}
            </span>
          </div>

          {k.failures.length > 0 ? (
            <div className="akpi-fail">
              <button className="akpi-fail-toggle" onClick={() => setShowFailures(v => !v)} dir="rtl">
                <AlertTriangle size={13} />
                {k.failures.length} أصلاً غير مطابق — {showFailures ? 'إخفاء' : 'عرض التفاصيل'}
              </button>
              {showFailures && (
                <div className="akpi-table-wrap">
                  <table className="akpi-table" dir="rtl">
                    <thead>
                      <tr><th>رقم الأصل</th><th>الاسم</th><th>الحقول الناقصة</th><th>آخر تحديث</th></tr>
                    </thead>
                    <tbody>
                      {k.failures.slice(0, 100).map(r => (
                        <tr key={r.id}>
                          <td>{r.code || '—'}</td>
                          <td>{r.name || '—'}</td>
                          <td>{r.registered ? '—' : r.missing.map(f => f.ar).join('، ')}</td>
                          <td className={r.current ? '' : 'bad'}>{fmtDate(r.lastUpdate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {k.failures.length > 100 && (
                    <p className="akpi-more" dir="rtl">يعرض أول 100 — التصدير يحتوي القائمة كاملة.</p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="akpi-clean" dir="rtl">
              <CheckCircle2 size={14} /> جميع الأصول ضمن النطاق مطابقة لمتطلبات التسجيل والتحديث.
            </div>
          )}
        </>
      )}
    </div>
  )
}
