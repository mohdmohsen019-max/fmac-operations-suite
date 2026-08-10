/* ══════════════════════════════════════════════════════════════════════════
   Crisis module — Business Impact Analysis (§12)
   One BIA per critical service: a dimension × horizon impact matrix, an
   auto-computed recovery priority (with justified manual override), and the
   continuity parameters (MTPD / RTO / RPO / min level / dependencies).
   ════════════════════════════════════════════════════════════════════════ */
import { useState } from 'react'
import { Activity, ArrowLeft, Save, Printer } from 'lucide-react'
import { db } from '../../firebase'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { Modal, StatusPill, Pill, Field, Empty, Select } from './CrisisShared'
import {
  COL, L, findById, IMPACT_DIMS, BIA_HORIZONS, BIA_LEVELS, biaPriority,
  ORG_UNITS, logCrisisAudit,
} from './crisisData'
import { printBiaReport } from './crisisPrint'

export default function CrisisBIA(props) {
  const { lang, t, locale, canManage, actor, services = [], bia = [] } = props
  const [openSvc, setOpenSvc] = useState(null)

  const biaFor = (sid) => bia.find(b => b.id === sid || b.serviceId === sid)

  const rows = services.map(s => {
    const b = biaFor(s.id)
    const pr = b?.override ? { id: b.override, en: b.override, ar: b.override } : (b ? biaPriority(b.grid) : null)
    return { svc: s, bia: b, priority: pr }
  })

  if (services.length === 0) {
    return <Empty icon={Activity} title={t('Add critical services first', 'أضف الخدمات الحيوية أولاً')}
      hint={t('Business impact analysis is built on top of the critical services register.', 'يُبنى تحليل أثر الأعمال على سجل الخدمات الحيوية.')} />
  }

  return (
    <div>
      <div className="crs-table-wrap">
        <table className="crs-table">
          <thead>
            <tr>
              <th dir="auto">{t('Service', 'الخدمة')}</th>
              <th dir="auto">{t('Unit', 'الوحدة')}</th>
              <th dir="auto">{t('RTO', 'زمن التعافي')}</th>
              <th dir="auto">{t('BIA status', 'حالة التحليل')}</th>
              <th dir="auto">{t('Recovery priority', 'أولوية التعافي')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ svc, bia: b, priority }) => (
              <tr key={svc.id} className="crs-row-click" onClick={() => setOpenSvc(svc.id)}>
                <td dir="auto"><b>{lang === 'ar' ? (svc.name_ar || svc.name_en) : svc.name_en}</b></td>
                <td dir="auto">{L(findById(ORG_UNITS, svc.unit), lang)}</td>
                <td dir="ltr">{svc.rto || '—'}</td>
                <td>{b ? <Pill tone="good">{t('Assessed', 'مُقيَّمة')}</Pill> : <Pill tone="neutral">{t('Not assessed', 'غير مُقيَّمة')}</Pill>}</td>
                <td>{priority ? <StatusPill meta={priority.tone ? priority : { ...priority, tone: 'info' }} lang={lang} soft={false} /> : '—'}</td>
                <td className="crs-td-actions" onClick={e => e.stopPropagation()}>
                  {b && <button className="crs-icon-btn crs-icon-btn-sm" title={t('Print', 'طباعة')}
                    onClick={() => printBiaReport({ service: svc, bia: b, lang, locale, t })}><Printer size={14} /></button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {openSvc && (
        <BiaEditor service={services.find(s => s.id === openSvc)} bia={biaFor(openSvc)}
          onClose={() => setOpenSvc(null)} lang={lang} t={t} locale={locale} canManage={canManage} actor={actor} />
      )}
    </div>
  )
}

function BiaEditor({ service, bia, onClose, lang, t, locale, canManage, actor }) {
  const [grid, setGrid] = useState(bia?.grid || {})
  const [meta, setMeta] = useState({
    mtpd: bia?.mtpd || service.mtpd || '', rto: bia?.rto || service.rto || '', rpo: bia?.rpo || service.rpo || '',
    minLevel: bia?.minLevel || service.minLevel || '', dependencies: bia?.dependencies || '',
    resources: bia?.resources || '', recoveryStrategy: bia?.recoveryStrategy || service.mainAlternative || '',
    override: bia?.override || '', overrideReason: bia?.overrideReason || '',
  })
  const [saving, setSaving] = useState(false)

  const setCell = (dim, hor, val) => setGrid(g => ({ ...g, [dim]: { ...(g[dim] || {}), [hor]: val } }))
  const computed = biaPriority(grid)
  const effective = meta.override ? { id: meta.override, en: cap(meta.override), ar: cap(meta.override), tone: toneFor(meta.override) } : computed

  const save = async () => {
    setSaving(true)
    try {
      await setDoc(doc(db, COL.bia, service.id), {
        serviceId: service.id, serviceName_en: service.name_en, serviceName_ar: service.name_ar,
        grid, ...meta, computedPriority: computed.id, updatedAt: serverTimestamp(), updatedByName: actor.name,
      }, { merge: true })
      await logCrisisAudit({ action: bia ? 'update' : 'create', entity: 'bia', entityId: service.id, actor,
        summary: `BIA ${service.name_en || service.name_ar} → ${effective.id}` })
      onClose()
    } catch (e) { console.error(e); alert(e?.message || String(e)) }
    setSaving(false)
  }

  return (
    <Modal open onClose={onClose} wide
      title={`${t('Impact analysis', 'تحليل الأثر')} · ${lang === 'ar' ? (service.name_ar || service.name_en) : service.name_en}`}
      footer={<>
        <button className="crs-btn crs-btn-ghost" onClick={() => printBiaReport({ service, bia: { grid, ...meta }, lang, locale, t })}><Printer size={13} />{t('Print', 'طباعة')}</button>
        <div className="crs-toolbar-spacer" />
        <button className="crs-btn crs-btn-ghost" onClick={onClose}><ArrowLeft size={13} />{t('Back', 'رجوع')}</button>
        {canManage && <button className="crs-btn crs-btn-primary" onClick={save} disabled={saving}><Save size={13} />{t('Save', 'حفظ')}</button>}
      </>}>
      <div className="crs-bia-priority">
        <span dir="auto">{t('Calculated recovery priority', 'أولوية التعافي المحسوبة')}</span>
        <StatusPill meta={effective} lang={lang} soft={false} />
        {meta.override && <Pill tone="neutral">{t('Manual override', 'تجاوز يدوي')}</Pill>}
      </div>

      {/* impact matrix */}
      <div className="crs-bia-matrix-wrap">
        <table className="crs-bia-matrix">
          <thead>
            <tr>
              <th dir="auto">{t('Impact ↓ / Time →', 'الأثر ↓ / الوقت →')}</th>
              {BIA_HORIZONS.map(h => <th key={h.id} dir="auto">{L(h, lang)}</th>)}
            </tr>
          </thead>
          <tbody>
            {IMPACT_DIMS.map(d => (
              <tr key={d.id}>
                <th dir="auto">{L(d, lang)}</th>
                {BIA_HORIZONS.map(h => {
                  const v = grid?.[d.id]?.[h.id] || 0
                  return (
                    <td key={h.id}>
                      <div className="crs-bia-levels">
                        {BIA_LEVELS.map(lv => (
                          <button key={lv.id} type="button" disabled={!canManage}
                            className={`crs-bia-lv${v === lv.id ? ' active' : ''}`}
                            style={v === lv.id ? { background: lv.hex, borderColor: lv.hex } : undefined}
                            title={L(lv, lang)} onClick={() => setCell(d.id, h.id, lv.id)}>{lv.id}</button>
                        ))}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="crs-field-hint" dir="auto">{t('0 = none · 4 = severe. Priority rises with peak impact and how fast it escalates.', '0 = لا يوجد · 4 = حرج. ترتفع الأولوية مع ذروة الأثر وسرعة تصاعده.')}</p>

      {/* continuity parameters */}
      <div className="crs-form-grid">
        <Field label={t('MTPD', 'أقصى فترة انقطاع')} half><input className="crs-input" value={meta.mtpd} onChange={e => setMeta(m => ({ ...m, mtpd: e.target.value }))} dir="ltr" /></Field>
        <Field label={t('RTO', 'زمن التعافي')} half><input className="crs-input" value={meta.rto} onChange={e => setMeta(m => ({ ...m, rto: e.target.value }))} dir="ltr" /></Field>
        <Field label={t('RPO', 'نقطة التعافي')} half><input className="crs-input" value={meta.rpo} onChange={e => setMeta(m => ({ ...m, rpo: e.target.value }))} dir="ltr" /></Field>
        <Field label={t('Minimum operating level', 'الحد الأدنى للتشغيل')} half><input className="crs-input" value={meta.minLevel} onChange={e => setMeta(m => ({ ...m, minLevel: e.target.value }))} dir="auto" /></Field>
        <Field label={t('Dependencies', 'الاعتماديات')} full><textarea className="crs-input crs-textarea" rows={2} value={meta.dependencies} onChange={e => setMeta(m => ({ ...m, dependencies: e.target.value }))} dir="auto" /></Field>
        <Field label={t('Resources required', 'الموارد المطلوبة')} full><textarea className="crs-input crs-textarea" rows={2} value={meta.resources} onChange={e => setMeta(m => ({ ...m, resources: e.target.value }))} dir="auto" /></Field>
        <Field label={t('Recovery strategy', 'استراتيجية التعافي')} full><textarea className="crs-input crs-textarea" rows={2} value={meta.recoveryStrategy} onChange={e => setMeta(m => ({ ...m, recoveryStrategy: e.target.value }))} dir="auto" /></Field>
      </div>

      {/* manual override */}
      {canManage && (
        <div className="crs-form-grid">
          <Field label={t('Override priority (optional)', 'تجاوز الأولوية (اختياري)')} half>
            <Select value={meta.override || ''} onChange={v => setMeta(m => ({ ...m, override: v }))} lang={lang}
              options={[{ id: '', en: 'Use calculated', ar: 'استخدام المحسوب' }, { id: 'low', en: 'Low', ar: 'منخفضة' }, { id: 'medium', en: 'Medium', ar: 'متوسطة' }, { id: 'high', en: 'High', ar: 'عالية' }, { id: 'critical', en: 'Critical', ar: 'حرجة' }]} />
          </Field>
          {meta.override && (
            <Field label={t('Justification (required for override)', 'المبرر (مطلوب للتجاوز)')} half>
              <input className="crs-input" value={meta.overrideReason} onChange={e => setMeta(m => ({ ...m, overrideReason: e.target.value }))} dir="auto" />
            </Field>
          )}
        </div>
      )}
    </Modal>
  )
}

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)
const toneFor = (id) => ({ low: 'good', medium: 'info', high: 'warn', critical: 'crit' }[id] || 'info')
