import { useState, useMemo, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, Filter, Grid, List, Printer, Edit2, History,
  Zap, ZapOff, CheckSquare, Square, Package, Download
} from 'lucide-react'
import { useLanguage } from '../../contexts/LanguageContext'
import { getItemStatus, getSportLabel, getCatLabel } from './shared'
import CustomSelect from '../CustomSelect'
import exportCsv from '../../utils/exportCsv'

function StatusBadge({ status, t }) {
  const cfg = {
    ok:  { label: t('Available', 'متوفر'),  color: 'var(--status-safe)', bg: 'rgba(16,185,129,0.1)' },
    low: { label: t('Low',       'منخفض'),  color: 'var(--status-warn)', bg: 'rgba(245,158,11,0.1)' },
    out: { label: t('Out',       'نفذ'),    color: 'var(--status-risk)', bg: 'rgba(244,63,94,0.1)' },
  }
  const c = cfg[status] || cfg.ok
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 99,
      fontSize: '0.7rem', fontWeight: 700,
      color: c.color, background: c.bg,
    }}>
      {c.label}
    </span>
  )
}

export default function InventoryStock({
  items, settings, isAdmin, scanMode, setScanMode,
  onOpenBarcode, onEditItem, onViewHistory, selectedItems, setSelectedItems,
}) {
  const { t, lang } = useLanguage()
  const [search, setSearch] = useState(
    () => new URLSearchParams(window.location.search).get('q') || ''
  )
  const [filterCat, setFilterCat] = useState('all')
  const [filterSport, setFilterSport] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [viewMode, setViewMode] = useState('table')

  const sports = settings?.sports || []
  const categories = settings?.categories || []

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return items.filter(item => {
      if (filterCat !== 'all' && item.category !== filterCat) return false
      if (filterSport !== 'all' && item.sport !== filterSport) return false
      const st = getItemStatus(item)
      if (filterStatus !== 'all' && st !== filterStatus) return false
      if (q) {
        const haystack = [item.nameAr, item.nameEn, item.sku, item.barcode]
          .filter(Boolean).join(' ').toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [items, search, filterCat, filterSport, filterStatus])

  const exportItems = () => {
    exportCsv(
      `fmac-stock-${new Date().toISOString().slice(0, 10)}`,
      ['Name (EN)', 'Name (AR)', 'SKU', 'Barcode', 'Category', 'Sport', 'Current Stock', 'Min Threshold', 'Status'],
      filtered.map(i => [
        i.nameEn, i.nameAr, i.sku, i.barcode,
        getCatLabel(i.category, categories, lang), getSportLabel(i.sport, sports, lang),
        i.currentStock ?? 0, i.minThreshold ?? 5, getItemStatus(i),
      ])
    )
  }

  const toggleSelect = (id) => {
    setSelectedItems(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const toggleAll = () => {
    if (selectedItems.length === filtered.length) setSelectedItems([])
    else setSelectedItems(filtered.map(i => i.id))
  }

  const allSelected = filtered.length > 0 && selectedItems.length === filtered.length

  return (
    <div className="inv-stock">
      {/* Toolbar */}
      <div className="inv-toolbar">
        <div className="inv-search-wrap">
          <Search size={15} className="inv-search-icon" />
          <input
            className="inv-search"
            placeholder={t('Search items, SKU, barcode…', 'بحث في الأصناف، SKU، الباركود…')}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="inv-filters">
          <div style={{ minWidth: 150 }}>
            <CustomSelect value={filterCat} onChange={setFilterCat}
              options={[{ value: 'all', label: t('All Categories', 'كل الفئات') }, ...categories.map(c => ({ value: c.id, label: lang === 'ar' ? c.ar : c.en }))]} />
          </div>
          <div style={{ minWidth: 150 }}>
            <CustomSelect value={filterSport} onChange={setFilterSport}
              options={[{ value: 'all', label: t('All Sports', 'كل الرياضات') }, ...sports.map(s => ({ value: s.id, label: lang === 'ar' ? s.ar : s.en }))]} />
          </div>
          <div style={{ minWidth: 150 }}>
            <CustomSelect value={filterStatus} onChange={setFilterStatus}
              options={[
                { value: 'all', label: t('All Status', 'كل الحالات') },
                { value: 'ok', label: t('Available', 'متوفر') },
                { value: 'low', label: t('Low Stock', 'منخفض') },
                { value: 'out', label: t('Out of Stock', 'نفذ') },
              ]} />
          </div>
        </div>
        <div className="inv-toolbar-right">
          <button className="inv-btn inv-btn-ghost inv-btn-sm" onClick={exportItems}
            disabled={filtered.length === 0}
            title={t('Export the current view as CSV', 'تصدير العرض الحالي كملف CSV')}>
            <Download size={14} /> CSV
          </button>
          {selectedItems.length > 0 && (
            <button className="inv-btn inv-btn-ghost inv-btn-sm" onClick={() => {
              const sel = items.filter(i => selectedItems.includes(i.id))
              sel.forEach(item => onOpenBarcode(item))
            }}>
              <Printer size={14} /> {t('Print Selected', 'طباعة المحدد')} ({selectedItems.length})
            </button>
          )}
          <button
            className={`inv-btn inv-btn-sm ${scanMode ? 'inv-btn-accent' : 'inv-btn-ghost'}`}
            onClick={() => setScanMode(v => !v)}
            title={t('Scan Mode', 'وضع المسح')}
          >
            {scanMode ? <Zap size={14} /> : <ZapOff size={14} />}
            {scanMode ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className="inv-scan-dot" />
                {t('Scan Mode ON', 'وضع المسح مفعّل')}
              </span>
            ) : t('Scan Mode', 'وضع المسح')}
          </button>
          <div className="inv-view-toggle">
            <button
              className={`inv-view-btn ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => setViewMode('table')}
            ><List size={15} /></button>
            <button
              className={`inv-view-btn ${viewMode === 'card' ? 'active' : ''}`}
              onClick={() => setViewMode('card')}
            ><Grid size={15} /></button>
          </div>
        </div>
      </div>

      {/* Results count */}
      <div className="inv-results-count">
        {filtered.length} {t('items', 'صنف')}
        {search || filterCat !== 'all' || filterSport !== 'all' || filterStatus !== 'all'
          ? ` (${t('filtered', 'مفلتر')})`
          : ''}
      </div>

      {filtered.length === 0 ? (
        <div className="inv-empty-state">
          <Package size={48} strokeWidth={1} style={{ color: 'var(--theme-text-ghost)' }} />
          <div>{t('No items found', 'لا توجد أصناف')}</div>
        </div>
      ) : viewMode === 'table' ? (
        <div className="inv-table-wrap">
          <table className="inv-table">
            <thead>
              <tr>
                <th>
                  <button className="inv-checkbox-btn" onClick={toggleAll}>
                    {allSelected ? <CheckSquare size={15} /> : <Square size={15} />}
                  </button>
                </th>
                <th>{t('Barcode', 'الباركود')}</th>
                <th>{t('Name', 'الاسم')}</th>
                <th>{t('Sport', 'الرياضة')}</th>
                <th>{t('Category', 'الفئة')}</th>
                <th>{t('Size', 'المقاس')}</th>
                <th>{t('Stock', 'المخزون')}</th>
                <th>{t('Min', 'الحد')}</th>
                <th>{t('Status', 'الحالة')}</th>
                <th>{t('Actions', 'إجراءات')}</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {filtered.map((item, idx) => {
                  const st = getItemStatus(item)
                  const sel = selectedItems.includes(item.id)
                  return (
                    <motion.tr
                      key={item.id}
                      className={`inv-table-row ${sel ? 'selected' : ''}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: idx * 0.02 }}
                    >
                      <td>
                        <button className="inv-checkbox-btn" onClick={() => toggleSelect(item.id)}>
                          {sel ? <CheckSquare size={14} /> : <Square size={14} />}
                        </button>
                      </td>
                      <td><span className="inv-sku-badge">{item.barcode || item.sku}</span></td>
                      <td>
                        <div className="inv-name-cell">
                          <div className="inv-name-ar">{item.nameAr}</div>
                          <div className="inv-name-en">{item.nameEn}</div>
                        </div>
                      </td>
                      <td>{getSportLabel(item.sport, lang, sports)}</td>
                      <td>{getCatLabel(item.category, lang)}</td>
                      <td>{item.size || '—'}</td>
                      <td>
                        <span className="inv-stock-num" style={{
                          color: st === 'out' ? 'var(--status-risk)' : st === 'low' ? 'var(--status-warn)' : 'var(--theme-text-main)'
                        }}>
                          {item.currentStock}
                        </span>
                      </td>
                      <td style={{ color: 'var(--theme-text-muted)' }}>{item.minThreshold ?? 5}</td>
                      <td><StatusBadge status={st} t={t} /></td>
                      <td>
                        <div className="inv-row-actions">
                          <button className="inv-icon-btn" title={t('Print Barcode', 'طباعة الباركود')} onClick={() => onOpenBarcode(item)}>
                            <Printer size={14} />
                          </button>
                          {isAdmin && (
                            <button className="inv-icon-btn" title={t('Edit', 'تعديل')} onClick={() => onEditItem(item)}>
                              <Edit2 size={14} />
                            </button>
                          )}
                          <button className="inv-icon-btn" title={t('View History', 'عرض السجل')} onClick={() => onViewHistory(item)}>
                            <History size={14} />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  )
                })}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      ) : (
        /* Card View */
        <div className="inv-card-grid">
          {filtered.map(item => {
            const st = getItemStatus(item)
            return (
              <motion.div
                key={item.id}
                className="inv-item-card"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ y: -2 }}
              >
                <div className="inv-card-top">
                  <div className="inv-card-sport-tag">
                    {getSportLabel(item.sport, lang, sports)}
                  </div>
                  {item.size && <span className="inv-card-size-badge">{item.size}</span>}
                </div>
                <div className="inv-card-name-ar">{item.nameAr}</div>
                <div className="inv-card-name-en">{item.nameEn}</div>
                <div className="inv-card-sku">{item.sku}</div>
                <div className="inv-card-stock-row">
                  <span className="inv-card-stock-num" style={{
                    color: st === 'out' ? 'var(--status-risk)' : st === 'low' ? 'var(--status-warn)' : 'var(--status-safe)'
                  }}>
                    {item.currentStock}
                  </span>
                  <StatusBadge status={st} t={t} />
                </div>
                <div className="inv-card-actions">
                  <button className="inv-btn inv-btn-ghost inv-btn-xs" onClick={() => onOpenBarcode(item)}>
                    <Printer size={12} /> {t('Barcode', 'باركود')}
                  </button>
                  <button className="inv-btn inv-btn-ghost inv-btn-xs" onClick={() => onViewHistory(item)}>
                    <History size={12} />
                  </button>
                  {isAdmin && (
                    <button className="inv-btn inv-btn-ghost inv-btn-xs" onClick={() => onEditItem(item)}>
                      <Edit2 size={12} />
                    </button>
                  )}
                </div>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}
