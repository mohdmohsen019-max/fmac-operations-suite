import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Pencil, Trash2, X, Save, RefreshCw, DoorOpen, Eye, ChevronRight } from 'lucide-react'
import { db } from '../../firebase'
import { collection, addDoc, doc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { roomLabel } from './shared'

function RoomModal({ room, lang, t, onClose, onSaved }) {
  const isNew = !room
  const [form, setForm] = useState(() => ({ name_en: '', name_ar: '', floor: '', ...(room || {}) }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.name_en.trim() && !form.name_ar.trim()) {
      setError(t('Please enter a room name.', 'يرجى إدخال اسم الغرفة.')); return
    }
    setSaving(true); setError('')
    try {
      const payload = { name_en: form.name_en.trim(), name_ar: form.name_ar.trim(), floor: (form.floor || '').trim() }
      if (isNew) await addDoc(collection(db, 'asset_rooms'), { ...payload, created_at: serverTimestamp() })
      else await updateDoc(doc(db, 'asset_rooms', room.id), payload)
      onSaved?.()
    } catch (e) { console.error('[assets] room save failed:', e); setError(e.message); setSaving(false) }
  }

  return (
    <motion.div className="ast-modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="ast-modal ast-modal-sm"
        initial={{ scale: 0.95, opacity: 0, y: 14 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0, y: 10 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }} onClick={e => e.stopPropagation()}>
        <div className="ast-modal-header">
          <h3>{isNew ? t('Add Room', 'إضافة غرفة') : t('Edit Room', 'تعديل الغرفة')}</h3>
          <button className="ast-modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="ast-modal-body">
          {error && <div className="ast-form-error">{error}</div>}
          <div className="ast-form-grid">
            <div className="ast-field">
              <label>{t('Name (English)', 'الاسم (إنجليزي)')}</label>
              <input value={form.name_en} onChange={e => set('name_en', e.target.value)} placeholder="e.g. Main Gym" />
            </div>
            <div className="ast-field">
              <label>{t('Name (Arabic)', 'الاسم (عربي)')}</label>
              <input value={form.name_ar} onChange={e => set('name_ar', e.target.value)} dir="rtl" style={{ fontFamily: "'Tajawal', sans-serif" }} placeholder="مثال: الصالة الرئيسية" />
            </div>
            <div className="ast-field ast-field-full">
              <label>{t('Floor (optional)', 'الطابق (اختياري)')}</label>
              <input value={form.floor} onChange={e => set('floor', e.target.value)} placeholder={t('e.g. Ground Floor', 'مثال: الطابق الأرضي')} />
            </div>
          </div>
        </div>
        <div className="ast-modal-footer">
          <button className="ast-btn ast-btn-ghost" onClick={onClose} disabled={saving}>{t('Cancel', 'إلغاء')}</button>
          <button className="ast-btn ast-btn-primary" onClick={save} disabled={saving}>
            {saving ? <><RefreshCw size={14} className="ast-spin" /> {t('Saving…', 'جارٍ الحفظ…')}</> : <><Save size={14} /> {t('Save Room', 'حفظ الغرفة')}</>}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

export default function AssetRooms({ assets, rooms, canManage, lang, t, onViewRoomAssets, onOpenEdit }) {
  const [modalRoom, setModalRoom] = useState(null) // null closed, {} new, room edit
  const [deleteError, setDeleteError] = useState('')

  const countByRoom = useMemo(() => {
    const map = {}
    assets.forEach(a => { if (a.location_room) map[a.location_room] = (map[a.location_room] || 0) + 1 })
    return map
  }, [assets])

  const handleDelete = async (room) => {
    const count = countByRoom[room.id] || 0
    if (count > 0) {
      setDeleteError(t(
        `Cannot delete "${roomLabel(room, 'en')}" — ${count} asset(s) are still assigned to it.`,
        `لا يمكن حذف "${roomLabel(room, 'ar')}" — لا يزال ${count} أصل مُعيَّناً إليها.`
      ))
      setTimeout(() => setDeleteError(''), 4000)
      return
    }
    if (!window.confirm(t(`Delete room "${roomLabel(room, 'en')}"?`, `حذف الغرفة "${roomLabel(room, 'ar')}"؟`))) return
    try { await deleteDoc(doc(db, 'asset_rooms', room.id)) }
    catch (e) { console.error('[assets] room delete failed:', e) }
  }

  return (
    <div className="ast-page">
      <div className="ast-page-header">
        <div>
          <h2 className="ast-page-title">{t('Rooms & Areas', 'الغرف والمناطق')}</h2>
          <p className="ast-page-sub">{rooms.length} {t('rooms', 'غرفة')}</p>
        </div>
        {canManage && (
          <button className="ast-btn ast-btn-primary ast-btn-sm" onClick={() => setModalRoom({})}>
            <Plus size={14} /> {t('Add Room', 'إضافة غرفة')}
          </button>
        )}
      </div>

      {deleteError && <div className="ast-form-error" style={{ marginBottom: 12 }}>{deleteError}</div>}

      {rooms.length === 0 ? (
        <div className="ast-empty"><DoorOpen size={42} strokeWidth={1} /><p>{t('No rooms created yet.', 'لم يتم إنشاء غرف بعد.')}</p></div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="ast-table-wrap ast-desktop-only">
            <table className="ast-table">
              <thead>
                <tr>
                  <th>{t('Name (EN)', 'الاسم (إنجليزي)')}</th>
                  <th>{t('Name (AR)', 'الاسم (عربي)')}</th>
                  <th>{t('Floor', 'الطابق')}</th>
                  <th>{t('Assets', 'الأصول')}</th>
                  <th>{t('Actions', 'إجراءات')}</th>
                </tr>
              </thead>
              <tbody>
                {rooms.map(r => (
                  <tr key={r.id}>
                    <td className="ast-strong">{r.name_en || '—'}</td>
                    <td dir="rtl" style={{ fontFamily: "'Tajawal', sans-serif" }}>{r.name_ar || '—'}</td>
                    <td>{r.floor || '—'}</td>
                    <td><span className="ast-count-pill">{countByRoom[r.id] || 0}</span></td>
                    <td>
                      <div className="ast-row-actions">
                        <button className="ast-icon-btn" onClick={() => onViewRoomAssets(r.id)} title={t('View Assets', 'عرض الأصول')}><Eye size={14} /></button>
                        {canManage && <button className="ast-icon-btn" onClick={() => setModalRoom(r)} title={t('Edit', 'تعديل')}><Pencil size={14} /></button>}
                        {canManage && <button className="ast-icon-btn ast-icon-btn-danger" onClick={() => handleDelete(r)} title={t('Delete', 'حذف')}><Trash2 size={14} /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="ast-card-list ast-mobile-only">
            {rooms.map(r => (
              <div key={r.id} className="ast-room-card">
                <button className="ast-room-card-main" onClick={() => onViewRoomAssets(r.id)}>
                  <span className="ast-asset-card-name">{roomLabel(r, lang)}</span>
                  <span className="ast-asset-card-meta">{r.floor || t('No floor', 'بدون طابق')} · {countByRoom[r.id] || 0} {t('assets', 'أصل')}</span>
                </button>
                {canManage && (
                  <div className="ast-room-card-actions">
                    <button className="ast-icon-btn" onClick={() => setModalRoom(r)}><Pencil size={14} /></button>
                    <button className="ast-icon-btn ast-icon-btn-danger" onClick={() => handleDelete(r)}><Trash2 size={14} /></button>
                  </div>
                )}
                <ChevronRight size={16} className="ast-asset-card-chevron" onClick={() => onViewRoomAssets(r.id)} />
              </div>
            ))}
          </div>
        </>
      )}

      <AnimatePresence>
        {modalRoom !== null && (
          <RoomModal
            room={modalRoom.id ? modalRoom : null}
            lang={lang} t={t}
            onClose={() => setModalRoom(null)}
            onSaved={() => setModalRoom(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
