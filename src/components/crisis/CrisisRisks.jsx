/* ══════════════════════════════════════════════════════════════════════════
   Crisis module — Critical Risk Register + 5×5 heatmap (§13)
   ════════════════════════════════════════════════════════════════════════ */
import { useMemo } from 'react'
import { ShieldAlert } from 'lucide-react'
import { db } from '../../firebase'
import { collection, addDoc, setDoc, doc, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { RegisterView, StatusPill, Pill } from './CrisisShared'
import {
  COL, L, findById, fmtDate, riskScore, riskBand, RISK_SCALE, RISK_BANDS,
  INCIDENT_CATEGORIES, LOCATIONS, JOB_TITLES, ORG_UNITS,
  logCrisisAudit,
} from './crisisData'

const RISK_STATUS = [
  { id: 'open', en: 'Open', ar: 'مفتوح', tone: 'warn' },
  { id: 'monitoring', en: 'Monitoring', ar: 'قيد المراقبة', tone: 'info' },
  { id: 'mitigated', en: 'Mitigated', ar: 'تمت المعالجة', tone: 'good' },
  { id: 'closed', en: 'Closed', ar: 'مغلق', tone: 'neutral' },
]

export default function CrisisRisks(props) {
  const { lang, t, locale, canManage, actor, risks = [], services = [] } = props

  const scored = useMemo(() => risks.map(r => {
    const s = riskScore(r.probability, r.impact); return { ...r, _s: s, _band: riskBand(s) }
  }), [risks])

  /* heatmap counts: rows = impact 5→1, cols = probability 1→5 */
  const cell = (p, i) => scored.filter(r => Number(r.probability) === p && Number(r.impact) === i).length

  const svcOptions = services.map(s => ({ id: s.id, en: s.name_en, ar: s.name_ar || s.name_en }))

  const onSave = async (form, existing) => {
    const clean = { ...form }; delete clean.id
    clean.score = riskScore(form.probability, form.impact)
    clean.band = riskBand(clean.score).id
    if (existing?.id) {
      await setDoc(doc(db, COL.risks, existing.id), { ...clean, updatedAt: serverTimestamp(), updatedByName: actor.name }, { merge: true })
      await logCrisisAudit({ action: 'update', entity: 'risks', entityId: existing.id, actor, summary: `Updated risk ${form.title_en || form.title_ar}` })
    } else {
      const ref = await addDoc(collection(db, COL.risks), { ...clean, createdAt: serverTimestamp(), createdByName: actor.name })
      await logCrisisAudit({ action: 'create', entity: 'risks', entityId: ref.id, actor, summary: `Created risk ${form.title_en || form.title_ar}` })
    }
  }
  const onDelete = async (row) => {
    await deleteDoc(doc(db, COL.risks, row.id))
    await logCrisisAudit({ action: 'delete', entity: 'risks', entityId: row.id, actor, summary: `Deleted risk ${row.title_en || row.title_ar}` })
  }

  const columns = [
    { key: 'title', label: { en: 'Risk', ar: 'المخاطرة' }, render: r => <b dir="auto">{lang === 'ar' ? (r.title_ar || r.title_en) : (r.title_en || r.title_ar)}</b> },
    { key: 'category', label: { en: 'Category', ar: 'الفئة' }, render: r => L(findById(INCIDENT_CATEGORIES, r.category), lang) },
    { key: 'p', label: { en: 'P', ar: 'الاحتمال' }, render: r => <span dir="ltr">{r.probability || '—'}</span> },
    { key: 'i', label: { en: 'I', ar: 'الأثر' }, render: r => <span dir="ltr">{r.impact || '—'}</span> },
    { key: 'score', label: { en: 'Score', ar: 'الدرجة' }, render: r => <span dir="ltr">{riskScore(r.probability, r.impact) || '—'}</span> },
    { key: 'band', label: { en: 'Level', ar: 'المستوى' }, render: r => { const b = riskBand(riskScore(r.probability, r.impact)); return <Pill tone={b.tone} soft={false}>{L(b, lang)}</Pill> } },
    { key: 'owner', label: { en: 'Owner', ar: 'المالك' }, render: r => L(findById(JOB_TITLES, r.owner), lang) || '—' },
    { key: 'status', label: { en: 'Status', ar: 'الحالة' }, render: r => <StatusPill meta={findById(RISK_STATUS, r.status)} lang={lang} /> },
  ]

  const fields = [
    { key: 'title_ar', type: 'text', label: { en: 'Risk title (Arabic)', ar: 'عنوان المخاطرة (عربي)' }, required: true, half: true },
    { key: 'title_en', type: 'text', label: { en: 'Risk title (English)', ar: 'عنوان المخاطرة (إنجليزي)' }, half: true },
    { key: 'category', type: 'select', label: { en: 'Category', ar: 'الفئة' }, options: INCIDENT_CATEGORIES, required: true, half: true },
    { key: 'status', type: 'select', label: { en: 'Status', ar: 'الحالة' }, options: RISK_STATUS, half: true },
    { key: 'description', type: 'textarea', label: { en: 'Description', ar: 'الوصف' } },
    { key: 'causes', type: 'textarea', label: { en: 'Causes', ar: 'الأسباب' } },
    { key: 'consequences', type: 'textarea', label: { en: 'Consequences', ar: 'العواقب' } },
    { key: 'services', type: 'multiselect', label: { en: 'Affected services', ar: 'الخدمات المتأثرة' }, options: svcOptions },
    { key: 'locations', type: 'multiselect', label: { en: 'Affected locations', ar: 'المواقع المتأثرة' }, options: LOCATIONS },
    { key: 'probability', type: 'select', label: { en: 'Probability (1–5)', ar: 'الاحتمال (1–5)' }, options: RISK_SCALE.map(n => ({ id: n, en: String(n), ar: String(n) })), required: true, half: true },
    { key: 'impact', type: 'select', label: { en: 'Impact (1–5)', ar: 'الأثر (1–5)' }, options: RISK_SCALE.map(n => ({ id: n, en: String(n), ar: String(n) })), required: true, half: true },
    { key: 'controls', type: 'textarea', label: { en: 'Existing controls', ar: 'الضوابط الحالية' } },
    { key: 'preventive', type: 'textarea', label: { en: 'Preventive measures', ar: 'التدابير الوقائية' } },
    { key: 'responsePlan', type: 'text', label: { en: 'Response plan', ar: 'خطة الاستجابة' } },
    { key: 'owner', type: 'select', label: { en: 'Risk owner (title)', ar: 'مالك المخاطرة (المسمى)' }, options: JOB_TITLES, half: true },
    { key: 'altOwner', type: 'select', label: { en: 'Alternative owner', ar: 'المالك البديل' }, options: JOB_TITLES, half: true },
    { key: 'unit', type: 'select', label: { en: 'Unit', ar: 'الوحدة' }, options: ORG_UNITS, half: true },
    { key: 'recoveryTime', type: 'text', label: { en: 'Recovery time', ar: 'زمن التعافي' }, half: true },
    { key: 'lastReview', type: 'date', label: { en: 'Last review', ar: 'آخر مراجعة' }, half: true },
    { key: 'nextReview', type: 'date', label: { en: 'Next review', ar: 'المراجعة القادمة' }, half: true },
    { key: 'attachments', type: 'file', label: { en: 'Attachments', ar: 'المرفقات' }, folder: 'risks' },
  ]

  const detailFields = [
    { key: 'description', label: { en: 'Description', ar: 'الوصف' } },
    { key: 'causes', label: { en: 'Causes', ar: 'الأسباب' } },
    { key: 'consequences', label: { en: 'Consequences', ar: 'العواقب' } },
    { key: 'controls', label: { en: 'Controls', ar: 'الضوابط' } },
    { key: 'preventive', label: { en: 'Preventive', ar: 'الوقائية' } },
    { key: 'nextReview', label: { en: 'Next review', ar: 'المراجعة القادمة' }, render: r => fmtDate(r.nextReview, locale) },
  ]

  return (
    <div>
      {/* heatmap */}
      <div className="crs-heatmap-wrap">
        <h3 className="crs-heatmap-title" dir="auto"><ShieldAlert size={15} />{t('Risk heatmap (5 × 5)', 'خريطة المخاطر الحرارية (5 × 5)')}</h3>
        <div className="crs-heatmap">
          <div className="crs-heat-axis-y" dir="auto">{t('Impact', 'الأثر')} →</div>
          <table className="crs-heat-table">
            <tbody>
              {[5, 4, 3, 2, 1].map(i => (
                <tr key={i}>
                  <th className="crs-heat-rowh" dir="ltr">{i}</th>
                  {RISK_SCALE.map(p => {
                    const s = p * i, band = riskBand(s), n = cell(p, i)
                    return (
                      <td key={p} className="crs-heat-cell" style={{ background: band.hex, opacity: n ? 1 : 0.32 }}
                        title={`${L(band, lang)} · ${s}`}>
                        {n > 0 ? <span className="crs-heat-count">{n}</span> : <span className="crs-heat-score">{s}</span>}
                      </td>
                    )
                  })}
                </tr>
              ))}
              <tr><th /> {RISK_SCALE.map(p => <td key={p} className="crs-heat-colh" dir="ltr">{p}</td>)}</tr>
            </tbody>
          </table>
        </div>
        <div className="crs-heat-legend">
          <span dir="auto">{t('Probability', 'الاحتمال')} →</span>
          {RISK_BANDS.map(b => <span key={b.id} className="crs-heat-key"><i style={{ background: b.hex }} />{L(b, lang)} ({b.min}–{b.max})</span>)}
        </div>
      </div>

      <RegisterView
        lang={lang} t={t} locale={locale} canEdit={canManage}
        title={t('Critical Risk Register', 'سجل المخاطر الحرجة')} icon={ShieldAlert}
        rows={risks} columns={columns} fields={fields}
        initialForm={{ status: 'open', probability: 3, impact: 3 }}
        onSave={onSave} onDelete={onDelete}
        addLabel={t('Add risk', 'إضافة مخاطرة')}
        emptyTitle={t('No risks recorded yet', 'لا توجد مخاطر مسجلة بعد')}
        searchKeys={['title_en', 'title_ar']}
        filters={[
          { id: 'category', label: { en: 'Category', ar: 'الفئة' }, options: INCIDENT_CATEGORIES, get: r => r.category },
          { id: 'status', label: { en: 'Status', ar: 'الحالة' }, options: RISK_STATUS, get: r => r.status },
        ]}
        renderDetail={(row) => (
          <div className="crs-detail-grid">
            {detailFields.map(df => (
              <div key={df.key} className="crs-detail-cell">
                <span className="crs-detail-k" dir="auto">{L(df.label, lang)}</span>
                <span className="crs-detail-v" dir="auto">{(df.render ? df.render(row) : row[df.key]) || '—'}</span>
              </div>
            ))}
          </div>
        )}
      />
    </div>
  )
}
