import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { X, Pencil, Printer, RefreshCw, Tag, UserCog } from 'lucide-react'
import { db } from '../../firebase'
import {
  collection, query, where, orderBy, limit, getDocs, doc, updateDoc, serverTimestamp,
} from 'firebase/firestore'
import {
  ASSET_STATUSES, STATUS_META, statusLabel, changeTypeLabel, roomLabel, fmtDateTime, toMillis, logAudit,
  conditionLabel, criticalityLabel, CRITICALITY_META, goalByCode, withDefaults, fmtMoney,
} from './shared'

function Field({ label, children, rtl }) {
  return (
    <div className="ast-detail-field">
      <span className="ast-detail-label">{label}</span>
      <span className="ast-detail-value" dir={rtl ? 'rtl' : undefined}
        style={rtl ? { fontFamily: "'Tajawal', sans-serif" } : undefined}>{children}</span>
    </div>
  )
}

export default function AssetDetailModal({
  asset, rooms, canManage, lang, t, isRTL, actorUid, actorName, onClose, onEdit, onBarcode,
}) {
  const [audit, setAudit] = useState([])
  const [loadingAudit, setLoadingAudit] = useState(true)
  const [statusOpen, setStatusOpen] = useState(false)
  const [reassignOpen, setReassignOpen] = useState(false)
  const [reassignVal, setReassignVal] = useState(asset.assigned_to || '')

  // Last 10 changes for this asset.
  // NOTE: where(asset_id) + orderBy(timestamp) may need a composite index;
  // fallback sorts client-side if the index isn't present.
  useEffect(() => {
    let alive = true
    const run = async () => {
      setLoadingAudit(true)
      try {
        const snap = await getDocs(query(
          collection(db, 'asset_audit_log'),
          where('asset_id', '==', asset.id),
          orderBy('timestamp', 'desc'),
          limit(10),
        ))
        if (alive) setAudit(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      } catch (e) {
        console.warn('[assets] audit index missing, client-sort fallback:', e.code)
        try {
          const snap = await getDocs(query(collection(db, 'asset_audit_log'), where('asset_id', '==', asset.id)))
          const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => toMillis(b.timestamp) - toMillis(a.timestamp)).slice(0, 10)
          if (alive) setAudit(rows)
        } catch (e2) { console.error('[assets] audit fallback failed:', e2) }
      } finally {
        if (alive) setLoadingAudit(false)
      }
    }
    run()
    return () => { alive = false }
  }, [asset.id])

  const room = rooms.find(r => r.id === asset.location_room)

  const applyStatus = async (newStatus) => {
    setStatusOpen(false)
    if (newStatus === asset.status) return
    try {
      await updateDoc(doc(db, 'assets', asset.id), { status: newStatus, last_updated: serverTimestamp(), last_updated_by: actorUid })
      await logAudit({ asset_id: asset.id, asset_name_en: asset.name_en, changed_by: actorUid, changed_by_name: actorName, change_type: 'status_change', previous_value: asset.status, new_value: newStatus })
    } catch (e) { console.error('[assets] status change failed:', e) }
  }

  const applyReassign = async () => {
    const next = reassignVal.trim()
    setReassignOpen(false)
    if (next === (asset.assigned_to || '')) return
    try {
      await updateDoc(doc(db, 'assets', asset.id), { assigned_to: next, last_updated: serverTimestamp(), last_updated_by: actorUid })
      await logAudit({ asset_id: asset.id, asset_name_en: asset.name_en, changed_by: actorUid, changed_by_name: actorName, change_type: 'reassigned', previous_value: asset.assigned_to || '—', new_value: next || '—' })
    } catch (e) { console.error('[assets] reassign failed:', e) }
  }

  const m = STATUS_META[asset.status] || STATUS_META.Active

  return (
    <motion.div className="ast-modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div
        className="ast-modal ast-modal-detail"
        initial={{ scale: 0.95, opacity: 0, y: 14 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0, y: 10 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        onClick={e => e.stopPropagation()}
      >
        <div className="ast-modal-header">
          <div>
            <h3>{lang === 'ar' ? (asset.name_ar || asset.name_en) : (asset.name_en || asset.name_ar)}</h3>
            <span className="ast-badge" style={{ color: m.color, background: m.bg, borderColor: m.border, marginTop: 6, display: 'inline-block' }}>
              {statusLabel(asset.status, lang)}
            </span>
          </div>
          <button className="ast-modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="ast-modal-body">
          {(() => { const d = withDefaults(asset); const goal = goalByCode(asset.strategic_goal_code); const cm = CRITICALITY_META[d.criticality]; return (
          <div className="ast-detail-grid">
            <Field label={t('Asset ID', 'رقم الأصل')}>{asset.asset_code || asset.barcode || '—'}</Field>
            <Field label={t('Name (EN)', 'الاسم (إنجليزي)')}>{asset.name_en || '—'}</Field>
            <Field label={t('Location / Department', 'الموقع / القسم')}>{asset.department || '—'}</Field>
            <Field label={t('Category', 'الفئة')}>{asset.category || '—'}</Field>
            <Field label={t('Quantity', 'الكمية')}>{asset.quantity || 1} {asset.unit || ''}</Field>
            <Field label={t('Condition', 'الحالة الفنية')}>{conditionLabel(d.condition, lang)}</Field>
            <Field label={t('Criticality', 'درجة الأهمية')}>
              <span style={cm ? { color: cm.color, fontWeight: 700 } : undefined}>{criticalityLabel(d.criticality, lang)}</span>
            </Field>
            <Field label={t('Room / Area', 'الغرفة / المنطقة')}>{roomLabel(room, lang)}</Field>
            <Field label={t('Replacement Year', 'سنة الاستبدال')}>{d.replacement_year || '—'}</Field>
            <Field label={t('Est. Replacement (AED)', 'تكلفة الاستبدال (د.إ)')}>{fmtMoney(d.est_replacement_cost)}</Field>
            <Field label={t('Utilization', 'مدى الاستغلال')}>{d.utilization === 'Underutilized' ? t('Underutilized', 'غير مُستغَل بالكامل') : t('Well-utilized', 'مُستغَل جيداً')}</Field>
            <Field label={t('Last Updated', 'آخر تحديث')}>{fmtDateTime(asset.last_updated)}</Field>
            {goal && (
              <div className="ast-detail-field ast-detail-field-full">
                <span className="ast-detail-label">{t('Strategic Goal', 'الهدف الاستراتيجي')}</span>
                <span className="ast-detail-value" dir="rtl" style={{ fontFamily: "'Tajawal', sans-serif" }}>
                  <strong style={{ color: goal.color }}>{goal.code}</strong> — {goal.ar}
                </span>
              </div>
            )}
            {asset.notes && <div className="ast-detail-field ast-detail-field-full"><span className="ast-detail-label">{t('Notes', 'ملاحظات')}</span><span className="ast-detail-value">{asset.notes}</span></div>}
          </div>
          )})()}

          {/* Manager quick actions */}
          {canManage && (
            <div className="ast-detail-actions">
              <div className="ast-quick-action">
                <button className="ast-btn ast-btn-ghost ast-btn-sm" onClick={() => { setStatusOpen(v => !v); setReassignOpen(false) }}>
                  <Tag size={13} /> {t('Change Status', 'تغيير الحالة')}
                </button>
                {statusOpen && (
                  <div className="ast-quick-pop">
                    {ASSET_STATUSES.map(s => (
                      <button key={s} className={`ast-quick-pop-item ${s === asset.status ? 'active' : ''}`} onClick={() => applyStatus(s)}>
                        {statusLabel(s, lang)}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="ast-quick-action">
                <button className="ast-btn ast-btn-ghost ast-btn-sm" onClick={() => { setReassignOpen(v => !v); setStatusOpen(false); setReassignVal(asset.assigned_to || '') }}>
                  <UserCog size={13} /> {t('Reassign', 'إعادة تعيين')}
                </button>
                {reassignOpen && (
                  <div className="ast-quick-pop ast-quick-pop-wide">
                    <input className="ast-reassign-input" value={reassignVal} onChange={e => setReassignVal(e.target.value)}
                      placeholder={t('Person name', 'اسم الشخص')} autoFocus />
                    <button className="ast-btn ast-btn-primary ast-btn-sm" onClick={applyReassign}>{t('Save', 'حفظ')}</button>
                  </div>
                )}
              </div>

              <button className="ast-btn ast-btn-ghost ast-btn-sm" onClick={() => onEdit(asset)}>
                <Pencil size={13} /> {t('Edit Full Record', 'تعديل السجل كاملاً')}
              </button>
              <button className="ast-btn ast-btn-primary ast-btn-sm" onClick={() => onBarcode(asset)}>
                <Printer size={13} /> {t('Print Label', 'طباعة ملصق')}
              </button>
            </div>
          )}

          {/* Audit trail */}
          <div className="ast-detail-audit">
            <h4>{t('Recent Changes', 'التغييرات الأخيرة')}</h4>
            {loadingAudit ? (
              <div className="ast-audit-loading"><RefreshCw size={15} className="ast-spin" /> {t('Loading…', 'جارٍ التحميل…')}</div>
            ) : audit.length === 0 ? (
              <p className="ast-muted" style={{ fontSize: '0.82rem' }}>{t('No change history.', 'لا يوجد سجل تغييرات.')}</p>
            ) : (
              <div className="ast-audit-list">
                {audit.map(ev => (
                  <div key={ev.id} className="ast-audit-item">
                    <span className="ast-audit-type">{changeTypeLabel(ev.change_type, lang)}</span>
                    <span className="ast-audit-detail">
                      {ev.previous_value && ev.previous_value !== ev.new_value
                        ? `${ev.previous_value} → ${ev.new_value}`
                        : ev.new_value || '—'}
                    </span>
                    <span className="ast-audit-meta">{ev.changed_by_name} · {fmtDateTime(ev.timestamp)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
