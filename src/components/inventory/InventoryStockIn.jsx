import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Trash2, Check, Upload, Search, Package, RefreshCw
} from 'lucide-react'
import { db, auth } from '../../firebase'
import {
  collection, addDoc, updateDoc, doc, serverTimestamp,
  increment, query, where, getDocs
} from 'firebase/firestore'
import * as XLSX from 'xlsx'
import { useLanguage } from '../../contexts/LanguageContext'
import { usePermissions } from '../../hooks/usePermissions'
import { getSportLabel, getCatLabel, getUnitLabel, buildSKU, DEFAULT_SPORTS, DEFAULT_CATEGORIES, DEFAULT_UNITS } from './shared'
import CustomSelect from '../CustomSelect'

async function doStockIn(item, qty, reason, notes, deliveryRef, supplierId) {
  const user = auth.currentUser
  const prev = item.currentStock || 0
  const newStock = prev + qty

  // Reset the low-stock flag once stock recovers above its threshold, so a
  // future dip will alert again.
  const threshold = item.minThreshold ?? 5
  const clearLow = newStock > threshold && item.low_stock_notified === true

  await updateDoc(doc(db, 'inventory_items', item.id), {
    currentStock: increment(qty),
    updatedAt: serverTimestamp(),
    ...(clearLow ? { low_stock_notified: false } : {}),
  })

  await addDoc(collection(db, 'inventory_movements'), {
    itemId: item.id,
    itemNameAr: item.nameAr,
    itemNameEn: item.nameEn,
    itemSku: item.sku,
    type: 'stock_in',
    quantity: qty,
    previousStock: prev,
    newStock,
    reason: reason || 'purchase',
    issuedTo: null,
    deliveryNoteRef: deliveryRef || null,
    receiptId: null,
    supplierId: supplierId || null,
    performedBy: user?.uid || 'unknown',
    performedByName: user?.displayName || user?.email || 'Unknown',
    createdAt: serverTimestamp(),
    notes: notes || null,
  })
}

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

function QuickAddTab({ items, settings, isAdmin }) {
  const { t, lang } = useLanguage()
  const { can } = usePermissions()
  const [selectedItem, setSelectedItem] = useState(null)
  const [qty, setQty] = useState(1)
  const [reason, setReason] = useState('purchase')
  const [deliveryRef, setDeliveryRef] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [permError, setPermError] = useState('')

  const sports = settings?.sports || DEFAULT_SPORTS
  const categories = settings?.categories || DEFAULT_CATEGORIES

  const handleSubmit = async () => {
    if (!can('inventory', 'edit')) {
      setPermError(lang === 'ar' ? 'ليس لديك صلاحية إضافة مخزون' : 'You do not have permission to add stock')
      return
    }
    if (!selectedItem || qty < 1) return
    setPermError('')
    setSaving(true)
    try {
      await doStockIn(selectedItem, qty, reason, notes, deliveryRef, null)
      setSuccess(true)
      setSelectedItem(null)
      setQty(1)
      setDeliveryRef('')
      setNotes('')
      setTimeout(() => setSuccess(false), 2500)
    } catch (err) {
      console.error(err)
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
            <Check size={14} /> {t('Stock added successfully', 'تمت إضافة المخزون بنجاح')}
          </motion.span>
        )}
        <button
          className="inv-btn inv-btn-primary"
          disabled={!selectedItem || qty < 1 || saving}
          onClick={handleSubmit}
        >
          {saving ? <RefreshCw size={15} className="inv-spin" /> : <Plus size={15} />}
          {t('Add Stock', 'إضافة مخزون')}
        </button>
      </div>
    </div>
  )
}

function BatchReceiveTab({ items, settings }) {
  const { t, lang } = useLanguage()
  const { can } = usePermissions()
  const [rows, setRows] = useState([])
  const [deliveryRef, setDeliveryRef] = useState('')
  const [notes, setNotes] = useState('')
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
      await Promise.all(
        rows.map(r => doStockIn(r.item, r.qty, r.reason, notes, deliveryRef, null))
      )
      setRows([])
      setDeliveryRef('')
      setNotes('')
      setSuccess(true)
      setTimeout(() => setSuccess(false), 2500)
    } catch (err) {
      console.error(err)
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

      <div className="inv-form-row">
        <label className="inv-label">{t('Notes', 'ملاحظات')}</label>
        <textarea className="inv-textarea" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
      </div>

      <div className="inv-form-actions">
        {permError && <div className="inv-error-msg">{permError}</div>}
        {success && (
          <motion.span className="inv-success-msg" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Check size={14} /> {t('All items added', 'تمت إضافة جميع الأصناف')}
          </motion.span>
        )}
        <button
          className="inv-btn inv-btn-primary"
          disabled={rows.length === 0 || saving}
          onClick={handleConfirm}
        >
          {saving ? <RefreshCw size={15} className="inv-spin" /> : <Check size={15} />}
          {t('Confirm All', 'تأكيد الكل')} ({rows.length})
        </button>
      </div>
    </div>
  )
}

export default function InventoryStockIn({ items, settings, isAdmin }) {
  const { t } = useLanguage()
  const [method, setMethod] = useState('quick')

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
            ? <QuickAddTab items={items} settings={settings} isAdmin={isAdmin} />
            : <BatchReceiveTab items={items} settings={settings} />
          }
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
