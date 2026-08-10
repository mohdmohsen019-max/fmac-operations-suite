import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Trash2, Edit2, Check, X, RefreshCw, Save } from 'lucide-react'
import { db } from '../../firebase'
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  getDocs, setDoc, serverTimestamp, writeBatch
} from 'firebase/firestore'
import { useLanguage } from '../../contexts/LanguageContext'

function CatalogTable({ title, collectionName, data, onDataChange }) {
  const { t, lang } = useLanguage()
  const [editingId, setEditingId] = useState(null)
  const [editEn, setEditEn] = useState('')
  const [editAr, setEditAr] = useState('')
  const [newEn, setNewEn] = useState('')
  const [newAr, setNewAr] = useState('')
  const [saving, setSaving] = useState(false)

  const startEdit = (item) => {
    setEditingId(item.id)
    setEditEn(item.en)
    setEditAr(item.ar)
  }

  const saveEdit = async () => {
    if (!editEn || !editAr) return
    setSaving(true)
    try {
      await updateDoc(doc(db, collectionName, editingId), {
        en: editEn, ar: editAr, updatedAt: serverTimestamp()
      })
      onDataChange()
      setEditingId(null)
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const addNew = async () => {
    if (!newEn || !newAr) return
    setSaving(true)
    try {
      await addDoc(collection(db, collectionName), {
        en: newEn, ar: newAr, createdAt: serverTimestamp()
      })
      setNewEn('')
      setNewAr('')
      onDataChange()
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id) => {
    if (!confirm(t('Delete this item?', 'حذف هذا العنصر؟'))) return
    try {
      await deleteDoc(doc(db, collectionName, id))
      onDataChange()
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className="inv-settings-table">
      <div className="inv-settings-table-header">{title}</div>
      <table className="inv-table inv-table-compact">
        <thead>
          <tr>
            <th>{t('English', 'الإنجليزية')}</th>
            <th>{t('Arabic', 'العربية')}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {data.map(item => (
            <tr key={item.id} className="inv-table-row">
              {editingId === item.id ? (
                <>
                  <td><input className="inv-input inv-input-sm" value={editEn} onChange={e => setEditEn(e.target.value)} /></td>
                  <td><input className="inv-input inv-input-sm" value={editAr} onChange={e => setEditAr(e.target.value)} dir="rtl" /></td>
                  <td>
                    <div className="inv-row-actions">
                      <button className="inv-icon-btn inv-icon-btn-success" onClick={saveEdit} disabled={saving}>
                        {saving ? <RefreshCw size={13} className="inv-spin" /> : <Check size={13} />}
                      </button>
                      <button className="inv-icon-btn" onClick={() => setEditingId(null)}><X size={13} /></button>
                    </div>
                  </td>
                </>
              ) : (
                <>
                  <td>{item.en}</td>
                  <td dir="rtl">{item.ar}</td>
                  <td>
                    <div className="inv-row-actions">
                      <button className="inv-icon-btn" onClick={() => startEdit(item)}><Edit2 size={13} /></button>
                      <button className="inv-icon-btn inv-icon-btn-danger" onClick={() => remove(item.id)}><Trash2 size={13} /></button>
                    </div>
                  </td>
                </>
              )}
            </tr>
          ))}
          {/* Add new row */}
          <tr className="inv-table-row inv-new-row">
            <td><input className="inv-input inv-input-sm" placeholder="English" value={newEn} onChange={e => setNewEn(e.target.value)} /></td>
            <td><input className="inv-input inv-input-sm" placeholder="عربي" value={newAr} onChange={e => setNewAr(e.target.value)} dir="rtl" /></td>
            <td>
              <button
                className="inv-icon-btn inv-icon-btn-success"
                onClick={addNew}
                disabled={!newEn || !newAr || saving}
              >
                {saving ? <RefreshCw size={13} className="inv-spin" /> : <Plus size={13} />}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function ThresholdEditor({ items, onRefresh }) {
  const { t } = useLanguage()
  const [thresholds, setThresholds] = useState({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const init = {}
    items.forEach(i => { init[i.id] = i.minThreshold ?? 5 })
    setThresholds(init)
  }, [items])

  const handleSaveAll = async () => {
    setSaving(true)
    try {
      const batch = writeBatch(db)
      Object.entries(thresholds).forEach(([id, val]) => {
        batch.update(doc(db, 'inventory_items', id), { minThreshold: val, updatedAt: serverTimestamp() })
      })
      await batch.commit()
      onRefresh()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="inv-settings-table">
      <div className="inv-settings-table-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{t('Minimum Stock Thresholds', 'حدود المخزون الدنيا')}</span>
        <button className="inv-btn inv-btn-primary inv-btn-sm" onClick={handleSaveAll} disabled={saving}>
          {saving ? <RefreshCw size={13} className="inv-spin" /> : <Save size={13} />}
          {saved ? t('Saved!', 'تم الحفظ!') : t('Save All', 'حفظ الكل')}
        </button>
      </div>
      <div className="inv-threshold-grid">
        {items.map(item => (
          <div key={item.id} className="inv-threshold-row">
            <div className="inv-threshold-name">
              <div>{item.nameAr}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--theme-text-muted)' }}>{item.sku}</div>
            </div>
            <input
              className="inv-qty-input"
              type="number"
              min={0}
              value={thresholds[item.id] ?? 5}
              onChange={e => setThresholds(p => ({ ...p, [item.id]: Math.max(0, parseInt(e.target.value) || 0) }))}
              style={{ width: 64 }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function InventorySettings({ items, settings, onSettingsChange }) {
  const { t } = useLanguage()
  const [activeSection, setActiveSection] = useState('sports')
  const [sports, setSports] = useState([])
  const [categories, setCategories] = useState([])
  const [units, setUnits] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [loadingSuppliers, setLoadingSuppliers] = useState(false)

  const loadCatalog = async () => {
    const [sSnap, cSnap, uSnap] = await Promise.all([
      getDocs(collection(db, 'inventory_sports')),
      getDocs(collection(db, 'inventory_categories')),
      getDocs(collection(db, 'inventory_units')),
    ])
    setSports(sSnap.docs.map(d => ({ id: d.id, ...d.data() })))
    setCategories(cSnap.docs.map(d => ({ id: d.id, ...d.data() })))
    setUnits(uSnap.docs.map(d => ({ id: d.id, ...d.data() })))
    onSettingsChange()
  }

  const loadSuppliers = async () => {
    setLoadingSuppliers(true)
    const snap = await getDocs(collection(db, 'suppliers'))
    setSuppliers(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    setLoadingSuppliers(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadCatalog()
    loadSuppliers()
  }, [])

  const sections = [
    { id: 'sports',     label: t('Sports', 'الرياضات') },
    { id: 'categories', label: t('Categories', 'الفئات') },
    { id: 'units',      label: t('Units', 'الوحدات') },
    { id: 'suppliers',  label: t('Suppliers', 'الموردون') },
    { id: 'thresholds', label: t('Thresholds', 'الحدود الدنيا') },
  ]

  return (
    <div className="inv-settings">
      <div className="inv-method-tabs">
        {sections.map(s => (
          <button
            key={s.id}
            className={`inv-method-tab ${activeSection === s.id ? 'active' : ''}`}
            onClick={() => setActiveSection(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeSection}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.15 }}
        >
          {activeSection === 'sports' && (
            <CatalogTable
              title={t('Sports List', 'قائمة الرياضات')}
              collectionName="inventory_sports"
              data={sports}
              onDataChange={loadCatalog}
            />
          )}
          {activeSection === 'categories' && (
            <CatalogTable
              title={t('Categories List', 'قائمة الفئات')}
              collectionName="inventory_categories"
              data={categories}
              onDataChange={loadCatalog}
            />
          )}
          {activeSection === 'units' && (
            <CatalogTable
              title={t('Units List', 'قائمة الوحدات')}
              collectionName="inventory_units"
              data={units}
              onDataChange={loadCatalog}
            />
          )}
          {activeSection === 'suppliers' && (
            <SupplierManager suppliers={suppliers} onRefresh={loadSuppliers} />
          )}
          {activeSection === 'thresholds' && (
            <ThresholdEditor items={items} onRefresh={onSettingsChange} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function SupplierManager({ suppliers, onRefresh }) {
  const { t } = useLanguage()
  const [newName, setNewName] = useState('')
  const [newContact, setNewContact] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState(null)
  const [editData, setEditData] = useState({})

  const addSupplier = async () => {
    if (!newName) return
    setSaving(true)
    try {
      await addDoc(collection(db, 'suppliers'), {
        name: newName, contactPerson: newContact || null,
        phone: newPhone || null, isActive: true, createdAt: serverTimestamp()
      })
      setNewName(''); setNewContact(''); setNewPhone('')
      onRefresh()
    } catch (err) { console.error(err) }
    finally { setSaving(false) }
  }

  const saveEdit = async () => {
    if (!editData.name) return
    setSaving(true)
    try {
      await updateDoc(doc(db, 'suppliers', editId), { ...editData, updatedAt: serverTimestamp() })
      setEditId(null)
      onRefresh()
    } catch (err) { console.error(err) }
    finally { setSaving(false) }
  }

  const remove = async (id) => {
    if (!confirm(t('Delete supplier?', 'حذف المورد؟'))) return
    await deleteDoc(doc(db, 'suppliers', id))
    onRefresh()
  }

  return (
    <div className="inv-settings-table">
      <div className="inv-settings-table-header">{t('Suppliers', 'الموردون')}</div>
      <table className="inv-table inv-table-compact">
        <thead>
          <tr>
            <th>{t('Name', 'الاسم')}</th>
            <th>{t('Contact', 'جهة الاتصال')}</th>
            <th>{t('Phone', 'الهاتف')}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {suppliers.map(s => (
            <tr key={s.id} className="inv-table-row">
              {editId === s.id ? (
                <>
                  <td><input className="inv-input inv-input-sm" value={editData.name || ''} onChange={e => setEditData(p => ({ ...p, name: e.target.value }))} /></td>
                  <td><input className="inv-input inv-input-sm" value={editData.contactPerson || ''} onChange={e => setEditData(p => ({ ...p, contactPerson: e.target.value }))} /></td>
                  <td><input className="inv-input inv-input-sm" value={editData.phone || ''} onChange={e => setEditData(p => ({ ...p, phone: e.target.value }))} /></td>
                  <td>
                    <div className="inv-row-actions">
                      <button className="inv-icon-btn inv-icon-btn-success" onClick={saveEdit}><Check size={13} /></button>
                      <button className="inv-icon-btn" onClick={() => setEditId(null)}><X size={13} /></button>
                    </div>
                  </td>
                </>
              ) : (
                <>
                  <td>{s.name}</td>
                  <td style={{ color: 'var(--theme-text-muted)' }}>{s.contactPerson || '—'}</td>
                  <td style={{ color: 'var(--theme-text-muted)' }}>{s.phone || '—'}</td>
                  <td>
                    <div className="inv-row-actions">
                      <button className="inv-icon-btn" onClick={() => { setEditId(s.id); setEditData({ name: s.name, contactPerson: s.contactPerson || '', phone: s.phone || '' }) }}><Edit2 size={13} /></button>
                      <button className="inv-icon-btn inv-icon-btn-danger" onClick={() => remove(s.id)}><Trash2 size={13} /></button>
                    </div>
                  </td>
                </>
              )}
            </tr>
          ))}
          <tr className="inv-table-row inv-new-row">
            <td><input className="inv-input inv-input-sm" placeholder={t('Supplier name', 'اسم المورد')} value={newName} onChange={e => setNewName(e.target.value)} /></td>
            <td><input className="inv-input inv-input-sm" placeholder={t('Contact', 'جهة الاتصال')} value={newContact} onChange={e => setNewContact(e.target.value)} /></td>
            <td><input className="inv-input inv-input-sm" placeholder={t('Phone', 'الهاتف')} value={newPhone} onChange={e => setNewPhone(e.target.value)} /></td>
            <td>
              <button className="inv-icon-btn inv-icon-btn-success" onClick={addSupplier} disabled={!newName || saving}>
                {saving ? <RefreshCw size={13} className="inv-spin" /> : <Plus size={13} />}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
