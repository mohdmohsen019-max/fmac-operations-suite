/* ══════════════════════════════════════════════════════════════════════════
   Crisis module — shared UI primitives + schema-driven register engine
   Namespaced `crs-` classes (see CrisisModule.css). RTL-aware throughout.
   ════════════════════════════════════════════════════════════════════════ */
import React, { useState, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Plus, Search, Trash2, Pencil, Printer, AlertTriangle, Paperclip,
  Upload, Loader2, Check, ChevronDown,
} from 'lucide-react'
import CustomSelect from '../CustomSelect'
import { storage } from '../../firebase'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { L, TONE_HEX } from './crisisData'

/* ── tone → badge ── */
export function Pill({ tone = 'neutral', children, soft = true, dir = 'auto' }) {
  const hex = TONE_HEX[tone] || TONE_HEX.neutral
  const style = soft
    ? { color: hex, background: `${hex}1a`, border: `1px solid ${hex}33` }
    : { color: '#fff', background: hex, border: `1px solid ${hex}` }
  return <span className="crs-pill" style={style} dir={dir}>{children}</span>
}

/* status object {en,ar,tone} + lang → pill */
export function StatusPill({ meta, lang, soft = true }) {
  if (!meta) return <span className="crs-muted">—</span>
  return <Pill tone={meta.tone} soft={soft}>{L(meta, lang)}</Pill>
}

/* ── stat / KPI card ── */
export function StatCard({ label, value, sub, tone, icon: Icon, onClick, accent }) {
  const hex = tone ? (TONE_HEX[tone] || tone) : null
  return (
    <button className={`crs-stat${onClick ? ' crs-stat--click' : ''}`} onClick={onClick} type="button"
      style={accent ? { borderInlineStartColor: hex || 'var(--theme-accent)', borderInlineStartWidth: 3 } : undefined}>
      <div className="crs-stat-top">
        <span className="crs-stat-label" dir="auto">{label}</span>
        {Icon && <Icon size={15} className="crs-stat-icon" />}
      </div>
      <div className="crs-stat-value" dir="auto" style={hex ? { color: hex } : undefined}>{value}</div>
      {sub != null && <div className="crs-stat-sub" dir="auto">{sub}</div>}
    </button>
  )
}

/* ── section wrapper ── */
export function Section({ title, sub, children, actions, icon: Icon }) {
  return (
    <section className="crs-section">
      {(title || actions) && (
        <div className="crs-section-head">
          <div className="crs-section-titles">
            {title && <h2 className="crs-section-title" dir="auto">{Icon && <Icon size={16} />}{title}</h2>}
            {sub && <p className="crs-section-sub" dir="auto">{sub}</p>}
          </div>
          {actions && <div className="crs-section-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

/* ── empty state ── */
export function Empty({ icon: Icon = AlertTriangle, title, hint }) {
  return (
    <div className="crs-empty">
      <Icon size={30} strokeWidth={1.4} />
      <p className="crs-empty-title" dir="auto">{title}</p>
      {hint && <p className="crs-empty-hint" dir="auto">{hint}</p>}
    </div>
  )
}

/* ── modal ── */
export function Modal({ open, onClose, title, sub, children, footer, wide }) {
  if (!open) return null
  return createPortal(
    <AnimatePresence>
      <motion.div className="crs-modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
        <motion.div className={`crs-modal${wide ? ' crs-modal--wide' : ''}`}
          initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }} transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}>
          <div className="crs-modal-head">
            <div>
              <h3 className="crs-modal-title" dir="auto">{title}</h3>
              {sub && <p className="crs-modal-sub" dir="auto">{sub}</p>}
            </div>
            <button className="crs-icon-btn" onClick={onClose} aria-label="Close"><X size={17} /></button>
          </div>
          <div className="crs-modal-body">{children}</div>
          {footer && <div className="crs-modal-foot">{footer}</div>}
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  )
}

/* ── form field label wrapper ── */
export function Field({ label, required, hint, children, half, full }) {
  return (
    <label className={`crs-field${half ? ' crs-field--half' : ''}${full ? ' crs-field--full' : ''}`}>
      {label && <span className="crs-field-label" dir="auto">{label}{required && <b className="crs-req">*</b>}</span>}
      {children}
      {hint && <span className="crs-field-hint" dir="auto">{hint}</span>}
    </label>
  )
}

/* ── labelled select built on the design-system CustomSelect ── */
export function Select({ value, onChange, options, placeholder, lang, ariaLabel }) {
  const opts = options.map(o =>
    typeof o === 'string' ? { value: o, label: o } : { value: o.id ?? o.value, label: L(o, lang) ?? o.label })
  return <CustomSelect value={value} onChange={onChange} options={opts} placeholder={placeholder} ariaLabel={ariaLabel} />
}

/* ── multi-select chip picker ── */
export function MultiChips({ value = [], onChange, options, lang }) {
  const toggle = (id) => onChange(value.includes(id) ? value.filter(v => v !== id) : [...value, id])
  return (
    <div className="crs-chips">
      {options.map(o => {
        const id = o.id ?? o.value
        const on = value.includes(id)
        return (
          <button type="button" key={id} className={`crs-chip${on ? ' active' : ''}`} onClick={() => toggle(id)}>
            {on && <Check size={12} />}{L(o, lang) ?? o.label}
          </button>
        )
      })}
    </div>
  )
}

/* ── tags input (free text list) ── */
export function TagsInput({ value = [], onChange, placeholder, lang }) {
  const [draft, setDraft] = useState('')
  const add = () => { const v = draft.trim(); if (v && !value.includes(v)) onChange([...value, v]); setDraft('') }
  return (
    <div className="crs-tags">
      <div className="crs-tags-list">
        {value.map(tag => (
          <span key={tag} className="crs-tag">{tag}
            <button type="button" onClick={() => onChange(value.filter(t => t !== tag))}><X size={11} /></button>
          </span>
        ))}
      </div>
      <input className="crs-input" value={draft} placeholder={placeholder}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
        onBlur={add} dir="auto" />
    </div>
  )
}

/* ── evidence / file uploader → Firebase Storage ── */
export function EvidenceInput({ value = [], onChange, folder = 'misc', lang }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const inputRef = useRef(null)
  const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv,.doc,.docx'
  const MAX = 15 * 1024 * 1024

  const onPick = async (e) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setBusy(true); setErr('')
    try {
      const uploaded = []
      for (const file of files) {
        if (file.size > MAX) { setErr(lang === 'ar' ? 'الحد الأقصى 15 ميجابايت' : 'Max size is 15MB'); continue }
        const clean = file.name.replace(/[^\w.\-؀-ۿ]+/g, '_')
        const path = `crisis_evidence/${folder}/${Date.now()}_${clean}`
        const r = storageRef(storage, path)
        await uploadBytes(r, file)
        const url = await getDownloadURL(r)
        uploaded.push({ name: file.name, url, type: file.type, size: file.size, path })
      }
      onChange([...value, ...uploaded])
    } catch (e2) {
      setErr(e2?.message || String(e2))
    }
    setBusy(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="crs-evidence">
      <div className="crs-evidence-list">
        {value.map((f, i) => (
          <span key={f.path || i} className="crs-evidence-item">
            <Paperclip size={12} />
            <a href={f.url} target="_blank" rel="noreferrer" dir="auto">{f.name || 'file'}</a>
            <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))}><X size={11} /></button>
          </span>
        ))}
      </div>
      <button type="button" className="crs-btn crs-btn-ghost crs-btn-sm" disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? <Loader2 size={13} className="crs-spin" /> : <Upload size={13} />}
        {lang === 'ar' ? 'إرفاق دليل' : 'Attach evidence'}
      </button>
      <input ref={inputRef} type="file" multiple accept={ACCEPT} onChange={onPick} style={{ display: 'none' }} />
      {err && <span className="crs-field-hint crs-danger-text" dir="auto">{err}</span>}
    </div>
  )
}

/* ── two-step danger delete button ── */
export function DangerDelete({ onConfirm, lang, small }) {
  const [armed, setArmed] = useState(false)
  if (!armed) {
    return (
      <button type="button" className={`crs-btn crs-btn-ghost-danger${small ? ' crs-btn-sm' : ''}`} onClick={() => setArmed(true)}>
        <Trash2 size={13} />{lang === 'ar' ? 'حذف' : 'Delete'}
      </button>
    )
  }
  return (
    <span className="crs-danger-confirm">
      <button type="button" className={`crs-btn crs-btn-danger${small ? ' crs-btn-sm' : ''}`} onClick={onConfirm}>
        {lang === 'ar' ? 'تأكيد الحذف' : 'Confirm'}
      </button>
      <button type="button" className={`crs-btn crs-btn-ghost${small ? ' crs-btn-sm' : ''}`} onClick={() => setArmed(false)}>
        {lang === 'ar' ? 'إلغاء' : 'Cancel'}
      </button>
    </span>
  )
}

/* ════════════════════════════════════════════════════════════════════
   SchemaForm — renders a field schema into a controlled form.
   fields: [{ key, type, label:{en,ar}, options, required, half, hint,
              placeholder, rows, min, max, folder, when:(form)=>bool }]
   ════════════════════════════════════════════════════════════════════ */
export function SchemaForm({ fields, form, setForm, lang }) {
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  return (
    <div className="crs-form-grid">
      {fields.filter(f => !f.when || f.when(form)).map(f => {
        if (f.type === 'heading') {
          return <h4 key={f.key} className="crs-form-heading" dir="auto">{L(f.label, lang)}</h4>
        }
        const label = L(f.label, lang)
        const common = { label, required: f.required, hint: f.hint && L(f.hint, lang), half: f.half, full: f.full }
        switch (f.type) {
          case 'textarea':
            return (
              <Field key={f.key} {...common} full={f.full ?? true}>
                <textarea className="crs-input crs-textarea" rows={f.rows || 3} value={form[f.key] || ''}
                  placeholder={f.placeholder && L(f.placeholder, lang)} dir="auto"
                  onChange={e => set(f.key, e.target.value)} />
              </Field>
            )
          case 'select':
            return (
              <Field key={f.key} {...common} half={f.half ?? true}>
                <Select value={form[f.key] || ''} onChange={v => set(f.key, v)} options={f.options}
                  placeholder={f.placeholder ? L(f.placeholder, lang) : (lang === 'ar' ? 'اختر' : 'Select')} lang={lang} ariaLabel={label} />
              </Field>
            )
          case 'multiselect':
            return (
              <Field key={f.key} {...common} full>
                <MultiChips value={form[f.key] || []} onChange={v => set(f.key, v)} options={f.options} lang={lang} />
              </Field>
            )
          case 'tags':
            return (
              <Field key={f.key} {...common} full={f.full ?? true}>
                <TagsInput value={form[f.key] || []} onChange={v => set(f.key, v)} lang={lang}
                  placeholder={f.placeholder ? L(f.placeholder, lang) : (lang === 'ar' ? 'أضف ثم Enter' : 'Type & press Enter')} />
              </Field>
            )
          case 'number':
            return (
              <Field key={f.key} {...common} half={f.half ?? true}>
                <input type="number" className="crs-input" value={form[f.key] ?? ''} min={f.min} max={f.max}
                  onChange={e => set(f.key, e.target.value === '' ? '' : Number(e.target.value))} dir="ltr" />
              </Field>
            )
          case 'date':
            return (
              <Field key={f.key} {...common} half={f.half ?? true}>
                <input type="date" className="crs-input" value={form[f.key] || ''} dir="ltr"
                  onChange={e => set(f.key, e.target.value)} />
              </Field>
            )
          case 'datetime':
            return (
              <Field key={f.key} {...common} half={f.half ?? true}>
                <input type="datetime-local" className="crs-input" value={form[f.key] || ''} dir="ltr"
                  onChange={e => set(f.key, e.target.value)} />
              </Field>
            )
          case 'checkbox':
            return (
              <label key={f.key} className="crs-checkbox">
                <input type="checkbox" checked={!!form[f.key]} onChange={e => set(f.key, e.target.checked)} />
                <span dir="auto">{label}</span>
              </label>
            )
          case 'file':
            return (
              <Field key={f.key} {...common} full>
                <EvidenceInput value={form[f.key] || []} onChange={v => set(f.key, v)} folder={f.folder || 'misc'} lang={lang} />
              </Field>
            )
          default:
            return (
              <Field key={f.key} {...common} half={f.half ?? true}>
                <input className="crs-input" value={form[f.key] || ''} dir="auto"
                  placeholder={f.placeholder && L(f.placeholder, lang)}
                  onChange={e => set(f.key, e.target.value)} />
              </Field>
            )
        }
      })}
    </div>
  )
}

/* Validate a schema form → array of missing required labels.
   (Co-located with SchemaForm on purpose; it is not a component.) */
// eslint-disable-next-line react-refresh/only-export-components
export function validateSchema(fields, form, lang) {
  const missing = []
  fields.filter(f => !f.when || f.when(form)).forEach(f => {
    if (!f.required || f.type === 'heading') return
    const v = form[f.key]
    const empty = v == null || v === '' || (Array.isArray(v) && v.length === 0)
    if (empty) missing.push(L(f.label, lang))
  })
  return missing
}

/* ════════════════════════════════════════════════════════════════════
   RegisterView — full CRUD list for a Firestore-backed register.
   ════════════════════════════════════════════════════════════════════ */
export function RegisterView({
  lang, t, locale, canEdit,
  title, subtitle, icon,
  rows, columns, fields, initialForm = {},
  onSave, onDelete, onPrint,
  searchKeys = [], filters = [],
  addLabel, emptyIcon, emptyTitle, emptyHint,
  renderDetail, extraToolbar,
}) {
  const [search, setSearch] = useState('')
  const [filterVals, setFilterVals] = useState({})
  const [editing, setEditing] = useState(null) // null | {} (new) | row (edit)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [openRow, setOpenRow] = useState(null)

  const filtered = useMemo(() => {
    let list = rows
    const q = search.trim().toLowerCase()
    if (q) list = list.filter(r => searchKeys.some(k => {
      const val = typeof k === 'function' ? k(r) : r[k]
      return String(val ?? '').toLowerCase().includes(q)
    }))
    filters.forEach(f => {
      const fv = filterVals[f.id]
      if (fv && fv !== 'all') list = list.filter(r => f.get(r) === fv)
    })
    return list
  }, [rows, search, filterVals, searchKeys, filters])

  const openNew = () => { setForm({ ...initialForm }); setEditing({}); setError('') }
  const openEdit = (row) => { setForm({ ...row }); setEditing(row); setError('') }

  const save = async () => {
    const missing = validateSchema(fields, form, lang)
    if (missing.length) { setError((lang === 'ar' ? 'حقول مطلوبة: ' : 'Required: ') + missing.join('، ')); return }
    setSaving(true); setError('')
    try {
      await onSave(form, editing?.id ? editing : null)
      setEditing(null)
    } catch (e) {
      setError(e?.message || String(e))
    }
    setSaving(false)
  }

  return (
    <div className="crs-register">
      <div className="crs-toolbar">
        <div className="crs-search">
          <Search size={14} />
          <input className="crs-search-input" placeholder={t('Search…', 'بحث…')} value={search}
            onChange={e => setSearch(e.target.value)} dir="auto" />
        </div>
        {filters.map(f => (
          <div key={f.id} className="crs-filter">
            <CustomSelect ariaLabel={L(f.label, lang)}
              value={filterVals[f.id] || 'all'}
              onChange={v => setFilterVals(s => ({ ...s, [f.id]: v }))}
              options={[{ value: 'all', label: `${L(f.label, lang)}: ${t('All', 'الكل')}` },
                ...f.options.map(o => ({ value: o.id ?? o.value, label: L(o, lang) ?? o.label }))]} />
          </div>
        ))}
        <div className="crs-toolbar-spacer" />
        {extraToolbar}
        {onPrint && (
          <button className="crs-btn crs-btn-ghost crs-btn-sm" onClick={() => onPrint(filtered)}>
            <Printer size={14} />{t('Print', 'طباعة')}
          </button>
        )}
        {canEdit && (
          <button className="crs-btn crs-btn-primary crs-btn-sm" onClick={openNew}>
            <Plus size={14} />{addLabel || t('Add', 'إضافة')}
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <Empty icon={emptyIcon || icon} title={emptyTitle || t('Nothing here yet', 'لا توجد سجلات بعد')} hint={emptyHint} />
      ) : (
        <div className="crs-table-wrap">
          <table className="crs-table">
            <thead>
              <tr>
                {columns.map(c => <th key={c.key} style={c.width ? { width: c.width } : undefined} dir="auto">{L(c.label, lang)}</th>)}
                <th className="crs-th-actions" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(row => (
                <React.Fragment key={row.id}>
                  <tr className={renderDetail ? 'crs-row-click' : ''}
                    onClick={renderDetail ? () => setOpenRow(openRow === row.id ? null : row.id) : undefined}>
                    {columns.map(c => <td key={c.key} dir="auto">{c.render ? c.render(row) : (row[c.key] ?? '—')}</td>)}
                    <td className="crs-td-actions" onClick={e => e.stopPropagation()}>
                      {renderDetail && (
                        <button className="crs-icon-btn crs-icon-btn-sm" onClick={() => setOpenRow(openRow === row.id ? null : row.id)} aria-label="Details">
                          <ChevronDown size={15} style={{ transform: openRow === row.id ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
                        </button>
                      )}
                      {canEdit && (
                        <button className="crs-icon-btn crs-icon-btn-sm" onClick={() => openEdit(row)} aria-label="Edit"><Pencil size={14} /></button>
                      )}
                    </td>
                  </tr>
                  {renderDetail && openRow === row.id && (
                    <tr className="crs-detail-row">
                      <td colSpan={columns.length + 1}>
                        <div className="crs-detail">
                          {renderDetail(row)}
                          {canEdit && onDelete && (
                            <div className="crs-detail-danger">
                              <DangerDelete lang={lang} small onConfirm={() => { onDelete(row); setOpenRow(null) }} />
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} wide
        title={editing?.id ? t('Edit record', 'تعديل السجل') : (addLabel || t('New record', 'سجل جديد'))}
        sub={title}
        footer={
          <>
            {editing?.id && onDelete && (
              <DangerDelete lang={lang} onConfirm={() => { onDelete(editing); setEditing(null) }} />
            )}
            <div className="crs-toolbar-spacer" />
            <button className="crs-btn crs-btn-ghost" onClick={() => setEditing(null)}>{t('Cancel', 'إلغاء')}</button>
            <button className="crs-btn crs-btn-primary" onClick={save} disabled={saving}>
              {saving ? <Loader2 size={14} className="crs-spin" /> : <Check size={14} />}{t('Save', 'حفظ')}
            </button>
          </>
        }>
        {editing !== null && <SchemaForm fields={fields} form={form} setForm={setForm} lang={lang} />}
        {error && <p className="crs-form-error" dir="auto">{error}</p>}
      </Modal>
    </div>
  )
}
