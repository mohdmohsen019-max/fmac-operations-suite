import { useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Download, RefreshCw, BarChart2, AlertTriangle, TrendingDown, FileText, Search, X as XIcon } from 'lucide-react'
import { db } from '../../firebase'
import { collection, query, where, orderBy, getDocs, Timestamp } from 'firebase/firestore'
import { useLanguage } from '../../contexts/LanguageContext'
import { getSportLabel, getCatLabel, getItemStatus, fmtDate, DEFAULT_SPORTS } from './shared'
import CustomSelect from '../CustomSelect'
import * as XLSX from 'xlsx'

const MONTHS_EN = ['January','February','March','April','May','June','July','August','September','October','November','December']
const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']

// ─── Stock report HTML builder ────────────────────────────────────────────────
function buildStockReportHTML(itemsData, srStart, srEnd) {
  const fmtD = (ts) => {
    if (!ts) return '—'
    const d = ts?.toDate ? ts.toDate() : new Date(ts)
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
  }
  const today = fmtD(new Date())
  const periodText = srStart && srEnd
    ? `${srStart.split('-').reverse().join('/')} — ${srEnd.split('-').reverse().join('/')}`
    : srStart ? `من ${srStart.split('-').reverse().join('/')}`
    : srEnd   ? `حتى ${srEnd.split('-').reverse().join('/')}`
    : 'جميع الفترات'

  const statusInfo = (item) => {
    const s = getItemStatus(item)
    if (s === 'out') return { text: 'نفذ المخزون', color: '#de4a41' }
    if (s === 'low') return { text: 'مخزون منخفض', color: '#d4a008' }
    return { text: 'متوفر', color: '#2c9c5c' }
  }

  let itemSections = ''
  let summaryRows = ''

  itemsData.forEach(({ item, movements }, idx) => {
    const si = statusInfo(item)
    const stockIn  = movements.filter(m => m.type === 'stock_in' ).reduce((s,m) => s + (m.quantity||0), 0)
    const stockOut = movements.filter(m => m.type === 'stock_out').reduce((s,m) => s + (m.quantity||0), 0)
    const net = stockIn - stockOut

    let movRows = ''
    if (!movements.length) {
      movRows = `<tr><td colspan="7" style="text-align:center;color:#888;padding:16px;font-size:12px;">لا توجد حركات في هذه الفترة</td></tr>`
    } else {
      movements.forEach(m => {
        const isIn = m.type === 'stock_in'
        movRows += `<tr style="border-bottom:1px solid #f3f4f6;">
          <td style="padding:7px 8px;">${fmtD(m.createdAt)}</td>
          <td style="padding:7px 8px;">
            <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${isIn?'#2c9c5c':'#de4a41'};margin-left:5px;vertical-align:middle;"></span>
            <span style="color:${isIn?'#2c9c5c':'#de4a41'};font-weight:600;">${isIn?'وارد':'صادر'}</span>
          </td>
          <td style="padding:7px 8px;text-align:center;font-weight:700;">${m.quantity||0}</td>
          <td style="padding:7px 8px;text-align:center;color:#555;">${m.stockBefore??'—'}</td>
          <td style="padding:7px 8px;text-align:center;color:#555;">${m.stockAfter??'—'}</td>
          <td style="padding:7px 8px;">${m.issuedTo?.name||m.receivedFrom||m.createdByName||'—'}</td>
          <td style="padding:7px 8px;color:#888;font-size:11px;">${m.receiptId||m.notes||'—'}</td>
        </tr>`
      })
    }

    if (idx > 0) itemSections += `<div style="border-top:2px solid #e5e7eb;margin:24px 0;"></div>`
    itemSections += `
    <div>
      <div style="background:#f3f4f6;padding:10px 14px;border-radius:6px;display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <div>
          <span style="font-family:monospace;font-size:11px;color:#666;margin-left:10px;background:#e5e7eb;padding:2px 6px;border-radius:3px;">${item.sku||''}</span>
          <strong style="font-size:15px;">${item.nameAr||''}</strong>
        </div>
        <span style="font-size:12px;color:#888;">${item.nameEn||''}</span>
      </div>
      <div style="display:flex;gap:10px;margin-bottom:12px;">
        <div style="flex:1;border:1px solid #e5e7eb;border-radius:6px;padding:10px;text-align:center;">
          <div style="font-size:11px;color:#888;margin-bottom:4px;">المخزون الحالي</div>
          <div style="font-size:24px;font-weight:800;">${item.currentStock??0}</div>
        </div>
        <div style="flex:1;border:1px solid #e5e7eb;border-radius:6px;padding:10px;text-align:center;">
          <div style="font-size:11px;color:#888;margin-bottom:4px;">الحالة</div>
          <div style="font-size:16px;font-weight:700;color:${si.color};">${si.text}</div>
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:12px;font-family:Cairo,sans-serif;">
        <thead>
          <tr style="background:#f9fafb;border-bottom:2px solid #e5e7eb;">
            <th style="padding:8px;text-align:right;font-weight:700;">التاريخ</th>
            <th style="padding:8px;text-align:right;font-weight:700;">النوع</th>
            <th style="padding:8px;text-align:center;font-weight:700;">الكمية</th>
            <th style="padding:8px;text-align:center;font-weight:700;">قبل</th>
            <th style="padding:8px;text-align:center;font-weight:700;">بعد</th>
            <th style="padding:8px;text-align:right;font-weight:700;">بواسطة</th>
            <th style="padding:8px;text-align:right;font-weight:700;">ملاحظات</th>
          </tr>
        </thead>
        <tbody>${movRows}</tbody>
        <tfoot>
          <tr style="background:#f9fafb;border-top:2px solid #e5e7eb;">
            <td colspan="2" style="padding:8px;font-weight:700;font-size:12px;">الإجماليات</td>
            <td colspan="5" style="padding:8px;font-size:12px;">
              إجمالي الوارد: <strong style="color:#2c9c5c;">${stockIn}</strong>
              &nbsp;|&nbsp;
              إجمالي الصادر: <strong style="color:#de4a41;">${stockOut}</strong>
              &nbsp;|&nbsp;
              صافي الحركة: <strong style="color:${net>=0?'#2c9c5c':'#de4a41'};">${net>=0?'+':''}${net}</strong>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>`

    summaryRows += `<tr style="border-bottom:1px solid #f3f4f6;">
      <td style="padding:9px 8px;">${item.nameAr||''}<div style="font-size:11px;color:#888;font-family:monospace;">${item.sku||''}</div></td>
      <td style="padding:9px 8px;text-align:center;font-weight:700;">${item.currentStock??0}</td>
      <td style="padding:9px 8px;text-align:center;color:#2c9c5c;font-weight:700;">+${stockIn}</td>
      <td style="padding:9px 8px;text-align:center;color:#de4a41;font-weight:700;">-${stockOut}</td>
      <td style="padding:9px 8px;text-align:center;font-weight:700;color:${si.color};">${si.text}</td>
    </tr>`
  })

  const summaryTable = itemsData.length > 1 ? `
  <div style="margin-top:32px;">
    <h2 style="font-size:15px;font-weight:800;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #e5e7eb;">ملخص المخزون</h2>
    <table style="width:100%;border-collapse:collapse;font-size:12px;font-family:Cairo,sans-serif;">
      <thead>
        <tr style="background:#f3f4f6;border-bottom:2px solid #e5e7eb;">
          <th style="padding:10px 8px;text-align:right;font-weight:700;">الصنف</th>
          <th style="padding:10px 8px;text-align:center;font-weight:700;">المخزون الحالي</th>
          <th style="padding:10px 8px;text-align:center;font-weight:700;">الوارد</th>
          <th style="padding:10px 8px;text-align:center;font-weight:700;">الصادر</th>
          <th style="padding:10px 8px;text-align:center;font-weight:700;">الحالة</th>
        </tr>
      </thead>
      <tbody>${summaryRows}</tbody>
    </table>
  </div>` : ''

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8">
<title>تقرير المخزون</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap');
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Cairo',sans-serif;direction:rtl;background:#fff;color:#111;padding:24px 28px;font-size:13px;line-height:1.5;}
@media print{@page{size:A4;margin:15mm;}body{padding:0;}.no-print{display:none!important;}tr{page-break-inside:avoid;}}
</style>
</head>
<body>
<div class="no-print" style="position:fixed;top:12px;left:12px;z-index:9999;display:flex;gap:8px;">
  <button onclick="window.print()" style="background:#b91c1c;color:#fff;border:none;padding:10px 22px;border-radius:7px;cursor:pointer;font-family:Cairo,sans-serif;font-size:14px;font-weight:700;">طباعة التقرير</button>
  <button onclick="window.close()" style="background:#e5e7eb;color:#333;border:none;padding:10px 18px;border-radius:7px;cursor:pointer;font-family:Cairo,sans-serif;font-size:13px;">إغلاق</button>
</div>
<div style="border-bottom:3px solid #b91c1c;padding-bottom:16px;margin-bottom:28px;">
  <h1 style="font-size:22px;font-weight:800;margin-bottom:5px;">تقرير المخزون</h1>
  <p style="color:#555;font-size:13px;margin-bottom:8px;">نادي الفجيرة للفنون القتالية</p>
  <div style="display:flex;gap:24px;font-size:12px;color:#666;flex-wrap:wrap;">
    <span>الفترة: <strong>${periodText}</strong></span>
    <span>تاريخ الطباعة: <strong>${today}</strong></span>
    <span>عدد الأصناف: <strong>${itemsData.length}</strong></span>
  </div>
</div>
${itemSections}
${summaryTable}
</body>
</html>`
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function InventoryReports({ items, settings }) {
  const { t, lang } = useLanguage()
  const [activeReport, setActiveReport] = useState('monthly')
  const [loading, setLoading] = useState(false)
  const [reportData, setReportData] = useState(null)

  const [selectedYear, setSelectedYear]   = useState(new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth())
  const [sumStart, setSumStart] = useState('')
  const [sumEnd,   setSumEnd]   = useState('')

  // Stock report state
  const [stockSearch, setStockSearch]               = useState('')
  const [stockSelectedItems, setStockSelectedItems] = useState([])
  const [srStart, setSrStart] = useState('')
  const [srEnd,   setSrEnd]   = useState('')
  const [stockLoading, setStockLoading] = useState(false)

  const sports = settings?.sports || DEFAULT_SPORTS
  const years  = Array.from({ length: 3 }, (_, i) => new Date().getFullYear() - i)

  // ── Existing report generators (unchanged) ────────────────────────────────
  const generateMonthlyReport = useCallback(async () => {
    setLoading(true); setReportData(null)
    try {
      const start = new Date(selectedYear, selectedMonth, 1)
      const end   = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59)
      const snap  = await getDocs(query(
        collection(db, 'inventory_movements'),
        where('type', '==', 'stock_out'),
        where('createdAt', '>=', Timestamp.fromDate(start)),
        where('createdAt', '<=', Timestamp.fromDate(end))
      ))
      const movements = snap.docs.map(d => d.data())
      const bySport = {}
      movements.forEach(mv => {
        const sport = mv.issuedTo?.sport || 'general'
        if (!bySport[sport]) bySport[sport] = { orders: new Set(), totalQty: 0, items: {} }
        bySport[sport].orders.add(mv.receiptId || mv.id)
        bySport[sport].totalQty += mv.quantity || 0
        const key = mv.itemNameAr || mv.itemSku
        bySport[sport].items[key] = (bySport[sport].items[key] || 0) + (mv.quantity || 0)
      })
      const rows = Object.entries(bySport).map(([sportId, data]) => ({
        sportId,
        sport: getSportLabel(sportId, lang, sports),
        orders: data.orders.size,
        totalQty: data.totalQty,
        topItems: Object.entries(data.items).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([n,q])=>`${n} (${q})`).join(', '),
      })).sort((a,b) => b.totalQty - a.totalQty)
      setReportData({ type: 'monthly', rows, month: selectedMonth, year: selectedYear })
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [selectedYear, selectedMonth, lang, sports])

  const generateLowStockReport = useCallback(() => {
    const rows = items
      .filter(i => getItemStatus(i) !== 'ok')
      .map(i => ({
        nameAr: i.nameAr, nameEn: i.nameEn,
        sport: getSportLabel(i.sport, lang, sports),
        category: getCatLabel(i.category, lang),
        currentStock: i.currentStock,
        minThreshold: i.minThreshold ?? 5,
        diff: i.currentStock - (i.minThreshold ?? 5),
        status: getItemStatus(i),
      }))
      .sort((a,b) => a.diff - b.diff)
    setReportData({ type: 'lowstock', rows })
  }, [items, lang, sports])

  const generateSummaryReport = useCallback(async () => {
    if (!sumStart || !sumEnd) return
    setLoading(true); setReportData(null)
    try {
      const start = new Date(sumStart)
      const end   = new Date(sumEnd + 'T23:59:59')
      const snap  = await getDocs(query(
        collection(db, 'inventory_movements'),
        where('createdAt', '>=', Timestamp.fromDate(start)),
        where('createdAt', '<=', Timestamp.fromDate(end))
      ))
      const byItem = {}
      snap.docs.map(d => d.data()).forEach(mv => {
        if (!byItem[mv.itemId]) byItem[mv.itemId] = { nameAr: mv.itemNameAr, nameEn: mv.itemNameEn, sku: mv.itemSku, stockIn: 0, stockOut: 0 }
        if (mv.type === 'stock_in')  byItem[mv.itemId].stockIn  += mv.quantity || 0
        if (mv.type === 'stock_out') byItem[mv.itemId].stockOut += mv.quantity || 0
      })
      const rows = Object.values(byItem).sort((a,b) => (b.stockIn+b.stockOut) - (a.stockIn+a.stockOut))
      setReportData({ type: 'summary', rows, start: sumStart, end: sumEnd })
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [sumStart, sumEnd])

  // ── Stock report ───────────────────────────────────────────────────────────
  const stockSearchResults = stockSearch.trim().length > 0
    ? items.filter(item =>
        !stockSelectedItems.find(s => s.id === item.id) &&
        (
          (item.nameAr || '').includes(stockSearch) ||
          (item.nameEn || '').toLowerCase().includes(stockSearch.toLowerCase()) ||
          (item.sku   || '').toLowerCase().includes(stockSearch.toLowerCase())
        )
      ).slice(0, 8)
    : []

  const addStockItem    = (item) => { setStockSelectedItems(p => [...p, item]); setStockSearch('') }
  const removeStockItem = (id)   => setStockSelectedItems(p => p.filter(i => i.id !== id))

  const setStockPreset = (preset) => {
    const now   = new Date()
    const today = now.toISOString().split('T')[0]
    if (preset === 'month') {
      setSrStart(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0])
      setSrEnd(today)
    } else if (preset === '3months') {
      const d = new Date(now); d.setMonth(d.getMonth() - 3)
      setSrStart(d.toISOString().split('T')[0]); setSrEnd(today)
    } else if (preset === 'year') {
      setSrStart(`${now.getFullYear()}-01-01`); setSrEnd(today)
    } else {
      setSrStart(''); setSrEnd('')
    }
  }

  const fetchStockData = useCallback(async () => {
    return Promise.all(stockSelectedItems.map(async (item) => {
      let movements = []
      try {
        const constraints = [where('itemId', '==', item.id)]
        if (srStart) constraints.push(where('createdAt', '>=', Timestamp.fromDate(new Date(srStart))))
        if (srEnd)   constraints.push(where('createdAt', '<=', Timestamp.fromDate(new Date(srEnd + 'T23:59:59'))))
        const snap = await getDocs(query(collection(db, 'inventory_movements'), ...constraints))
        movements = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.createdAt?.toDate?.()?.getTime()||0) - (b.createdAt?.toDate?.()?.getTime()||0))
      } catch (err) { console.error('stock fetch:', err) }
      return { item, movements }
    }))
  }, [stockSelectedItems, srStart, srEnd])

  const handlePrintStockReport = async () => {
    if (!stockSelectedItems.length) return
    setStockLoading(true)
    try {
      const data = await fetchStockData()
      const html = buildStockReportHTML(data, srStart, srEnd)
      const win = window.open('', '_blank')
      if (win) { win.document.write(html); win.document.close() }
    } finally { setStockLoading(false) }
  }

  const handleExportStockExcel = async () => {
    if (!stockSelectedItems.length) return
    setStockLoading(true)
    try {
      const data = await fetchStockData()
      const rows = []
      data.forEach(({ item, movements }) => {
        if (!movements.length) {
          rows.push({ 'الصنف': item.nameAr||'', 'SKU': item.sku||'', 'المخزون الحالي': item.currentStock??0, 'التاريخ': '', 'النوع': '', 'الكمية': '', 'قبل': '', 'بعد': '', 'بواسطة': '', 'ملاحظات': 'لا توجد حركات' })
        } else {
          movements.forEach(m => {
            const d = m.createdAt?.toDate ? m.createdAt.toDate() : null
            rows.push({
              'الصنف': item.nameAr||'', 'SKU': item.sku||'', 'المخزون الحالي': item.currentStock??0,
              'التاريخ': d ? `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}` : '',
              'النوع': m.type === 'stock_in' ? 'وارد' : 'صادر',
              'الكمية': m.quantity||0, 'قبل': m.stockBefore??'', 'بعد': m.stockAfter??'',
              'بواسطة': m.issuedTo?.name||m.createdByName||'', 'ملاحظات': m.receiptId||m.notes||'',
            })
          })
        }
      })
      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Stock Report')
      XLSX.writeFile(wb, `stock-report-${new Date().toISOString().split('T')[0]}.xlsx`)
    } finally { setStockLoading(false) }
  }

  // ── Excel export for existing reports ─────────────────────────────────────
  const exportExcel = () => {
    if (!reportData) return
    let rows = []
    if (reportData.type === 'monthly') {
      rows = reportData.rows.map(r => ({
        [t('Sport','الرياضة')]: r.sport,
        [t('Issuance Orders','عدد أوامر الصرف')]: r.orders,
        [t('Total Qty','إجمالي القطع')]: r.totalQty,
        [t('Top Items','أبرز الأصناف')]: r.topItems,
      }))
    } else if (reportData.type === 'lowstock') {
      rows = reportData.rows.map(r => ({
        [t('Item (AR)','الصنف عربي')]: r.nameAr,
        [t('Item (EN)','الصنف إنجليزي')]: r.nameEn,
        [t('Sport','الرياضة')]: r.sport,
        [t('Current Stock','المخزون الحالي')]: r.currentStock,
        [t('Min Threshold','الحد الأدنى')]: r.minThreshold,
        [t('Difference','الفرق')]: r.diff,
      }))
    } else if (reportData.type === 'summary') {
      rows = reportData.rows.map(r => ({
        [t('Item (AR)','الصنف عربي')]: r.nameAr,
        [t('Item (EN)','الصنف إنجليزي')]: r.nameEn,
        SKU: r.sku,
        [t('Stock In','وارد')]: r.stockIn,
        [t('Stock Out','صادر')]: r.stockOut,
        [t('Net','صافي')]: r.stockIn - r.stockOut,
      }))
    }
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Report')
    XLSX.writeFile(wb, `inventory-report-${reportData.type}-${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  const reportTabs = [
    { id: 'monthly',  icon: BarChart2,      label: t('Monthly Issuance',  'الصرف الشهري') },
    { id: 'lowstock', icon: AlertTriangle,   label: t('Low Stock Report',   'تقرير المخزون المنخفض') },
    { id: 'summary',  icon: TrendingDown,    label: t('Movement Summary',   'ملخص الحركة') },
    { id: 'stock',    icon: FileText,        label: t('Stock Report',       'تقرير المخزون') },
  ]

  return (
    <div className="inv-reports">
      <div className="luxury-tab-rail">
        {reportTabs.map(r => (
          <button
            key={r.id}
            className={`tab-item ${activeReport === r.id ? 'active' : ''}`}
            onClick={() => { setActiveReport(r.id); setReportData(null) }}
          >
            <r.icon size={14} /> {r.label}
          </button>
        ))}
      </div>

      <div className="inv-form-section">

        {/* ── Monthly controls ── */}
        {activeReport === 'monthly' && (
          <div className="inv-report-controls">
            <div style={{ minWidth: 110 }}>
              <CustomSelect value={selectedYear} onChange={setSelectedYear}
                options={years.map(y => ({ value: y, label: String(y) }))} />
            </div>
            <div style={{ minWidth: 140 }}>
              <CustomSelect value={selectedMonth} onChange={setSelectedMonth}
                options={MONTHS_EN.map((m, i) => ({ value: i, label: lang === 'ar' ? MONTHS_AR[i] : m }))} />
            </div>
            <button className="inv-btn inv-btn-primary" onClick={generateMonthlyReport} disabled={loading}>
              {loading ? <RefreshCw size={14} className="inv-spin" /> : t('Generate','إنشاء')}
            </button>
          </div>
        )}

        {/* ── Low stock controls ── */}
        {activeReport === 'lowstock' && (
          <div className="inv-report-controls">
            <button className="inv-btn inv-btn-primary" onClick={generateLowStockReport}>
              {t('Generate Report','إنشاء التقرير')}
            </button>
          </div>
        )}

        {/* ── Summary controls ── */}
        {activeReport === 'summary' && (
          <div className="inv-report-controls">
            <input type="date" className="inv-input inv-input-sm" value={sumStart} onChange={e => setSumStart(e.target.value)} />
            <span style={{ color:'var(--theme-text-muted)' }}>—</span>
            <input type="date" className="inv-input inv-input-sm" value={sumEnd} onChange={e => setSumEnd(e.target.value)} />
            <button className="inv-btn inv-btn-primary" onClick={generateSummaryReport} disabled={loading || !sumStart || !sumEnd}>
              {loading ? <RefreshCw size={14} className="inv-spin" /> : t('Generate','إنشاء')}
            </button>
          </div>
        )}

        {/* ── Stock Report controls ── */}
        {activeReport === 'stock' && (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>

            {/* Item selector */}
            <div>
              {/* Selected chips */}
              {stockSelectedItems.length > 0 && (
                <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:8 }}>
                  {stockSelectedItems.map(item => (
                    <span key={item.id} style={{ display:'inline-flex', alignItems:'center', gap:5, background:'var(--theme-surface)', border:'1px solid var(--theme-border)', borderRadius:6, padding:'3px 8px', fontSize:'0.78rem', fontFamily:'Cairo,sans-serif' }}>
                      {item.nameAr || item.nameEn}
                      <button onClick={() => removeStockItem(item.id)} style={{ background:'none', border:'none', cursor:'pointer', padding:0, color:'var(--theme-text-muted)', display:'flex' }}>
                        <XIcon size={12} />
                      </button>
                    </span>
                  ))}
                  <span style={{ fontSize:'0.73rem', color:'var(--theme-text-muted)', alignSelf:'center' }}>
                    {stockSelectedItems.length} {t('items selected','أصناف محددة')}
                  </span>
                </div>
              )}

              {/* Search row */}
              <div style={{ display:'flex', gap:8 }}>
                <div style={{ position:'relative', flex:1 }}>
                  <Search size={13} style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', color:'var(--theme-text-muted)', pointerEvents:'none' }} />
                  <input
                    className="inv-input"
                    style={{ paddingRight:30 }}
                    placeholder={t('Search by name or SKU…','ابحث بالاسم أو الكود…')}
                    value={stockSearch}
                    onChange={e => setStockSearch(e.target.value)}
                  />
                  {stockSearchResults.length > 0 && (
                    <div style={{ position:'absolute', top:'calc(100% + 4px)', right:0, left:0, zIndex:50, background:'var(--theme-surface)', border:'1px solid var(--theme-border)', borderRadius:8, boxShadow:'0 8px 24px rgba(0,0,0,0.15)', maxHeight:220, overflowY:'auto' }}>
                      {stockSearchResults.map(item => (
                        <button key={item.id} onClick={() => addStockItem(item)} style={{ width:'100%', textAlign:'right', padding:'8px 12px', background:'none', border:'none', borderBottom:'1px solid var(--theme-border)', cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                          <span style={{ fontSize:'0.85rem', color:'var(--theme-text-main)', fontFamily:'Cairo,sans-serif' }}>{item.nameAr}</span>
                          <span style={{ fontSize:'0.72rem', color:'var(--theme-text-muted)', fontFamily:'monospace' }}>{item.sku}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button className="inv-btn inv-btn-ghost inv-btn-sm" onClick={() => { setStockSelectedItems(items.slice()); setStockSearch('') }}>
                  {t('All Items','كل الأصناف')}
                </button>
                {stockSelectedItems.length > 0 && (
                  <button className="inv-btn inv-btn-ghost inv-btn-sm" onClick={() => setStockSelectedItems([])}>
                    {t('Clear','مسح')}
                  </button>
                )}
              </div>
            </div>

            {/* Date range */}
            <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
              <input type="date" className="inv-input inv-input-sm" value={srStart} onChange={e => setSrStart(e.target.value)} />
              <span style={{ color:'var(--theme-text-muted)' }}>—</span>
              <input type="date" className="inv-input inv-input-sm" value={srEnd} onChange={e => setSrEnd(e.target.value)} />
              <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                {[
                  { id:'month',   label:'هذا الشهر' },
                  { id:'3months', label:'آخر 3 أشهر' },
                  { id:'year',    label:'هذه السنة' },
                  { id:'all',     label:'الكل' },
                ].map(p => (
                  <button key={p.id} className="inv-btn inv-btn-ghost inv-btn-sm" style={{ fontSize:'0.72rem', padding:'4px 10px' }} onClick={() => setStockPreset(p.id)}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end', alignItems:'center' }}>
              {stockSelectedItems.length === 0 && (
                <span style={{ fontSize:'0.78rem', color:'var(--theme-text-muted)', marginRight:'auto' }}>
                  {t('Select at least one item','اختر صنفاً واحداً على الأقل')}
                </span>
              )}
              <button className="inv-btn inv-btn-ghost inv-btn-sm" onClick={handleExportStockExcel} disabled={stockLoading || !stockSelectedItems.length}>
                <Download size={14} /> {t('Export Excel','تصدير Excel')}
              </button>
              <button className="inv-btn inv-btn-primary" onClick={handlePrintStockReport} disabled={stockLoading || !stockSelectedItems.length}>
                {stockLoading ? <RefreshCw size={14} className="inv-spin" /> : <FileText size={14} />}
                {stockLoading ? t('Preparing…','جارٍ التجهيز…') : t('Print Report','طباعة التقرير')}
              </button>
            </div>
          </div>
        )}

        {/* ── Results for existing reports ── */}
        {reportData && (
          <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }}>
            <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:12 }}>
              <button className="inv-btn inv-btn-ghost inv-btn-sm" onClick={exportExcel}>
                <Download size={14} /> {t('Export Excel','تصدير Excel')}
              </button>
            </div>

            {reportData.type === 'monthly' && (
              <div className="inv-table-wrap">
                <table className="inv-table">
                  <thead><tr>
                    <th>{t('Sport','الرياضة')}</th>
                    <th>{t('Issuance Orders','عدد أوامر الصرف')}</th>
                    <th>{t('Total Qty','إجمالي القطع')}</th>
                    <th>{t('Top Items','أبرز الأصناف')}</th>
                  </tr></thead>
                  <tbody>
                    {reportData.rows.map(r => (
                      <tr key={r.sportId} className="inv-table-row">
                        <td>{r.sport}</td>
                        <td style={{ textAlign:'center', fontWeight:700 }}>{r.orders}</td>
                        <td style={{ textAlign:'center', fontWeight:700, color:'var(--theme-accent)' }}>{r.totalQty}</td>
                        <td style={{ fontSize:'0.78rem', color:'var(--theme-text-muted)' }}>{r.topItems}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {reportData.type === 'lowstock' && (
              <div className="inv-table-wrap">
                <table className="inv-table">
                  <thead><tr>
                    <th>{t('Item','الصنف')}</th>
                    <th>{t('Sport','الرياضة')}</th>
                    <th>{t('Current Stock','المخزون الحالي')}</th>
                    <th>{t('Min Threshold','الحد الأدنى')}</th>
                    <th>{t('Difference','الفرق')}</th>
                  </tr></thead>
                  <tbody>
                    {reportData.rows.map((r,i) => (
                      <tr key={i} className="inv-table-row">
                        <td><div className="inv-name-cell"><div className="inv-name-ar">{r.nameAr}</div><div className="inv-name-en">{r.nameEn}</div></div></td>
                        <td>{r.sport}</td>
                        <td style={{ textAlign:'center', fontWeight:700, color: r.currentStock === 0 ? '#de4a41' : '#d4a008' }}>{r.currentStock}</td>
                        <td style={{ textAlign:'center', color:'var(--theme-text-muted)' }}>{r.minThreshold}</td>
                        <td style={{ textAlign:'center', fontWeight:700, color:'#de4a41' }}>{r.diff}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {reportData.type === 'summary' && (
              <div className="inv-table-wrap">
                <table className="inv-table">
                  <thead><tr>
                    <th>{t('Item','الصنف')}</th>
                    <th>SKU</th>
                    <th style={{ color:'#2c9c5c' }}>{t('Stock In','وارد')}</th>
                    <th style={{ color:'#de4a41' }}>{t('Stock Out','صادر')}</th>
                    <th>{t('Net','صافي')}</th>
                  </tr></thead>
                  <tbody>
                    {reportData.rows.map((r,i) => (
                      <tr key={i} className="inv-table-row">
                        <td><div className="inv-name-cell"><div className="inv-name-ar">{r.nameAr}</div><div className="inv-name-en">{r.nameEn}</div></div></td>
                        <td><span className="inv-sku-badge">{r.sku}</span></td>
                        <td style={{ textAlign:'center', fontWeight:700, color:'#2c9c5c' }}>+{r.stockIn}</td>
                        <td style={{ textAlign:'center', fontWeight:700, color:'#de4a41' }}>-{r.stockOut}</td>
                        <td style={{ textAlign:'center', fontWeight:700 }}>{r.stockIn - r.stockOut}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  )
}
