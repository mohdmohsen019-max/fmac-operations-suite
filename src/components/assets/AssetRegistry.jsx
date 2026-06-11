import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, Filter, X, ChevronRight, Pencil, Printer, ScanLine, Building2,
} from 'lucide-react'
import { db } from '../../firebase'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import CustomSelect from '../CustomSelect'
import {
  ASSET_STATUSES, STATUS_META, statusLabel, roomLabel, fmtDate, logAudit,
} from './shared'

function StatusBadge({ status, lang }) {
  const m = STATUS_META[status] || STATUS_META.Active
  return (
    <span className="ast-badge" style={{ color: m.color, background: m.bg, borderColor: m.border }}>
      {statusLabel(status, lang)}
    </span>
  )
}

export default function AssetRegistry({
  assets, rooms, canManage, lang, t, isRTL,
  actorUid, actorName,
  onOpenDetail, onOpenEdit, onOpenBarcode,
  roomFilter, setRoomFilter,
}) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [type, setType] = useState('all')
  const [status, setStatus] = useState('all')
  const [assignment, setAssignment] = useState('all')
  const [filtersOpen, setFiltersOpen] = useState(false)

  const categories = useMemo(
    () => [...new Set(assets.map(a => a.category).filter(Boolean))].sort(),
    [assets]
  )
  const types = useMemo(
    () => [...new Set(assets.map(a => a.type).filter(Boolean))].sort(),
    [assets]
  )

  const roomById = useMemo(() => Object.fromEntries(rooms.map(r => [r.id, r])), [rooms])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return assets.filter(a => {
      if (q) {
        const hay = `${a.name_en || ''} ${a.name_ar || ''} ${a.sku || ''} ${a.barcode || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (roomFilter !== 'all' && a.location_room !== roomFilter) return false
      if (category !== 'all' && a.category !== category) return false
      if (type !== 'all' && a.type !== type) return false
      if (status !== 'all' && a.status !== status) return false
      if (assignment === 'assigned' && !(a.assigned_to || '').trim()) return false
      if (assignment === 'unassigned' && (a.assigned_to || '').trim()) return false
      return true
    })
  }, [assets, search, roomFilter, category, type, status, assignment])

  const activeFilterCount =
    (roomFilter !== 'all' ? 1 : 0) + (category !== 'all' ? 1 : 0) +
    (type !== 'all' ? 1 : 0) + (status !== 'all' ? 1 : 0) + (assignment !== 'all' ? 1 : 0)

  const clearAll = () => {
    setRoomFilter('all'); setCategory('all'); setType('all'); setStatus('all'); setAssignment('all')
  }

  // Quick inline status change (manager only).
  const quickStatus = async (asset, newStatus) => {
    if (newStatus === asset.status) return
    try {
      await updateDoc(doc(db, 'assets', asset.id), {
        status: newStatus, last_updated: serverTimestamp(), last_updated_by: actorUid,
      })
      await logAudit({
        asset_id: asset.id, asset_name_en: asset.name_en,
        changed_by: actorUid, changed_by_name: actorName,
        change_type: 'status_change', previous_value: asset.status, new_value: newStatus,
      })
    } catch (e) { console.error('[assets] quick status failed:', e) }
  }

  const FilterControls = (
    <>
      <div className="ast-filter-group">
        <label>{t('Room', 'الغرفة')}</label>
        <CustomSelect value={roomFilter} onChange={setRoomFilter}
          options={[{ value: 'all', label: t('All Rooms', 'كل الغرف') }, ...rooms.map(r => ({ value: r.id, label: roomLabel(r, lang) }))]} />
      </div>
      <div className="ast-filter-group">
        <label>{t('Category', 'الفئة')}</label>
        <CustomSelect value={category} onChange={setCategory}
          options={[{ value: 'all', label: t('All Categories', 'كل الفئات') }, ...categories.map(c => ({ value: c, label: c }))]} />
      </div>
      <div className="ast-filter-group">
        <label>{t('Type', 'النوع')}</label>
        <CustomSelect value={type} onChange={setType}
          options={[{ value: 'all', label: t('All Types', 'كل الأنواع') }, ...types.map(ty => ({ value: ty, label: ty }))]} />
      </div>
      <div className="ast-filter-group">
        <label>{t('Status', 'الحالة')}</label>
        <CustomSelect value={status} onChange={setStatus}
          options={[{ value: 'all', label: t('All Statuses', 'كل الحالات') }, ...ASSET_STATUSES.map(s => ({ value: s, label: statusLabel(s, lang) }))]} />
      </div>
      <div className="ast-filter-group">
        <label>{t('Assignment', 'التعيين')}</label>
        <CustomSelect value={assignment} onChange={setAssignment}
          options={[
            { value: 'all', label: t('All', 'الكل') },
            { value: 'assigned', label: t('Assigned', 'مُعيَّن') },
            { value: 'unassigned', label: t('Unassigned', 'غير مُعيَّن') },
          ]} />
      </div>
      {activeFilterCount > 0 && (
        <button className="ast-btn ast-btn-ghost ast-btn-sm" onClick={clearAll}>
          <X size={13} /> {t('Clear filters', 'مسح الفلاتر')}
        </button>
      )}
    </>
  )

  return (
    <div className="ast-page">
      {/* Search + scan hint */}
      <div className="ast-toolbar">
        <div className="ast-search-wrap">
          <Search size={16} className="ast-search-icon" />
          <input
            className="ast-search-input"
            placeholder={t('Search by name, SKU, or barcode…', 'ابحث بالاسم أو SKU أو الباركود…')}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="ast-search-clear" onClick={() => setSearch('')}><X size={14} /></button>
          )}
        </div>
        <div className="ast-scan-hint" title={t('USB scanner ready — scan a barcode to open an asset', 'الماسح جاهز — امسح باركود لفتح الأصل')}>
          <ScanLine size={15} /> <span>{t('Scan ready', 'جاهز للمسح')}</span>
        </div>
        <button className="ast-filter-toggle" onClick={() => setFiltersOpen(true)}>
          <Filter size={15} /> {t('Filter', 'تصفية')}
          {activeFilterCount > 0 && <span className="ast-filter-count">{activeFilterCount}</span>}
        </button>
      </div>

      {/* Desktop inline filter bar */}
      <div className="ast-filter-bar">{FilterControls}</div>

      {/* Mobile filter bottom sheet */}
      <AnimatePresence>
        {filtersOpen && (
          <>
            <motion.div className="ast-sheet-backdrop"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setFiltersOpen(false)} />
            <motion.div className="ast-sheet"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}>
              <div className="ast-sheet-header">
                <h3>{t('Filters', 'الفلاتر')}</h3>
                <button onClick={() => setFiltersOpen(false)}><X size={18} /></button>
              </div>
              <div className="ast-sheet-body">{FilterControls}</div>
              <button className="ast-btn ast-btn-primary ast-sheet-apply" onClick={() => setFiltersOpen(false)}>
                {t('Show', 'عرض')} {filtered.length} {t('results', 'نتيجة')}
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="ast-result-count">
        {filtered.length} {t('of', 'من')} {assets.length} {t('assets', 'أصل')}
      </div>

      {filtered.length === 0 ? (
        <div className="ast-empty">
          <Building2 size={42} strokeWidth={1} />
          <p>{assets.length === 0
            ? t('No assets registered yet.', 'لا توجد أصول مسجلة بعد.')
            : t('No assets match your filters.', 'لا توجد أصول تطابق الفلاتر.')}</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="ast-table-wrap ast-desktop-only">
            <table className="ast-table">
              <thead>
                <tr>
                  <th>{t('Barcode', 'الباركود')}</th>
                  <th>{t('Name (EN)', 'الاسم (إنجليزي)')}</th>
                  <th>{t('Name (AR)', 'الاسم (عربي)')}</th>
                  <th>{t('Category', 'الفئة')}</th>
                  <th>{t('Type', 'النوع')}</th>
                  <th>{t('Room', 'الغرفة')}</th>
                  <th>{t('Assigned To', 'مُعيَّن إلى')}</th>
                  <th>{t('Status', 'الحالة')}</th>
                  <th>{t('Last Updated', 'آخر تحديث')}</th>
                  {canManage && <th>{t('Actions', 'إجراءات')}</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(a => (
                  <tr key={a.id} onClick={() => onOpenDetail(a)} className="ast-row">
                    <td className="ast-mono">{a.barcode || '—'}</td>
                    <td className="ast-strong">{a.name_en || '—'}</td>
                    <td dir="rtl" style={{ fontFamily: "'Tajawal', sans-serif" }}>{a.name_ar || '—'}</td>
                    <td>{a.category || '—'}</td>
                    <td>{a.type || '—'}</td>
                    <td>{roomLabel(roomById[a.location_room], lang)}</td>
                    <td>{a.assigned_to || <span className="ast-muted">{t('Unassigned', 'غير مُعيَّن')}</span>}</td>
                    <td><StatusBadge status={a.status} lang={lang} /></td>
                    <td className="ast-muted">{fmtDate(a.last_updated)}</td>
                    {canManage && (
                      <td onClick={e => e.stopPropagation()}>
                        <div className="ast-row-actions">
                          <div style={{ minWidth: 130 }}>
                            <CustomSelect
                              className="cs-sm"
                              value={a.status}
                              onChange={(v) => quickStatus(a, v)}
                              options={ASSET_STATUSES.map(s => ({ value: s, label: statusLabel(s, lang) }))}
                              ariaLabel={t('Quick status change', 'تغيير سريع للحالة')}
                            />
                          </div>
                          <button className="ast-icon-btn" onClick={() => onOpenEdit(a)} title={t('Edit', 'تعديل')}>
                            <Pencil size={14} />
                          </button>
                          <button className="ast-icon-btn" onClick={() => onOpenBarcode(a)} title={t('Print Label', 'طباعة ملصق')}>
                            <Printer size={14} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="ast-card-list ast-mobile-only">
            {filtered.map(a => (
              <button key={a.id} className="ast-asset-card" onClick={() => onOpenDetail(a)}>
                <div className="ast-asset-card-main">
                  <span className="ast-asset-card-name">{lang === 'ar' ? (a.name_ar || a.name_en) : (a.name_en || a.name_ar)}</span>
                  <span className="ast-asset-card-meta">
                    {roomLabel(roomById[a.location_room], lang)}
                    {a.barcode ? ` · ${a.barcode}` : ''}
                  </span>
                </div>
                <StatusBadge status={a.status} lang={lang} />
                <ChevronRight size={16} className="ast-asset-card-chevron" />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
