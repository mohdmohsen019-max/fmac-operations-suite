/* ══════════════════════════════════════════════════════════════════════════
   Crisis module — Settings (levels & approval matrix), audit log (§27),
   notifications and the permissions reference (§22).
   ════════════════════════════════════════════════════════════════════════ */
import { useState, useEffect } from 'react'
import { ShieldCheck, History, Bell, KeyRound, Save, Check } from 'lucide-react'
import { db } from '../../firebase'
import { collection, query, orderBy, limit, onSnapshot, doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { Section, MultiChips, Field, StatusPill, Pill, Empty } from './CrisisShared'
import {
  COL, L, findById, fmtDateTime, CRISIS_LEVELS, JOB_TITLES, CRISIS_CAPS, logCrisisAudit,
} from './crisisData'

export default function CrisisSettings(props) {
  const { lang, t, locale, canManage, actor } = props
  const [levelCfg, setLevelCfg] = useState({})
  const [draft, setDraft] = useState({})
  const [savingLvl, setSavingLvl] = useState(false)
  const [savedLvl, setSavedLvl] = useState(false)
  const [audit, setAudit] = useState([])
  const [notifs, setNotifs] = useState([])

  useEffect(() => {
    const u1 = onSnapshot(doc(db, COL.settings, 'levels'), s => {
      const data = s.exists() ? s.data() : {}
      setLevelCfg(data); setDraft(data)
    }, () => {})
    const u2 = onSnapshot(query(collection(db, COL.audit), orderBy('timestamp', 'desc'), limit(60)),
      s => setAudit(s.docs.map(d => ({ id: d.id, ...d.data() }))), () => setAudit([]))
    const u3 = onSnapshot(query(collection(db, COL.notifs), orderBy('timestamp', 'desc'), limit(40)),
      s => setNotifs(s.docs.map(d => ({ id: d.id, ...d.data() }))), () => setNotifs([]))
    return () => { u1(); u2(); u3() }
  }, [])

  const rolesFor = (lvlId) => draft?.[lvlId]?.approverRoles ?? findById(CRISIS_LEVELS, lvlId).approverRoles
  const setRoles = (lvlId, roles) => setDraft(d => ({ ...d, [lvlId]: { ...(d[lvlId] || {}), approverRoles: roles } }))

  const saveLevels = async () => {
    setSavingLvl(true)
    try {
      await setDoc(doc(db, COL.settings, 'levels'), { ...draft, updatedAt: serverTimestamp(), updatedByName: actor.name }, { merge: true })
      await logCrisisAudit({ action: 'update', entity: 'settings', entityId: 'levels', actor, summary: 'Updated crisis levels / approval matrix' })
      setSavedLvl(true); setTimeout(() => setSavedLvl(false), 1800)
    } catch (e) { console.error(e); alert(e?.message || String(e)) }
    setSavingLvl(false)
  }

  const markRead = async (n) => {
    try { await updateDoc(doc(db, COL.notifs, n.id), { read: true }) } catch (e) { console.error(e) }
  }

  return (
    <div className="crs-settings">
      {/* crisis levels + approval matrix */}
      <Section title={t('Crisis levels & approval matrix', 'مستويات الأزمة ومصفوفة الاعتماد')}
        sub={t('Configure who approves each level. Defaults follow the framework.', 'حدّد من يعتمد كل مستوى. الافتراضات تتبع الإطار.')}
        icon={ShieldCheck}
        actions={canManage && <button className="crs-btn crs-btn-primary crs-btn-sm" onClick={saveLevels} disabled={savingLvl}>
          {savedLvl ? <Check size={13} /> : <Save size={13} />}{savedLvl ? t('Saved', 'تم الحفظ') : t('Save', 'حفظ')}</button>}
      >
        <div className="crs-levels">
          {CRISIS_LEVELS.map(lvl => (
            <div key={lvl.id} className="crs-level-card">
              <div className="crs-level-head">
                <StatusPill meta={lvl} lang={lang} soft={false} />
                <span className="crs-level-name" dir="auto">{t(`Level ${lvl.level}`, `المستوى ${lvl.level}`)}</span>
              </div>
              <p className="crs-level-desc" dir="auto">{lang === 'ar' ? lvl.descAr : lvl.descEn}</p>
              <Field label={t('Approval authority (titles)', 'صلاحية الاعتماد (المسميات)')} full>
                {canManage ? (
                  <MultiChips value={rolesFor(lvl.id)} onChange={r => setRoles(lvl.id, r)} options={JOB_TITLES} lang={lang} />
                ) : (
                  <div className="crs-chips">{rolesFor(lvl.id).map(r => <span key={r} className="crs-chip active">{L(findById(JOB_TITLES, r), lang)}</span>)}</div>
                )}
              </Field>
            </div>
          ))}
        </div>
      </Section>

      {/* notifications */}
      <Section title={t('Notifications', 'الإشعارات')} sub={t('In-app crisis alerts and reminders.', 'تنبيهات وتذكيرات الأزمات داخل النظام.')} icon={Bell}>
        {notifs.length === 0 ? <Empty icon={Bell} title={t('No notifications', 'لا توجد إشعارات')} /> : (
          <ul className="crs-notif-list">
            {notifs.map(n => (
              <li key={n.id} className={n.read ? 'read' : ''}>
                <Pill tone={n.kind || 'info'} soft>{L({ en: n.titleEn, ar: n.titleAr }, lang) || '—'}</Pill>
                <span dir="auto">{L({ en: n.bodyEn, ar: n.bodyAr }, lang)}</span>
                <span className="crs-notif-meta" dir="auto">{fmtDateTime(n.timestamp, locale)}</span>
                {!n.read && <button className="crs-btn crs-btn-ghost crs-btn-sm" onClick={() => markRead(n)}>{t('Mark read', 'تعليم كمقروء')}</button>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* audit log */}
      <Section title={t('Audit log', 'سجل التدقيق')} sub={t('Immutable history of every change in the module.', 'سجل غير قابل للتعديل لكل تغيير في الوحدة.')} icon={History}>
        {audit.length === 0 ? <Empty icon={History} title={t('No audit entries yet', 'لا توجد سجلات تدقيق بعد')} /> : (
          <div className="crs-table-wrap">
            <table className="crs-table">
              <thead><tr><th dir="auto">{t('When', 'الوقت')}</th><th dir="auto">{t('Actor', 'المُنفِّذ')}</th><th dir="auto">{t('Action', 'الإجراء')}</th><th dir="auto">{t('Detail', 'التفاصيل')}</th></tr></thead>
              <tbody>
                {audit.map(a => (
                  <tr key={a.id}>
                    <td dir="ltr" className="crs-mono">{fmtDateTime(a.timestamp, locale)}</td>
                    <td dir="auto">{a.actorName}</td>
                    <td><Pill tone="neutral" soft>{a.action}</Pill> <span className="crs-muted">{a.entity}</span></td>
                    <td dir="auto">{a.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* permissions reference */}
      <Section title={t('Permissions', 'الصلاحيات')} sub={t('Grant access from User Management → Crisis. Server rules enforce these.', 'امنح الصلاحية من إدارة المستخدمين ← الأزمات. قواعد الخادم تفرضها.')} icon={KeyRound}>
        <p className="crs-perm-note" dir="auto">
          {t('This module reads the standard "crisis" permission (View / Edit) that the Master Admin and Head of Operations assign per user in User Management. The fine-grained capabilities below map onto that access and are enforced by the Firestore security rules.',
             'تقرأ هذه الوحدة صلاحية "الأزمات" القياسية (عرض / تعديل) التي يمنحها المسؤول العام ورئيس قسم العمليات لكل مستخدم في إدارة المستخدمين. القدرات التفصيلية أدناه ترتبط بهذه الصلاحية وتُفرض عبر قواعد أمان قاعدة البيانات.')}
        </p>
        <div className="crs-caps">
          {CRISIS_CAPS.map(c => <code key={c} className="crs-cap">{c}</code>)}
        </div>
      </Section>
    </div>
  )
}
