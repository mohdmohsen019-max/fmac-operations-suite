/* ══════════════════════════════════════════════════════════════════════════
   Crisis module — Performance Indicators (§25)
   Ten indicators auto-calculated from live records, with configurable annual
   targets for 2026 / 2027 / 2028 and never-negative attainment.
   ════════════════════════════════════════════════════════════════════════ */
import { useState, useEffect, useMemo } from 'react'
import { Gauge, Printer, Save, Pencil } from 'lucide-react'
import { db } from '../../firebase'
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore'
import { Section, StatusPill, Empty } from './CrisisShared'
import {
  COL, L, KPIS, computeCrisisKpis, attainment, kpiStatusOf, logCrisisAudit,
} from './crisisData'
import { printKpiReport } from './crisisPrint'

const YEARS = [2026, 2027, 2028]
const FREQ = { annual: { en: 'Annual', ar: 'سنوي' }, quarterly: { en: 'Quarterly', ar: 'ربع سنوي' } }

export default function CrisisKpis(props) {
  const { lang, t, locale, canManage, actor, incidents = [], services = [], plans = [],
    exercises = [], corrective = [], contacts = [], recovery = [] } = props

  const [year, setYear] = useState(2026)
  const [overrides, setOverrides] = useState({})
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const unsub = onSnapshot(doc(db, COL.settings, 'kpi_targets'),
      snap => setOverrides(snap.exists() ? (snap.data().targets || {}) : {}),
      () => setOverrides({}))
    return unsub
  }, [])

  const kpis = useMemo(() => computeCrisisKpis({ incidents, services, plans, exercises, corrective, contacts, recovery }),
    [incidents, services, plans, exercises, corrective, contacts, recovery])

  const targetOf = (k, y) => {
    const o = overrides?.[k.id]?.[y]
    return (o === 0 || o) ? o : k.targets[y]
  }

  const rows = KPIS.map(k => {
    const tgt = targetOf(k, year)
    const v = kpis[k.id]?.value
    const att = attainment(k, v, tgt)
    return { k, tgt, v, att, status: kpiStatusOf(att), note: kpis[k.id]?.note }
  })

  const unitSuffix = (k) => k.ut === '%' ? '%' : k.ut === 'h' ? (lang === 'ar' ? ' س' : 'h') : ''

  const startEdit = () => {
    const d = {}
    KPIS.forEach(k => { d[k.id] = {}; YEARS.forEach(y => { d[k.id][y] = targetOf(k, y) }) })
    setDraft(d); setEditing(true)
  }
  const saveTargets = async () => {
    setSaving(true)
    try {
      await setDoc(doc(db, COL.settings, 'kpi_targets'), { targets: draft, updatedAt: serverTimestamp(), updatedByName: actor.name }, { merge: true })
      await logCrisisAudit({ action: 'update', entity: 'kpi_targets', entityId: 'kpi_targets', actor, summary: 'Updated crisis KPI targets' })
      setEditing(false)
    } catch (e) { console.error(e); alert(e?.message || String(e)) }
    setSaving(false)
  }

  return (
    <div>
      <Section
        title={t('Performance Indicators', 'مؤشرات الأداء')}
        sub={t('Auto-calculated from live crisis records — never hard-coded, never negative.', 'محسوبة تلقائياً من سجلات الأزمات الحية — غير ثابتة ولا سالبة.')}
        icon={Gauge}
        actions={
          <div className="crs-kpi-actions">
            <div className="crs-year-toggle">
              {YEARS.map(y => <button key={y} className={`crs-chip${year === y ? ' active' : ''}`} onClick={() => setYear(y)}>{y}</button>)}
            </div>
            {canManage && !editing && <button className="crs-btn crs-btn-ghost crs-btn-sm" onClick={startEdit}><Pencil size={13} />{t('Edit targets', 'تعديل المستهدفات')}</button>}
            {editing && <button className="crs-btn crs-btn-primary crs-btn-sm" onClick={saveTargets} disabled={saving}><Save size={13} />{t('Save targets', 'حفظ المستهدفات')}</button>}
            <button className="crs-btn crs-btn-ghost crs-btn-sm" onClick={() => printKpiReport({ kpis, year, lang, locale, t, targetsOverride: overrides })}><Printer size={13} />{t('Print', 'طباعة')}</button>
          </div>
        }
      />

      {rows.length === 0 ? <Empty icon={Gauge} title={t('No indicators', 'لا مؤشرات')} /> : (
        <div className="crs-table-wrap">
          <table className="crs-table crs-kpi-table">
            <thead>
              <tr>
                <th dir="auto">{t('Indicator', 'المؤشر')}</th>
                <th dir="auto">{t('Cadence', 'الدورية')}</th>
                {editing
                  ? YEARS.map(y => <th key={y} dir="auto">{t('Target', 'المستهدف')} {y}</th>)
                  : <th dir="auto">{t('Target', 'المستهدف')} {year}</th>}
                <th dir="auto">{t('Actual', 'الفعلي')}</th>
                <th dir="auto">{t('Attainment', 'الإنجاز')}</th>
                <th dir="auto">{t('Status', 'الحالة')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ k, tgt, v, att, status, note }) => (
                <tr key={k.id}>
                  <td dir="auto">
                    <b>{L(k, lang)}</b>
                    {note && <div className="crs-kpi-note" dir="auto">{L(note, lang)}</div>}
                  </td>
                  <td dir="auto">{L(FREQ[k.freq] || FREQ.annual, lang)}</td>
                  {editing
                    ? YEARS.map(y => (
                      <td key={y}>
                        <input type="number" className="crs-input crs-input-sm" dir="ltr"
                          value={draft[k.id]?.[y] ?? ''} onChange={e => setDraft(d => ({ ...d, [k.id]: { ...d[k.id], [y]: e.target.value === '' ? '' : Number(e.target.value) } }))} />
                      </td>
                    ))
                    : <td dir="ltr" className="num">{tgt}{unitSuffix(k)}</td>}
                  <td dir="ltr" className="num">{v == null ? '—' : `${v}${unitSuffix(k)}`}</td>
                  <td dir="ltr" className="num">{att == null ? '—' : `${Math.round(att)}%`}</td>
                  <td><StatusPill meta={status} lang={lang} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
