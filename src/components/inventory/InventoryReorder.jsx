import { useMemo, useState } from 'react'
import { ClipboardList, Printer, Copy, Download, Check } from 'lucide-react'
import { useLanguage } from '../../contexts/LanguageContext'

/**
 * Reorder Sheet — a procurement-ready list of everything at or below its
 * minimum stock threshold, with a suggested order quantity. Printable,
 * copyable, exportable. Suggested qty heuristic (labelled in the UI):
 * bring stock back to 2× the minimum threshold.
 */
/* Escape values interpolated into the print document's HTML. */
const escHtml = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

export default function InventoryReorder({ items, settings }) {
  const { t, lang, locale } = useLanguage()
  const [copied, setCopied] = useState(false)

  const catLabel = (id) => {
    const c = (settings?.categories || []).find(x => x.id === id || x.en === id || x.name === id)
    if (!c) return id || '—'
    return lang === 'ar' ? (c.ar || c.nameAr || c.en || c.name || id) : (c.en || c.name || c.ar || id)
  }

  const rows = useMemo(() => {
    return (items || [])
      .filter(i => (i.currentStock ?? 0) <= (i.minThreshold ?? 5))
      .map(i => {
        const min = i.minThreshold ?? 5
        const cur = i.currentStock ?? 0
        /* Show BOTH names like the Stock tab does. A purchasing sheet has to
           identify the item unambiguously, and some records carry a generic
           label in one language only — showing a single language can make
           distinct items look identical. */
        const primary = lang === 'ar' ? (i.nameAr || i.nameEn) : (i.nameEn || i.nameAr)
        const secondary = lang === 'ar' ? (i.nameEn || '') : (i.nameAr || '')
        return {
          id: i.id,
          name: primary || i.sku || '—',
          alt: secondary && secondary !== primary ? secondary : '',
          size: i.size || '',
          sku: i.sku || '—',
          category: catLabel(i.category),
          cur,
          min,
          suggested: Math.max(min * 2 - cur, min),
          out: cur === 0,
        }
      })
      .sort((a, b) => (b.out - a.out) || ((b.min - b.cur) - (a.min - a.cur)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, settings, lang])

  const outCount = rows.filter(r => r.out).length
  const lowCount = rows.length - outCount
  const totalUnits = rows.reduce((s, r) => s + r.suggested, 0)
  const today = new Date().toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })

  /* ── Copy as plain text ── */
  const copyList = async () => {
    const lines = [
      `${t('Reorder sheet', 'ورقة إعادة الطلب')} — ${today}`,
      '',
      ...rows.map(r => {
        const label = [r.name, r.size, r.alt && `/ ${r.alt}`].filter(Boolean).join(' ')
        return `• ${label} (${r.sku}) — ${t('order', 'اطلب')} ${r.suggested} (${t('stock', 'المخزون')}: ${r.cur}/${r.min})`
      }),
    ]
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { /* clipboard unavailable */ }
  }

  /* ── CSV download ── */
  const downloadCsv = () => {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const header = ['Item', 'Item (other language)', 'Size', 'SKU', 'Category',
                    'Current stock', 'Min threshold', 'Suggested order']
    const body = rows.map(r =>
      [r.name, r.alt, r.size, r.sku, r.category, r.cur, r.min, r.suggested].map(esc).join(','))
    const csv = '﻿' + [header.map(esc).join(','), ...body].join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `reorder-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  /* ── Print sheet (standalone window — literal colors only, CSS vars
        do not resolve in a fresh document) ── */
  const printSheet = () => {
    const w = window.open('', '_blank', 'width=900,height=700')
    if (!w) return
    const rowsHtml = rows.map((r, i) => `
      <tr>
        <td style="text-align:center;color:#8a8a94;">${i + 1}</td>
        <td>${escHtml(r.name)}${r.size ? ` <b>${escHtml(r.size)}</b>` : ''}${r.alt ? `<div style="color:#8a8a94;font-size:11px;">${escHtml(r.alt)}</div>` : ''}</td>
        <td style="font-family:monospace;font-size:11px;">${escHtml(r.sku)}</td>
        <td>${escHtml(r.category)}</td>
        <td style="text-align:center;${r.out ? 'color:#c23934;font-weight:700;' : ''}">${r.cur}</td>
        <td style="text-align:center;">${r.min}</td>
        <td style="text-align:center;font-weight:700;">${r.suggested}</td>
        <td style="width:90px;border-bottom:1px solid #ddd;"></td>
      </tr>`).join('')
    w.document.write(`<!doctype html><html dir="rtl"><head><meta charset="utf-8">
      <title>Reorder Sheet</title>
      <style>
        body { font-family: 'Cairo', 'Segoe UI', sans-serif; color: #111114; padding: 32px; }
        h1 { font-size: 20px; margin: 0 0 2px; }
        .sub { color: #8a8a94; font-size: 12px; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
        th { text-align: right; padding: 8px; background: #f4f2ed; border: 1px solid #e2e0da; font-size: 11px; }
        td { padding: 7px 8px; border: 1px solid #eceae4; }
        .foot { margin-top: 24px; color: #8a8a94; font-size: 11px; display: flex; justify-content: space-between; }
        @media print { body { padding: 12px; } }
      </style></head><body>
      <h1>${t('Inventory Reorder Sheet', 'ورقة إعادة طلب المخزون')} — FMAC</h1>
      <div class="sub">${today} · ${outCount} ${t('out of stock', 'نفذ')} · ${lowCount} ${t('low', 'منخفض')} · ${t('suggested total', 'إجمالي مقترح')}: ${totalUnits}</div>
      <table>
        <thead><tr>
          <th>#</th><th>${t('Item', 'الصنف')}</th><th>SKU</th><th>${t('Category', 'الفئة')}</th>
          <th>${t('Stock', 'المخزون')}</th><th>${t('Min', 'الحد الأدنى')}</th>
          <th>${t('Suggested', 'المقترح')}</th><th>${t('Ordered', 'المطلوب فعلياً')}</th>
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <div class="foot"><span>${t('Suggested = restock to 2× minimum threshold', 'المقترح = إعادة التعبئة إلى ضعف الحد الأدنى')}</span><span>FMAC Operations Suite</span></div>
      <script>window.print()</script></body></html>`)
    w.document.close()
  }

  return (
    <div className="rl">
      <div className="rl-head">
        <div>
          <h2 className="rl-title">{t('Reorder Sheet', 'ورقة إعادة الطلب')}</h2>
          <p className="rl-sub">
            {t('Everything at or below its minimum threshold. Suggested = restock to 2× minimum.', 'كل صنف عند أو دون حده الأدنى. المقترح = إعادة التعبئة إلى ضعف الحد الأدنى.')}
          </p>
        </div>
        <div className="rl-actions">
          <button className="rl-btn" onClick={copyList} disabled={rows.length === 0}>
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? t('Copied', 'تم النسخ') : t('Copy list', 'نسخ القائمة')}
          </button>
          <button className="rl-btn" onClick={downloadCsv} disabled={rows.length === 0}>
            <Download size={13} /> CSV
          </button>
          <button className="rl-btn rl-btn-primary" onClick={printSheet} disabled={rows.length === 0}>
            <Printer size={13} /> {t('Print', 'طباعة')}
          </button>
        </div>
      </div>

      <div className="rl-chips">
        <span className="rl-chip rl-chip-risk" dir="ltr">{outCount.toLocaleString(locale)} {t('out of stock', 'نفذ')}</span>
        <span className="rl-chip rl-chip-warn" dir="ltr">{lowCount.toLocaleString(locale)} {t('running low', 'منخفض')}</span>
        <span className="rl-chip" dir="ltr">{totalUnits.toLocaleString(locale)} {t('units suggested', 'وحدة مقترحة')}</span>
      </div>

      {rows.length === 0 ? (
        <div className="rl-empty">
          <ClipboardList size={26} strokeWidth={1.5} />
          <p>{t('Nothing needs reordering — every item is above its minimum.', 'لا شيء يحتاج إعادة طلب — كل الأصناف فوق حدها الأدنى.')}</p>
        </div>
      ) : (
        <table className="rl-table">
          <thead>
            <tr>
              <th>{t('Item', 'الصنف')}</th>
              <th>SKU</th>
              <th>{t('Category', 'الفئة')}</th>
              <th className="rl-num">{t('Stock', 'المخزون')}</th>
              <th className="rl-num">{t('Min', 'الحد الأدنى')}</th>
              <th className="rl-num">{t('Suggested', 'المقترح')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td className="rl-name" dir="auto">
                  <span className="rl-name-main">
                    {r.name}
                    {r.size && <span className="rl-size">{r.size}</span>}
                    {r.out && <span className="rl-out">{t('out', 'نفذ')}</span>}
                  </span>
                  {r.alt && <span className="rl-name-alt" dir="auto">{r.alt}</span>}
                </td>
                <td className="rl-mono" dir="ltr">{r.sku}</td>
                <td className="rl-muted" dir="auto">{r.category}</td>
                <td className={`rl-num${r.out ? ' rl-risk' : ''}`} dir="ltr">{r.cur.toLocaleString(locale)}</td>
                <td className="rl-num rl-muted" dir="ltr">{r.min.toLocaleString(locale)}</td>
                <td className="rl-num rl-strong" dir="ltr">{r.suggested.toLocaleString(locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
