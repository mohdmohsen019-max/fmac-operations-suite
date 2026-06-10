import { useState, useEffect, useMemo } from 'react'
import { Search, X, ScrollText, RefreshCw } from 'lucide-react'
import { db } from '../../firebase'
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore'
import { CHANGE_TYPE_META, changeTypeLabel, fmtDateTime, toMillis } from './shared'

export default function AssetAuditLog({ lang, t }) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  // Live listener, most-recent first. orderBy(timestamp) uses the automatic
  // single-field index; fallback sorts client-side if it isn't ready.
  useEffect(() => {
    const apply = (docs) => {
      setLogs(docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    }
    const unsub = onSnapshot(
      query(collection(db, 'asset_audit_log'), orderBy('timestamp', 'desc'), limit(500)),
      snap => apply(snap.docs),
      err => {
        console.warn('[assets] audit ordered query fallback:', err.code)
        const unsub2 = onSnapshot(collection(db, 'asset_audit_log'), snap => {
          const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => toMillis(b.timestamp) - toMillis(a.timestamp)).slice(0, 500)
          setLogs(rows); setLoading(false)
        }, e => { console.error('[assets] audit fallback failed:', e); setLoading(false) })
        return () => unsub2()
      }
    )
    return unsub
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const fromMs = fromDate ? new Date(fromDate + 'T00:00:00').getTime() : 0
    const toMs = toDate ? new Date(toDate + 'T23:59:59').getTime() : Infinity
    return logs.filter(l => {
      if (q && !(l.asset_name_en || '').toLowerCase().includes(q)) return false
      if (typeFilter !== 'all' && l.change_type !== typeFilter) return false
      const ms = toMillis(l.timestamp)
      if (ms && (ms < fromMs || ms > toMs)) return false
      return true
    })
  }, [logs, search, typeFilter, fromDate, toDate])

  const clearAll = () => { setSearch(''); setTypeFilter('all'); setFromDate(''); setToDate('') }
  const hasFilters = search || typeFilter !== 'all' || fromDate || toDate

  return (
    <div className="ast-page">
      <div className="ast-page-header">
        <div>
          <h2 className="ast-page-title">{t('Audit Log', 'سجل التغييرات')}</h2>
          <p className="ast-page-sub">{filtered.length} {t('events', 'حدث')}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="ast-audit-filters">
        <div className="ast-search-wrap">
          <Search size={16} className="ast-search-icon" />
          <input className="ast-search-input" placeholder={t('Search asset name…', 'ابحث باسم الأصل…')}
            value={search} onChange={e => setSearch(e.target.value)} />
          {search && <button className="ast-search-clear" onClick={() => setSearch('')}><X size={14} /></button>}
        </div>
        <select className="ast-select" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="all">{t('All change types', 'كل أنواع التغيير')}</option>
          {Object.keys(CHANGE_TYPE_META).map(k => <option key={k} value={k}>{changeTypeLabel(k, lang)}</option>)}
        </select>
        <input className="ast-select" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} title={t('From', 'من')} />
        <input className="ast-select" type="date" value={toDate} onChange={e => setToDate(e.target.value)} title={t('To', 'إلى')} />
        {hasFilters && <button className="ast-btn ast-btn-ghost ast-btn-sm" onClick={clearAll}><X size={13} /> {t('Clear', 'مسح')}</button>}
      </div>

      {loading ? (
        <div className="ast-loading"><RefreshCw size={22} className="ast-spin" style={{ color: 'var(--theme-accent)' }} /><span>{t('Loading…', 'جارٍ التحميل…')}</span></div>
      ) : filtered.length === 0 ? (
        <div className="ast-empty"><ScrollText size={42} strokeWidth={1} /><p>{t('No matching changes.', 'لا توجد تغييرات مطابقة.')}</p></div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="ast-table-wrap ast-desktop-only">
            <table className="ast-table">
              <thead>
                <tr>
                  <th>{t('Timestamp', 'الوقت')}</th>
                  <th>{t('Asset', 'الأصل')}</th>
                  <th>{t('Change Type', 'نوع التغيير')}</th>
                  <th>{t('Previous', 'السابق')}</th>
                  <th>{t('New', 'الجديد')}</th>
                  <th>{t('Changed By', 'بواسطة')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(l => (
                  <tr key={l.id}>
                    <td className="ast-muted ast-nowrap">{fmtDateTime(l.timestamp)}</td>
                    <td className="ast-strong">{l.asset_name_en || '—'}</td>
                    <td><span className="ast-type-chip">{changeTypeLabel(l.change_type, lang)}</span></td>
                    <td className="ast-muted">{l.previous_value || '—'}</td>
                    <td>{l.new_value || '—'}</td>
                    <td className="ast-muted">{l.changed_by_name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="ast-card-list ast-mobile-only">
            {filtered.map(l => (
              <div key={l.id} className="ast-audit-card">
                <div className="ast-audit-card-top">
                  <span className="ast-type-chip">{changeTypeLabel(l.change_type, lang)}</span>
                  <span className="ast-muted" style={{ fontSize: '0.72rem' }}>{fmtDateTime(l.timestamp)}</span>
                </div>
                <span className="ast-asset-card-name">{l.asset_name_en || '—'}</span>
                <span className="ast-audit-card-change">
                  {l.previous_value && l.previous_value !== l.new_value ? `${l.previous_value} → ${l.new_value}` : (l.new_value || '—')}
                </span>
                <span className="ast-muted" style={{ fontSize: '0.72rem' }}>{l.changed_by_name || '—'}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
