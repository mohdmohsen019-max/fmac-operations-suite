import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { X, Save, RefreshCw } from 'lucide-react'
import { db } from '../../firebase'
import { collection, addDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import CustomSelect from '../CustomSelect'
import {
  ASSET_STATUSES, statusLabel, roomLabel, logAudit, nextAssetCode,
  CONDITIONS, CRITICALITIES, UTILIZATIONS, STRATEGIC_GOALS,
  conditionLabel, criticalityLabel, utilizationLabel, goalByCode, deriveDefaults,
} from './shared'

const EMPTY = {
  asset_code: '', name_en: '', name_ar: '', sku: '', barcode: '', category: '', type: '',
  department: '', location_room: '', assigned_to: '', status: 'Active', notes: '',
  quantity: 1, unit: 'PCS', brand: '', serial: '', location_code: '', rack: '',
  purchase_cost: 0,
  condition: 'Good', criticality: '', strategic_goal_code: '',
  useful_life_years: '', replacement_year: '', est_replacement_cost: '',
  funding_source: 'الموازنة التشغيلية', utilization: 'Well-utilized',
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

  // Highest FMAC-#### currently in memory — used both for the placeholder
  // preview and (on save) as the seed passed to the atomic code allocator.
  const scannedMax = useMemo(() => {
    let max = 0
    for (const a of (assets || [])) {
      for (const v of [a.barcode, a.sku, a.asset_code]) {
        const m = /^FMAC-(\d+)$/.exec(String(v || '').trim())
        if (m) max = Math.max(max, parseInt(m[1], 10))
      }
    }
    return max
  }, [assets])

  // Non-authoritative preview of the likely next code (shown in the placeholder).
  // The real, collision-safe code is reserved via nextAssetCode() on save — two
  // users adding in the same snapshot window would otherwise compute this same
  // string and, if both leave the identifiers blank, save duplicate codes.
  const nextCodePreview = useMemo(
    () => `FMAC-${String(scannedMax + 1).padStart(4, '0')}`,
    [scannedMax],
  )

  // Duplicate-barcode warning (same guard as Inventory's ItemEditModal; the
  // full register is already in memory, so no query is needed).
  const barcodeWarning = useMemo(() => {
    const v = (form.barcode || '').trim()
    if (!v) return ''
    const dup = (assets || []).find(a => a.id !== asset?.id
      && [a.barcode, a.sku].some(x => String(x || '').trim() === v))
    if (!dup) return ''
    return lang === 'ar'
      ? `هذا الباركود مستخدم لأصل آخر: ${dup.name_ar || dup.name_en}`
      : `This barcode is already used by: ${dup.name_en || dup.name_ar}`
  }, [form.barcode, assets, asset, lang])

  const handleSave = async () => {
    if (!form.name_en.trim() && !form.name_ar.trim()) {
      setError(t('Please enter an asset name.', 'يرجى إدخال اسم الأصل.')); return
    }
    setSaving(true); setError('')
    try {
      const goal = goalByCode(form.strategic_goal_code)
      // Fill any lifecycle field left blank with a smart default from category/condition.
      const derived = deriveDefaults({
        category: form.category, condition: form.condition, criticality: form.criticality,
        quantity: form.quantity, purchase_cost: form.purchase_cost,
        useful_life_years: form.useful_life_years, replacement_year: form.replacement_year,
        est_replacement_cost: form.est_replacement_cost,
        funding_source: form.funding_source, utilization: form.utilization,
      })
      // New assets always end up with a scannable code: any of the three
      // identifiers left blank falls back to an atomically-allocated FMAC-####
      // (a Firestore counter transaction, so two concurrent adds never collide).
      const explicitCode = form.barcode.trim() || form.sku.trim() || (form.asset_code || '').trim()
      const code = isNew
        ? (explicitCode || await nextAssetCode(scannedMax))
        : null
      const payload = {
        asset_code: isNew ? ((form.asset_code || '').trim() || code) : (form.asset_code || '').trim(),
        name_en: form.name_en.trim(),
        name_ar: form.name_ar.trim(),
        sku: isNew ? (form.sku.trim() || code) : form.sku.trim(),
        barcode: isNew ? (form.barcode.trim() || code) : form.barcode.trim(),
        category: form.category.trim(),
        type: form.type.trim(),
        department: (form.department || '').trim(),
        location_room: form.location_room || '',
        assigned_to: form.assigned_to.trim(),
        status: form.status || 'Active',
        quantity: Number(form.quantity) || 1,
        unit: (form.unit || 'PCS').trim(),
        brand: (form.brand || '').trim(),
        serial: (form.serial || '').trim(),
        location_code: (form.location_code || '').trim(),
        rack: (form.rack || '').trim(),
        purchase_cost: Number(form.purchase_cost) || 0,
        condition: form.condition || 'Good',
        criticality: derived.criticality,
        useful_life_years: derived.useful_life_years,
        replacement_year: derived.replacement_year,
        est_replacement_cost: derived.est_replacement_cost,
        funding_source: derived.funding_source,
        utilization: derived.utilization,
        strategic_goal_code: goal?.code || '',
        strategic_goal_text: goal?.ar || '',
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
              <input value={form.barcode} onChange={e => set('barcode', e.target.value)}
                placeholder={isNew ? `${t('Auto', 'تلقائي')}: ${nextCodePreview}` : ''} />
              {barcodeWarning && <span className="ast-field-warning">⚠ {barcodeWarning}</span>}
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
              <label>{t('Location / Department', 'الموقع / القسم')}</label>
              <input value={form.department} onChange={e => set('department', e.target.value)} placeholder={t('e.g. GYM, Finance…', 'مثال: الصالة، المالية…')} />
            </div>
            <div className="ast-field">
              <label>{t('Room / Area', 'الغرفة / المنطقة')}</label>
              <CustomSelect value={form.location_room} onChange={(v) => set('location_room', v)}
                placeholder={t('— Unassigned —', '— غير محدد —')}
                options={[{ value: '', label: t('— Unassigned —', '— غير محدد —') }, ...rooms.map(r => ({ value: r.id, label: roomLabel(r, lang) }))]} />
            </div>
            <div className="ast-field">
              <label>{t('Quantity', 'الكمية')}</label>
              <input type="number" min="1" value={form.quantity} onChange={e => set('quantity', e.target.value)} />
            </div>
            <div className="ast-field">
              <label>{t('Status', 'الحالة')}</label>
              <CustomSelect value={form.status} onChange={(v) => set('status', v)}
                options={ASSET_STATUSES.map(s => ({ value: s, label: statusLabel(s, lang) }))} />
            </div>
          </div>

          {/* Strategic & lifecycle — feeds the approved reports (smart-defaulted, editable) */}
          <div className="ast-form-section-label">{t('Strategic & Lifecycle', 'الاستراتيجية ودورة الحياة')}</div>
          <div className="ast-form-grid">
            <div className="ast-field">
              <label>{t('Condition', 'الحالة الفنية')}</label>
              <CustomSelect value={form.condition} onChange={(v) => set('condition', v)}
                options={CONDITIONS.map(c => ({ value: c, label: conditionLabel(c, lang) }))} />
            </div>
            <div className="ast-field">
              <label>{t('Criticality', 'درجة الأهمية')}</label>
              <CustomSelect value={form.criticality} onChange={(v) => set('criticality', v)}
                placeholder={t('Auto from category', 'تلقائي حسب الفئة')}
                options={[{ value: '', label: t('Auto from category', 'تلقائي حسب الفئة') }, ...CRITICALITIES.map(c => ({ value: c, label: criticalityLabel(c, lang) }))]} />
            </div>
            <div className="ast-field ast-field-full">
              <label>{t('Strategic Goal Supported', 'الهدف الاستراتيجي المدعوم')}</label>
              <CustomSelect value={form.strategic_goal_code} onChange={(v) => set('strategic_goal_code', v)}
                placeholder={t('— None —', '— لا يوجد —')}
                options={[{ value: '', label: t('— None —', '— لا يوجد —') }, ...STRATEGIC_GOALS.map(g => ({ value: g.code, label: `${g.code} — ${g.shortAr}` }))]} />
            </div>
            <div className="ast-field">
              <label>{t('Purchase / Unit Cost (AED)', 'تكلفة الشراء / الوحدة (د.إ)')}</label>
              <input type="number" min="0" value={form.purchase_cost} onChange={e => set('purchase_cost', e.target.value)} placeholder={t('Blank = category estimate', 'فارغ = تقدير حسب الفئة')} />
            </div>
            <div className="ast-field">
              <label>{t('Replacement Year', 'سنة الاستبدال')}</label>
              <input type="number" value={form.replacement_year} onChange={e => set('replacement_year', e.target.value)} placeholder={t('Auto', 'تلقائي')} />
            </div>
            <div className="ast-field">
              <label>{t('Utilization', 'مدى الاستغلال')}</label>
              <CustomSelect value={form.utilization} onChange={(v) => set('utilization', v)}
                options={UTILIZATIONS.map(u => ({ value: u, label: utilizationLabel(u, lang) }))} />
            </div>
            <div className="ast-field">
              <label>{t('Funding Source', 'مصدر التمويل')}</label>
              <input value={form.funding_source} onChange={e => set('funding_source', e.target.value)} dir="rtl" style={{ fontFamily: "'Tajawal', sans-serif" }} />
            </div>
            <div className="ast-field ast-field-full">
              <label>{t('Notes', 'ملاحظات')}</label>
              <textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} />
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
