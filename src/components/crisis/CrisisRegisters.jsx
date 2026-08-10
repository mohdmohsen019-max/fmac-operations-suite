/* ══════════════════════════════════════════════════════════════════════════
   Crisis module — schema-driven registers
   Services · Response Plans · Teams · Contacts · Communications · Exercises ·
   Corrective Actions · Digital Recovery
   One declarative config per `kind`, rendered through RegisterView.
   ════════════════════════════════════════════════════════════════════════ */
import { useMemo } from 'react'
import {
  Boxes, ClipboardList, Users2, Contact, Megaphone, FlaskConical, Wrench,
  DatabaseBackup, Zap,
} from 'lucide-react'
import { db } from '../../firebase'
import {
  collection, addDoc, setDoc, doc, deleteDoc, serverTimestamp,
} from 'firebase/firestore'
import { RegisterView, Pill, StatusPill } from './CrisisShared'
import {
  COL, L, findById, fmtDate, nowMs,
  ORG_UNITS, LOCATIONS, JOB_TITLES, CRISIS_LEVELS, INCIDENT_CATEGORIES,
  READINESS, SERVICE_STATUS, APPROVAL_STATUS, PRIORITIES,
  AUDIENCES, CHANNELS, DELIVERY_STATUS, EXERCISE_TYPES, EXERCISE_STATUS,
  CAPA_SOURCES, ACTION_STATUSES, BACKUP_FREQ, CONTACT_CATEGORIES, READINESS as _r,
  PLAN_CHECKLIST_DEFAULTS, nextIncidentNumber, logCrisisAudit, pushCrisisNotif,
} from './crisisData'

/* map kind → collection */
const KIND_COL = {
  services: COL.services, plans: COL.plans, teams: COL.teams, contacts: COL.contacts,
  comms: COL.comms, exercises: COL.exercises, corrective: COL.corrective, recovery: COL.recovery,
}

export default function CrisisRegisters(props) {
  const {
    kind, lang, t, locale, canManage, actor, goTab,
    incidents = [], services = [], exercises = [], risks = [], plans = [],
  } = props

  const cfg = useMemo(() => buildConfig(kind, { lang, t, locale, incidents, services, exercises, risks, plans }),
    [kind, lang, t, locale, incidents, services, exercises, risks, plans])

  const col = KIND_COL[kind]

  const onSave = async (form, existing) => {
    const clean = { ...form }
    delete clean.id
    if (existing?.id) {
      await setDoc(doc(db, col, existing.id), {
        ...clean, updatedAt: serverTimestamp(), updatedByName: actor.name,
      }, { merge: true })
      await logCrisisAudit({ action: 'update', entity: kind, entityId: existing.id, actor,
        summary: `Updated ${kind} · ${cfg.rowTitle(form, lang)}` })
    } else {
      const refDoc = await addDoc(collection(db, col), {
        ...clean, createdAt: serverTimestamp(), createdByName: actor.name,
      })
      await logCrisisAudit({ action: 'create', entity: kind, entityId: refDoc.id, actor,
        summary: `Created ${kind} · ${cfg.rowTitle(form, lang)}` })
    }
  }

  const onDelete = async (row) => {
    await deleteDoc(doc(db, col, row.id))
    await logCrisisAudit({ action: 'delete', entity: kind, entityId: row.id, actor,
      summary: `Deleted ${kind} · ${cfg.rowTitle(row, lang)}` })
  }

  /* Response-plan activation → spins up a linked incident + action checklist. */
  const activatePlan = async (plan) => {
    try {
      const number = await nextIncidentNumber()
      const inc = await addDoc(collection(db, COL.incidents), {
        number,
        title_ar: `${lang === 'ar' ? 'تفعيل خطة' : 'Plan activation'}: ${plan.name_ar || plan.name_en || ''}`,
        title_en: `Plan activation: ${plan.name_en || plan.name_ar || ''}`,
        category: plan.category || 'other',
        level: plan.level || 'l2',
        kind: 'real',
        status: 'activated',
        stage: 'scenario',
        planId: plan.id,
        affectedServices: plan.services || [],
        locations: plan.locations || [],
        source: 'staff',
        detectedAt: serverTimestamp(),
        reportedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        createdByName: actor.name,
        createdById: actor.uid,
        stageLog: [{ stage: 'scenario', at: nowMs(), by: actor.name }],
      })
      // generate actions from the plan's checklist + immediate actions
      const items = [
        ...(plan.checklist?.length ? plan.checklist : PLAN_CHECKLIST_DEFAULTS),
        ...((plan.immediate || []).map(x => ({ en: x, ar: x }))),
      ]
      const results = await Promise.allSettled(items.map((it, i) => addDoc(collection(db, COL.actions), {
        incidentId: inc.id,
        incidentNumber: number,
        description_en: L(it, 'en') || `Action ${i + 1}`,
        description_ar: L(it, 'ar') || `إجراء ${i + 1}`,
        priority: 'high',
        status: 'new',
        fromPlan: plan.id,
        createdAt: serverTimestamp(),
        createdByName: actor.name,
      })))
      const failed = results.filter(r => r.status === 'rejected').length
      // Always record the audit trail (and notify) once the incident exists — even
      // if some action writes failed — so we never leave a live "activated"
      // incident with no history.
      await logCrisisAudit({ action: 'activate', entity: 'plans', entityId: plan.id, actor,
        summary: `Activated plan ${plan.name_en || plan.name_ar} → ${number}${failed ? ` (${failed} action(s) failed)` : ''}` })
      await pushCrisisNotif({ kind: 'crit', actor,
        titleEn: `Plan activated — ${number}`, titleAr: `تم تفعيل خطة — ${number}`,
        bodyEn: plan.name_en || '', bodyAr: plan.name_ar || '',
        link: `/crisis/room`, forRoles: ['director', 'head_ops', 'event_commander'] })
      if (failed) {
        alert(t(`Plan activated, but ${failed} action(s) could not be created.`,
                `تم تفعيل الخطة، لكن تعذّر إنشاء ${failed} إجراء.`))
      }
      goTab('room')
    } catch (err) {
      console.error('plan activation failed:', err)
      alert(t('Could not activate the plan.', 'تعذر تفعيل الخطة.') + '\n' + (err?.message || ''))
    }
  }

  const rows = props[kind] || []

  return (
    <RegisterView
      lang={lang} t={t} locale={locale} canEdit={canManage}
      title={L(cfg.title, lang)} subtitle={L(cfg.sub, lang)} icon={cfg.icon}
      rows={rows} columns={cfg.columns} fields={cfg.fields} initialForm={cfg.initialForm}
      onSave={onSave} onDelete={onDelete}
      filters={cfg.filters} searchKeys={cfg.searchKeys}
      addLabel={L(cfg.addLabel, lang)}
      emptyTitle={L(cfg.empty, lang)}
      renderDetail={(row) => cfg.renderDetail
        ? cfg.renderDetail(row, { lang, t, locale, canManage, activatePlan })
        : defaultDetail(row, cfg, lang)}
    />
  )
}

/* generic key/value detail if a config doesn't supply one */
function defaultDetail(row, cfg, lang) {
  return (
    <div className="crs-detail-grid">
      {cfg.detailFields?.map(df => {
        const v = df.render ? df.render(row) : row[df.key]
        return (
          <div key={df.key} className="crs-detail-cell">
            <span className="crs-detail-k" dir="auto">{L(df.label, lang)}</span>
            <span className="crs-detail-v" dir="auto">{v == null || v === '' ? '—' : v}</span>
          </div>
        )
      })}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════
   Per-kind configuration
   ════════════════════════════════════════════════════════════════════ */
function buildConfig(kind, ctx) {
  const { lang, t, locale, incidents = [], services = [], exercises = [], risks = [] } = ctx
  const unitLabel = (id) => L(findById(ORG_UNITS, id), lang) || '—'
  const svcOptions = services.map(s => ({ id: s.id, en: s.name_en, ar: s.name_ar || s.name_en }))
  const incOptions = incidents.map(i => ({ id: i.id, en: `${i.number} · ${i.title_en || ''}`, ar: `${i.number} · ${i.title_ar || ''}` }))
  const exOptions = exercises.map(e => ({ id: e.id, en: e.title_en || e.title || '', ar: e.title_ar || e.title || '' }))
  const riskOptions = risks.map(r => ({ id: r.id, en: r.title_en || r.title || '', ar: r.title_ar || r.title || '' }))

  switch (kind) {
    /* ─────────────────────── Critical services ─────────────────────── */
    case 'services':
      return {
        icon: Boxes, title: { en: 'Critical Services & Operations', ar: 'الخدمات والعمليات الحيوية' },
        sub: { en: 'Services that must keep running, with recovery objectives.', ar: 'الخدمات التي يجب استمرارها مع أهداف التعافي.' },
        addLabel: { en: 'Add service', ar: 'إضافة خدمة' },
        empty: { en: 'No critical services yet', ar: 'لا توجد خدمات حيوية بعد' },
        rowTitle: (r) => (lang === 'ar' ? r.name_ar : r.name_en) || r.name_en || '',
        searchKeys: ['name_en', 'name_ar', (r) => unitLabel(r.unit)],
        filters: [
          { id: 'unit', label: { en: 'Unit', ar: 'الوحدة' }, options: ORG_UNITS, get: r => r.unit },
          { id: 'priority', label: { en: 'Priority', ar: 'الأولوية' }, options: PRIORITIES, get: r => r.priority },
          { id: 'status', label: { en: 'Status', ar: 'الحالة' }, options: SERVICE_STATUS, get: r => r.status },
        ],
        columns: [
          { key: 'name', label: { en: 'Service', ar: 'الخدمة' }, render: r => <b>{lang === 'ar' ? (r.name_ar || r.name_en) : r.name_en}</b> },
          { key: 'unit', label: { en: 'Unit', ar: 'الوحدة' }, render: r => unitLabel(r.unit) },
          { key: 'rto', label: { en: 'RTO', ar: 'زمن التعافي' }, render: r => <span dir="ltr">{r.rto || '—'}</span> },
          { key: 'priority', label: { en: 'Priority', ar: 'الأولوية' }, render: r => <StatusPill meta={findById(PRIORITIES, r.priority)} lang={lang} /> },
          { key: 'status', label: { en: 'Status', ar: 'الحالة' }, render: r => <StatusPill meta={findById(SERVICE_STATUS, r.status)} lang={lang} /> },
          { key: 'readiness', label: { en: 'Readiness', ar: 'الجاهزية' }, render: r => <StatusPill meta={findById(READINESS, r.readiness)} lang={lang} soft /> },
        ],
        initialForm: { status: 'operational', readiness: 'partial', approval: 'draft', priority: 'high' },
        fields: [
          { key: 'name_ar', type: 'text', label: { en: 'Service name (Arabic)', ar: 'اسم الخدمة (عربي)' }, required: true, half: true },
          { key: 'name_en', type: 'text', label: { en: 'Service name (English)', ar: 'اسم الخدمة (إنجليزي)' }, half: true },
          { key: 'description', type: 'textarea', label: { en: 'Description', ar: 'الوصف' } },
          { key: 'unit', type: 'select', label: { en: 'Organizational unit', ar: 'الوحدة التنظيمية' }, options: ORG_UNITS, required: true },
          { key: 'owner', type: 'select', label: { en: 'Service owner (title)', ar: 'مالك الخدمة (المسمى)' }, options: JOB_TITLES },
          { key: 'altOwner', type: 'select', label: { en: 'Alternative owner', ar: 'المالك البديل' }, options: JOB_TITLES },
          { key: 'priority', type: 'select', label: { en: 'Recovery priority', ar: 'أولوية التعافي' }, options: PRIORITIES, required: true },
          { key: 'locations', type: 'multiselect', label: { en: 'Locations', ar: 'المواقع' }, options: LOCATIONS },
          { key: 'beneficiaries', type: 'text', label: { en: 'Beneficiaries', ar: 'المستفيدون' }, half: true },
          { key: 'criticalEmployees', type: 'text', label: { en: 'Critical employees', ar: 'الموظفون الحرجون' }, half: true },
          { key: 'systems', type: 'tags', label: { en: 'Systems used', ar: 'الأنظمة المستخدمة' } },
          { key: 'assets', type: 'tags', label: { en: 'Assets required', ar: 'الأصول المطلوبة' } },
          { key: 'vehicles', type: 'tags', label: { en: 'Vehicles required', ar: 'المركبات المطلوبة' } },
          { key: 'suppliers', type: 'tags', label: { en: 'Suppliers & partners', ar: 'الموردون والشركاء' } },
          { key: 'minLevel', type: 'text', label: { en: 'Minimum operating level', ar: 'الحد الأدنى لمستوى التشغيل' }, half: true },
          { key: 'mtpd', type: 'text', label: { en: 'MTPD (max tolerable disruption)', ar: 'أقصى فترة انقطاع مسموحة' }, half: true, hint: { en: 'e.g. 1d, 12h', ar: 'مثال: 1d أو 12h' } },
          { key: 'rto', type: 'text', label: { en: 'RTO (recovery time)', ar: 'زمن التعافي المستهدف' }, half: true, hint: { en: 'e.g. 4h', ar: 'مثال: 4h' } },
          { key: 'rpo', type: 'text', label: { en: 'RPO (recovery point)', ar: 'نقطة التعافي المستهدفة' }, half: true },
          { key: 'mainAlternative', type: 'textarea', label: { en: 'Main operating alternative', ar: 'بديل التشغيل الرئيسي' } },
          { key: 'recoveryReqs', type: 'textarea', label: { en: 'Recovery requirements', ar: 'متطلبات التعافي' } },
          { key: 'status', type: 'select', label: { en: 'Current status', ar: 'الحالة الحالية' }, options: SERVICE_STATUS },
          { key: 'readiness', type: 'select', label: { en: 'Readiness', ar: 'الجاهزية' }, options: READINESS },
          { key: 'lastReview', type: 'date', label: { en: 'Last review', ar: 'آخر مراجعة' } },
          { key: 'nextReview', type: 'date', label: { en: 'Next review', ar: 'المراجعة القادمة' } },
          { key: 'approval', type: 'select', label: { en: 'Approval status', ar: 'حالة الاعتماد' }, options: APPROVAL_STATUS },
        ],
        detailFields: [
          { key: 'description', label: { en: 'Description', ar: 'الوصف' } },
          { key: 'owner', label: { en: 'Owner', ar: 'المالك' }, render: r => L(findById(JOB_TITLES, r.owner), lang) },
          { key: 'mtpd', label: { en: 'MTPD', ar: 'أقصى انقطاع' } },
          { key: 'rpo', label: { en: 'RPO', ar: 'نقطة التعافي' } },
          { key: 'minLevel', label: { en: 'Min. operating level', ar: 'الحد الأدنى للتشغيل' } },
          { key: 'mainAlternative', label: { en: 'Alternative', ar: 'البديل' } },
          { key: 'locations', label: { en: 'Locations', ar: 'المواقع' }, render: r => (r.locations || []).map(l => L(findById(LOCATIONS, l), lang)).join('، ') },
          { key: 'systems', label: { en: 'Systems', ar: 'الأنظمة' }, render: r => (r.systems || []).join('، ') },
          { key: 'nextReview', label: { en: 'Next review', ar: 'المراجعة القادمة' }, render: r => fmtDate(r.nextReview, locale) },
        ],
      }

    /* ─────────────────────── Response plans ─────────────────────── */
    case 'plans':
      return {
        icon: ClipboardList, title: { en: 'Response Plans & Scenarios', ar: 'خطط وسيناريوهات الاستجابة' },
        sub: { en: 'Reusable playbooks. Activating one launches a linked incident with a ready checklist.', ar: 'خطط جاهزة قابلة لإعادة الاستخدام. تفعيل أي منها ينشئ حادثاً مرتبطاً بقائمة إجراءات جاهزة.' },
        addLabel: { en: 'Add plan', ar: 'إضافة خطة' },
        empty: { en: 'No response plans yet', ar: 'لا توجد خطط استجابة بعد' },
        rowTitle: (r) => (lang === 'ar' ? r.name_ar : r.name_en) || r.name_en || '',
        searchKeys: ['name_en', 'name_ar'],
        filters: [
          { id: 'category', label: { en: 'Scenario', ar: 'السيناريو' }, options: INCIDENT_CATEGORIES, get: r => r.category },
          { id: 'level', label: { en: 'Level', ar: 'المستوى' }, options: CRISIS_LEVELS, get: r => r.level },
        ],
        columns: [
          { key: 'name', label: { en: 'Plan', ar: 'الخطة' }, render: r => <b>{lang === 'ar' ? (r.name_ar || r.name_en) : r.name_en}</b> },
          { key: 'category', label: { en: 'Scenario', ar: 'السيناريو' }, render: r => L(findById(INCIDENT_CATEGORIES, r.category), lang) },
          { key: 'level', label: { en: 'Level', ar: 'المستوى' }, render: r => <StatusPill meta={findById(CRISIS_LEVELS, r.level)} lang={lang} /> },
          { key: 'version', label: { en: 'Ver.', ar: 'الإصدار' }, render: r => <span dir="ltr">{r.version || '1.0'}</span> },
          { key: 'approval', label: { en: 'Approval', ar: 'الاعتماد' }, render: r => <StatusPill meta={findById(APPROVAL_STATUS, r.approval)} lang={lang} soft /> },
        ],
        initialForm: { level: 'l2', approval: 'draft', version: '1.0', checklist: PLAN_CHECKLIST_DEFAULTS.map(c => ({ ...c })) },
        fields: [
          { key: 'name_ar', type: 'text', label: { en: 'Plan name (Arabic)', ar: 'اسم الخطة (عربي)' }, required: true, half: true },
          { key: 'name_en', type: 'text', label: { en: 'Plan name (English)', ar: 'اسم الخطة (إنجليزي)' }, half: true },
          { key: 'category', type: 'select', label: { en: 'Scenario category', ar: 'فئة السيناريو' }, options: INCIDENT_CATEGORIES, required: true },
          { key: 'level', type: 'select', label: { en: 'Crisis level', ar: 'مستوى الأزمة' }, options: CRISIS_LEVELS, required: true },
          { key: 'indicators', type: 'textarea', label: { en: 'Activation indicators', ar: 'مؤشرات التفعيل' } },
          { key: 'locations', type: 'multiselect', label: { en: 'Applicable locations', ar: 'المواقع المعنية' }, options: LOCATIONS },
          { key: 'services', type: 'multiselect', label: { en: 'Applicable services', ar: 'الخدمات المعنية' }, options: svcOptions },
          { key: 'commanderRole', type: 'select', label: { en: 'Incident commander role', ar: 'دور قائد الحدث' }, options: JOB_TITLES },
          { key: 'teamRoles', type: 'multiselect', label: { en: 'Response team roles', ar: 'أدوار فريق الاستجابة' }, options: JOB_TITLES },
          { key: 'immediate', type: 'tags', label: { en: 'Immediate actions', ar: 'الإجراءات الفورية' } },
          { key: 'first15', type: 'tags', label: { en: 'First 15 minutes', ar: 'أول 15 دقيقة' } },
          { key: 'firstHour', type: 'tags', label: { en: 'First hour', ar: 'أول ساعة' } },
          { key: 'containment', type: 'tags', label: { en: 'Containment actions', ar: 'إجراءات الاحتواء' } },
          { key: 'alternatives', type: 'textarea', label: { en: 'Operating alternatives', ar: 'بدائل التشغيل' } },
          { key: 'resources', type: 'tags', label: { en: 'Required resources', ar: 'الموارد المطلوبة' } },
          { key: 'suppliers', type: 'tags', label: { en: 'Required suppliers', ar: 'الموردون المطلوبون' } },
          { key: 'commsReqs', type: 'textarea', label: { en: 'Communication requirements', ar: 'متطلبات الاتصال' } },
          { key: 'recoveryActions', type: 'tags', label: { en: 'Recovery actions', ar: 'إجراءات التعافي' } },
          { key: 'recoveryTarget', type: 'text', label: { en: 'Recovery target', ar: 'هدف التعافي' }, half: true },
          { key: 'normalConditions', type: 'textarea', label: { en: 'Return-to-normal conditions', ar: 'شروط العودة للوضع الطبيعي' } },
          { key: 'evidenceReq', type: 'text', label: { en: 'Required evidence', ar: 'الأدلة المطلوبة' } },
          { key: 'version', type: 'text', label: { en: 'Version', ar: 'الإصدار' }, half: true },
          { key: 'reviewDate', type: 'date', label: { en: 'Review date', ar: 'تاريخ المراجعة' }, half: true },
          { key: 'approval', type: 'select', label: { en: 'Approval', ar: 'الاعتماد' }, options: APPROVAL_STATUS, half: true },
        ],
        renderDetail: (row, d) => (
          <div>
            <div className="crs-detail-grid">
              <DetailCell label={{ en: 'Activation indicators', ar: 'مؤشرات التفعيل' }} lang={lang} v={row.indicators} />
              <DetailCell label={{ en: 'Operating alternatives', ar: 'بدائل التشغيل' }} lang={lang} v={row.alternatives} />
              <DetailCell label={{ en: 'Immediate actions', ar: 'الإجراءات الفورية' }} lang={lang} v={(row.immediate || []).join('، ')} />
              <DetailCell label={{ en: 'Recovery target', ar: 'هدف التعافي' }} lang={lang} v={row.recoveryTarget} />
            </div>
            {row.approval === 'approved' && d.canManage && (
              <div className="crs-detail-danger">
                <button className="crs-btn crs-btn-primary crs-btn-sm" onClick={() => d.activatePlan(row)}>
                  <Zap size={13} />{t('Activate this plan', 'تفعيل هذه الخطة')}
                </button>
              </div>
            )}
          </div>
        ),
      }

    /* ─────────────────────── Crisis teams ─────────────────────── */
    case 'teams':
      return {
        icon: Users2, title: { en: 'Crisis & Emergency Teams', ar: 'فرق إدارة الأزمات والطوارئ' },
        sub: { en: 'Standing teams and their leaders, coverage and availability.', ar: 'الفرق الدائمة وقادتها والتغطية والجاهزية.' },
        addLabel: { en: 'Add team', ar: 'إضافة فريق' },
        empty: { en: 'No teams configured yet', ar: 'لم يتم إعداد فرق بعد' },
        rowTitle: (r) => r.name || '',
        searchKeys: ['name', 'purpose'],
        filters: [{ id: 'active', label: { en: 'Status', ar: 'الحالة' }, options: [{ id: 'yes', en: 'Active', ar: 'نشط' }, { id: 'no', en: 'Inactive', ar: 'غير نشط' }], get: r => r.active ? 'yes' : 'no' }],
        columns: [
          { key: 'name', label: { en: 'Team', ar: 'الفريق' }, render: r => <b dir="auto">{r.name}</b> },
          { key: 'leader', label: { en: 'Leader', ar: 'القائد' }, render: r => L(findById(JOB_TITLES, r.leader), lang) || r.leaderName || '—' },
          { key: 'members', label: { en: 'Members', ar: 'الأعضاء' }, render: r => <span dir="ltr">{(r.members || []).length}</span> },
          { key: 'locations', label: { en: 'Coverage', ar: 'التغطية' }, render: r => (r.locations || []).map(l => L(findById(LOCATIONS, l), lang)).join('، ') || '—' },
          { key: 'active', label: { en: 'Active', ar: 'نشط' }, render: r => <Pill tone={r.active ? 'good' : 'neutral'}>{r.active ? t('Active', 'نشط') : t('Inactive', 'غير نشط')}</Pill> },
        ],
        initialForm: { active: true },
        fields: [
          { key: 'name', type: 'text', label: { en: 'Team name', ar: 'اسم الفريق' }, required: true },
          { key: 'purpose', type: 'textarea', label: { en: 'Purpose', ar: 'الغرض' } },
          { key: 'leader', type: 'select', label: { en: 'Team leader (title)', ar: 'قائد الفريق (المسمى)' }, options: JOB_TITLES, required: true },
          { key: 'altLeader', type: 'select', label: { en: 'Alternative leader', ar: 'القائد البديل' }, options: JOB_TITLES },
          { key: 'members', type: 'multiselect', label: { en: 'Members (titles)', ar: 'الأعضاء (المسميات)' }, options: JOB_TITLES },
          { key: 'role', type: 'textarea', label: { en: 'Role during crisis', ar: 'الدور أثناء الأزمة' } },
          { key: 'contact', type: 'text', label: { en: 'Contact details', ar: 'بيانات الاتصال' }, half: true },
          { key: 'availability', type: 'text', label: { en: 'Availability', ar: 'الجاهزية' }, half: true },
          { key: 'locations', type: 'multiselect', label: { en: 'Locations covered', ar: 'المواقع المغطاة' }, options: LOCATIONS },
          { key: 'lastTest', type: 'date', label: { en: 'Last contact test', ar: 'آخر اختبار اتصال' }, half: true },
          { key: 'active', type: 'checkbox', label: { en: 'Team is active', ar: 'الفريق نشط' } },
          { key: 'notes', type: 'textarea', label: { en: 'Notes', ar: 'ملاحظات' } },
        ],
        detailFields: [
          { key: 'purpose', label: { en: 'Purpose', ar: 'الغرض' } },
          { key: 'role', label: { en: 'Crisis role', ar: 'الدور في الأزمة' } },
          { key: 'members', label: { en: 'Members', ar: 'الأعضاء' }, render: r => (r.members || []).map(m => L(findById(JOB_TITLES, m), lang)).join('، ') },
          { key: 'contact', label: { en: 'Contact', ar: 'الاتصال' } },
          { key: 'lastTest', label: { en: 'Last test', ar: 'آخر اختبار' }, render: r => fmtDate(r.lastTest, locale) },
        ],
      }

    /* ─────────────────────── Contact directory ─────────────────────── */
    case 'contacts':
      return {
        icon: Contact, title: { en: 'Crisis Contact Directory', ar: 'دليل جهات اتصال الأزمات' },
        sub: { en: 'Protected directory — visible only to authorized crisis users.', ar: 'دليل محمي — يظهر فقط لمستخدمي الأزمات المصرح لهم.' },
        addLabel: { en: 'Add contact', ar: 'إضافة جهة اتصال' },
        empty: { en: 'No contacts yet', ar: 'لا توجد جهات اتصال بعد' },
        rowTitle: (r) => r.name || '',
        searchKeys: ['name', 'org', 'phone', 'role'],
        filters: [
          { id: 'category', label: { en: 'Category', ar: 'الفئة' }, options: CONTACT_CATEGORIES, get: r => r.category },
          { id: 'location', label: { en: 'Location', ar: 'الموقع' }, options: LOCATIONS, get: r => r.location },
        ],
        columns: [
          { key: 'name', label: { en: 'Name', ar: 'الاسم' }, render: r => <b dir="auto">{r.name}</b> },
          { key: 'category', label: { en: 'Category', ar: 'الفئة' }, render: r => L(findById(CONTACT_CATEGORIES, r.category), lang) },
          { key: 'org', label: { en: 'Organization', ar: 'الجهة' } },
          { key: 'phone', label: { en: 'Phone', ar: 'الهاتف' }, render: r => <span dir="ltr">{r.phone || '—'}</span> },
          { key: 'availability', label: { en: 'Availability', ar: 'الجاهزية' } },
        ],
        initialForm: { category: 'employee' },
        fields: [
          { key: 'name', type: 'text', label: { en: 'Name', ar: 'الاسم' }, required: true, half: true },
          { key: 'category', type: 'select', label: { en: 'Category', ar: 'الفئة' }, options: CONTACT_CATEGORIES, required: true, half: true },
          { key: 'org', type: 'text', label: { en: 'Organization', ar: 'الجهة' }, half: true },
          { key: 'role', type: 'text', label: { en: 'Role', ar: 'الدور' }, half: true },
          { key: 'phone', type: 'text', label: { en: 'Primary phone', ar: 'الهاتف الأساسي' }, half: true },
          { key: 'altPhone', type: 'text', label: { en: 'Alternative phone', ar: 'هاتف بديل' }, half: true },
          { key: 'email', type: 'text', label: { en: 'Email', ar: 'البريد الإلكتروني' }, half: true },
          { key: 'location', type: 'select', label: { en: 'Location', ar: 'الموقع' }, options: LOCATIONS, half: true },
          { key: 'availability', type: 'text', label: { en: 'Availability', ar: 'الجاهزية' }, half: true, hint: { en: 'e.g. 24/7, working hours', ar: 'مثال: 24/7 أو أوقات الدوام' } },
          { key: 'lastVerified', type: 'date', label: { en: 'Last verification date', ar: 'تاريخ آخر تحقق' }, half: true },
          { key: 'notes', type: 'textarea', label: { en: 'Notes', ar: 'ملاحظات' } },
        ],
        detailFields: [
          { key: 'role', label: { en: 'Role', ar: 'الدور' } },
          { key: 'email', label: { en: 'Email', ar: 'البريد' } },
          { key: 'altPhone', label: { en: 'Alt phone', ar: 'هاتف بديل' } },
          { key: 'location', label: { en: 'Location', ar: 'الموقع' }, render: r => L(findById(LOCATIONS, r.location), lang) },
          { key: 'lastVerified', label: { en: 'Last verified', ar: 'آخر تحقق' }, render: r => fmtDate(r.lastVerified, locale) },
          { key: 'notes', label: { en: 'Notes', ar: 'ملاحظات' } },
        ],
      }

    /* ─────────────────────── Communications ─────────────────────── */
    case 'comms':
      return {
        icon: Megaphone, title: { en: 'Crisis Communications Log', ar: 'سجل اتصالات الأزمات' },
        sub: { en: 'Every message sent during an event — audience, channel and status.', ar: 'كل رسالة تُرسل أثناء الحدث — الجمهور والقناة والحالة.' },
        addLabel: { en: 'Log message', ar: 'تسجيل رسالة' },
        empty: { en: 'No communications logged yet', ar: 'لا توجد اتصالات مسجلة بعد' },
        rowTitle: (r) => r.messageType || (lang === 'ar' ? 'رسالة' : 'Message'),
        searchKeys: ['messageType', 'message_en', 'message_ar'],
        filters: [
          { id: 'channel', label: { en: 'Channel', ar: 'القناة' }, options: CHANNELS, get: r => r.channel },
          { id: 'status', label: { en: 'Status', ar: 'الحالة' }, options: DELIVERY_STATUS, get: r => r.status },
        ],
        columns: [
          { key: 'messageType', label: { en: 'Type', ar: 'النوع' }, render: r => <b dir="auto">{r.messageType || '—'}</b> },
          { key: 'audiences', label: { en: 'Audience', ar: 'الجمهور' }, render: r => (r.audiences || []).map(a => L(findById(AUDIENCES, a), lang)).join('، ') || '—' },
          { key: 'channel', label: { en: 'Channel', ar: 'القناة' }, render: r => L(findById(CHANNELS, r.channel), lang) },
          { key: 'incidentId', label: { en: 'Incident', ar: 'الحادث' }, render: r => (incidents.find(i => i.id === r.incidentId)?.number) || '—' },
          { key: 'status', label: { en: 'Status', ar: 'الحالة' }, render: r => <StatusPill meta={findById(DELIVERY_STATUS, r.status)} lang={lang} /> },
        ],
        initialForm: { status: 'draft', audiences: [] },
        fields: [
          { key: 'messageType', type: 'text', label: { en: 'Message type', ar: 'نوع الرسالة' }, required: true, half: true },
          { key: 'incidentId', type: 'select', label: { en: 'Related incident', ar: 'الحادث المرتبط' }, options: incOptions, half: true },
          { key: 'audiences', type: 'multiselect', label: { en: 'Audience', ar: 'الجمهور' }, options: AUDIENCES, required: true },
          { key: 'channel', type: 'select', label: { en: 'Channel', ar: 'القناة' }, options: CHANNELS, required: true, half: true },
          { key: 'status', type: 'select', label: { en: 'Delivery status', ar: 'حالة التسليم' }, options: DELIVERY_STATUS, half: true },
          { key: 'message_ar', type: 'textarea', label: { en: 'Message (Arabic)', ar: 'الرسالة (عربي)' } },
          { key: 'message_en', type: 'textarea', label: { en: 'Message (English)', ar: 'الرسالة (إنجليزي)' } },
          { key: 'sender', type: 'select', label: { en: 'Sender', ar: 'المُرسِل' }, options: JOB_TITLES, half: true },
          { key: 'approver', type: 'select', label: { en: 'Approver', ar: 'المعتمِد' }, options: JOB_TITLES, half: true },
          { key: 'sentAt', type: 'datetime', label: { en: 'Sent at', ar: 'وقت الإرسال' }, half: true },
          { key: 'nextUpdate', type: 'datetime', label: { en: 'Next update', ar: 'التحديث القادم' }, half: true },
          { key: 'attachments', type: 'file', label: { en: 'Attachment', ar: 'مرفق' }, folder: 'comms' },
          { key: 'notes', type: 'textarea', label: { en: 'Notes', ar: 'ملاحظات' } },
        ],
        detailFields: [
          { key: 'message_ar', label: { en: 'Message (AR)', ar: 'الرسالة (عربي)' } },
          { key: 'message_en', label: { en: 'Message (EN)', ar: 'الرسالة (إنجليزي)' } },
          { key: 'sender', label: { en: 'Sender', ar: 'المرسل' }, render: r => L(findById(JOB_TITLES, r.sender), lang) },
          { key: 'approver', label: { en: 'Approver', ar: 'المعتمد' }, render: r => L(findById(JOB_TITLES, r.approver), lang) },
        ],
      }

    /* ─────────────────────── Exercises ─────────────────────── */
    case 'exercises':
      return {
        icon: FlaskConical, title: { en: 'Exercises & Simulations', ar: 'الاختبارات والتمارين' },
        sub: { en: 'Test plans without a real incident — record results and gaps.', ar: 'اختبار الخطط دون حادث فعلي — تسجيل النتائج والثغرات.' },
        addLabel: { en: 'Add exercise', ar: 'إضافة تمرين' },
        empty: { en: 'No exercises yet', ar: 'لا توجد تمارين بعد' },
        rowTitle: (r) => r.title_en || r.title_ar || r.title || '',
        searchKeys: ['title_en', 'title_ar', 'scenario'],
        filters: [
          { id: 'type', label: { en: 'Type', ar: 'النوع' }, options: EXERCISE_TYPES, get: r => r.type },
          { id: 'status', label: { en: 'Status', ar: 'الحالة' }, options: EXERCISE_STATUS, get: r => r.status },
        ],
        columns: [
          { key: 'title', label: { en: 'Exercise', ar: 'التمرين' }, render: r => <b dir="auto">{lang === 'ar' ? (r.title_ar || r.title_en) : (r.title_en || r.title_ar)}</b> },
          { key: 'type', label: { en: 'Type', ar: 'النوع' }, render: r => L(findById(EXERCISE_TYPES, r.type), lang) },
          { key: 'date', label: { en: 'Date', ar: 'التاريخ' }, render: r => fmtDate(r.date, locale) },
          { key: 'location', label: { en: 'Location', ar: 'الموقع' }, render: r => L(findById(LOCATIONS, r.location), lang) || '—' },
          { key: 'status', label: { en: 'Status', ar: 'الحالة' }, render: r => <StatusPill meta={findById(EXERCISE_STATUS, r.status)} lang={lang} /> },
        ],
        initialForm: { status: 'planned', type: 'tabletop' },
        fields: [
          { key: 'title_ar', type: 'text', label: { en: 'Title (Arabic)', ar: 'العنوان (عربي)' }, required: true, half: true },
          { key: 'title_en', type: 'text', label: { en: 'Title (English)', ar: 'العنوان (إنجليزي)' }, half: true },
          { key: 'type', type: 'select', label: { en: 'Exercise type', ar: 'نوع التمرين' }, options: EXERCISE_TYPES, required: true, half: true },
          { key: 'status', type: 'select', label: { en: 'Status', ar: 'الحالة' }, options: EXERCISE_STATUS, half: true },
          { key: 'scenario', type: 'textarea', label: { en: 'Scenario', ar: 'السيناريو' } },
          { key: 'planId', type: 'select', label: { en: 'Plan under test', ar: 'الخطة قيد الاختبار' }, options: (ctx.plans || []).map(p => ({ id: p.id, en: p.name_en, ar: p.name_ar })), half: true },
          { key: 'date', type: 'date', label: { en: 'Date', ar: 'التاريخ' }, half: true },
          { key: 'location', type: 'select', label: { en: 'Location', ar: 'الموقع' }, options: LOCATIONS, half: true },
          { key: 'objectives', type: 'textarea', label: { en: 'Objectives', ar: 'الأهداف' } },
          { key: 'successCriteria', type: 'textarea', label: { en: 'Success criteria', ar: 'معايير النجاح' } },
          { key: 'participants', type: 'multiselect', label: { en: 'Participants (titles)', ar: 'المشاركون (المسميات)' }, options: JOB_TITLES },
          { key: 'observers', type: 'multiselect', label: { en: 'Observers', ar: 'المراقبون' }, options: JOB_TITLES },
          { key: 'responseTime', type: 'number', label: { en: 'Response time (min)', ar: 'زمن الاستجابة (دقيقة)' }, half: true },
          { key: 'recoveryTime', type: 'number', label: { en: 'Recovery time (min)', ar: 'زمن التعافي (دقيقة)' }, half: true },
          { key: 'result', type: 'select', label: { en: 'Overall result', ar: 'النتيجة العامة' }, options: [{ id: 'pass', en: 'Successful', ar: 'ناجح' }, { id: 'partial', en: 'Partial', ar: 'جزئي' }, { id: 'fail', en: 'Failed', ar: 'فاشل' }], half: true },
          { key: 'strengths', type: 'textarea', label: { en: 'Strengths', ar: 'نقاط القوة' } },
          { key: 'gaps', type: 'textarea', label: { en: 'Gaps', ar: 'الثغرات' } },
          { key: 'lessons', type: 'textarea', label: { en: 'Lessons learned', ar: 'الدروس المستفادة' } },
          { key: 'attachments', type: 'file', label: { en: 'Final report / evidence', ar: 'التقرير النهائي / الأدلة' }, folder: 'exercises' },
          { key: 'approval', type: 'select', label: { en: 'Approval', ar: 'الاعتماد' }, options: APPROVAL_STATUS },
        ],
        detailFields: [
          { key: 'objectives', label: { en: 'Objectives', ar: 'الأهداف' } },
          { key: 'result', label: { en: 'Result', ar: 'النتيجة' }, render: r => r.result || '—' },
          { key: 'strengths', label: { en: 'Strengths', ar: 'نقاط القوة' } },
          { key: 'gaps', label: { en: 'Gaps', ar: 'الثغرات' } },
          { key: 'lessons', label: { en: 'Lessons', ar: 'الدروس' } },
        ],
      }

    /* ─────────────────────── Corrective actions ─────────────────────── */
    case 'corrective':
      return {
        icon: Wrench, title: { en: 'Corrective Actions Register', ar: 'سجل الإجراءات التصحيحية' },
        sub: { en: 'Closed only after evidence and effectiveness verification are recorded.', ar: 'لا تُغلق إلا بعد تسجيل الأدلة والتحقق من الفعالية.' },
        addLabel: { en: 'Add action', ar: 'إضافة إجراء' },
        empty: { en: 'No corrective actions yet', ar: 'لا توجد إجراءات تصحيحية بعد' },
        rowTitle: (r) => r.action || r.gap || '',
        searchKeys: ['action', 'gap', 'number'],
        filters: [
          { id: 'source', label: { en: 'Source', ar: 'المصدر' }, options: CAPA_SOURCES, get: r => r.source },
          { id: 'status', label: { en: 'Status', ar: 'الحالة' }, options: ACTION_STATUSES, get: r => r.status },
          { id: 'priority', label: { en: 'Priority', ar: 'الأولوية' }, options: PRIORITIES, get: r => r.priority },
        ],
        columns: [
          { key: 'action', label: { en: 'Action', ar: 'الإجراء' }, render: r => <b dir="auto">{r.action || '—'}</b> },
          { key: 'source', label: { en: 'Source', ar: 'المصدر' }, render: r => L(findById(CAPA_SOURCES, r.source), lang) },
          { key: 'owner', label: { en: 'Owner', ar: 'المسؤول' }, render: r => L(findById(JOB_TITLES, r.owner), lang) || '—' },
          { key: 'due', label: { en: 'Due', ar: 'الاستحقاق' }, render: r => fmtDate(r.dueDate, locale) },
          { key: 'priority', label: { en: 'Priority', ar: 'الأولوية' }, render: r => <StatusPill meta={findById(PRIORITIES, r.priority)} lang={lang} /> },
          { key: 'status', label: { en: 'Status', ar: 'الحالة' }, render: r => <StatusPill meta={findById(ACTION_STATUSES, r.status)} lang={lang} /> },
        ],
        initialForm: { status: 'new', priority: 'medium', source: 'incident' },
        fields: [
          { key: 'number', type: 'text', label: { en: 'Reference no.', ar: 'الرقم المرجعي' }, half: true },
          { key: 'source', type: 'select', label: { en: 'Source', ar: 'المصدر' }, options: CAPA_SOURCES, required: true, half: true },
          { key: 'sourceIncident', type: 'select', label: { en: 'Source record (incident)', ar: 'السجل المصدر (حادث)' }, options: incOptions, when: f => f.source === 'incident', half: true },
          { key: 'sourceExercise', type: 'select', label: { en: 'Source record (exercise)', ar: 'السجل المصدر (تمرين)' }, options: exOptions, when: f => f.source === 'exercise', half: true },
          { key: 'sourceRisk', type: 'select', label: { en: 'Source record (risk)', ar: 'السجل المصدر (مخاطرة)' }, options: riskOptions, when: f => f.source === 'risk', half: true },
          { key: 'gap', type: 'textarea', label: { en: 'Gap description', ar: 'وصف الثغرة' }, required: true },
          { key: 'rootCause', type: 'textarea', label: { en: 'Root cause', ar: 'السبب الجذري' } },
          { key: 'action', type: 'textarea', label: { en: 'Corrective action', ar: 'الإجراء التصحيحي' }, required: true },
          { key: 'owner', type: 'select', label: { en: 'Owner (title)', ar: 'المسؤول (المسمى)' }, options: JOB_TITLES, required: true, half: true },
          { key: 'unit', type: 'select', label: { en: 'Organizational unit', ar: 'الوحدة التنظيمية' }, options: ORG_UNITS, half: true },
          { key: 'priority', type: 'select', label: { en: 'Priority', ar: 'الأولوية' }, options: PRIORITIES, half: true },
          { key: 'dueDate', type: 'date', label: { en: 'Due date', ar: 'تاريخ الاستحقاق' }, half: true },
          { key: 'status', type: 'select', label: { en: 'Status', ar: 'الحالة' }, options: ACTION_STATUSES, half: true },
          { key: 'verificationMethod', type: 'text', label: { en: 'Verification method', ar: 'طريقة التحقق' }, half: true },
          { key: 'verificationResult', type: 'textarea', label: { en: 'Verification result', ar: 'نتيجة التحقق' } },
          { key: 'verifiedBy', type: 'select', label: { en: 'Verified by', ar: 'تم التحقق بواسطة' }, options: JOB_TITLES, half: true },
          { key: 'closureDate', type: 'date', label: { en: 'Closure date', ar: 'تاريخ الإغلاق' }, half: true },
          { key: 'evidence', type: 'file', label: { en: 'Evidence', ar: 'الأدلة' }, folder: 'corrective' },
          { key: 'notes', type: 'textarea', label: { en: 'Notes', ar: 'ملاحظات' } },
        ],
        detailFields: [
          { key: 'gap', label: { en: 'Gap', ar: 'الثغرة' } },
          { key: 'rootCause', label: { en: 'Root cause', ar: 'السبب الجذري' } },
          { key: 'verificationResult', label: { en: 'Verification', ar: 'التحقق' } },
          { key: 'verifiedBy', label: { en: 'Verified by', ar: 'تم التحقق بواسطة' }, render: r => L(findById(JOB_TITLES, r.verifiedBy), lang) },
        ],
      }

    /* ─────────────────────── Digital recovery ─────────────────────── */
    case 'recovery':
    default:
      return {
        icon: DatabaseBackup, title: { en: 'Digital Disaster Recovery', ar: 'التعافي من الكوارث الرقمية' },
        sub: { en: 'Systems, backups and recovery objectives. Never store secrets here.', ar: 'الأنظمة والنسخ الاحتياطية وأهداف التعافي. لا تُخزَّن الأسرار هنا.' },
        addLabel: { en: 'Add system', ar: 'إضافة نظام' },
        empty: { en: 'No systems yet', ar: 'لا توجد أنظمة بعد' },
        rowTitle: (r) => r.system_en || r.system_ar || '',
        searchKeys: ['system_en', 'system_ar', 'hosting'],
        filters: [
          { id: 'priority', label: { en: 'Priority', ar: 'الأولوية' }, options: PRIORITIES, get: r => r.priority },
          { id: 'status', label: { en: 'Readiness', ar: 'الجاهزية' }, options: _r, get: r => r.status },
        ],
        columns: [
          { key: 'system', label: { en: 'System', ar: 'النظام' }, render: r => <b dir="auto">{lang === 'ar' ? (r.system_ar || r.system_en) : r.system_en}</b> },
          { key: 'owner', label: { en: 'Owner', ar: 'المالك' }, render: r => L(findById(ORG_UNITS, r.owner), lang) || '—' },
          { key: 'rto', label: { en: 'RTO', ar: 'زمن التعافي' }, render: r => <span dir="ltr">{r.rto || '—'}</span> },
          { key: 'rpo', label: { en: 'RPO', ar: 'نقطة التعافي' }, render: r => <span dir="ltr">{r.rpo || '—'}</span> },
          { key: 'lastBackup', label: { en: 'Last backup', ar: 'آخر نسخة' }, render: r => fmtDate(r.lastBackup, locale) },
          { key: 'status', label: { en: 'Readiness', ar: 'الجاهزية' }, render: r => <StatusPill meta={findById(READINESS, r.status)} lang={lang} /> },
        ],
        initialForm: { status: 'ready', priority: 'high', freq: 'daily' },
        fields: [
          { key: 'system_ar', type: 'text', label: { en: 'System name (Arabic)', ar: 'اسم النظام (عربي)' }, required: true, half: true },
          { key: 'system_en', type: 'text', label: { en: 'System name (English)', ar: 'اسم النظام (إنجليزي)' }, half: true },
          { key: 'owner', type: 'select', label: { en: 'System owner (unit)', ar: 'مالك النظام (الوحدة)' }, options: ORG_UNITS, required: true, half: true },
          { key: 'priority', type: 'select', label: { en: 'Priority', ar: 'الأولوية' }, options: PRIORITIES, half: true },
          { key: 'rto', type: 'text', label: { en: 'RTO', ar: 'زمن التعافي المستهدف' }, half: true },
          { key: 'rpo', type: 'text', label: { en: 'RPO', ar: 'نقطة التعافي المستهدفة' }, half: true },
          { key: 'backupMethod', type: 'text', label: { en: 'Backup method', ar: 'طريقة النسخ الاحتياطي' }, half: true },
          { key: 'freq', type: 'select', label: { en: 'Backup frequency', ar: 'دورية النسخ' }, options: BACKUP_FREQ, half: true },
          { key: 'lastBackup', type: 'date', label: { en: 'Last successful backup', ar: 'آخر نسخة ناجحة' }, half: true },
          { key: 'lastTest', type: 'date', label: { en: 'Last recovery test', ar: 'آخر اختبار تعافٍ' }, half: true },
          { key: 'nextTest', type: 'date', label: { en: 'Next recovery test', ar: 'اختبار التعافي القادم' }, half: true },
          { key: 'procedure', type: 'textarea', label: { en: 'Recovery procedure', ar: 'إجراء التعافي' } },
          { key: 'altMethod', type: 'textarea', label: { en: 'Alternative operating method', ar: 'طريقة التشغيل البديلة' } },
          { key: 'hosting', type: 'text', label: { en: 'Hosting provider', ar: 'مزود الاستضافة' }, half: true },
          { key: 'recoveryAccounts', type: 'text', label: { en: 'Recovery account references', ar: 'مراجع حسابات التعافي' }, half: true, hint: { en: 'Reference only — NEVER store passwords or keys', ar: 'مرجع فقط — لا تُخزَّن كلمات المرور أو المفاتيح' } },
          { key: 'testResult', type: 'select', label: { en: 'Last test result', ar: 'نتيجة آخر اختبار' }, options: [{ id: 'pass', en: 'Passed', ar: 'ناجح' }, { id: 'partial', en: 'Partial', ar: 'جزئي' }, { id: 'fail', en: 'Failed', ar: 'فاشل' }], half: true },
          { key: 'status', type: 'select', label: { en: 'Readiness status', ar: 'حالة الجاهزية' }, options: READINESS, half: true },
          { key: 'attachments', type: 'file', label: { en: 'Attachments', ar: 'المرفقات' }, folder: 'recovery' },
        ],
        detailFields: [
          { key: 'procedure', label: { en: 'Procedure', ar: 'الإجراء' } },
          { key: 'altMethod', label: { en: 'Alternative', ar: 'البديل' } },
          { key: 'hosting', label: { en: 'Hosting', ar: 'الاستضافة' } },
          { key: 'freq', label: { en: 'Backup frequency', ar: 'دورية النسخ' }, render: r => L(findById(BACKUP_FREQ, r.freq), lang) },
          { key: 'nextTest', label: { en: 'Next test', ar: 'الاختبار القادم' }, render: r => fmtDate(r.nextTest, locale) },
        ],
      }
  }
}

/* small labelled detail cell used inside custom renderers */
function DetailCell({ label, v, lang }) {
  return (
    <div className="crs-detail-cell">
      <span className="crs-detail-k" dir="auto">{L(label, lang)}</span>
      <span className="crs-detail-v" dir="auto">{v == null || v === '' ? '—' : v}</span>
    </div>
  )
}
