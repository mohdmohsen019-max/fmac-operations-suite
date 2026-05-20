import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowUpRight, ArrowDownRight, RefreshCw, Download, Filter
} from 'lucide-react'
import { db } from '../../firebase'
import {
  collection, query, where, orderBy, getDocs, Timestamp, limit
} from 'firebase/firestore'
import { useLanguage } from '../../contexts/LanguageContext'
import { getSportLabel, fmtDateTime, DEFAULT_SPORTS } from './shared'
import * as XLSX from 'xlsx'

const PAGE_SIZE = 50

export default function InventoryHistory({ items, settings }) {
  const { t, lang } = useLanguage()
  const [movements, setMovements] = useState([])
  const [loading, setLoading] = useState(false)
  const [preset, setPreset] = useState('month')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [filterSport, setFilterSport] = useState('all')
  const [filterItem, setFilterItem] = useState('')

  const sports = settings?.sports || DEFAULT_SPORTS

  const getDateRange = useCallback(() => {
    const now = new Date()
    if (preset === 'today') {
      const s = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      return { start: s, end: now }
    }
    if (preset === 'week') {
      const day = now.getDay()
      const s = new Date(now)
      s.setDate(now.getDate() - day)
      s.setHours(0, 0, 0, 0)
      return { start: s, end: now }
    }
    if (preset === 'month') {
      const s = new Date(now.getFullYear(), now.getMonth(), 1)
      return { start: s, end: now }
    }
    if (preset === 'custom' && customStart && customEnd) {
      return { start: new Date(customStart), end: new Date(customEnd + 'T23:59:59') }
    }
    const s = new Date(now.getFullYear(), now.getMonth(), 1)
    return { start: s, end: now }
  }, [preset, customStart, customEnd])

  const loadMovements = useCallback(async () => {
    setLoading(true)
    try {
      const { start, end } = getDateRange()
      let q = query(
        collection(db, 'inventory_movements'),
        where('createdAt', '>=', Timestamp.fromDate(start)),
        where('createdAt', '<=', Timestamp.fromDate(end)),
        orderBy('createdAt', 'desc'),
        limit(PAGE_SIZE)
      )
      const snap = await getDocs(q)
      let data = snap.docs.map(d => ({ id: d.id, ...d.data() }))

      if (filterType !== 'all') {
        data = data.filter(m => m.type === filterType)
      }
      if (filterSport !== 'all') {
        data = data.filter(m => m.issuedTo?.sport === filterSport)
      }
      if (filterItem) {
        const q2 = filterItem.toLowerCase()
        data = data.filter(m =>
          (m.itemNameAr || '').toLowerCase().includes(q2) ||
          (m.itemNameEn || '').toLowerCase().includes(q2) ||
          (m.itemSku || '').toLowerCase().includes(q2)
        )
      }
      setMovements(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [getDateRange, filterType, filterSport, filterItem])

  useEffect(() => { loadMovements() }, [loadMovements])

  const exportExcel = () => {
    const rows = movements.map(m => ({
      Date: fmtDateTime(m.createdAt),
      Type: m.type === 'stock_in' ? 'In' : m.type === 'stock_out' ? 'Out' : 'Adj',
      'Item (AR)': m.itemNameAr,
      'Item (EN)': m.itemNameEn,
      SKU: m.itemSku,
      Qty: m.quantity,
      'Prev Stock': m.previousStock,
      'New Stock': m.newStock,
      Sport: m.issuedTo?.sport || '',
      Recipient: m.issuedTo?.personName || '',
      Reference: m.deliveryNoteRef || m.receiptId || '',
      By: m.performedByName,
      Notes: m.notes || '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Movements')
    XLSX.writeFile(wb, `inventory-movements-${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  const typeBadge = (type) => {
    if (type === 'stock_in')    return { icon: ArrowUpRight,    color: '#10b981', bg: 'rgba(16,185,129,0.1)',  label: t('In', 'وارد') }
    if (type === 'stock_out')   return { icon: ArrowDownRight,  color: '#f43f5e', bg: 'rgba(244,63,94,0.1)',  label: t('Out', 'صادر') }
    return { icon: RefreshCw, color: '#3b82f6', bg: 'rgba(59,130,246,0.1)', label: t('Adj', 'تسوية') }
  }

  return (
    <div className="inv-history">
      <div className="inv-toolbar">
        <div className="inv-filters" style={{ flexWrap: 'wrap', gap: 8 }}>
          {/* Presets */}
          <div className="inv-preset-tabs">
            {[
              { id: 'today',  label: t('Today', 'اليوم') },
              { id: 'week',   label: t('This Week', 'هذا الأسبوع') },
              { id: 'month',  label: t('This Month', 'هذا الشهر') },
              { id: 'custom', label: t('Custom', 'مخصص') },
            ].map(p => (
              <button
                key={p.id}
                className={`inv-preset-btn ${preset === p.id ? 'active' : ''}`}
                onClick={() => setPreset(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>

          {preset === 'custom' && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="date" className="inv-input inv-input-sm" value={customStart} onChange={e => setCustomStart(e.target.value)} />
              <span style={{ color: 'var(--theme-text-muted)' }}>—</span>
              <input type="date" className="inv-input inv-input-sm" value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
            </div>
          )}

          <select className="inv-select" value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="all">{t('All Types', 'كل الأنواع')}</option>
            <option value="stock_in">{t('Stock In', 'وارد')}</option>
            <option value="stock_out">{t('Stock Out', 'صادر')}</option>
            <option value="adjustment">{t('Adjustment', 'تسوية')}</option>
          </select>

          <select className="inv-select" value={filterSport} onChange={e => setFilterSport(e.target.value)}>
            <option value="all">{t('All Sports', 'كل الرياضات')}</option>
            {sports.map(s => (
              <option key={s.id} value={s.id}>{lang === 'ar' ? s.ar : s.en}</option>
            ))}
          </select>

          <input
            className="inv-search inv-input-sm"
            placeholder={t('Filter by item…', 'تصفية حسب الصنف…')}
            value={filterItem}
            onChange={e => setFilterItem(e.target.value)}
            style={{ maxWidth: 160 }}
          />
        </div>

        <div className="inv-toolbar-right">
          <button className="inv-btn inv-btn-ghost inv-btn-sm" onClick={exportExcel}>
            <Download size={14} /> {t('Export Excel', 'تصدير Excel')}
          </button>
        </div>
      </div>

      <div className="inv-results-count">
        {movements.length} {t('records', 'سجل')}
      </div>

      {loading ? (
        <div className="inv-loading-row"><RefreshCw size={20} className="inv-spin" /></div>
      ) : movements.length === 0 ? (
        <div className="inv-empty-state">
          <RefreshCw size={40} strokeWidth={1} style={{ color: 'var(--theme-text-ghost)' }} />
          <div>{t('No movements in this period', 'لا توجد حركات في هذه الفترة')}</div>
        </div>
      ) : (
        <div className="inv-table-wrap">
          <table className="inv-table">
            <thead>
              <tr>
                <th>{t('Date', 'التاريخ')}</th>
                <th>{t('Type', 'النوع')}</th>
                <th>{t('Item', 'الصنف')}</th>
                <th>{t('Qty', 'الكمية')}</th>
                <th>{t('Sport', 'الرياضة')}</th>
                <th>{t('Recipient', 'المستلم')}</th>
                <th>{t('Reference', 'المرجع')}</th>
                <th>{t('By', 'بواسطة')}</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((mv, idx) => {
                const bd = typeBadge(mv.type)
                const Icon = bd.icon
                return (
                  <motion.tr
                    key={mv.id}
                    className="inv-table-row"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: idx * 0.015 }}
                  >
                    <td style={{ fontSize: '0.78rem', color: 'var(--theme-text-muted)', whiteSpace: 'nowrap' }}>
                      {fmtDateTime(mv.createdAt)}
                    </td>
                    <td>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '2px 8px', borderRadius: 99,
                        fontSize: '0.72rem', fontWeight: 700,
                        color: bd.color, background: bd.bg,
                      }}>
                        <Icon size={11} strokeWidth={2.5} />
                        {bd.label}
                      </span>
                    </td>
                    <td>
                      <div className="inv-name-cell">
                        <div className="inv-name-ar">{mv.itemNameAr}</div>
                        <div className="inv-name-en">{mv.itemSku}</div>
                      </div>
                    </td>
                    <td>
                      <span style={{ fontWeight: 700, color: bd.color }}>
                        {mv.type === 'stock_in' ? '+' : mv.type === 'stock_out' ? '-' : '±'}{mv.quantity}
                      </span>
                    </td>
                    <td>{mv.issuedTo ? getSportLabel(mv.issuedTo.sport, lang, sports) : '—'}</td>
                    <td style={{ color: 'var(--theme-text-muted)' }}>
                      {mv.issuedTo?.personName || '—'}
                    </td>
                    <td style={{ fontSize: '0.75rem', color: 'var(--theme-text-muted)' }}>
                      {mv.deliveryNoteRef || mv.receiptId?.slice(0, 8) || '—'}
                    </td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--theme-text-muted)' }}>
                      {mv.performedByName}
                    </td>
                  </motion.tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
