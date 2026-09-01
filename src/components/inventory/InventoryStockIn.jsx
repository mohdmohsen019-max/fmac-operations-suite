import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Trash2, Check, Search, RefreshCw, ShieldAlert
} from 'lucide-react'
import { useLanguage } from '../../contexts/LanguageContext'
import { usePermissions } from '../../hooks/usePermissions'
import { DEFAULT_SPORTS } from './shared'
import CustomSelect from '../CustomSelect'
import InventoryEvidencePicker from './InventoryEvidencePicker'
import { submitInventoryRequest } from './inventoryApprovalService'

function ItemSearchRow({ items, lang, sports, onSelect }) {
  const { t } = useLanguage()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)

  const results = q.length >= 2
    ? items.filter(i => {
        const hay = [i.nameAr, i.nameEn, i.sku, i.barcode].filter(Boolean).join(' ').toLowerCase()
        return hay.includes(q.toLowerCase())
      }).slice(0, 6)
    : []

  return (
    <div style={{ position: 'relative' }}>
      <div className="inv-search-wrap" style={{ marginBottom: 0 }}>
        <Search size={14} className="inv-search-icon" />
        <input
          className="inv-search"
          placeholder={t('Search item…', 'ابحث عن صنف…')}
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
      </div>
      {open && results.length > 0 && (
        <div className="inv-search-dropdown">
          {results.map(item => (
            <button
              key={item.id}
              className="inv-search-option"
              onMouseDown={() => { onSelect(item); setQ(''); setOpen(false) }}
            >
              <div className="inv-search-opt-name">{lang === 'ar' ? item.nameAr : item.nameEn}</div>
              <div className="inv-search-opt-meta">
                {item.sku} · {t('Stock', 'مخزون')}: {item.currentStock}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function QuickAddTab({ items, settings }) {
  const { t, lang } = useLanguage()
  const { can, userProfile } = usePermissions()
  const [selectedItem, setSelectedItem] = useState(null)
  const [qty, setQty] = useState(1)
  const [reason, setReason] = useState('purchase')
  const [deliveryRef, setDeliveryRef] = useState('')
  const [notes, setNotes] = useState('')
  const [evidenceFiles, setEvidenceFiles] = useState([])
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [permError, setPermError] = useState('')

  const sports = settings?.sports || DEFAULT_SPORTS
  const handleSubmit = async () => {
    if (!can('inventory', 'edit')) {
      setPermError(lang === 'ar' ? 'ليس لديك صلاحية إضافة مخزون' : 'You do not have permission to add stock')
      return
    }
    if (!selectedItem || qty < 1) return
    setPermError('')
    setSaving(true)
    try {
      await submitInventoryRequest({
        type: 'stock_in',
        items: [{
          itemId: selectedItem.id,
          itemNameAr: selectedItem.nameAr,
          itemNameEn: selectedItem.nameEn,
          itemSku: selectedItem.sku,
          size: selectedItem.size || null,
          quantity: qty,
          reason,
        }],
        details: { reason, deliveryNoteRef: deliveryRef || null, supplierId: null },
        notes,
      }, evidenceFiles, userProfile)
      setSuccess(true)
      setSelectedItem(null)
      setQty(1)
      setDeliveryRef('')
      setNotes('')
      setEvidenceFiles([])
      setTimeout(() => setSuccess(false), 2500)
    } catch (err) {
      console.error(err)
      setPermError(err.message || t('Could not submit the request.', 'تعذر تقديم الطلب.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="inv-form-section">
      <div className="inv-form-row">
        <label className="inv-label">{t('Item', 'الصنف')} *</label>
        {selectedItem ? (
          <div className="inv-selected-item">
            <div>
              <div className="inv-si-name">{lang === 'ar' ? selectedItem.nameAr : selectedItem.nameEn}</div>
              <div className="inv-si-meta">{selectedItem.sku} · {t('Current Stock', 'المخزون الحالي')}: {selectedItem.currentStock}</div>
            </div>
            <button className="inv-icon-btn" onClick={() => setSelectedItem(null)}><Trash2 size={14} /></button>
          </div>
        ) : (
          <ItemSearchRow items={items} lang={lang} sports={sports} onSelect={setSelectedItem} />
        )}
      </div>

      <div className="inv-form-row">
        <label className="inv-label">{t('Quantity', 'الكمية')} *</label>
        <div className="inv-qty-row">
          <button className="inv-qty-btn" onClick={() => setQty(q => Math.max(1, q - 1))}>−</button>
          <input
            className="inv-qty-input"
            type="number" min={1}
            value={qty}
            onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
          />
          <button className="inv-qty-btn" onClick={() => setQty(q => q + 1)}>+</button>
        </div>
      </div>

      <InventoryEvidencePicker
        files={evidenceFiles}
        onChange={setEvidenceFiles}
        title={t('Receiving evidence', 'إثبات الاستلام')}
        description={t('Attach the delivery note, invoice or other proof that this stock was received.', 'أرفق وصل التسليم أو الفاتورة أو أي إثبات آخر على استلام المخزون.')}
      />

      <div className="inv-form-row">
        <label className="inv-label">{t('Reason', 'السبب')}</label>
        <CustomSelect value={reason} onChange={setReason}
          options={[
            { value: 'purchase', label: t('Purchase', 'شراء') },
            { value: 'return', label: t('Return', 'إرجاع') },
            { value: 'transfer', label: t('Transfer', 'نقل') },
            { value: 'other', label: t('Other', 'أخرى') },
          ]} />
      </div>

      <div className="inv-form-row">
        <label className="inv-label">{t('Delivery Note Ref.', 'مرجع وصل التسليم')}</label>
        <input
          className="inv-input"
          placeholder={t('Optional', 'اختياري')}
          value={deliveryRef}
          onChange={e => setDeliveryRef(e.target.value)}
        />
      </div>

      <div className="inv-form-row">
        <label className="inv-label">{t('Notes', 'ملاحظات')}</label>
        <textarea
          className="inv-textarea"
          rows={2}
          placeholder={t('Optional', 'اختياري')}
          value={notes}
          onChange={e => setNotes(e.target.value)}
        />
      </div>

      <div className="inv-form-actions">
        {permError && <div className="inv-error-msg">{permError}</div>}
        {success && (
          <motion.span
            className="inv-success-msg"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <Check size={14} /> {t('Request submitted for approval', 'تم تقديم الطلب للاعتماد')}
          </motion.span>
        )}
        <button
          className="inv-btn inv-btn-primary"
          disabled={!selectedItem || qty < 1 || saving}
          onClick={handleSubmit}
        >
          {saving ? <RefreshCw size={15} className="inv-spin" /> : <Plus size={15} />}
          {t('Submit stock-in request', 'تقديم طلب إضافة المخزون')}
        </button>
      </div>
    </div>
  )
}

function BatchReceiveTab({ items, settings }) {
  const { t, lang } = useLanguage()
  const { can, userProfile } = usePermissions()
  const [rows, setRows] = useState([])
  const [deliveryRef, setDeliveryRef] = useState('')
  const [notes, setNotes] = useState('')
  const [evidenceFiles, setEvidenceFiles] = useState([])
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [permError, setPermError] = useState('')

  const sports = settings?.sports || DEFAULT_SPORTS

  const addRow = (item) => {
    if (rows.find(r => r.item.id === item.id)) return
    setRows(prev => [...prev, { item, qty: 1, reason: 'purchase' }])
  }

  const updateRow = (idx, field, val) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: val } : r))
  }

  const removeRow = (idx) => setRows(prev => prev.filter((_, i) => i !== idx))

  const handleConfirm = async () => {
    if (!can('inventory', 'edit')) {
      setPermError(lang === 'ar' ? 'ليس لديك صلاحية إضافة مخزون' : 'You do not have permission to add stock')
      return
    }
    if (rows.length === 0) return
    setPermError('')
    setSaving(true)
    try {
      await submitInventoryRequest({
        type: 'stock_in',
        items: rows.map((row) => ({
          itemId: row.item.id,
          itemNameAr: row.item.nameAr,
          itemNameEn: row.item.nameEn,
          itemSku: row.item.sku,
          size: row.item.size || null,
          quantity: row.qty,
          reason: row.reason,
        })),
        details: { deliveryNoteRef: deliveryRef || null, supplierId: null },
        notes,
      }, evidenceFiles, userProfile)
      setRows([])
      setDeliveryRef('')
      setNotes('')
      setEvidenceFiles([])
      setSuccess(true)
      setTimeout(() => setSuccess(false), 2500)
    } catch (err) {
      console.error(err)
      setPermError(err.message || t('Could not submit the request.', 'تعذر تقديم الطلب.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="inv-form-section">
      <div className="inv-batch-header">
        <div>
          <div className="inv-form-subtitle">{t('Batch Receive', 'استلام دفعة')}</div>
          <div className="inv-form-desc">{t('Add multiple items at once with one delivery reference.', 'أضف عدة أصناف دفعة واحدة بمرجع تسليم واحد.')}</div>
        </div>
      </div>

      <ItemSearchRow items={items} lang={lang} sports={sports} onSelect={addRow} />

      {rows.length > 0 && (
        <div className="inv-batch-table">
          <table className="inv-table inv-table-compact">
            <thead>
              <tr>
                <th>{t('Item', 'الصنف')}</th>
                <th>{t('Qty', 'كمية')}</th>
                <th>{t('Reason', 'السبب')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={r.item.id}>
                  <td>
                    <div className="inv-name-cell">
                      <div className="inv-name-ar">{r.item.nameAr}</div>
                      <div className="inv-name-en">{r.item.sku}</div>
                    </div>
                  </td>
                  <td>
                    <input
                      className="inv-qty-input inv-qty-inline"
                      type="number" min={1}
                      value={r.qty}
                      onChange={e => updateRow(idx, 'qty', Math.max(1, parseInt(e.target.value) || 1))}
                    />
                  </td>
                  <td>
                    <div style={{ minWidth: 120 }}>
                      <CustomSelect className="cs-sm" value={r.reason} onChange={(v) => updateRow(idx, 'reason', v)}
                        options={[
                          { value: 'purchase', label: t('Purchase', 'شراء') },
                          { value: 'return', label: t('Return', 'إرجاع') },
                          { value: 'transfer', label: t('Transfer', 'نقل') },
                          { value: 'other', label: t('Other', 'أخرى') },
                        ]} />
                    </div>
                  </td>
                  <td>
                    <button className="inv-icon-btn inv-icon-btn-danger" onClick={() => removeRow(idx)}>
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="inv-form-row">
        <label className="inv-label">{t('Delivery Note Ref.', 'مرجع وصل التسليم')}</label>
        <input
          className="inv-input"
          placeholder={t('Optional – applies to all items', 'اختياري – يطبق على الكل')}
          value={deliveryRef}
          onChange={e => setDeliveryRef(e.target.value)}
        />
      </div>

      <InventoryEvidencePicker
        files={evidenceFiles}
        onChange={setEvidenceFiles}
        title={t('Receiving evidence', 'إثبات الاستلام')}
        description={t('One delivery note, invoice or receiving document may support the whole batch.', 'يمكن لوصل تسليم أو فاتورة أو مستند استلام واحد أن يدعم الدفعة كاملة.')}
      />

      <div className="inv-form-row">
        <label className="inv-label">{t('Notes', 'ملاحظات')}</label>
        <textarea className="inv-textarea" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
      </div>

      <div className="inv-form-actions">
        {permError && <div className="inv-error-msg">{permError}</div>}
        {success && (
          <motion.span className="inv-success-msg" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Check size={14} /> {t('Batch request submitted', 'تم تقديم طلب الدفعة')}
          </motion.span>
        )}
        <button
          className="inv-btn inv-btn-primary"
          disabled={rows.length === 0 || saving}
          onClick={handleConfirm}
        >
          {saving ? <RefreshCw size={15} className="inv-spin" /> : <Check size={15} />}
          {t('Submit batch request', 'تقديم طلب الدفعة')} ({rows.length})
        </button>
      </div>
    </div>
  )
}

export default function InventoryStockIn({ items, settings, canRequest }) {
  const { t } = useLanguage()
  const [method, setMethod] = useState('quick')

  if (!canRequest) {
    return (
      <div className="inv-workflow-guard">
        <ShieldAlert size={28} />
        <strong>{t('Stock-in requests are initiated by the Warehouse/Store Manager.', 'يتم تقديم طلبات إضافة المخزون من مدير المخزن.')}</strong>
        <span>{t('Use the Approvals tab to review requests assigned to your role.', 'استخدم تبويب الاعتمادات لمراجعة الطلبات المسندة إلى دورك.')}</span>
      </div>
    )
  }

  return (
    <div className="inv-stockin">
      <div className="inv-method-tabs">
        <button
          className={`inv-method-tab ${method === 'quick' ? 'active' : ''}`}
          onClick={() => setMethod('quick')}
        >
          {t('Quick Add', 'إضافة سريعة')}
        </button>
        <button
          className={`inv-method-tab ${method === 'batch' ? 'active' : ''}`}
          onClick={() => setMethod('batch')}
        >
          {t('Batch Receive', 'استلام دفعة')}
        </button>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={method}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
        >
          {method === 'quick'
            ? <QuickAddTab items={items} settings={settings} />
            : <BatchReceiveTab items={items} settings={settings} />
          }
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
