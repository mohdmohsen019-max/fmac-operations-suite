import { motion } from 'framer-motion'
import { X, Plus, Minus, Printer } from 'lucide-react'
import { useLanguage } from '../../contexts/LanguageContext'
import { getSportLabel, getItemStatus, DEFAULT_SPORTS } from './shared'

export default function ScanPopup({ item, settings, onClose, onStockIn, onIssue, onBarcode }) {
  const { t, lang } = useLanguage()
  const sports = settings?.sports || DEFAULT_SPORTS
  const status = getItemStatus(item)

  const statusColor = status === 'out' ? '#f43f5e' : status === 'low' ? '#f59e0b' : '#10b981'
  const statusLabel = status === 'out'
    ? t('Out of Stock', 'نفذ')
    : status === 'low'
    ? t('Low Stock', 'منخفض')
    : t('Available', 'متوفر')

  return (
    <motion.div
      className="inv-scan-popup-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="inv-scan-popup"
        initial={{ scale: 0.88, opacity: 0, y: -20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.88, opacity: 0, y: -20 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        onClick={e => e.stopPropagation()}
      >
        <button className="inv-scan-popup-close" onClick={onClose}><X size={16} /></button>

        <div className="inv-scan-popup-sku">{item.sku || item.barcode}</div>
        <div className="inv-scan-popup-name-ar">{item.nameAr}</div>
        <div className="inv-scan-popup-name-en">{item.nameEn}</div>
        <div className="inv-scan-popup-meta">
          {getSportLabel(item.sport, lang, sports)}
          {item.size ? ` · ${item.size}` : ''}
        </div>

        <div className="inv-scan-popup-stock">
          <span className="inv-scan-stock-num" style={{ color: statusColor }}>{item.currentStock}</span>
          <span className="inv-scan-stock-status" style={{ color: statusColor }}>{statusLabel}</span>
        </div>

        <div className="inv-scan-popup-actions">
          <button className="inv-btn inv-btn-primary" onClick={() => { onClose(); onStockIn(item) }}>
            <Plus size={14} /> {t('Stock In', 'إضافة مخزون')}
          </button>
          <button
            className="inv-btn inv-btn-accent"
            disabled={item.currentStock === 0}
            onClick={() => { onClose(); onIssue(item) }}
          >
            <Minus size={14} /> {t('Issue Out', 'صرف')}
          </button>
          <button className="inv-btn inv-btn-ghost" onClick={() => { onClose(); onBarcode(item) }}>
            <Printer size={14} /> {t('Barcode', 'باركود')}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
