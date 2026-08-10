/* ══════════════════════════════════════════════════════════════════════════
   Crisis module — Incident & Crisis register (§6–§8)
   Report → assess → classify → respond → recover → close, with a 20-step
   workflow tracker, level-based approval, and a closure guard.
   ════════════════════════════════════════════════════════════════════════ */
import { useState, useMemo } from 'react'
import {
  Siren, Plus, Search, ArrowRight, ShieldCheck, CheckCircle2, Circle, Lock,
  AlertTriangle, Radio,
} from 'lucide-react'
import { db } from '../../firebase'
import { collection, addDoc, setDoc, doc, serverTimestamp, arrayUnion } from 'firebase/firestore'
import { Modal, SchemaForm, StatusPill, Pill, Select, Field, validateSchema, Empty } from './CrisisShared'
import {
  COL, L, findById, fmtDateTime, elapsedSince, nowMs,
  INCIDENT_STATUSES, CRISIS_LEVELS, SEVERITIES, INCIDENT_CATEGORIES, INCIDENT_SOURCES,
  INCIDENT_KINDS, WORKFLOW_STAGES, LOCATIONS, ORG_UNITS, JOB_TITLES, IMPACT_DIMS,
  ACTIVE_STATUSES, nextIncidentNumber, logCrisisAudit, pushCrisisNotif,
} from './crisisData'

/* transitions the coarse "manage" user may drive from each status */
const NEXT_STATUS = {
  draft:      ['reported', 'cancelled'],
  reported:   ['assessing', 'cancelled'],
  assessing:  ['activated', 'cancelled'],
  activated:  ['responding'],
  responding: ['contained'],
  contained:  ['recovering'],
  recovering: ['restored'],
  restored:   ['reviewing'],
  reviewing:  ['closed'],
  closed:     [],
  cancelled:  [],
}

export default function CrisisIncidents(props) {
  const { lang, t, locale, canManage, actor, services = [], plans = [], actions = [], incidents = [], goTab } = props
  const canReport = true // any authorised viewer of the module can file a report

  const [search, setSearch] = useState('')
  const [fStatus, setFStatus] = useState('all')
  const [fLevel, setFLevel] = useState('all')
  const [fKind, setFKind] = useState('all')
  const [editing, setEditing] = useState(null) // null | {} | row
  const [form, setForm] = useState({})
  const [detail, setDetail] = useState(null)   // incident being viewed
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const fields = useMemo(() => incidentFields({ lang, services, plans }), [lang, services, plans])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return incidents.filter(i => {
      if (fStatus !== 'all' && i.status !== fStatus) return false
      if (fLevel !== 'all' && i.level !== fLevel) return false
      if (fKind !== 'all' && (i.kind || 'real') !== fKind) return false
      if (q && !`${i.number} ${i.title_en} ${i.title_ar}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [incidents, search, fStatus, fLevel, fKind])

  const openNew = () => { setForm({ kind: 'real', status: 'draft', stage: 'discovery', severity: 'moderate', level: 'l1', source: 'staff', affectedServices: [], locations: [] }); setEditing({}); setError('') }
  const openEdit = (row) => { setForm({ ...row }); setEditing(row); setError('') }

  const save = async () => {
    const missing = validateSchema(fields, form, lang)
    if (missing.length) { setError((lang === 'ar' ? 'حقول مطلوبة: ' : 'Required: ') + missing.join('، ')); return }
    // Defensive closure guard: terminal statuses must go through the workflow
    // status control (which stamps closedAt/closedByName + a statusLog entry and
    // enforces the open-critical-actions check), never this generic edit form.
    if (editing?.id && ['closed', 'cancelled'].includes(form.status) && !['closed', 'cancelled'].includes(editing.status)) {
      setError(t('To close or cancel an incident, use the status control in the incident view.',
        'لإغلاق أو إلغاء الحادث، استخدم عنصر التحكم بالحالة في عرض الحادث.'))
      return
    }
    setSaving(true); setError('')
    try {
      const clean = { ...form }; delete clean.id
      if (editing?.id) {
        await setDoc(doc(db, COL.incidents, editing.id), { ...clean, updatedAt: serverTimestamp(), updatedByName: actor.name }, { merge: true })
        await logCrisisAudit({ action: 'update', entity: 'incidents', entityId: editing.id, actor, summary: `Updated incident ${editing.number}` })
      } else {
        const number = await nextIncidentNumber()
        const ref = await addDoc(collection(db, COL.incidents), {
          ...clean, number,
          status: clean.status || 'reported',
          stage: clean.stage || 'discovery',
          reportedAt: serverTimestamp(), createdAt: serverTimestamp(),
          createdByName: actor.name, createdById: actor.uid,
          stageLog: [{ stage: clean.stage || 'discovery', at: nowMs(), by: actor.name }],
        })
        await logCrisisAudit({ action: 'create', entity: 'incidents', entityId: ref.id, actor, summary: `Reported incident ${number}` })
        await pushCrisisNotif({ kind: clean.level === 'l3' ? 'crit' : 'warn', actor,
          titleEn: `New incident ${number}`, titleAr: `حادث جديد ${number}`,
          bodyEn: clean.title_en || '', bodyAr: clean.title_ar || '',
          link: '/crisis/incidents', forRoles: ['director', 'head_ops', 'head_dept'] })
      }
      setEditing(null)
    } catch (e) { setError(e?.message || String(e)) }
    setSaving(false)
  }

  return (
    <div className="crs-register">
      <div className="crs-toolbar">
        <div className="crs-search">
          <Search size={14} />
          <input className="crs-search-input" placeholder={t('Search incidents…', 'بحث في الحوادث…')} value={search} onChange={e => setSearch(e.target.value)} dir="auto" />
        </div>
        <div className="crs-filter"><Select value={fStatus} onChange={setFStatus} lang={lang}
          options={[{ id: 'all', en: `Status: All`, ar: 'الحالة: الكل' }, ...INCIDENT_STATUSES]} /></div>
        <div className="crs-filter"><Select value={fLevel} onChange={setFLevel} lang={lang}
          options={[{ id: 'all', en: `Level: All`, ar: 'المستوى: الكل' }, ...CRISIS_LEVELS]} /></div>
        <div className="crs-filter"><Select value={fKind} onChange={setFKind} lang={lang}
          options={[{ id: 'all', en: `Type: All`, ar: 'النوع: الكل' }, ...INCIDENT_KINDS]} /></div>
        <div className="crs-toolbar-spacer" />
        {canReport && (
          <button className="crs-btn crs-btn-primary crs-btn-sm" onClick={openNew}>
            <Plus size={14} />{t('Report incident', 'الإبلاغ عن حادث')}
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <Empty icon={Siren} title={t('No incidents match', 'لا توجد حوادث مطابقة')}
          hint={t('Report an incident to begin the response workflow.', 'أبلغ عن حادث لبدء سير عمل الاستجابة.')} />
      ) : (
        <div className="crs-table-wrap">
          <table className="crs-table">
            <thead>
              <tr>
                <th dir="auto">{t('No.', 'الرقم')}</th>
                <th dir="auto">{t('Title', 'العنوان')}</th>
                <th dir="auto">{t('Category', 'الفئة')}</th>
                <th dir="auto">{t('Level', 'المستوى')}</th>
                <th dir="auto">{t('Status', 'الحالة')}</th>
                <th dir="auto">{t('Type', 'النوع')}</th>
                <th dir="auto">{t('Elapsed', 'المدة')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map(inc => (
                <tr key={inc.id} className="crs-row-click" onClick={() => setDetail(inc)}>
                  <td dir="ltr"><b>{inc.number}</b></td>
                  <td dir="auto">{lang === 'ar' ? (inc.title_ar || inc.title_en) : (inc.title_en || inc.title_ar) || '—'}</td>
                  <td dir="auto">{L(findById(INCIDENT_CATEGORIES, inc.category), lang)}</td>
                  <td><StatusPill meta={findById(CRISIS_LEVELS, inc.level)} lang={lang} /></td>
                  <td><StatusPill meta={findById(INCIDENT_STATUSES, inc.status)} lang={lang} /></td>
                  <td><Pill tone={inc.kind === 'exercise' ? 'info' : 'crit'} soft>{L(findById(INCIDENT_KINDS, inc.kind || 'real'), lang)}</Pill></td>
                  <td dir="ltr" className="crs-mono">{ACTIVE_STATUSES.includes(inc.status) ? elapsedSince(inc.createdAt, lang) : '—'}</td>
                  <td className="crs-td-actions" onClick={e => e.stopPropagation()}>
                    {ACTIVE_STATUSES.includes(inc.status) && (
                      <button className="crs-icon-btn crs-icon-btn-sm" title={t('Event room', 'غرفة الحدث')} onClick={() => goTab('room')}><Radio size={15} /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* create / edit */}
      <Modal open={editing !== null} onClose={() => setEditing(null)} wide
        title={editing?.id ? `${t('Edit incident', 'تعديل الحادث')} · ${editing.number}` : t('Report a new incident', 'الإبلاغ عن حادث جديد')}
        footer={<>
          <div className="crs-toolbar-spacer" />
          <button className="crs-btn crs-btn-ghost" onClick={() => setEditing(null)}>{t('Cancel', 'إلغاء')}</button>
          <button className="crs-btn crs-btn-primary" onClick={save} disabled={saving}>{saving ? '…' : t('Save', 'حفظ')}</button>
        </>}>
        {editing !== null && <SchemaForm fields={fields} form={form} setForm={setForm} lang={lang} />}
        {error && <p className="crs-form-error" dir="auto">{error}</p>}
      </Modal>

      {/* detail + workflow */}
      {detail && (
        <IncidentDetail incident={incidents.find(i => i.id === detail.id) || detail}
          onClose={() => setDetail(null)} onEdit={() => { setDetail(null); openEdit(detail) }}
          lang={lang} t={t} locale={locale} canManage={canManage} actor={actor}
          actions={actions} services={services} goTab={goTab} />
      )}
    </div>
  )
}

/* ─────────────────────── incident detail + workflow ─────────────────────── */
function IncidentDetail({ incident, onClose, onEdit, lang, t, locale, canManage, actor, actions, services, goTab }) {
  const [busy, setBusy] = useState(false)
  const [exception, setException] = useState('')
  const [showException, setShowException] = useState(false)

  const inc = incident
  const level = findById(CRISIS_LEVELS, inc.level)
  const stageIdx = WORKFLOW_STAGES.findIndex(s => s.id === inc.stage)
  const myActions = actions.filter(a => a.incidentId === inc.id)
  const openCritical = myActions.filter(a => (a.priority === 'critical' || a.priority === 'high') && !['done', 'verified', 'cancelled'].includes(a.status))

  const advanceStage = async () => {
    if (stageIdx >= WORKFLOW_STAGES.length - 1) return
    const next = WORKFLOW_STAGES[stageIdx + 1]
    setBusy(true)
    try {
      await setDoc(doc(db, COL.incidents, inc.id), {
        stage: next.id,
        stageLog: arrayUnion({ stage: next.id, at: nowMs(), by: actor.name }),
        updatedAt: serverTimestamp(), updatedByName: actor.name,
      }, { merge: true })
      await logCrisisAudit({ action: 'stage', entity: 'incidents', entityId: inc.id, actor, summary: `${inc.number} → stage ${next.en}` })
    } catch (e) { console.error(e) }
    setBusy(false)
  }

  const changeStatus = async (to) => {
    // closure guard
    if (to === 'closed' && openCritical.length > 0 && !exception.trim()) {
      setShowException(true); return
    }
    setBusy(true)
    try {
      const patch = {
        status: to, updatedAt: serverTimestamp(), updatedByName: actor.name,
        statusLog: arrayUnion({ status: to, at: nowMs(), by: actor.name }),
      }
      if (to === 'closed') { patch.closedAt = serverTimestamp(); patch.closedByName = actor.name; if (exception.trim()) patch.closureException = exception.trim() }
      await setDoc(doc(db, COL.incidents, inc.id), patch, { merge: true })
      await logCrisisAudit({ action: to === 'closed' ? 'close' : 'status', entity: 'incidents', entityId: inc.id, actor,
        summary: `${inc.number} → ${to}${exception.trim() ? ' (documented exception)' : ''}` })
      if (['activated', 'responding'].includes(to)) {
        await pushCrisisNotif({ kind: 'crit', actor, titleEn: `${inc.number} activated`, titleAr: `${inc.number} تم التفعيل`,
          link: '/crisis/room', forRoles: level?.approverRoles || ['head_ops'] })
      }
      setShowException(false); setException('')
    } catch (e) { console.error(e) }
    setBusy(false)
  }

  const nexts = NEXT_STATUS[inc.status] || []
  const needsApproval = ['activated'].includes(inc.status) === false && nexts.includes('activated')

  return (
    <Modal open onClose={onClose} wide title={`${inc.number} · ${lang === 'ar' ? (inc.title_ar || inc.title_en) : (inc.title_en || inc.title_ar) || ''}`}
      sub={`${L(findById(INCIDENT_CATEGORIES, inc.category), lang)} · ${L(level, lang)}`}
      footer={<>
        {canManage && <button className="crs-btn crs-btn-ghost" onClick={onEdit}>{t('Edit fields', 'تعديل الحقول')}</button>}
        <div className="crs-toolbar-spacer" />
        {ACTIVE_STATUSES.includes(inc.status) && (
          <button className="crs-btn crs-btn-ghost" onClick={() => { onClose(); goTab('room') }}><Radio size={13} />{t('Open event room', 'فتح غرفة الحدث')}</button>
        )}
        <button className="crs-btn crs-btn-primary" onClick={onClose}>{t('Close', 'إغلاق')}</button>
      </>}>
      <div className="crs-inc-detail">
        {/* status + level + approval banner */}
        <div className="crs-inc-badges">
          <StatusPill meta={findById(INCIDENT_STATUSES, inc.status)} lang={lang} soft={false} />
          <StatusPill meta={level} lang={lang} />
          <StatusPill meta={findById(SEVERITIES, inc.severity)} lang={lang} soft />
          <Pill tone={inc.kind === 'exercise' ? 'info' : 'crit'}>{L(findById(INCIDENT_KINDS, inc.kind || 'real'), lang)}</Pill>
          {ACTIVE_STATUSES.includes(inc.status) && <Pill tone="warn">{t('Elapsed', 'المدة')} {elapsedSince(inc.createdAt, lang)}</Pill>}
        </div>

        {level && (
          <div className="crs-inc-approval" dir="auto">
            <ShieldCheck size={14} />
            {t('Approval authority for this level:', 'صلاحية الاعتماد لهذا المستوى:')} <b>{L({ en: level.approverEn, ar: level.approverAr }, lang)}</b>
          </div>
        )}

        {/* description + key facts */}
        <div className="crs-detail-grid">
          <Cell k={{ en: 'Description', ar: 'الوصف' }} v={inc.description} lang={lang} full />
          <Cell k={{ en: 'Location', ar: 'الموقع' }} v={(inc.locations || []).map(l => L(findById(LOCATIONS, l), lang)).join('، ')} lang={lang} />
          <Cell k={{ en: 'Unit', ar: 'الوحدة' }} v={L(findById(ORG_UNITS, inc.unit), lang)} lang={lang} />
          <Cell k={{ en: 'Commander', ar: 'قائد الحدث' }} v={L(findById(JOB_TITLES, inc.commander), lang)} lang={lang} />
          <Cell k={{ en: 'Source', ar: 'المصدر' }} v={L(findById(INCIDENT_SOURCES, inc.source), lang)} lang={lang} />
          <Cell k={{ en: 'Affected services', ar: 'الخدمات المتأثرة' }} v={(inc.affectedServices || []).map(s => { const svc = services.find(x => x.id === s); return svc ? (lang === 'ar' ? svc.name_ar : svc.name_en) : s }).join('، ')} lang={lang} full />
          <Cell k={{ en: 'Reported', ar: 'وقت الإبلاغ' }} v={fmtDateTime(inc.reportedAt || inc.createdAt, locale)} lang={lang} />
          <Cell k={{ en: 'Next update', ar: 'التحديث القادم' }} v={inc.nextUpdate ? fmtDateTime(inc.nextUpdate, locale) : '—'} lang={lang} />
        </div>

        {/* impacts */}
        <div className="crs-inc-impacts">
          {IMPACT_DIMS.map(d => inc[`impact_${d.id}`] ? (
            <div key={d.id} className="crs-inc-impact"><span dir="auto">{L(d, lang)}</span><b dir="auto">{inc[`impact_${d.id}`]}</b></div>
          ) : null)}
        </div>

        {/* workflow tracker */}
        <h4 className="crs-form-heading" dir="auto">{t('Response workflow', 'سير عمل الاستجابة')}</h4>
        <div className="crs-workflow">
          {WORKFLOW_STAGES.map((s, i) => {
            const done = i < stageIdx, cur = i === stageIdx
            return (
              <div key={s.id} className={`crs-wf-step${done ? ' done' : ''}${cur ? ' current' : ''}`}>
                {done ? <CheckCircle2 size={14} /> : cur ? <Circle size={14} /> : <Circle size={14} className="crs-wf-dim" />}
                <span dir="auto">{L(s, lang)}</span>
              </div>
            )
          })}
        </div>
        {canManage && stageIdx < WORKFLOW_STAGES.length - 1 && !['closed', 'cancelled'].includes(inc.status) && (
          <button className="crs-btn crs-btn-ghost crs-btn-sm" disabled={busy} onClick={advanceStage}>
            <ArrowRight size={13} />{t('Advance stage', 'المرحلة التالية')}: {L(WORKFLOW_STAGES[stageIdx + 1], lang)}
          </button>
        )}

        {/* action summary */}
        <h4 className="crs-form-heading" dir="auto">{t('Actions', 'الإجراءات')} · {myActions.length}</h4>
        {openCritical.length > 0 && (
          <div className="crs-inc-warn" dir="auto"><AlertTriangle size={14} />
            {t(`${openCritical.length} critical/high action(s) still open — required before closure.`,
               `${openCritical.length} إجراء حرج/عالٍ لا يزال مفتوحاً — مطلوب إنجازه قبل الإغلاق.`)}
          </div>
        )}

        {/* status control */}
        {canManage && nexts.length > 0 && (
          <>
            <h4 className="crs-form-heading" dir="auto">{t('Change status', 'تغيير الحالة')}</h4>
            {needsApproval && (
              <p className="crs-field-hint" dir="auto">
                {t('Activation requires approval by the level authority above.', 'يتطلب التفعيل اعتماد صاحب الصلاحية للمستوى أعلاه.')}
              </p>
            )}
            <div className="crs-status-actions">
              {nexts.map(s => {
                const meta = findById(INCIDENT_STATUSES, s)
                return <button key={s} className="crs-btn crs-btn-ghost crs-btn-sm" disabled={busy} onClick={() => changeStatus(s)}>
                  <ArrowRight size={12} />{L(meta, lang)}
                </button>
              })}
            </div>
            {showException && (
              <div className="crs-exception">
                <Lock size={13} />
                <Field label={t('Documented exception (required to close with open critical actions)', 'استثناء موثق (مطلوب للإغلاق مع وجود إجراءات حرجة مفتوحة)')} full>
                  <textarea className="crs-input crs-textarea" rows={2} value={exception} onChange={e => setException(e.target.value)} dir="auto" />
                </Field>
                <button className="crs-btn crs-btn-danger crs-btn-sm" disabled={!exception.trim()} onClick={() => changeStatus('closed')}>
                  {t('Close with exception', 'إغلاق مع استثناء')}
                </button>
              </div>
            )}
          </>
        )}

        {/* closure info */}
        {inc.status === 'closed' && (
          <div className="crs-detail-grid">
            <Cell k={{ en: 'Closed at', ar: 'وقت الإغلاق' }} v={fmtDateTime(inc.closedAt, locale)} lang={lang} />
            <Cell k={{ en: 'Root cause', ar: 'السبب الجذري' }} v={inc.rootCause} lang={lang} />
            <Cell k={{ en: 'Lessons learned', ar: 'الدروس المستفادة' }} v={inc.lessons} lang={lang} full />
            {inc.closureException && <Cell k={{ en: 'Closure exception', ar: 'استثناء الإغلاق' }} v={inc.closureException} lang={lang} full />}
          </div>
        )}
      </div>
    </Modal>
  )
}

function Cell({ k, v, lang, full }) {
  return (
    <div className={`crs-detail-cell${full ? ' crs-detail-cell--full' : ''}`}>
      <span className="crs-detail-k" dir="auto">{L(k, lang)}</span>
      <span className="crs-detail-v" dir="auto">{v == null || v === '' ? '—' : v}</span>
    </div>
  )
}

/* ─────────────────────── incident form schema ─────────────────────── */
function incidentFields({ lang, services, plans }) {
  const svcOptions = services.map(s => ({ id: s.id, en: s.name_en, ar: s.name_ar || s.name_en }))
  const planOptions = plans.map(p => ({ id: p.id, en: p.name_en, ar: p.name_ar }))
  return [
    { key: 'h1', type: 'heading', label: { en: 'Identification', ar: 'التعريف' } },
    { key: 'title_ar', type: 'text', label: { en: 'Title (Arabic)', ar: 'العنوان (عربي)' }, required: true, half: true },
    { key: 'title_en', type: 'text', label: { en: 'Title (English)', ar: 'العنوان (إنجليزي)' }, half: true },
    { key: 'description', type: 'textarea', label: { en: 'Description', ar: 'الوصف' }, required: true },
    { key: 'category', type: 'select', label: { en: 'Category', ar: 'الفئة' }, options: INCIDENT_CATEGORIES, required: true },
    { key: 'source', type: 'select', label: { en: 'Source', ar: 'المصدر' }, options: INCIDENT_SOURCES },
    { key: 'kind', type: 'select', label: { en: 'Real or simulation', ar: 'حادث فعلي أم تمرين' }, options: INCIDENT_KINDS, required: true },
    { key: 'detectedAt', type: 'datetime', label: { en: 'Detected at', ar: 'وقت الاكتشاف' }, half: true },
    { key: 'nextUpdate', type: 'datetime', label: { en: 'Next update at', ar: 'وقت التحديث القادم' }, half: true },

    { key: 'h2', type: 'heading', label: { en: 'Location & ownership', ar: 'الموقع والمسؤولية' } },
    { key: 'locations', type: 'multiselect', label: { en: 'Location(s)', ar: 'الموقع/المواقع' }, options: LOCATIONS },
    { key: 'site', type: 'text', label: { en: 'Specific site / room', ar: 'الموقع أو الغرفة تحديداً' }, half: true },
    { key: 'unit', type: 'select', label: { en: 'Organizational unit', ar: 'الوحدة التنظيمية' }, options: ORG_UNITS, half: true },
    { key: 'reporter', type: 'text', label: { en: 'Reporting employee', ar: 'الموظف المُبلِّغ' }, half: true },
    { key: 'commander', type: 'select', label: { en: 'Incident commander', ar: 'قائد الحدث' }, options: JOB_TITLES, half: true },
    { key: 'team', type: 'multiselect', label: { en: 'Response team', ar: 'فريق الاستجابة' }, options: JOB_TITLES },

    { key: 'h3', type: 'heading', label: { en: 'Classification', ar: 'التصنيف' } },
    { key: 'level', type: 'select', label: { en: 'Crisis level', ar: 'مستوى الأزمة' }, options: CRISIS_LEVELS, required: true, half: true },
    { key: 'severity', type: 'select', label: { en: 'Severity', ar: 'الخطورة' }, options: SEVERITIES, half: true },
    { key: 'status', type: 'select', label: { en: 'Current status', ar: 'الحالة الحالية' }, options: INCIDENT_STATUSES.filter(s => s.id !== 'closed' && s.id !== 'cancelled'), half: true },
    { key: 'stage', type: 'select', label: { en: 'Response stage', ar: 'مرحلة الاستجابة' }, options: WORKFLOW_STAGES, half: true },

    { key: 'h4', type: 'heading', label: { en: 'Affected scope', ar: 'النطاق المتأثر' } },
    { key: 'affectedServices', type: 'multiselect', label: { en: 'Affected services', ar: 'الخدمات المتأثرة' }, options: svcOptions },
    { key: 'affectedSystems', type: 'tags', label: { en: 'Affected systems', ar: 'الأنظمة المتأثرة' } },
    { key: 'affectedAssets', type: 'tags', label: { en: 'Affected assets', ar: 'الأصول المتأثرة' } },
    { key: 'affectedVehicles', type: 'tags', label: { en: 'Affected vehicles', ar: 'المركبات المتأثرة' } },
    { key: 'affectedFacilities', type: 'tags', label: { en: 'Affected facilities', ar: 'المرافق المتأثرة' } },
    { key: 'countPlayers', type: 'number', label: { en: 'Affected players (est.)', ar: 'اللاعبون المتأثرون (تقدير)' }, half: true },
    { key: 'countStaff', type: 'number', label: { en: 'Affected employees (est.)', ar: 'الموظفون المتأثرون (تقدير)' }, half: true },
    { key: 'countVisitors', type: 'number', label: { en: 'Affected visitors (est.)', ar: 'الزوار المتأثرون (تقدير)' }, half: true },

    { key: 'h5', type: 'heading', label: { en: 'Impact assessment', ar: 'تقييم الأثر' } },
    { key: 'impact_safety', type: 'text', label: { en: 'Safety impact', ar: 'أثر السلامة' }, half: true },
    { key: 'impact_operational', type: 'text', label: { en: 'Operational impact', ar: 'الأثر التشغيلي' }, half: true },
    { key: 'impact_financial', type: 'text', label: { en: 'Financial impact', ar: 'الأثر المالي' }, half: true },
    { key: 'impact_legal', type: 'text', label: { en: 'Legal / regulatory', ar: 'الأثر القانوني/التنظيمي' }, half: true },
    { key: 'impact_reputation', type: 'text', label: { en: 'Reputation impact', ar: 'أثر السمعة' }, half: true },
    { key: 'impact_stakeholder', type: 'text', label: { en: 'Stakeholder impact', ar: 'أثر أصحاب المصلحة' }, half: true },

    { key: 'h6', type: 'heading', label: { en: 'Response', ar: 'الاستجابة' } },
    { key: 'initialActions', type: 'textarea', label: { en: 'Initial actions', ar: 'الإجراءات الأولية' } },
    { key: 'planId', type: 'select', label: { en: 'Selected response plan', ar: 'خطة الاستجابة المختارة' }, options: planOptions, half: true },
    { key: 'expectedRecovery', type: 'text', label: { en: 'Expected recovery time', ar: 'زمن التعافي المتوقع' }, half: true },
    { key: 'attachments', type: 'file', label: { en: 'Attachments / evidence', ar: 'المرفقات / الأدلة' }, folder: 'incidents' },
    { key: 'internalNotes', type: 'textarea', label: { en: 'Internal notes', ar: 'ملاحظات داخلية' } },

    { key: 'h7', type: 'heading', label: { en: 'Closure (when resolved)', ar: 'الإغلاق (عند الحل)' } },
    { key: 'closureSummary', type: 'textarea', label: { en: 'Closure summary', ar: 'ملخص الإغلاق' } },
    { key: 'rootCause', type: 'textarea', label: { en: 'Root cause', ar: 'السبب الجذري' } },
    { key: 'lessons', type: 'textarea', label: { en: 'Lessons learned', ar: 'الدروس المستفادة' } },
  ]
}
