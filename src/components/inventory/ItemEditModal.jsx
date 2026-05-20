import { useState } from 'react'
import { motion } from 'framer-motion'
import { X, Check, RefreshCw } from 'lucide-react'
import { db, auth } from '../../firebase'
import { collection, addDoc, updateDoc, doc, serverTimestamp, getDocs, query, where, runTransaction } from 'firebase/firestore'
import { useLanguage } from '../../contexts/LanguageContext'
import { usePermissions } from '../../hooks/usePermissions'
import { buildSKU, DEFAULT_SPORTS, DEFAULT_CATEGORIES, DEFAULT_UNITS } from './shared'

async function nextSKUCounter(sport, category) {
  const configRef = doc(db, 'inventory_config', 'main')
  const key = `sku_${sport}_${category}`
  let count = 1
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(configRef)
    const data = snap.exists() ? snap.data() : {}
    count = (data[key] || 0) + 1
    tx.set(configRef, { [key]: count }, { merge: true })
  })
  return count
}

export default function ItemEditModal({ item, settings, onClose, onSaved }) {
  const { t, lang } = useLanguage()
  const { can } = usePermissions()
  const isNew = !item?.id

  const sports     = settings?.sports     || DEFAULT_SPORTS
  const categories = settings?.categories || DEFAULT_CATEGORIES
  const units      = settings?.units      || DEFAULT_UNITS

  const [form, setForm] = useState({
    nameAr:       item?.nameAr       || '',
    nameEn:       item?.nameEn       || '',
    category:     item?.category     || 'equipment',
    sport:        item?.sport        || 'general',
    size:         item?.size         || '',
    barcode:      item?.barcode      || '',
    currentStock: item?.currentStock ?? 0,
    minThreshold: item?.minThreshold ?? 5,
    unit:         item?.unit         || 'piece',
    notes:        item?.notes        || '',
    isActive:     item?.isActive     ?? true,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [barcodeWarning, setBarcodeWarning] = useState('')

  const checkBarcodeUnique = async (value) => {
    if (!value.trim()) { setBarcodeWarning(''); return }
    try {
      const snap = await getDocs(query(
        collection(db, 'inventory_items'),
        where('barcode', '==', value.trim())
      ))
      const dups = snap.docs.filter(d => d.id !== item?.id)
      if (dups.length > 0) {
        const dupName = dups[0].data().nameAr || dups[0].data().nameEn || ''
        setBarcodeWarning(`هذا الباركود مستخدم لصنف آخر: ${dupName}`)
      } else {
        setBarcodeWarning('')
      }
    } catch { setBarcodeWarning('') }
  }

  const set = (key, val) => setForm(p => ({ ...p, [key]: val }))

  const handleSave = async () => {
    if (!can('inventory', 'edit')) {
      setError(lang === 'ar' ? 'ليس لديك صلاحية تعديل المخزون' : 'You do not have permission to edit inventory')
      return
    }
    if (!form.nameAr || !form.nameEn) {
      setError(t('Name in both languages is required.', 'الاسم بالعربية والإنجليزية مطلوب.'))
      return
    }
    setSaving(true)
    setError('')
    try {
      const user = auth.currentUser
      const unitObj = units.find(u => u.id === form.unit)

      if (isNew) {
        const count = await nextSKUCounter(form.sport, form.category)
        const sku = buildSKU(form.sport, form.category, count)
        await addDoc(collection(db, 'inventory_items'), {
          ...form,
          sku,
          barcode: form.barcode.trim() || sku,
          currentStock: Number(form.currentStock),
          minThreshold: Number(form.minThreshold),
          unitAr: unitObj?.ar || form.unit,
          supplierId: null,
          isActive: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: user?.uid || 'unknown',
        })
      } else {
        await updateDoc(doc(db, 'inventory_items', item.id), {
          ...form,
          ...(form.barcode.trim() ? { barcode: form.barcode.trim() } : {}),
          currentStock: Number(form.currentStock),
          minThreshold: Number(form.minThreshold),
          unitAr: unitObj?.ar || form.unit,
          updatedAt: serverTimestamp(),
        })
      }
      onSaved()
      onClose()
    } catch (err) {
      console.error(err)
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="inv-modal-overlay" onClick={onClose}>
      <motion.div
        className="inv-modal-box inv-edit-modal"
        initial={{ scale: 0.93, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.93, opacity: 0 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        onClick={e => e.stopPropagation()}
      >
        <div className="inv-modal-header">
          <div className="inv-modal-title">
            {isNew ? t('Add New Item', 'إضافة صنف جديد') : t('Edit Item', 'تعديل الصنف')}
          </div>
          <button className="inv-modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="inv-modal-body">
          <div className="inv-form-grid">
            <div className="inv-form-row">
              <label className="inv-label">{t('Arabic Name', 'الاسم بالعربية')} *</label>
              <input className="inv-input" dir="rtl" value={form.nameAr} onChange={e => set('nameAr', e.target.value)} />
            </div>
            <div className="inv-form-row">
              <label className="inv-label">{t('English Name', 'الاسم بالإنجليزية')} *</label>
              <input className="inv-input" value={form.nameEn} onChange={e => set('nameEn', e.target.value)} />
            </div>
            <div className="inv-form-row">
              <label className="inv-label">{t('Category', 'الفئة')}</label>
              <select className="inv-select inv-full" value={form.category} onChange={e => set('category', e.target.value)}>
                {categories.map(c => <option key={c.id} value={c.id}>{lang === 'ar' ? c.ar : c.en}</option>)}
              </select>
            </div>
            <div className="inv-form-row">
              <label className="inv-label">{t('Sport', 'الرياضة')}</label>
              <select className="inv-select inv-full" value={form.sport} onChange={e => set('sport', e.target.value)}>
                {sports.map(s => <option key={s.id} value={s.id}>{lang === 'ar' ? s.ar : s.en}</option>)}
              </select>
            </div>
            <div className="inv-form-row">
              <label className="inv-label">{t('Size', 'المقاس')}</label>
              <input className="inv-input" placeholder="S, M, L, XL, 34…" value={form.size} onChange={e => set('size', e.target.value)} />
            </div>
            <div className="inv-form-row">
              <label className="inv-label">{t('Unit', 'الوحدة')}</label>
              <select className="inv-select inv-full" value={form.unit} onChange={e => set('unit', e.target.value)}>
                {units.map(u => <option key={u.id} value={u.id}>{lang === 'ar' ? u.ar : u.en}</option>)}
              </select>
            </div>
            <div className="inv-form-row inv-form-row-full">
              <label className="inv-label">{t('Barcode', 'الباركود')}</label>
              <input
                className="inv-input"
                placeholder={t('Enter barcode number', 'أدخل رقم الباركود')}
                value={form.barcode}
                onChange={e => { set('barcode', e.target.value); setBarcodeWarning('') }}
                onBlur={e => checkBarcodeUnique(e.target.value)}
              />
              {barcodeWarning && (
                <div style={{ fontSize:'0.75rem', color:'#f59e0b', marginTop:4 }}>
                  ⚠ {barcodeWarning}
                </div>
              )}
            </div>
            {isNew && (
              <div className="inv-form-row">
                <label className="inv-label">{t('Initial Stock', 'المخزون الأولي')}</label>
                <input className="inv-input" type="number" min={0} value={form.currentStock} onChange={e => set('currentStock', parseInt(e.target.value) || 0)} />
              </div>
            )}
            <div className="inv-form-row">
              <label className="inv-label">{t('Min Threshold', 'الحد الأدنى')}</label>
              <input className="inv-input" type="number" min={0} value={form.minThreshold} onChange={e => set('minThreshold', parseInt(e.target.value) || 0)} />
            </div>
            <div className="inv-form-row inv-form-row-full">
              <label className="inv-label">{t('Notes', 'ملاحظات')}</label>
              <textarea className="inv-textarea" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} />
            </div>
          </div>
          {error && <div className="inv-error-msg">{error}</div>}
        </div>

        <div className="inv-modal-footer">
          <button className="inv-btn inv-btn-ghost" onClick={onClose}>{t('Cancel', 'إلغاء')}</button>
          <button className="inv-btn inv-btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <RefreshCw size={15} className="inv-spin" /> : <Check size={15} />}
            {isNew ? t('Add Item', 'إضافة الصنف') : t('Save Changes', 'حفظ التغييرات')}
          </button>
        </div>
      </motion.div>
    </div>
  )
}
