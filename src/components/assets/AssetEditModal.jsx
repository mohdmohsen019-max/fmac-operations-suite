import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { X, Save, RefreshCw } from 'lucide-react'
import { db } from '../../firebase'
import { collection, addDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import CustomSelect from '../CustomSelect'
import { ASSET_STATUSES, statusLabel, roomLabel, logAudit } from './shared'

const EMPTY = {
  name_en: '', name_ar: '', sku: '', barcode: '', category: '', type: '',
  location_room: '', assigned_to: '', status: 'Active', notes: '',
}

export default function AssetEditModal({
  asset, assets, rooms, lang, t, isRTL, actorUid, actorName, onClose, onSaved,
}) {
  const isNew = !asset
  const [form, setForm] = useState(() => ({ ...EMPTY, ...(asset || {}) }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const categories = useMemo(() => [...new Set((assets || []).map(a => a.category).filter(Boolean))].sort(), [assets])
  const types = useMemo(() => [...new Set((assets || []).map(a => a.type).filter(Boolean))].sort(), [assets])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.name_en.trim() && !form.name_ar.trim()) {
      setError(t('Please enter an asset name.', 'يرجى إدخال اسم الأصل.')); return
    }
    setSaving(true); setError('')
    try {
      const payload = {
        name_en: form.name_en.trim(),
        name_ar: form.name_ar.trim(),
        sku: form.sku.trim(),
        barcode: form.barcode.trim(),
        category: form.category.trim(),
        type: form.type.trim(),
        location_room: form.location_room || '',
        assigned_to: form.assigned_to.trim(),
        status: form.status || 'Active',
        notes: form.notes.trim(),
        last_updated: serverTimestamp(),
        last_updated_by: actorUid,
      }

      if (isNew) {
        const ref = await addDoc(collection(db, 'assets'), { ...payload, created_at: serverTimestamp() })
        await logAudit({
          asset_id: ref.id, asset_name_en: payload.name_en,
          changed_by: actorUid, changed_by_name: actorName,
          change_type: 'created', previous_value: '', new_value: payload.name_en || payload.name_ar,
        })
      } else {
        await updateDoc(doc(db, 'assets', asset.id), payload)
        // Log specific, meaningful changes; fall back to a generic "edited" event.
        const events = []
        if (asset.status !== payload.status)
          events.push({ change_type: 'status_change', previous_value: asset.status, new_value: payload.status })
        if ((asset.location_room || '') !== payload.location_room) {
          const prev = roomLabel(rooms.find(r => r.id === asset.location_room), lang)
          const next = roomLabel(rooms.find(r => r.id === payload.location_room), lang)
          events.push({ change_type: 'location_change', previous_value: prev, new_value: next })
        }
        if ((asset.assigned_to || '') !== payload.assigned_to)
          events.push({ change_type: 'reassigned', previous_value: asset.assigned_to || '—', new_value: payload.assigned_to || '—' })

        const otherChanged = ['name_en', 'name_ar', 'sku', 'barcode', 'category', 'type', 'notes']
          .some(k => (asset[k] || '') !== payload[k])
        if (otherChanged || events.length === 0)
          events.push({ change_type: 'edited', previous_value: '', new_value: payload.name_en || payload.name_ar })

        for (const ev of events) {
          await logAudit({
            asset_id: asset.id, asset_name_en: payload.name_en,
            changed_by: actorUid, changed_by_name: actorName, ...ev,
          })
        }
      }
      onSaved?.()
    } catch (e) {
      console.error('[assets] save failed:', e)
      setError(e.message || t('Save failed.', 'فشل الحفظ.'))
      setSaving(false)
    }
  }

  return (
    <motion.div className="ast-modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div
        className="ast-modal ast-modal-form"
        initial={{ scale: 0.95, opacity: 0, y: 14 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0, y: 10 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        onClick={e => e.stopPropagation()}
      >
        <div className="ast-modal-header">
          <h3>{isNew ? t('Add Asset', 'إضافة أصل') : t('Edit Asset', 'تعديل الأصل')}</h3>
          <button className="ast-modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="ast-modal-body">
          {error && <div className="ast-form-error">{error}</div>}

          <div className="ast-form-grid">
            <div className="ast-field">
              <label>{t('Name (English)', 'الاسم (إنجليزي)')}</label>
              <input value={form.name_en} onChange={e => set('name_en', e.target.value)} placeholder="e.g. Leg Press Machine" />
            </div>
            <div className="ast-field">
              <label>{t('Name (Arabic)', 'الاسم (عربي)')}</label>
              <input value={form.name_ar} onChange={e => set('name_ar', e.target.value)}
                dir="rtl" style={{ fontFamily: "'Tajawal', sans-serif" }} placeholder="مثال: جهاز ضغط الأرجل" />
            </div>
            <div className="ast-field">
              <label>{t('SKU', 'رمز SKU')}</label>
              <input value={form.sku} onChange={e => set('sku', e.target.value)} />
            </div>
            <div className="ast-field">
              <label>{t('Barcode', 'الباركود')}</label>
              <input value={form.barcode} onChange={e => set('barcode', e.target.value)} />
            </div>
            <div className="ast-field">
              <label>{t('Category', 'الفئة')}</label>
              <input list="ast-cat-list" value={form.category} onChange={e => set('category', e.target.value)} placeholder="Furniture, Electronics…" />
              <datalist id="ast-cat-list">{categories.map(c => <option key={c} value={c} />)}</datalist>
            </div>
            <div className="ast-field">
              <label>{t('Type', 'النوع')}</label>
              <input list="ast-type-list" value={form.type} onChange={e => set('type', e.target.value)} placeholder="Desk, Laptop…" />
              <datalist id="ast-type-list">{types.map(ty => <option key={ty} value={ty} />)}</datalist>
            </div>
            <div className="ast-field">
              <label>{t('Room / Area', 'الغرفة / المنطقة')}</label>
              <CustomSelect value={form.location_room} onChange={(v) => set('location_room', v)}
                placeholder={t('— Unassigned —', '— غير محدد —')}
                options={[{ value: '', label: t('— Unassigned —', '— غير محدد —') }, ...rooms.map(r => ({ value: r.id, label: roomLabel(r, lang) }))]} />
            </div>
            <div className="ast-field">
              <label>{t('Assigned To', 'مُعيَّن إلى')}</label>
              <input value={form.assigned_to} onChange={e => set('assigned_to', e.target.value)} placeholder={t('Person name', 'اسم الشخص')} />
            </div>
            <div className="ast-field">
              <label>{t('Status', 'الحالة')}</label>
              <CustomSelect value={form.status} onChange={(v) => set('status', v)}
                options={ASSET_STATUSES.map(s => ({ value: s, label: statusLabel(s, lang) }))} />
            </div>
            <div className="ast-field ast-field-full">
              <label>{t('Notes', 'ملاحظات')}</label>
              <textarea rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="ast-modal-footer">
          <button className="ast-btn ast-btn-ghost" onClick={onClose} disabled={saving}>{t('Cancel', 'إلغاء')}</button>
          <button className="ast-btn ast-btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <><RefreshCw size={14} className="ast-spin" /> {t('Saving…', 'جارٍ الحفظ…')}</> : <><Save size={14} /> {t('Save Asset', 'حفظ الأصل')}</>}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
