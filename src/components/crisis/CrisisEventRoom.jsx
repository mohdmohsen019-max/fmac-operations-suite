/* ══════════════════════════════════════════════════════════════════════════
   Crisis module — Event Management Room (§9, §10)
   A live console for each active incident: summary, service status, decisions,
   action tracker, merged timeline, recovery progress and escalation.
   Live data arrives through the shell's real-time listeners (props).
   ════════════════════════════════════════════════════════════════════════ */
import { useState, useMemo } from 'react'
import {
  Radio, Gavel, ListChecks, Megaphone, TrendingUp, ChevronsUp, Plus, Clock,
  ShieldAlert,
} from 'lucide-react'
import { db } from '../../firebase'
import { collection, addDoc, setDoc, doc, serverTimestamp, arrayUnion } from 'firebase/firestore'
import { Modal, SchemaForm, StatusPill, Pill, Select, Empty, validateSchema } from './CrisisShared'
import {
  COL, L, findById, fmtDateTime, elapsedSince, toMillis, nowMs,
  INCIDENT_STATUSES, CRISIS_LEVELS, WORKFLOW_STAGES, JOB_TITLES, ORG_UNITS,
  ACTION_STATUSES, PRIORITIES, ACTIVE_STATUSES, SERVICE_STATUS, AUDIENCES, CHANNELS,
  logCrisisAudit, pushCrisisNotif, nextDecisionNumber,
} from './crisisData'

export default function CrisisEventRoom(props) {
  const { lang, t, locale, canManage, actor, incidents = [], decisions = [], actions = [], comms = [], services = [] } = props

  const active = useMemo(() => incidents.filter(i => ACTIVE_STATUSES.includes(i.status))
    .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt)), [incidents])
  const [sel, setSel] = useState(null)
  const inc = active.find(i => i.id === sel) || active[0] || null

  const [modal, setModal] = useState(null) // 'decision' | 'action' | 'comm'
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (active.length === 0) {
    return <Empty icon={Radio} title={t('No active incident', 'لا يوجد حادث نشط')}
      hint={t('The event room opens automatically when an incident is activated.', 'تُفتح غرفة الحدث تلقائياً عند تفعيل أي حادث.')} />
  }

  const myDecisions = decisions.filter(d => d.incidentId === inc.id).sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
  const myActions = actions.filter(a => a.incidentId === inc.id)
  const myComms = comms.filter(c => c.incidentId === inc.id).sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
  const doneActions = myActions.filter(a => ['done', 'verified'].includes(a.status)).length
  const recoveryPct = myActions.length ? Math.round((doneActions / myActions.length) * 100) : 0
  const level = findById(CRISIS_LEVELS, inc.level)
  const stageIdx = WORKFLOW_STAGES.findIndex(s => s.id === inc.stage)

  /* merged timeline (plain compute — placed after the early return, so it must
     not be a hook) */
  const timeline = (() => {
    const rows = []
    ;(inc.stageLog || []).forEach(s => rows.push({ at: s.at, kind: 'stage', text: L(findById(WORKFLOW_STAGES, s.stage), lang), by: s.by }))
    ;(inc.statusLog || []).forEach(s => rows.push({ at: s.at, kind: 'status', text: L(findById(INCIDENT_STATUSES, s.status), lang), by: s.by }))
    myDecisions.forEach(d => rows.push({ at: toMillis(d.createdAt), kind: 'decision', text: d.text, by: d.maker && L(findById(JOB_TITLES, d.maker), lang) }))
    myComms.forEach(c => rows.push({ at: toMillis(c.createdAt), kind: 'comm', text: c.messageType, by: '' }))
    return rows.filter(r => r.at).sort((a, b) => b.at - a.at)
  })()

  const openModal = (kind) => {
    setError('')
    if (kind === 'decision') setForm({ approval: 'pending', implementation: 'new' })
    else if (kind === 'action') setForm({ status: 'new', priority: 'high' })
    else setForm({ status: 'draft', audiences: [], channel: 'system' })
    setModal(kind)
  }

  const saveModal = async () => {
    const schema = modal === 'decision' ? decisionFields(lang) : modal === 'action' ? actionFields(lang, services) : commFields(lang)
    const missing = validateSchema(schema, form, lang)
    if (missing.length) { setError((lang === 'ar' ? 'حقول مطلوبة: ' : 'Required: ') + missing.join('، ')); return }
    setSaving(true); setError('')
    try {
      const base = { incidentId: inc.id, incidentNumber: inc.number, createdAt: serverTimestamp(), createdByName: actor.name }
      if (modal === 'decision') {
        const n = await nextDecisionNumber(inc.id)
        await addDoc(collection(db, COL.decisions), { ...form, number: n, ...base })
        await logCrisisAudit({ action: 'decision', entity: 'decisions', entityId: inc.id, actor, summary: `${inc.number} decision ${n}` })
      } else if (modal === 'action') {
        await addDoc(collection(db, COL.actions), { ...form, ...base })
        await logCrisisAudit({ action: 'action', entity: 'actions', entityId: inc.id, actor, summary: `${inc.number} action added` })
      } else {
        await addDoc(collection(db, COL.comms), { ...form, ...base })
        await logCrisisAudit({ action: 'comm', entity: 'comms', entityId: inc.id, actor, summary: `${inc.number} communication logged` })
      }
      setModal(null)
    } catch (e) { setError(e?.message || String(e)) }
    setSaving(false)
  }

  const setActionStatus = async (a, status) => {
    try {
      await setDoc(doc(db, COL.actions, a.id), {
        status, ...(status === 'done' ? { completedAt: serverTimestamp() } : {}), updatedByName: actor.name,
      }, { merge: true })
      await logCrisisAudit({ action: 'action-status', entity: 'actions', entityId: a.id, actor, summary: `${inc.number} action → ${status}` })
    } catch (e) { console.error(e) }
  }

  const escalate = async () => {
    const order = ['l1', 'l2', 'l3']
    const idx = order.indexOf(inc.level)
    if (idx >= order.length - 1) return
    const to = order[idx + 1]
    try {
      await setDoc(doc(db, COL.incidents, inc.id), {
        level: to, escalatedAt: serverTimestamp(), escalatedByName: actor.name,
        statusLog: arrayUnion({ status: inc.status, at: nowMs(), by: actor.name, note: `escalated to ${to}` }),
      }, { merge: true })
      await logCrisisAudit({ action: 'escalate', entity: 'incidents', entityId: inc.id, actor, summary: `${inc.number} escalated ${inc.level} → ${to}` })
      const lvl = findById(CRISIS_LEVELS, to)
      await pushCrisisNotif({ kind: 'crit', actor, titleEn: `${inc.number} escalated to ${lvl?.en}`, titleAr: `${inc.number} تصعيد إلى ${lvl?.ar}`,
        link: '/crisis/room', forRoles: lvl?.approverRoles || ['director'] })
    } catch (e) { console.error(e) }
  }

  const setPhase = async (stageId) => {
    try {
      await setDoc(doc(db, COL.incidents, inc.id), {
        stage: stageId, stageLog: arrayUnion({ stage: stageId, at: nowMs(), by: actor.name }),
      }, { merge: true })
      await logCrisisAudit({ action: 'stage', entity: 'incidents', entityId: inc.id, actor, summary: `${inc.number} phase → ${stageId}` })
    } catch (e) { console.error(e) }
  }

  return (
    <div className="crs-room">
      {/* active incident selector */}
      {active.length > 1 && (
        <div className="crs-room-selector">
          {active.map(a => (
            <button key={a.id} className={`crs-chip${(inc.id === a.id) ? ' active' : ''}`} onClick={() => setSel(a.id)}>
              {a.number}
            </button>
          ))}
        </div>
      )}

      {/* command bar */}
      <div className="crs-room-head">
        <div className="crs-room-head-main">
          <div className="crs-room-live"><span className="crs-live-dot" />{t('LIVE', 'مباشر')}</div>
          <h2 dir="auto">{inc.number} · {lang === 'ar' ? (inc.title_ar || inc.title_en) : (inc.title_en || inc.title_ar)}</h2>
          <div className="crs-room-badges">
            <StatusPill meta={level} lang={lang} soft={false} />
            <StatusPill meta={findById(INCIDENT_STATUSES, inc.status)} lang={lang} />
            <Pill tone="warn"><Clock size={12} />{elapsedSince(inc.createdAt, lang)}</Pill>
            <Pill tone="neutral">{t('Phase', 'المرحلة')}: {L(findById(WORKFLOW_STAGES, inc.stage), lang)}</Pill>
            {inc.commander && <Pill tone="info">{L(findById(JOB_TITLES, inc.commander), lang)}</Pill>}
          </div>
        </div>
        {canManage && (
          <div className="crs-room-actions">
            <button className="crs-btn crs-btn-ghost crs-btn-sm" onClick={() => openModal('decision')}><Gavel size={13} />{t('Decision', 'قرار')}</button>
            <button className="crs-btn crs-btn-ghost crs-btn-sm" onClick={() => openModal('action')}><ListChecks size={13} />{t('Action', 'إجراء')}</button>
            <button className="crs-btn crs-btn-ghost crs-btn-sm" onClick={() => openModal('comm')}><Megaphone size={13} />{t('Update', 'تحديث')}</button>
            {inc.level !== 'l3' && <button className="crs-btn crs-btn-ghost-danger crs-btn-sm" onClick={escalate}><ChevronsUp size={13} />{t('Escalate', 'تصعيد')}</button>}
          </div>
        )}
      </div>

      {/* recovery progress */}
      <div className="crs-room-progress">
        <div className="crs-room-progress-top">
          <span dir="auto"><TrendingUp size={13} /> {t('Recovery progress', 'تقدم التعافي')}</span>
          <b dir="ltr">{recoveryPct}%</b>
        </div>
        <div className="crs-progress-track"><div className="crs-progress-fill" style={{ width: `${recoveryPct}%` }} /></div>
        <div className="crs-room-phasepick">
          {canManage && WORKFLOW_STAGES.slice(Math.max(0, stageIdx), stageIdx + 4).map(s => (
            <button key={s.id} className={`crs-chip crs-chip-sm${inc.stage === s.id ? ' active' : ''}`} onClick={() => setPhase(s.id)}>{L(s, lang)}</button>
          ))}
        </div>
      </div>

      <div className="crs-room-grid">
        {/* affected services */}
        <div className="crs-room-panel">
          <h3 dir="auto"><ShieldAlert size={14} />{t('Affected services', 'الخدمات المتأثرة')}</h3>
          {(inc.affectedServices || []).length === 0 ? <p className="crs-muted" dir="auto">{t('None recorded', 'لا يوجد')}</p> : (
            <ul className="crs-room-svc">
              {(inc.affectedServices || []).map(sid => {
                const svc = services.find(s => s.id === sid)
                return (
                  <li key={sid}>
                    <span dir="auto">{svc ? (lang === 'ar' ? svc.name_ar : svc.name_en) : sid}</span>
                    <StatusPill meta={findById(SERVICE_STATUS, svc?.status || 'disrupted')} lang={lang} soft />
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* decisions */}
        <div className="crs-room-panel">
          <h3 dir="auto"><Gavel size={14} />{t('Decisions log', 'سجل القرارات')} · {myDecisions.length}</h3>
          {myDecisions.length === 0 ? <p className="crs-muted" dir="auto">{t('No decisions logged', 'لا توجد قرارات')}</p> : (
            <ul className="crs-room-list">
              {myDecisions.map(d => (
                <li key={d.id}>
                  <div className="crs-room-list-top">
                    <b dir="ltr">{d.number}</b>
                    <Pill tone={d.approval === 'approved' ? 'good' : d.approval === 'rejected' ? 'crit' : 'warn'} soft>
                      {d.approval === 'approved' ? t('Approved', 'معتمد') : d.approval === 'rejected' ? t('Rejected', 'مرفوض') : t('Pending', 'قيد الاعتماد')}
                    </Pill>
                  </div>
                  <p dir="auto">{d.text}</p>
                  <span className="crs-room-meta" dir="auto">{d.maker && L(findById(JOB_TITLES, d.maker), lang)} · {fmtDateTime(d.createdAt, locale)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* action tracker */}
        <div className="crs-room-panel crs-room-panel--wide">
          <h3 dir="auto"><ListChecks size={14} />{t('Action tracker', 'متتبع الإجراءات')} · {doneActions}/{myActions.length}</h3>
          {myActions.length === 0 ? <p className="crs-muted" dir="auto">{t('No actions yet', 'لا توجد إجراءات')}</p> : (
            <ul className="crs-room-actions-list">
              {myActions.map(a => (
                <li key={a.id}>
                  <div className="crs-room-action-main">
                    <span dir="auto">{lang === 'ar' ? (a.description_ar || a.description_en) : (a.description_en || a.description_ar)}</span>
                    <span className="crs-room-meta" dir="auto">
                      {a.assignedTitle && L(findById(JOB_TITLES, a.assignedTitle), lang)}
                      {a.dueDate ? ` · ${t('due', 'الاستحقاق')} ${a.dueDate}` : ''}
                    </span>
                  </div>
                  <StatusPill meta={findById(PRIORITIES, a.priority)} lang={lang} soft />
                  {canManage ? (
                    <div className="crs-room-action-status">
                      <Select value={a.status} onChange={v => setActionStatus(a, v)} options={ACTION_STATUSES} lang={lang} />
                    </div>
                  ) : <StatusPill meta={findById(ACTION_STATUSES, a.status)} lang={lang} />}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* timeline */}
        <div className="crs-room-panel crs-room-panel--wide">
          <h3 dir="auto"><Clock size={14} />{t('Timeline', 'الخط الزمني')}</h3>
          {timeline.length === 0 ? <p className="crs-muted" dir="auto">{t('No events yet', 'لا توجد أحداث')}</p> : (
            <ul className="crs-timeline">
              {timeline.map((r, i) => (
                <li key={i} className={`crs-tl-${r.kind}`}>
                  <span className="crs-tl-dot" />
                  <div>
                    <span className="crs-tl-text" dir="auto">{r.text}</span>
                    <span className="crs-tl-meta" dir="auto">{[r.by, fmtDateTime(r.at, locale)].filter(Boolean).join(' · ')}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* quick-entry modal */}
      <Modal open={modal !== null} onClose={() => setModal(null)} wide
        title={modal === 'decision' ? t('Record a decision', 'تسجيل قرار') : modal === 'action' ? t('Assign an action', 'إسناد إجراء') : t('Log a communication', 'تسجيل تواصل')}
        sub={inc.number}
        footer={<>
          <div className="crs-toolbar-spacer" />
          <button className="crs-btn crs-btn-ghost" onClick={() => setModal(null)}>{t('Cancel', 'إلغاء')}</button>
          <button className="crs-btn crs-btn-primary" onClick={saveModal} disabled={saving}>{saving ? '…' : t('Save', 'حفظ')}</button>
        </>}>
        {modal && (
          <SchemaForm
            fields={modal === 'decision' ? decisionFields(lang) : modal === 'action' ? actionFields(lang, services) : commFields(lang)}
            form={form} setForm={setForm} lang={lang} />
        )}
        {error && <p className="crs-form-error" dir="auto">{error}</p>}
      </Modal>
    </div>
  )
}

/* schemas for the quick-entry modals */
function decisionFields(lang) {
  return [
    { key: 'text', type: 'textarea', label: { en: 'Decision', ar: 'القرار' }, required: true },
    { key: 'maker', type: 'select', label: { en: 'Decision maker', ar: 'متخذ القرار' }, options: JOB_TITLES, required: true, half: true },
    { key: 'approval', type: 'select', label: { en: 'Approval', ar: 'الاعتماد' }, options: [{ id: 'pending', en: 'Pending', ar: 'قيد الاعتماد' }, { id: 'approved', en: 'Approved', ar: 'معتمد' }, { id: 'rejected', en: 'Rejected', ar: 'مرفوض' }], half: true },
    { key: 'reason', type: 'textarea', label: { en: 'Reason', ar: 'المبرر' } },
    { key: 'info', type: 'textarea', label: { en: 'Information used', ar: 'المعلومات المستخدمة' } },
    { key: 'expectedImpact', type: 'text', label: { en: 'Expected impact', ar: 'الأثر المتوقع' }, half: true },
    { key: 'affectedParties', type: 'text', label: { en: 'Affected parties', ar: 'الأطراف المتأثرة' }, half: true },
    { key: 'implementation', type: 'select', label: { en: 'Implementation status', ar: 'حالة التنفيذ' }, options: [{ id: 'new', en: 'New', ar: 'جديد' }, { id: 'inprogress', en: 'In progress', ar: 'قيد التنفيذ' }, { id: 'done', en: 'Done', ar: 'منفذ' }], half: true },
    { key: 'attachments', type: 'file', label: { en: 'Attachments', ar: 'المرفقات' }, folder: 'decisions' },
  ]
}
function actionFields(lang, services) {
  const svcOptions = services.map(s => ({ id: s.id, en: s.name_en, ar: s.name_ar || s.name_en }))
  return [
    { key: 'description_ar', type: 'text', label: { en: 'Action (Arabic)', ar: 'الإجراء (عربي)' }, required: true, half: true },
    { key: 'description_en', type: 'text', label: { en: 'Action (English)', ar: 'الإجراء (إنجليزي)' }, half: true },
    { key: 'assignedTitle', type: 'select', label: { en: 'Assigned to (title)', ar: 'مُسند إلى (المسمى)' }, options: JOB_TITLES, half: true },
    { key: 'assignedUnit', type: 'select', label: { en: 'Assigned unit', ar: 'الوحدة المسؤولة' }, options: ORG_UNITS, half: true },
    { key: 'priority', type: 'select', label: { en: 'Priority', ar: 'الأولوية' }, options: PRIORITIES, half: true },
    { key: 'status', type: 'select', label: { en: 'Status', ar: 'الحالة' }, options: ACTION_STATUSES, half: true },
    { key: 'startDate', type: 'date', label: { en: 'Start date', ar: 'تاريخ البدء' }, half: true },
    { key: 'dueDate', type: 'date', label: { en: 'Due date', ar: 'تاريخ الاستحقاق' }, half: true },
    { key: 'relatedService', type: 'select', label: { en: 'Related service', ar: 'الخدمة المرتبطة' }, options: svcOptions, half: true },
    { key: 'evidence', type: 'file', label: { en: 'Evidence', ar: 'الأدلة' }, folder: 'actions' },
    { key: 'notes', type: 'textarea', label: { en: 'Notes', ar: 'ملاحظات' } },
  ]
}
function commFields(lang) {
  return [
    { key: 'messageType', type: 'text', label: { en: 'Message type', ar: 'نوع الرسالة' }, required: true, half: true },
    { key: 'channel', type: 'select', label: { en: 'Channel', ar: 'القناة' }, options: CHANNELS, half: true },
    { key: 'audiences', type: 'multiselect', label: { en: 'Audience', ar: 'الجمهور' }, options: AUDIENCES, required: true },
    { key: 'message_ar', type: 'textarea', label: { en: 'Message (Arabic)', ar: 'الرسالة (عربي)' } },
    { key: 'message_en', type: 'textarea', label: { en: 'Message (English)', ar: 'الرسالة (إنجليزي)' } },
    { key: 'status', type: 'select', label: { en: 'Delivery status', ar: 'حالة التسليم' }, options: [{ id: 'draft', en: 'Draft', ar: 'مسودة' }, { id: 'sent', en: 'Sent', ar: 'مُرسلة' }, { id: 'delivered', en: 'Delivered', ar: 'تم التسليم' }], half: true },
    { key: 'nextUpdate', type: 'datetime', label: { en: 'Next update', ar: 'التحديث القادم' }, half: true },
  ]
}
