/**
 * Predictive part-failure warnings.
 * Catalog (fleet_part_catalog) × per-vehicle installs (fleet_part_installs)
 * against the live Cartrack odometer. All lifespans and installs editable.
 */
import React, { useState, useMemo } from 'react'
import {
  Cog, Plus, X, Loader2, Pencil, Trash2, AlertTriangle, ShieldAlert,
  Wrench, Gauge, EyeOff, Eye,
} from 'lucide-react'
import { collection, doc, serverTimestamp } from 'firebase/firestore'
import { db, auth } from '../../../firebase'
import { useLanguage } from '../../../contexts/LanguageContext'
import CustomSelect from '../../CustomSelect'
import { newCatalogBatch, DEFAULT_PARTS } from './maintenanceSuite'

const todayISO = () => new Date().toISOString().split('T')[0]

const STATUS_LABEL = {
  healthy:   { en: 'Healthy', ar: 'سليم' },
  'due-soon': { en: 'Due soon', ar: 'مستحق قريباً' },
  due:       { en: 'Due', ar: 'مستحق' },
  overdue:   { en: 'Overdue', ar: 'متأخر' },
  none:      { en: 'No install record',  ar: 'لا يوجد سجل تركيب' },
}

function PartStatusBadge({ status }) {
  const { t } = useLanguage()
  const l = STATUS_LABEL[status] || STATUS_LABEL.none
  return <span className={`fms-status fms-status--${status}`}>{t(l.en, l.ar)}</span>
}

function LifeBar({ pct, status }) {
  return (
    <div className="fms-bar">
      <div
        className={`fms-bar-fill fms-bar-fill--${status}`}
        style={{ width: `${Math.min(100, Math.round(pct * 100))}%` }}
      />
    </div>
  )
}

/* ── Install modal: "part replaced/installed at odometer X" ────────────── */
function InstallModal({ vehicle, part, catalogIsSeed, onClose }) {
  const { t } = useLanguage()
  const [km, setKm] = useState(String(vehicle.odoKm || ''))
  const [date, setDate] = useState(todayISO())
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const save = async () => {
    const kmNum = parseFloat(km)
    if (Number.isNaN(kmNum) || kmNum < 0) {
      setError(t('Enter a valid odometer reading.', 'أدخل قراءة عداد صحيحة.'))
      return
    }
    setSaving(true)
    try {
      const batch = newCatalogBatch(catalogIsSeed) // materialise seeds if needed
      batch.set(doc(collection(db, 'fleet_part_installs')), {
        vehicleReg: vehicle.reg,
        partId: part.id,
        installedAtKm: kmNum,
        installedDate: date,
        notes: notes.trim(),
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser?.uid || null,
      })
      await batch.commit()
      onClose()
    } catch (err) {
      console.error('Install save failed:', err)
      setError(t('Save failed: ', 'فشل الحفظ: ') + err.message)
      setSaving(false)
    }
  }

  return (
    <div className="fms-modal-overlay" onClick={onClose}>
      <div className="fms-modal fms-modal--sm" onClick={(e) => e.stopPropagation()}>
        <div className="fms-modal-head">
          <h3><Wrench size={16} />{t('Record part installation', 'تسجيل تركيب قطعة')}</h3>
          <button type="button" className="fms-icon-btn" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="fms-modal-body">
          <p className="fms-modal-context">
            {t(part.nameEn, part.nameAr)} — <strong>{vehicle.reg}</strong>
            <span className="fms-hint" style={{ marginInlineStart: 8 }}>
              <Gauge size={11} /> {t('Current odometer:', 'العداد الحالي:')} {vehicle.odoKm.toLocaleString()} {t('km', 'كم')}
            </span>
          </p>
          {error && <div className="fms-error">{error}</div>}
          <label className="fms-field">
            <span>{t('Installed at odometer (km)', 'تم التركيب عند عداد (كم)')}</span>
            <input type="number" value={km} onChange={(e) => setKm(e.target.value)} />
          </label>
          <label className="fms-field">
            <span>{t('Installation date', 'تاريخ التركيب')}</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="fms-field">
            <span>{t('Notes (optional)', 'ملاحظات (اختياري)')}</span>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <div className="fms-modal-actions">
            <button type="button" className="fms-btn" onClick={onClose}>{t('Cancel', 'إلغاء')}</button>
            <button type="button" className="fms-btn fms-btn--primary" onClick={save} disabled={saving}>
              {saving ? <Loader2 size={14} className="fms-spin" /> : <Plus size={14} />}
              {t('Save install', 'حفظ التركيب')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Catalog part editor (add or edit) ─────────────────────────────────── */
function PartEditModal({ part, catalog, catalogIsSeed, onClose }) {
  const { t } = useLanguage()
  const [nameEn, setNameEn] = useState(part?.nameEn || '')
  const [nameAr, setNameAr] = useState(part?.nameAr || '')
  const [lifespan, setLifespan] = useState(String(part?.lifespanKm ?? ''))
  const [basis, setBasis] = useState(part?.lifecycleBasis === 'time' ? 'time' : 'km')
  const [lifespanDays, setLifespanDays] = useState(String(part?.lifespanDays ?? '365'))
  const [warningPct, setWarningPct] = useState(String(part?.warningThresholdPct ?? '75'))
  const [duePct, setDuePct] = useState(String(part?.dueThresholdPct ?? '90'))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const save = async () => {
    const life = parseFloat(lifespan)
    if (!nameEn.trim() && !nameAr.trim()) {
      setError(t('Enter a part name.', 'أدخل اسم القطعة.'))
      return
    }
    const days = parseFloat(lifespanDays)
    const warning = parseFloat(warningPct)
    const due = parseFloat(duePct)
    if ((basis === 'km' && (Number.isNaN(life) || life <= 0)) || (basis === 'time' && (Number.isNaN(days) || days <= 0))) {
      setError(t('Enter a valid lifespan in km.', 'أدخل عمراً افتراضياً صحيحاً بالكيلومترات.'))
      return
    }
    if (!(warning >= 0 && warning < due && due <= 100)) {
      setError(t('Thresholds must satisfy 0 ≤ warning < due ≤ 100.', 'يجب أن تكون عتبة التحذير أقل من عتبة الاستحقاق وحتى 100.'))
      return
    }
    setSaving(true)
    try {
      const batch = newCatalogBatch(catalogIsSeed)
      const data = {
        nameEn: nameEn.trim() || nameAr.trim(),
        nameAr: nameAr.trim() || nameEn.trim(),
        lifespanKm: life,
        lifespanDays: days,
        lifecycleBasis: basis,
        warningThresholdPct: warning,
        dueThresholdPct: due,
      }
      if (part) {
        batch.set(doc(db, 'fleet_part_catalog', part.id), data, { merge: true })
      } else {
        const nextSort = Math.max(0, ...catalog.map((p) => p.sortOrder ?? 0)) + 1
        batch.set(doc(collection(db, 'fleet_part_catalog')), { ...data, active: true, sortOrder: nextSort })
      }
      await batch.commit()
      onClose()
    } catch (err) {
      console.error('Catalog save failed:', err)
      setError(t('Save failed: ', 'فشل الحفظ: ') + err.message)
      setSaving(false)
    }
  }

  return (
    <div className="fms-modal-overlay" onClick={onClose}>
      <div className="fms-modal fms-modal--sm" onClick={(e) => e.stopPropagation()}>
        <div className="fms-modal-head">
          <h3><Cog size={16} />{part ? t('Edit part', 'تعديل قطعة') : t('Add part', 'إضافة قطعة')}</h3>
          <button type="button" className="fms-icon-btn" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="fms-modal-body">
          {error && <div className="fms-error">{error}</div>}
          <label className="fms-field">
            <span>{t('Name (English)', 'الاسم (إنجليزي)')}</span>
            <input type="text" value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
          </label>
          <label className="fms-field">
            <span>{t('Name (Arabic)', 'الاسم (عربي)')}</span>
            <input type="text" dir="rtl" value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
          </label>
          <label className="fms-field">
            <span>{t('Lifecycle basis', 'أساس دورة الحياة')}</span>
            <CustomSelect value={basis} onChange={setBasis} options={[
              { value: 'km', label: t('Distance (km)', 'المسافة (كم)') },
              { value: 'time', label: t('Time (days)', 'الوقت (أيام)') },
            ]} />
          </label>
          {basis === 'km' ? (
            <label className="fms-field"><span>{t('Expected lifespan (km)', 'العمر الافتراضي (كم)')}</span><input type="number" value={lifespan} onChange={(e) => setLifespan(e.target.value)} /></label>
          ) : (
            <label className="fms-field"><span>{t('Expected lifespan (days)', 'العمر الافتراضي (أيام)')}</span><input type="number" value={lifespanDays} onChange={(e) => setLifespanDays(e.target.value)} /></label>
          )}
          <label className="fms-field"><span>{t('Due-soon warning (%)', 'تحذير الاستحقاق القريب (%)')}</span><input type="number" min="0" max="99" value={warningPct} onChange={(e) => setWarningPct(e.target.value)} /></label>
          <label className="fms-field"><span>{t('Due threshold (%)', 'عتبة الاستحقاق (%)')}</span><input type="number" min="1" max="100" value={duePct} onChange={(e) => setDuePct(e.target.value)} /></label>
          <div className="fms-modal-actions">
            <button type="button" className="fms-btn" onClick={onClose}>{t('Cancel', 'إلغاء')}</button>
            <button type="button" className="fms-btn fms-btn--primary" onClick={save} disabled={saving}>
              {saving ? <Loader2 size={14} className="fms-spin" /> : null}
              {t('Save', 'حفظ')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Main section ──────────────────────────────────────────────────────── */
export default function PartsHealth({ suite, canEdit, displayName }) {
  const { t, locale } = useLanguage()
  const {
    vehicles, vehiclesLoading, catalog, catalogIsSeed, partsHealth, summary,
  } = suite
  const [selectedReg, setSelectedReg] = useState('')
  const [installTarget, setInstallTarget] = useState(null) // { vehicle, part }
  const [editPart, setEditPart] = useState(null)           // part | 'new'
  const [showCatalog, setShowCatalog] = useState(false)

  const effectiveReg = selectedReg || vehicles[0]?.reg || ''
  const selectedHealth = useMemo(
    () => partsHealth.find((row) => row.vehicle.reg === effectiveReg) || null,
    [partsHealth, effectiveReg],
  )

  const warningRows = useMemo(() => {
    const rows = []
    partsHealth.forEach(({ vehicle, parts }) => parts.forEach((ph) => {
      if (ph.status === 'overdue' || ph.status === 'due' || ph.status === 'due-soon') rows.push({ vehicle, ...ph })
    }))
    return rows.sort((a, b) => b.pct - a.pct)
  }, [partsHealth])

  const setCatalogField = async (part, data) => {
    try {
      const batch = newCatalogBatch(catalogIsSeed)
      batch.set(doc(db, 'fleet_part_catalog', part.id), data, { merge: true })
      await batch.commit()
    } catch (err) { console.error('Catalog update failed:', err) }
  }

  const removePart = async (part) => {
    const ok = window.confirm(t(
      `Remove "${part.nameEn}" from the catalog? Existing install records are kept but no longer tracked.`,
      `إزالة "${part.nameAr}" من الكتالوج؟ ستبقى سجلات التركيب لكنها لن تُتابع.`))
    if (!ok) return
    try {
      const batch = newCatalogBatch(catalogIsSeed)
      batch.delete(doc(db, 'fleet_part_catalog', part.id))
      await batch.commit()
    } catch (err) { console.error('Catalog remove failed:', err) }
  }

  if (catalog === null || (vehiclesLoading && vehicles.length === 0)) {
    return <div className="fms-loading"><Loader2 size={20} className="fms-spin" /> {t('Loading parts health...', 'جارٍ تحميل صحة القطع...')}</div>
  }

  return (
    <div className="fms-section">
      {/* Summary cards */}
      <div className="fms-cards">
        <div className="glass-panel fms-card">
          <div className="fms-card-head"><span>{t('Total warnings', 'إجمالي التحذيرات')}</span><AlertTriangle size={15} className={summary.warnings ? 'fms-t-warn' : ''} /></div>
          <div className={`fms-card-value${summary.warnings ? ' fms-t-warn' : ''}`}>{summary.warnings.toLocaleString(locale)}</div>
          <p>{t('Parts at 75% of lifespan or more', 'قطع بلغت 75% من عمرها أو أكثر')}</p>
        </div>
        <div className="glass-panel fms-card">
          <div className="fms-card-head"><span>{t('Critical parts', 'قطع حرجة')}</span><ShieldAlert size={15} className={summary.critical ? 'fms-t-risk' : ''} /></div>
          <div className={`fms-card-value${summary.critical ? ' fms-t-risk' : ''}`}>{summary.critical.toLocaleString(locale)}</div>
          <p>{t('At 90%+ — service recommended soon', 'بلغت 90%+ — يُنصح بالصيانة قريباً')}</p>
        </div>
        <div className="glass-panel fms-card">
          <div className="fms-card-head"><span>{t('Vehicles in scope', 'المركبات ضمن النطاق')}</span><Gauge size={15} /></div>
          <div className="fms-card-value">{vehicles.length.toLocaleString(locale)}</div>
          <p>{t('Tracked with live odometer', 'مُتابعة بعداد مسافة مباشر')}</p>
        </div>
        <div className="glass-panel fms-card">
          <div className="fms-card-head"><span>{t('Catalog parts', 'قطع الكتالوج')}</span><Cog size={15} /></div>
          <div className="fms-card-value">{suite.activeParts.length.toLocaleString(locale)}</div>
          <p>{catalogIsSeed ? t('Default catalog — editable', 'كتالوج افتراضي — قابل للتعديل') : t('Active part types', 'أنواع قطع نشطة')}</p>
        </div>
      </div>

      {/* Fleet-wide warnings */}
      <div className="glass-panel fms-panel">
        <div className="fms-panel-head">
          <div>
            <h3>{t('Predicted part warnings', 'تحذيرات القطع المتوقعة')}</h3>
            <p>{t('Warnings use each component’s editable lifecycle basis and thresholds.', 'تستخدم التحذيرات أساس دورة الحياة والعتبات القابلة للتعديل لكل مكوّن.')}</p>
          </div>
        </div>
        {warningRows.length === 0 ? (
          <div className="fms-empty">{t('No part warnings — everything within safe lifespan.', 'لا توجد تحذيرات — جميع القطع ضمن العمر الآمن.')}</div>
        ) : (
          <div className="fleet-table-container fms-table-wrap">
            <table className="fleet-table">
              <thead>
                <tr>
                  <th>{t('Vehicle', 'المركبة')}</th>
                  <th>{t('Part', 'القطعة')}</th>
                  <th>{t('Used / Lifespan', 'المستهلك / العمر')}</th>
                  <th>{t('Wear', 'الاستهلاك')}</th>
                  <th>{t('Status', 'الحالة')}</th>
                </tr>
              </thead>
              <tbody>
                {warningRows.map((row) => (
                  <tr key={`${row.vehicle.reg}_${row.part.id}`}>
                    <td style={{ fontWeight: 700 }}>{displayName(row.vehicle.reg, locale)}</td>
                    <td>{t(row.part.nameEn, row.part.nameAr)}</td>
                    <td className="fms-mono">
                      {(row.basis === 'time' ? row.usedDays : row.usedKm).toLocaleString(locale)} / {row.lifespan.toLocaleString(locale)} {row.basis === 'time' ? t('days', 'يوم') : t('km', 'كم')}
                    </td>
                    <td style={{ minWidth: 140 }}>
                      <div className="fms-bar-cell">
                        <LifeBar pct={row.pct} status={row.status} />
                        <span className="fms-mono">{Math.round(row.pct * 100)}%</span>
                      </div>
                    </td>
                    <td><PartStatusBadge status={row.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Per-vehicle detail */}
      <div className="glass-panel fms-panel">
        <div className="fms-panel-head">
          <div>
            <h3>{t('Vehicle part health', 'صحة قطع المركبة')}</h3>
            <p>{t('Full catalog against one vehicle — record replacements here', 'الكتالوج الكامل لمركبة واحدة — سجّل الاستبدالات هنا')}</p>
          </div>
          <CustomSelect
            value={effectiveReg}
            onChange={setSelectedReg}
            options={vehicles.map((v) => ({ value: v.reg, label: `${displayName(v.reg, locale)} — ${v.odoKm.toLocaleString(locale)} ${t('km', 'كم')}` }))}
            placeholder={t('Select vehicle', 'اختر مركبة')}
            style={{ minWidth: 240 }}
            ariaLabel={t('Select vehicle', 'اختر مركبة')}
          />
        </div>
        {!selectedHealth ? (
          <div className="fms-empty">{t('No vehicles in the current scope.', 'لا توجد مركبات ضمن النطاق الحالي.')}</div>
        ) : (
          <div className="fleet-table-container fms-table-wrap">
            <table className="fleet-table">
              <thead>
                <tr>
                  <th>{t('Part', 'القطعة')}</th>
                  <th>{t('Installed at (km)', 'رُكِّبت عند (كم)')}</th>
                  <th>{t('Lifecycle used', 'دورة الحياة المستهلكة')}</th>
                  <th>{t('Wear', 'الاستهلاك')}</th>
                  <th>{t('Status', 'الحالة')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {selectedHealth.parts.map((ph) => (
                  <tr key={ph.part.id}>
                    <td style={{ fontWeight: 700 }}>{t(ph.part.nameEn, ph.part.nameAr)}</td>
                    <td className="fms-mono">
                      {ph.install
                        ? <>{parseFloat(ph.install.installedAtKm).toLocaleString(locale)}<span className="fms-hint" style={{ marginInlineStart: 6 }}>{ph.install.installedDate}</span></>
                        : <span className="fms-muted">—</span>}
                    </td>
                    <td className="fms-mono">{ph.install ? <>{(ph.basis === 'time' ? ph.usedDays : ph.usedKm).toLocaleString(locale)} {ph.basis === 'time' ? t('days', 'يوم') : t('km', 'كم')}</> : <span className="fms-muted">—</span>}</td>
                    <td style={{ minWidth: 140 }}>
                      {ph.install ? (
                        <div className="fms-bar-cell">
                          <LifeBar pct={ph.pct} status={ph.status} />
                          <span className="fms-mono">{Math.round(ph.pct * 100)}%</span>
                        </div>
                      ) : <span className="fms-muted">—</span>}
                    </td>
                    <td><PartStatusBadge status={ph.status} /></td>
                    <td style={{ textAlign: 'end' }}>
                      <button
                        type="button" className="fms-btn fms-btn--ghost"
                        onClick={() => setInstallTarget({ vehicle: selectedHealth.vehicle, part: ph.part })}
                      >
                        <Plus size={13} />
                        {ph.install ? t('Replaced', 'استُبدلت') : t('Add install', 'إضافة تركيب')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Catalog admin */}
      {canEdit && (
        <div className="glass-panel fms-panel">
          <div className="fms-panel-head">
            <div>
              <h3>{t('Part catalog', 'كتالوج القطع')}</h3>
              <p>{t('Names and expected lifespans — all editable', 'الأسماء والأعمار المتوقعة — الكل قابل للتعديل')}</p>
            </div>
            <div className="fms-head-actions">
              <button type="button" className="fms-btn" onClick={() => setShowCatalog((s) => !s)}>
                {showCatalog ? t('Hide', 'إخفاء') : t('Manage', 'إدارة')}
              </button>
              {showCatalog && (
                <button type="button" className="fms-btn fms-btn--primary" onClick={() => setEditPart('new')}>
                  <Plus size={13} /> {t('Add part', 'إضافة قطعة')}
                </button>
              )}
            </div>
          </div>
          {showCatalog && (
            <div className="fleet-table-container fms-table-wrap">
              <table className="fleet-table">
                <thead>
                  <tr>
                    <th>{t('Part (EN)', 'القطعة (EN)')}</th>
                    <th>{t('Part (AR)', 'القطعة (AR)')}</th>
                    <th>{t('Basis / Lifespan', 'الأساس / العمر')}</th>
                    <th>{t('Active', 'نشطة')}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {catalog.map((p) => (
                    <tr key={p.id} style={p.active === false ? { opacity: 0.45 } : undefined}>
                      <td>{p.nameEn}</td>
                      <td dir="rtl">{p.nameAr}</td>
                      <td className="fms-mono">{p.lifecycleBasis === 'time' ? `${Number(p.lifespanDays || 0).toLocaleString(locale)} ${t('days', 'يوم')}` : `${Number(p.lifespanKm || 0).toLocaleString(locale)} ${t('km', 'كم')}`}<div className="fms-hint">{Number(p.warningThresholdPct || 75)}% / {Number(p.dueThresholdPct || 90)}%</div></td>
                      <td>
                        <button
                          type="button" className="fms-icon-btn"
                          title={p.active === false ? t('Activate', 'تفعيل') : t('Deactivate', 'تعطيل')}
                          onClick={() => setCatalogField(p, { active: p.active === false })}
                        >
                          {p.active === false ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </td>
                      <td style={{ textAlign: 'end', whiteSpace: 'nowrap' }}>
                        <button type="button" className="fms-icon-btn" title={t('Edit', 'تعديل')} onClick={() => setEditPart(p)}>
                          <Pencil size={14} />
                        </button>
                        <button type="button" className="fms-icon-btn danger" title={t('Remove', 'إزالة')} onClick={() => removePart(p)}>
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {installTarget && (
        <InstallModal
          vehicle={installTarget.vehicle}
          part={installTarget.part}
          catalogIsSeed={catalogIsSeed}
          onClose={() => setInstallTarget(null)}
        />
      )}
      {editPart && (
        <PartEditModal
          part={editPart === 'new' ? null : editPart}
          catalog={catalog || DEFAULT_PARTS}
          catalogIsSeed={catalogIsSeed}
          onClose={() => setEditPart(null)}
        />
      )}
    </div>
  )
}
