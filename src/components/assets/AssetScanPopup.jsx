import { motion } from 'framer-motion'
import { X, Eye, Pencil, Printer } from 'lucide-react'
import { useLanguage } from '../../contexts/LanguageContext'
import { STATUS_META, statusLabel, roomLabel } from './shared'

// Scan-result popup — the assets twin of inventory's ScanPopup: compact card
// with the scanned asset and quick actions, instead of jumping straight into
// the full detail modal.
export default function AssetScanPopup({ asset, rooms, canManage, onClose, onDetail, onEdit, onBarcode }) {
  const { t, lang } = useLanguage()
  const meta = STATUS_META[asset.status] || STATUS_META.Active
  const room = rooms.find(r => r.id === asset.location_room)

  return (
    <motion.div
      className="ast-scan-popup-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="ast-scan-popup"
        initial={{ scale: 0.88, opacity: 0, y: -20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.88, opacity: 0, y: -20 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        onClick={e => e.stopPropagation()}
      >
        <button className="ast-scan-popup-close" onClick={onClose}><X size={16} /></button>

        <div className="ast-scan-popup-sku">{asset.barcode || asset.sku}</div>
        <div className="ast-scan-popup-name-ar">{asset.name_ar || asset.name_en}</div>
        <div className="ast-scan-popup-name-en">{asset.name_en}</div>
        <div className="ast-scan-popup-meta">
          {[asset.category, room ? roomLabel(room, lang) : asset.department].filter(Boolean).join(' · ') || '—'}
        </div>

        <div className="ast-scan-popup-status">
          <span className="ast-badge" style={{ color: meta.color, background: meta.bg, borderColor: meta.border }}>
            {statusLabel(asset.status, lang)}
          </span>
          {(asset.assigned_to || '').trim() && (
            <span className="ast-scan-popup-assignee">{asset.assigned_to}</span>
          )}
        </div>

        <div className="ast-scan-popup-actions">
          <button className="ast-btn ast-btn-primary ast-btn-sm" onClick={() => { onClose(); onDetail(asset) }}>
            <Eye size={14} /> {t('Details', 'التفاصيل')}
          </button>
          {canManage && (
            <button className="ast-btn ast-btn-ghost ast-btn-sm" onClick={() => { onClose(); onEdit(asset) }}>
              <Pencil size={14} /> {t('Edit', 'تعديل')}
            </button>
          )}
          <button className="ast-btn ast-btn-ghost ast-btn-sm" onClick={() => { onClose(); onBarcode(asset) }}>
            <Printer size={14} /> {t('Barcode', 'باركود')}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
