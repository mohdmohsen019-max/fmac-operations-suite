/* ══════════════════════════════════════════════════════════════════════════
   Crisis & Emergency Management — data model, catalogue & calculators
   إدارة الأزمات والطوارئ — نموذج البيانات والحسابات

   Single source of truth for the module: bilingual enumerations, seed
   registers, the risk / BIA / KPI calculators, the sequential-incident-number
   transaction, and the audit + in-app-notification writers.

   Everything here is framework-agnostic (no React) so it can be unit-imported
   and reused by every tab, the reports, and the dashboard.
   ════════════════════════════════════════════════════════════════════════ */

import { db } from '../../firebase'
import {
  doc, runTransaction, addDoc, collection, serverTimestamp,
} from 'firebase/firestore'

/* ── bilingual helper: L({en,ar}, lang) → the active-language string ── */
export const L = (obj, lang) => {
  if (obj == null) return ''
  if (typeof obj === 'string') return obj
  return (lang === 'ar' ? obj.ar : obj.en) ?? obj.en ?? obj.ar ?? ''
}

/* Firestore collection names — one flat namespace, `crisis_` prefixed. */
export const COL = {
  incidents:   'crisis_incidents',
  decisions:   'crisis_decisions',
  actions:     'crisis_actions',
  services:    'crisis_services',
  bia:         'crisis_bia',
  risks:       'crisis_risks',
  plans:       'crisis_plans',
  teams:       'crisis_teams',
  contacts:    'crisis_contacts',
  comms:       'crisis_comms',
  exercises:   'crisis_exercises',
  corrective:  'crisis_corrective',
  recovery:    'crisis_recovery',
  audit:       'crisis_audit',
  notifs:      'crisis_notifications',
  settings:    'crisis_settings',
  counters:    'crisis_counters',
  kpiTargets:  'crisis_kpi_targets',
}

/* ═══════════════════════ Organisational vocabulary ═══════════════════════ */
/* Approved job titles — the ONLY titles allowed anywhere in the module. */
export const JOB_TITLES = [
  { id: 'director',            en: 'Director',                        ar: 'المدير' },
  { id: 'head_ops',           en: 'Head of Operations',              ar: 'رئيس قسم العمليات' },
  { id: 'head_dept',          en: 'Head of Concerned Department',    ar: 'رئيس القسم المعني' },
  { id: 'branch_officer',     en: 'Branch Officer',                  ar: 'مسؤول الفرع' },
  { id: 'hr_specialist',      en: 'Human Resources Specialist',      ar: 'أخصائي الموارد البشرية' },
  { id: 'sports_specialist',  en: 'Sports Activities Specialist',    ar: 'أخصائي الأنشطة الرياضية' },
  { id: 'logistics_specialist', en: 'Logistics Support Specialist',  ar: 'أخصائي الدعم اللوجستي' },
  { id: 'strategy_specialist', en: 'Strategy Specialist',            ar: 'أخصائي الاستراتيجية' },
  { id: 'ai_engineer',        en: 'AI Engineer',                     ar: 'مهندس الذكاء الاصطناعي' },
  { id: 'procurement_specialist', en: 'Procurement Specialist',      ar: 'أخصائي المشتريات' },
  { id: 'medical_officer',    en: 'Medical Officer',                 ar: 'المسؤول الطبي' },
  { id: 'service_owner',      en: 'Service Owner',                   ar: 'مالك الخدمة' },
  { id: 'event_commander',    en: 'Event Commander',                 ar: 'قائد الحدث' },
  { id: 'system_admin',       en: 'System Administrator',            ar: 'مدير النظام' },
  { id: 'internal_auditor',   en: 'Internal Auditor',                ar: 'المراجع الداخلي' },
  { id: 'transport_supervisor', en: 'Transport Supervisor',          ar: 'مشرف النقل' },
  { id: 'driver',             en: 'Driver',                          ar: 'السائق' },
  { id: 'coach',              en: 'Coach',                           ar: 'المدرب' },
  { id: 'admin_staff',       en: 'Administrative Staff',            ar: 'الموظف الإداري' },
  { id: 'crisis_member',      en: 'Crisis & Emergency Team Member',  ar: 'عضو فريق إدارة الأزمات والطوارئ' },
]

/* Approved organisational units — the ONLY units allowed. */
export const ORG_UNITS = [
  { id: 'director_office',  en: "Director's Office",              ar: 'مكتب المدير' },
  { id: 'strategy_office',  en: 'Strategy Office',                ar: 'مكتب الاستراتيجية' },
  { id: 'operations',       en: 'Operations Department',          ar: 'إدارة العمليات' },
  { id: 'support_services', en: 'Support Services Department',    ar: 'إدارة الخدمات المساندة' },
  { id: 'finance',          en: 'Finance Department',             ar: 'الإدارة المالية' },
  { id: 'procurement',      en: 'Procurement Section',            ar: 'قسم المشتريات' },
  { id: 'medical',          en: 'Medical Section',                ar: 'القسم الطبي' },
  { id: 'technical',        en: 'Technical Department',           ar: 'الإدارة الفنية' },
  { id: 'assets',           en: 'Assets Department',              ar: 'إدارة الأصول' },
  { id: 'fleet',            en: 'Fleet & Transport Department',   ar: 'إدارة الأسطول والنقل' },
  { id: 'facilities',       en: 'Facilities Department',          ar: 'إدارة المرافق' },
  { id: 'branches',         en: 'Branches Department',            ar: 'إدارة الفروع' },
  { id: 'strategy',         en: 'Strategy Section',               ar: 'قسم الاستراتيجية' },
  { id: 'internal_audit',   en: 'Internal Audit',                 ar: 'التدقيق الداخلي' },
  { id: 'complaints',       en: 'Complaints & Inquiries Dept.',   ar: 'إدارة الشكاوى والاستفسارات' },
]

/* Approved locations (3 sites). */
export const LOCATIONS = [
  { id: 'fujairah', en: 'Fujairah Headquarters', ar: 'المقر الرئيسي في الفجيرة' },
  { id: 'dibba',    en: 'Dibba Branch',          ar: 'فرع دبا' },
  { id: 'albidya',  en: 'Al Bidya Branch',       ar: 'فرع البدية' },
]

/* ═══════════════════════════ Incident model ═══════════════════════════ */
export const INCIDENT_STATUSES = [
  { id: 'draft',            en: 'Draft',                ar: 'مسودة',              tone: 'neutral' },
  { id: 'reported',         en: 'Reported',             ar: 'تم الإبلاغ',         tone: 'info' },
  { id: 'assessing',        en: 'Under Assessment',     ar: 'قيد التقييم',        tone: 'info' },
  { id: 'activated',        en: 'Activated',            ar: 'تم التفعيل',         tone: 'warn' },
  { id: 'responding',       en: 'Responding',           ar: 'قيد الاستجابة',      tone: 'warn' },
  { id: 'contained',        en: 'Contained',            ar: 'تم الاحتواء',        tone: 'warn' },
  { id: 'recovering',       en: 'Recovering',           ar: 'قيد التعافي',        tone: 'info' },
  { id: 'restored',         en: 'Services Restored',    ar: 'تمت استعادة الخدمات', tone: 'good' },
  { id: 'reviewing',        en: 'Under Review',         ar: 'قيد المراجعة',       tone: 'info' },
  { id: 'closed',           en: 'Closed',               ar: 'مغلق',               tone: 'good' },
  { id: 'cancelled',        en: 'Cancelled',            ar: 'ملغى',               tone: 'neutral' },
]
/* Statuses that mean the incident is "active" (needs the war room). */
export const ACTIVE_STATUSES = ['activated', 'responding', 'contained', 'recovering']
export const OPEN_STATUSES   = ['reported', 'assessing', ...ACTIVE_STATUSES, 'restored', 'reviewing']

export const CRISIS_LEVELS = [
  {
    id: 'l1', level: 1, en: 'Limited Incident', ar: 'حادث محدود', tone: 'good',
    descEn: 'Affects one service or one location. Handled by the responsible unit; usually resolved quickly. No wide institutional coordination.',
    descAr: 'يؤثر على خدمة واحدة أو موقع واحد. تتم إدارته من قبل الوحدة المعنية، ويُحل عادةً خلال فترة قصيرة، ولا يتطلب تنسيقاً مؤسسياً واسعاً.',
    approverEn: 'Head of Concerned Department or Branch Officer',
    approverAr: 'رئيس القسم المعني أو مسؤول الفرع',
    approverRoles: ['head_dept', 'branch_officer'],
  },
  {
    id: 'l2', level: 2, en: 'Operational Disruption', ar: 'انقطاع تشغيلي', tone: 'warn',
    descEn: 'Affects multiple services, units or locations. Requires coordination led by the Operations Department. May need temporary operating alternatives.',
    descAr: 'يؤثر على عدة خدمات أو وحدات تنظيمية أو مواقع. يتطلب تنسيقاً تقوده إدارة العمليات، وقد يستلزم بدائل تشغيل مؤقتة.',
    approverEn: 'Head of Operations',
    approverAr: 'رئيس قسم العمليات',
    approverRoles: ['head_ops'],
  },
  {
    id: 'l3', level: 3, en: 'Institutional Crisis', ar: 'أزمة مؤسسية', tone: 'crit',
    descEn: 'Threatens safety or affects several critical services. Requires the Director. May require external authorities and cause major legal, financial, operational or reputational effects.',
    descAr: 'يهدد السلامة أو يؤثر على عدة خدمات حيوية. يتطلب إشراك المدير، وقد يستلزم جهات خارجية، وقد يُحدث آثاراً قانونية أو مالية أو تشغيلية أو سمعية كبيرة.',
    approverEn: 'Director',
    approverAr: 'المدير',
    approverRoles: ['director'],
  },
]

export const SEVERITIES = [
  { id: 'minor',    en: 'Minor',    ar: 'طفيفة',  tone: 'good' },
  { id: 'moderate', en: 'Moderate', ar: 'متوسطة', tone: 'info' },
  { id: 'major',    en: 'Major',    ar: 'كبيرة',  tone: 'warn' },
  { id: 'severe',   en: 'Severe',   ar: 'حرجة',   tone: 'crit' },
]

export const INCIDENT_CATEGORIES = [
  { id: 'platform',   en: 'Platform / System Outage', ar: 'تعطل منصة أو نظام' },
  { id: 'power',      en: 'Power Outage',             ar: 'انقطاع الكهرباء' },
  { id: 'internet',   en: 'Internet / Network',       ar: 'انقطاع الإنترنت' },
  { id: 'transport',  en: 'Transport / Bus',          ar: 'النقل والحافلات' },
  { id: 'facility',   en: 'Facility / Site',          ar: 'المرافق والمواقع' },
  { id: 'fire',       en: 'Fire / Evacuation',        ar: 'حريق أو إخلاء' },
  { id: 'medical',    en: 'Medical / Injury',         ar: 'طبي أو إصابات' },
  { id: 'data',       en: 'Data Loss',                ar: 'فقدان البيانات' },
  { id: 'security',   en: 'Security / Breach',        ar: 'أمني أو اختراق' },
  { id: 'staffing',   en: 'Critical Staffing',        ar: 'نقص الموظفين الحرجين' },
  { id: 'event',      en: 'Tournament / Camp',        ar: 'بطولة أو معسكر' },
  { id: 'equipment',  en: 'Equipment Failure',        ar: 'تعطل معدات' },
  { id: 'weather',    en: 'Weather Conditions',       ar: 'الظروف الجوية' },
  { id: 'supplier',   en: 'Supplier / Partner',       ar: 'مورد أو شريك' },
  { id: 'comms_loss', en: 'Communication Loss',       ar: 'فقدان الاتصال' },
  { id: 'other',      en: 'Other',                    ar: 'أخرى' },
]

export const INCIDENT_SOURCES = [
  { id: 'staff',      en: 'Staff Report',          ar: 'بلاغ موظف' },
  { id: 'monitoring', en: 'System Monitoring',     ar: 'مراقبة النظام' },
  { id: 'supplier',   en: 'Supplier Notice',       ar: 'إشعار مورد' },
  { id: 'public',     en: 'Public / Parent',       ar: 'الجمهور أو ولي أمر' },
  { id: 'authority',  en: 'Government Authority',   ar: 'جهة حكومية' },
  { id: 'exercise',   en: 'Exercise / Drill',      ar: 'تمرين أو محاكاة' },
  { id: 'other',      en: 'Other',                 ar: 'أخرى' },
]

/* Impact dimensions used on the incident + BIA. */
export const IMPACT_DIMS = [
  { id: 'safety',      en: 'Safety',              ar: 'السلامة' },
  { id: 'operational', en: 'Operational',         ar: 'التشغيل' },
  { id: 'financial',   en: 'Financial',           ar: 'المالية' },
  { id: 'legal',       en: 'Legal / Regulatory',  ar: 'القانونية والتنظيمية' },
  { id: 'reputation',  en: 'Reputation',          ar: 'السمعة' },
  { id: 'stakeholder', en: 'Stakeholders',        ar: 'أصحاب المصلحة' },
]

/* Real event vs. simulation. */
export const INCIDENT_KINDS = [
  { id: 'real',     en: 'Real Incident', ar: 'حادث فعلي',   tone: 'crit' },
  { id: 'exercise', en: 'Simulation',    ar: 'تمرين محاكاة', tone: 'info' },
]

/* 20-step response lifecycle (§8). */
export const WORKFLOW_STAGES = [
  { id: 'discovery',      en: 'Discovery & Reporting',        ar: 'الاكتشاف والإبلاغ' },
  { id: 'assessment',     en: 'Initial Assessment',           ar: 'التقييم الأولي' },
  { id: 'classification', en: 'Classification',               ar: 'التصنيف' },
  { id: 'commander',      en: 'Appoint Event Commander',      ar: 'تعيين قائد الحدث' },
  { id: 'team',           en: 'Activate Response Team',       ar: 'تفعيل فريق الاستجابة' },
  { id: 'scenario',       en: 'Select Response Scenario',     ar: 'اختيار سيناريو الاستجابة' },
  { id: 'actions',        en: 'Create Response Actions',      ar: 'إنشاء إجراءات الاستجابة' },
  { id: 'alternatives',   en: 'Activate Alternatives',        ar: 'تفعيل البدائل المؤقتة' },
  { id: 'communicate',    en: 'Communicate with Parties',     ar: 'التواصل مع الأطراف' },
  { id: 'monitor',        en: 'Monitor Critical Services',    ar: 'مراقبة الخدمات الحيوية' },
  { id: 'containment',    en: 'Containment',                  ar: 'الاحتواء' },
  { id: 'recovery',       en: 'Recovery',                     ar: 'التعافي' },
  { id: 'verify',         en: 'Verify Restored Services',     ar: 'التحقق من استعادة الخدمات' },
  { id: 'normal',         en: 'Return to Normal',             ar: 'العودة للوضع الطبيعي' },
  { id: 'closure',        en: 'Incident Closure',             ar: 'إغلاق الحادث' },
  { id: 'review',         en: 'Post-Incident Review',         ar: 'مراجعة ما بعد الحادث' },
  { id: 'rootcause',      en: 'Root-Cause Analysis',          ar: 'تحليل السبب الجذري' },
  { id: 'lessons',        en: 'Lessons Learned',              ar: 'الدروس المستفادة' },
  { id: 'capa',           en: 'Corrective Action Plan',       ar: 'خطة الإجراءات التصحيحية' },
  { id: 'effectiveness',  en: 'Effectiveness Verification',   ar: 'التحقق من الفعالية' },
]

/* ═══════════════════════ Decisions & Actions ═══════════════════════ */
export const ACTION_STATUSES = [
  { id: 'new',        en: 'New',        ar: 'جديد',      tone: 'info' },
  { id: 'inprogress', en: 'In Progress', ar: 'قيد التنفيذ', tone: 'warn' },
  { id: 'overdue',    en: 'Overdue',    ar: 'متأخر',      tone: 'crit' },
  { id: 'onhold',     en: 'On Hold',    ar: 'معلق',      tone: 'neutral' },
  { id: 'done',       en: 'Completed',  ar: 'مكتمل',     tone: 'good' },
  { id: 'verified',   en: 'Verified',   ar: 'تم التحقق',  tone: 'good' },
  { id: 'cancelled',  en: 'Cancelled',  ar: 'ملغى',      tone: 'neutral' },
]
export const PRIORITIES = [
  { id: 'low',      en: 'Low',      ar: 'منخفضة', tone: 'good' },
  { id: 'medium',   en: 'Medium',   ar: 'متوسطة', tone: 'info' },
  { id: 'high',     en: 'High',     ar: 'عالية',  tone: 'warn' },
  { id: 'critical', en: 'Critical', ar: 'حرجة',   tone: 'crit' },
]

/* ═══════════════════════ Critical services register ═══════════════════════ */
export const READINESS = [
  { id: 'ready',     en: 'Ready',           ar: 'جاهزة',       tone: 'good' },
  { id: 'partial',   en: 'Partially Ready', ar: 'جاهزية جزئية', tone: 'warn' },
  { id: 'notready',  en: 'Not Ready',       ar: 'غير جاهزة',    tone: 'crit' },
  { id: 'degraded',  en: 'Degraded',        ar: 'متدهورة',     tone: 'warn' },
]
export const SERVICE_STATUS = [
  { id: 'operational', en: 'Operational', ar: 'تعمل',        tone: 'good' },
  { id: 'degraded',    en: 'Degraded',    ar: 'متدهورة',     tone: 'warn' },
  { id: 'disrupted',   en: 'Disrupted',   ar: 'متوقفة',      tone: 'crit' },
  { id: 'alternative', en: 'On Alternative', ar: 'على البديل', tone: 'info' },
]
export const APPROVAL_STATUS = [
  { id: 'draft',    en: 'Draft',    ar: 'مسودة',    tone: 'neutral' },
  { id: 'pending',  en: 'Pending',  ar: 'قيد الاعتماد', tone: 'warn' },
  { id: 'approved', en: 'Approved', ar: 'معتمد',    tone: 'good' },
]

/* Seed critical services derived from the framework (configurable records). */
export const SEED_SERVICES = [
  { name_en: 'Player Training Sessions', name_ar: 'حصص تدريب اللاعبين', unit: 'operations', rto: '4h', mtpd: '1d', priority: 'critical' },
  { name_en: 'Student Transport (Buses)', name_ar: 'نقل الطلاب (الحافلات)', unit: 'fleet', rto: '2h', mtpd: '12h', priority: 'critical' },
  { name_en: 'Operations Platform', name_ar: 'منصة العمليات', unit: 'technical', rto: '4h', mtpd: '1d', priority: 'critical' },
  { name_en: 'Player & Parent Communication', name_ar: 'التواصل مع اللاعبين وأولياء الأمور', unit: 'complaints', rto: '4h', mtpd: '1d', priority: 'high' },
  { name_en: 'Medical & First Aid Cover', name_ar: 'التغطية الطبية والإسعافات الأولية', unit: 'medical', rto: '1h', mtpd: '4h', priority: 'critical' },
  { name_en: 'Tournaments & Camps', name_ar: 'البطولات والمعسكرات', unit: 'operations', rto: '1d', mtpd: '3d', priority: 'high' },
  { name_en: 'Facility Access & Safety', name_ar: 'دخول المرافق والسلامة', unit: 'facilities', rto: '4h', mtpd: '1d', priority: 'high' },
  { name_en: 'Sports Equipment Availability', name_ar: 'توفر المعدات الرياضية', unit: 'assets', rto: '1d', mtpd: '3d', priority: 'medium' },
]

/* ═══════════════════════ Risk register (5×5) ═══════════════════════ */
export const RISK_SCALE = [1, 2, 3, 4, 5]
export const RISK_BANDS = [
  { id: 'low',    en: 'Low',      ar: 'منخفض',  min: 1,  max: 4,  hex: '#16a34a', tone: 'good' },
  { id: 'medium', en: 'Medium',   ar: 'متوسط',  min: 5,  max: 9,  hex: '#d97706', tone: 'warn' },
  { id: 'high',   en: 'High',     ar: 'مرتفع',  min: 10, max: 16, hex: '#dc2626', tone: 'crit' },
  { id: 'crit',   en: 'Critical', ar: 'حرج',    min: 17, max: 25, hex: '#7f1d1d', tone: 'crit' },
]
export const riskScore = (p, i) => (Number(p) || 0) * (Number(i) || 0)
export const riskBand  = (score) => RISK_BANDS.find(b => score >= b.min && score <= b.max) || RISK_BANDS[0]

/* ═══════════════════════ Business Impact Analysis ═══════════════════════ */
export const BIA_HORIZONS = [
  { id: 'h2',   en: '< 2 hours',      ar: 'أقل من ساعتين' },
  { id: 'h2_1', en: '2h – 1 day',     ar: 'ساعتان إلى يوم' },
  { id: 'd1_3', en: '1 – 3 days',     ar: 'يوم إلى ثلاثة أيام' },
  { id: 'd3_7', en: '3 days – 1 week', ar: 'ثلاثة أيام إلى أسبوع' },
  { id: 'w1',   en: '> 1 week',       ar: 'أكثر من أسبوع' },
]
export const BIA_LEVELS = [
  { id: 0, en: 'None',     ar: 'لا يوجد',  hex: '#e2e8f0' },
  { id: 1, en: 'Low',      ar: 'منخفض',   hex: '#bbf7d0' },
  { id: 2, en: 'Moderate', ar: 'متوسط',   hex: '#fde68a' },
  { id: 3, en: 'High',     ar: 'مرتفع',   hex: '#fdba74' },
  { id: 4, en: 'Severe',   ar: 'حرج',     hex: '#fca5a5' },
]
/* Priority = worst impact across dims at the longest horizon, blended with
   the speed at which impact escalates. Higher = more urgent recovery. */
export const biaPriority = (grid) => {
  // grid: { [dimId]: { [horizonId]: level 0..4 } }
  let peak = 0, early = 0
  IMPACT_DIMS.forEach(d => {
    BIA_HORIZONS.forEach((h, hi) => {
      const v = grid?.[d.id]?.[h.id] || 0
      peak = Math.max(peak, v)
      if (hi <= 1) early = Math.max(early, v) // impact within a day
    })
  })
  const score = peak * 2 + early // 0..12
  if (score >= 10) return { id: 'critical', en: 'Critical', ar: 'حرجة', tone: 'crit', score }
  if (score >= 7)  return { id: 'high',     en: 'High',     ar: 'عالية', tone: 'warn', score }
  if (score >= 4)  return { id: 'medium',   en: 'Medium',   ar: 'متوسطة', tone: 'info', score }
  return { id: 'low', en: 'Low', ar: 'منخفضة', tone: 'good', score }
}

/* ═══════════════════════ Communications ═══════════════════════ */
export const AUDIENCES = [
  { id: 'staff',      en: 'Employees',            ar: 'الموظفون' },
  { id: 'coaches',    en: 'Coaches',              ar: 'المدربون' },
  { id: 'drivers',    en: 'Drivers',              ar: 'السائقون' },
  { id: 'players',    en: 'Players',              ar: 'اللاعبون' },
  { id: 'parents',    en: 'Parents',              ar: 'أولياء الأمور' },
  { id: 'government', en: 'Government Entities',   ar: 'الجهات الحكومية' },
  { id: 'federations', en: 'Sports Federations',  ar: 'الاتحادات الرياضية' },
  { id: 'suppliers',  en: 'Suppliers',            ar: 'الموردون' },
  { id: 'partners',   en: 'Partners',             ar: 'الشركاء' },
  { id: 'public',     en: 'Public',               ar: 'الجمهور' },
]
export const CHANNELS = [
  { id: 'phone',    en: 'Phone',            ar: 'الهاتف' },
  { id: 'email',    en: 'Email',            ar: 'البريد الإلكتروني' },
  { id: 'sms',      en: 'SMS',              ar: 'الرسائل النصية' },
  { id: 'groups',   en: 'Official Work Groups', ar: 'مجموعات العمل الرسمية' },
  { id: 'website',  en: 'Website',          ar: 'الموقع الإلكتروني' },
  { id: 'social',   en: 'Social Media',     ar: 'حسابات التواصل الاجتماعي' },
  { id: 'system',   en: 'In-System Update', ar: 'تحديث داخلي في النظام' },
]
export const DELIVERY_STATUS = [
  { id: 'draft',   en: 'Draft',     ar: 'مسودة',   tone: 'neutral' },
  { id: 'sent',    en: 'Sent',      ar: 'مُرسلة',  tone: 'info' },
  { id: 'delivered', en: 'Delivered', ar: 'تم التسليم', tone: 'good' },
  { id: 'failed',  en: 'Failed',    ar: 'فشل',     tone: 'crit' },
]

/* ═══════════════════════ Exercises ═══════════════════════ */
export const EXERCISE_TYPES = [
  { id: 'tabletop',   en: 'Tabletop Exercise',      ar: 'تمرين مكتبي' },
  { id: 'comms',      en: 'Communication Test',     ar: 'اختبار اتصال' },
  { id: 'backup',     en: 'Backup Test',            ar: 'اختبار نسخ احتياطية' },
  { id: 'evacuation', en: 'Evacuation Drill',       ar: 'تمرين إخلاء' },
  { id: 'system',     en: 'System Outage Simulation', ar: 'محاكاة تعطل نظام' },
  { id: 'transport',  en: 'Transport Failure Sim',  ar: 'محاكاة تعطل النقل' },
  { id: 'site',       en: 'Site Unavailability Sim', ar: 'محاكاة تعذر استخدام موقع' },
  { id: 'full',       en: 'Full Institutional Crisis', ar: 'تمرين أزمة مؤسسية متكامل' },
]
export const EXERCISE_STATUS = [
  { id: 'planned',   en: 'Planned',    ar: 'مخطط',    tone: 'info' },
  { id: 'scheduled', en: 'Scheduled',  ar: 'مجدول',   tone: 'warn' },
  { id: 'completed', en: 'Completed',  ar: 'مكتمل',   tone: 'good' },
  { id: 'cancelled', en: 'Cancelled',  ar: 'ملغى',    tone: 'neutral' },
]

/* ═══════════════════════ Corrective actions ═══════════════════════ */
export const CAPA_SOURCES = [
  { id: 'incident',  en: 'Incident',      ar: 'حادث' },
  { id: 'exercise',  en: 'Exercise',      ar: 'تمرين' },
  { id: 'audit',     en: 'Audit',         ar: 'تدقيق' },
  { id: 'risk',      en: 'Risk',          ar: 'مخاطرة' },
  { id: 'recovery',  en: 'Recovery Test', ar: 'اختبار تعافٍ' },
]

/* ═══════════════════════ Digital recovery ═══════════════════════ */
export const BACKUP_FREQ = [
  { id: 'realtime', en: 'Real-time',  ar: 'فوري' },
  { id: 'hourly',   en: 'Hourly',     ar: 'كل ساعة' },
  { id: 'daily',    en: 'Daily',      ar: 'يومي' },
  { id: 'weekly',   en: 'Weekly',     ar: 'أسبوعي' },
  { id: 'monthly',  en: 'Monthly',    ar: 'شهري' },
]
export const SEED_RECOVERY = [
  { system_en: 'Operations Suite (Firebase)', system_ar: 'منظومة العمليات (Firebase)', owner: 'technical', priority: 'critical', rto: '4h', rpo: '1h', freq: 'daily' },
  { system_en: 'Fleet Tracking (Cartrack)', system_ar: 'تتبع الأسطول (Cartrack)', owner: 'fleet', priority: 'high', rto: '8h', rpo: '4h', freq: 'daily' },
  { system_en: 'Player & Attendance Records', system_ar: 'سجلات اللاعبين والحضور', owner: 'operations', priority: 'critical', rto: '4h', rpo: '1h', freq: 'daily' },
  { system_en: 'Email & Notifications', system_ar: 'البريد والإشعارات', owner: 'technical', priority: 'medium', rto: '1d', rpo: '1d', freq: 'daily' },
]

/* ═══════════════════════ Response scenarios (seed plans, §14) ═══════════════════════ */
export const SEED_SCENARIOS = [
  { cat: 'platform',  name_en: 'Operations Platform Outage',  name_ar: 'تعطل منصة العمليات',  level: 'l2' },
  { cat: 'power',     name_en: 'Power Outage',                name_ar: 'انقطاع الكهرباء',      level: 'l2' },
  { cat: 'internet',  name_en: 'Internet Outage',             name_ar: 'انقطاع الإنترنت',      level: 'l1' },
  { cat: 'transport', name_en: 'Bus Breakdown',               name_ar: 'تعطل الحافلات',        level: 'l2' },
  { cat: 'facility',  name_en: 'Branch Unavailable',          name_ar: 'تعذر استخدام أحد الفروع', level: 'l2' },
  { cat: 'fire',      name_en: 'Fire / Evacuation',           name_ar: 'الحريق أو الإخلاء',    level: 'l3' },
  { cat: 'medical',   name_en: 'Mass Injury',                 name_ar: 'إصابة جماعية',         level: 'l3' },
  { cat: 'data',      name_en: 'Data Loss',                   name_ar: 'فقدان البيانات',       level: 'l2' },
  { cat: 'staffing',  name_en: 'Critical Staff Absence',      name_ar: 'غياب موظفين في وظائف حرجة', level: 'l2' },
  { cat: 'event',     name_en: 'Tournament / Camp Cancellation', name_ar: 'إلغاء أو تأجيل بطولة أو معسكر', level: 'l2' },
  { cat: 'security',  name_en: 'Account / System Breach',      name_ar: 'اختراق حساب أو نظام',  level: 'l3' },
  { cat: 'equipment', name_en: 'Critical Sports/Medical Equipment Failure', name_ar: 'تعطل معدات رياضية أو طبية حرجة', level: 'l2' },
  { cat: 'weather',   name_en: 'Adverse Weather',             name_ar: 'الظروف الجوية المؤثرة', level: 'l2' },
  { cat: 'supplier',  name_en: 'Key Supplier Failure',        name_ar: 'تعطل مورد رئيسي',      level: 'l2' },
  { cat: 'comms_loss', name_en: 'Loss of Contact with Players & Parents', name_ar: 'فقدان الاتصال باللاعبين وأولياء الأمور', level: 'l2' },
]

/* Immediate-action checklist templates generated when a plan is activated. */
export const PLAN_CHECKLIST_DEFAULTS = [
  { en: 'Confirm the incident and notify the Event Commander', ar: 'تأكيد الحادث وإبلاغ قائد الحدث' },
  { en: 'Assess affected critical services', ar: 'تقييم الخدمات الحيوية المتأثرة' },
  { en: 'Activate the response team', ar: 'تفعيل فريق الاستجابة' },
  { en: 'Apply temporary operating alternatives', ar: 'تطبيق بدائل التشغيل المؤقتة' },
  { en: 'Communicate with affected parties', ar: 'التواصل مع الأطراف المتأثرة' },
  { en: 'Log decisions and monitor service status', ar: 'تسجيل القرارات ومراقبة حالة الخدمات' },
]

/* ═══════════════════════ Contact directory ═══════════════════════ */
export const CONTACT_CATEGORIES = [
  { id: 'employee',   en: 'Employee',            ar: 'موظف' },
  { id: 'branch',     en: 'Branch',              ar: 'فرع' },
  { id: 'driver',     en: 'Driver',              ar: 'سائق' },
  { id: 'coach',      en: 'Coach',               ar: 'مدرب' },
  { id: 'medical',    en: 'Medical',             ar: 'طبي' },
  { id: 'supplier',   en: 'Supplier',            ar: 'مورد' },
  { id: 'partner',    en: 'Partner',             ar: 'شريك' },
  { id: 'federation', en: 'Sports Federation',   ar: 'اتحاد رياضي' },
  { id: 'authority',  en: 'Government Authority', ar: 'جهة حكومية' },
  { id: 'emergency',  en: 'Emergency Service',   ar: 'خدمة طوارئ' },
  { id: 'hosting',    en: 'Technology / Hosting', ar: 'تقنية واستضافة' },
]

/* ═══════════════════════ KPIs (§25) ═══════════════════════ */
/* dir 'up' = higher is better; ut is the unit suffix. Targets configurable per
   year (2026/2027/2028) from Settings; defaults below. computeFrom describes
   which live records feed the auto-calculation. */
export const KPIS = [
  { id: 'services_planned', dir: 'up', ut: '%', freq: 'annual',
    en: 'Critical services covered by approved plans', ar: 'نسبة الخدمات الحيوية المغطاة بخطط معتمدة',
    targets: { 2026: 80, 2027: 90, 2028: 100 } },
  { id: 'plans_tested', dir: 'up', ut: '%', freq: 'annual',
    en: 'Continuity plans that were tested', ar: 'نسبة خطط الاستمرارية التي تم اختبارها',
    targets: { 2026: 60, 2027: 80, 2028: 100 } },
  { id: 'recovery_success', dir: 'up', ut: '%', freq: 'annual',
    en: 'Successful recovery tests', ar: 'نسبة نجاح اختبارات التعافي',
    targets: { 2026: 80, 2027: 90, 2028: 95 } },
  { id: 'avg_response', dir: 'down', ut: 'h', freq: 'quarterly',
    en: 'Average incident response time', ar: 'متوسط زمن الاستجابة للحوادث',
    targets: { 2026: 4, 2027: 3, 2028: 2 } },
  { id: 'avg_recovery', dir: 'down', ut: 'h', freq: 'quarterly',
    en: 'Average service recovery time', ar: 'متوسط زمن استعادة الخدمات',
    targets: { 2026: 24, 2027: 18, 2028: 12 } },
  { id: 'rto_met', dir: 'up', ut: '%', freq: 'quarterly',
    en: 'Services restored within target recovery time', ar: 'نسبة الخدمات المستعادة ضمن زمن التعافي المستهدف',
    targets: { 2026: 75, 2027: 85, 2028: 95 } },
  { id: 'capa_ontime', dir: 'up', ut: '%', freq: 'quarterly',
    en: 'Corrective actions closed on time', ar: 'نسبة إغلاق الإجراءات التصحيحية ضمن الموعد',
    targets: { 2026: 80, 2027: 90, 2028: 95 } },
  { id: 'contacts_updated', dir: 'up', ut: '%', freq: 'quarterly',
    en: 'Contact lists verified & up to date', ar: 'نسبة تحديث قوائم الاتصال',
    targets: { 2026: 90, 2027: 95, 2028: 100 } },
  { id: 'backup_ready', dir: 'up', ut: '%', freq: 'quarterly',
    en: 'Backup readiness', ar: 'نسبة جاهزية النسخ الاحتياطية',
    targets: { 2026: 90, 2027: 95, 2028: 100 } },
  { id: 'plan_review', dir: 'up', ut: '%', freq: 'annual',
    en: 'Departments reviewing their plans on schedule', ar: 'نسبة التزام الإدارات بمراجعة خططها',
    targets: { 2026: 80, 2027: 90, 2028: 100 } },
]

/* KPI attainment (never negative; capped at 200%). */
export const attainment = (kpi, value, target) => {
  if (value == null || target == null || Number.isNaN(value) || Number.isNaN(target)) return null
  if (target === 0) return value === 0 ? 100 : 0
  const raw = kpi.dir === 'down' ? (target / value) * 100 : (value / target) * 100
  if (!Number.isFinite(raw)) return null
  return Math.max(0, Math.min(200, raw))
}
export const kpiStatusOf = (att) => {
  if (att == null) return { id: 'nodata', en: 'No data', ar: 'لا بيانات', tone: 'neutral' }
  if (att >= 100)  return { id: 'above',  en: 'On target', ar: 'ضمن المستهدف', tone: 'good' }
  if (att >= 85)   return { id: 'ontrack', en: 'On track', ar: 'على المسار', tone: 'info' }
  if (att >= 65)   return { id: 'atrisk',  en: 'At risk',  ar: 'في خطر', tone: 'warn' }
  return { id: 'offtrack', en: 'Off track', ar: 'خارج المسار', tone: 'crit' }
}

/* ═══════════════════════ generic tone → hex (print + charts) ═══════════════════════ */
export const TONE_HEX = {
  good: '#16a34a', info: '#2563eb', warn: '#d97706', crit: '#dc2626', neutral: '#64748b',
}

/* ═══════════════════════ small utilities ═══════════════════════ */
export const findById = (list, id) => list.find(x => x.id === id) || null
/* Clock helpers behind a module boundary — keeps `Date.now()` out of render
   bodies so the React-compiler purity rule stays satisfied (same trick the
   date formatters below rely on). */
export const nowMs = () => Date.now()
export const daysFromNow = (n) => Date.now() + n * 86400000
export const toMillis = (ts) => {
  if (!ts) return 0
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  const ms = d.getTime()
  return Number.isNaN(ms) ? 0 : ms
}
export const fmtDate = (ts, locale = 'en-GB') => {
  const ms = toMillis(ts)
  if (!ms) return '—'
  return new Date(ms).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })
}
export const fmtDateTime = (ts, locale = 'en-GB') => {
  const ms = toMillis(ts)
  if (!ms) return '—'
  return new Date(ms).toLocaleString(locale, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
}
/* elapsed since a timestamp, as "2d 4h" / "3h 12m" / "8m". */
export const elapsedSince = (ts, lang = 'en') => {
  const ms = toMillis(ts)
  if (!ms) return '—'
  let s = Math.max(0, Math.floor((Date.now() - ms) / 1000))
  const d = Math.floor(s / 86400); s -= d * 86400
  const h = Math.floor(s / 3600);  s -= h * 3600
  const m = Math.floor(s / 60)
  const u = lang === 'ar' ? { d: 'ي', h: 'س', m: 'د' } : { d: 'd', h: 'h', m: 'm' }
  if (d > 0) return `${d}${u.d} ${h}${u.h}`
  if (h > 0) return `${h}${u.h} ${m}${u.m}`
  return `${m}${u.m}`
}
export const isOverdue = (dueTs, status) => {
  if (['done', 'verified', 'cancelled', 'closed'].includes(status)) return false
  const ms = toMillis(dueTs)
  return ms > 0 && ms < Date.now()
}

/* Parse a duration token like "4h", "2d", "90m", "1w" into hours (for RTO
   comparisons). Returns null if unparseable. */
export const durationToHours = (token) => {
  if (token == null) return null
  if (typeof token === 'number') return token
  const m = String(token).trim().match(/^(\d+(?:\.\d+)?)\s*(m|h|d|w)?$/i)
  if (!m) return null
  const n = parseFloat(m[1])
  switch ((m[2] || 'h').toLowerCase()) {
    case 'm': return n / 60
    case 'd': return n * 24
    case 'w': return n * 168
    default:  return n
  }
}

/* ═══════════════════════ Sequential incident number (atomic) ═══════════════════════ */
/* Returns e.g. "INC-2026-0007". Uses a Firestore transaction on a counter doc
   so two concurrent reporters never collide. */
export async function nextIncidentNumber() {
  const year = new Date().getFullYear()
  const ref = doc(db, COL.counters, 'incidents')
  const seq = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    const data = snap.exists() ? snap.data() : {}
    const current = data[`y${year}`] || 0
    const next = current + 1
    tx.set(ref, { [`y${year}`]: next }, { merge: true })
    return next
  })
  return `INC-${year}-${String(seq).padStart(4, '0')}`
}

/* ═══════════════════════ Sequential decision number (atomic, per-incident) ═══════════════════════ */
/* Returns e.g. "DEC-001". Uses a Firestore transaction on a per-incident counter
   doc so two concurrent decision writers never collide. */
export async function nextDecisionNumber(incidentId) {
  const ref = doc(db, COL.counters, `decisions_${incidentId}`)
  const seq = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    const data = snap.exists() ? snap.data() : {}
    const current = data.n || 0
    const next = current + 1
    tx.set(ref, { n: next }, { merge: true })
    return next
  })
  return `DEC-${String(seq).padStart(3, '0')}`
}

/* ═══════════════════════ Audit log writer ═══════════════════════ */
/* Append-only. Never throws into the caller — audit failure must not block the
   user action. `entity` is the collection, `action` a short verb slug. */
export async function logCrisisAudit({ action, entity, entityId, summary, meta, actor }) {
  try {
    await addDoc(collection(db, COL.audit), {
      action: action || 'update',
      entity: entity || '',
      entityId: entityId || '',
      summary: summary || '',
      meta: meta || null,
      actorId: actor?.uid || '',
      actorName: actor?.name || actor?.email || 'System',
      timestamp: serverTimestamp(),
    })
  } catch (err) {
    console.error('crisis audit write failed:', err)
  }
}

/* ═══════════════════════ In-app notification writer ═══════════════════════ */
/* Writes to crisis_notifications. The module surfaces these in its own bell /
   dashboard. Never blocks the caller. */
export async function pushCrisisNotif({ kind, titleEn, titleAr, bodyEn, bodyAr, link, forRoles, forUser, actor }) {
  try {
    await addDoc(collection(db, COL.notifs), {
      kind: kind || 'info',
      titleEn: titleEn || '', titleAr: titleAr || '',
      bodyEn: bodyEn || '', bodyAr: bodyAr || '',
      link: link || '',
      forRoles: forRoles || [],
      forUser: forUser || null,
      read: false,
      createdById: actor?.uid || '',
      createdByName: actor?.name || actor?.email || 'System',
      timestamp: serverTimestamp(),
    })
  } catch (err) {
    console.error('crisis notif write failed:', err)
  }
}

/* ═══════════════════════ KPI auto-calculation (§25) ═══════════════════════ */
/* Derive every indicator from live module records. Returns
   { [kpiId]: { value:Number|null, note:{en,ar} } }. Values are ratios or
   averages — always ≥ 0, never fabricated. `null` means "no data yet". */
const DAY = 86400000
export function computeCrisisKpis({ incidents = [], services = [], plans = [], exercises = [], corrective = [], contacts = [], recovery = [] }) {
  const pct = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null)
  const firstStatusAt = (inc, statuses) => {
    const log = inc.statusLog || []
    const hit = log.find(s => statuses.includes(s.status))
    return hit ? hit.at : null
  }
  const reportedAt = (inc) => toMillis(inc.reportedAt) || toMillis(inc.createdAt)

  // response / recovery timing (hours)
  const respHrs = [], recovHrs = []
  let rtoWithin = 0, rtoTotal = 0
  incidents.forEach(inc => {
    if ((inc.kind || 'real') !== 'real') return
    const rep = reportedAt(inc)
    const act = firstStatusAt(inc, ACTIVE_STATUSES)
    const res = firstStatusAt(inc, ['restored'])
    if (rep && act && act >= rep) respHrs.push((act - rep) / 3600000)
    if (act && res && res >= act) {
      const h = (res - act) / 3600000
      recovHrs.push(h)
      // RTO comparison against affected services
      const svcRtos = (inc.affectedServices || []).map(sid => durationToHours(services.find(s => s.id === sid)?.rto)).filter(x => x != null)
      if (svcRtos.length) { rtoTotal++; if (h <= Math.max(...svcRtos)) rtoWithin++ }
    }
  })
  const avg = (arr) => (arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null)

  const approvedPlans = plans.filter(p => p.approval === 'approved')
  const testedPlans = approvedPlans.filter(p => exercises.some(e => e.planId === p.id))
  const testedRecovery = recovery.filter(r => r.testResult)
  const passedRecovery = testedRecovery.filter(r => r.testResult === 'pass')
  const closedCapa = corrective.filter(c => ['done', 'verified'].includes(c.status))
  const onTimeCapa = closedCapa.filter(c => c.closureDate && c.dueDate && new Date(c.closureDate) <= new Date(c.dueDate))
  const recentContacts = contacts.filter(c => c.lastVerified && (Date.now() - new Date(c.lastVerified).getTime()) <= 180 * DAY)
  const readyRecovery = recovery.filter(r => r.status === 'ready')
  const reviewedPlans = plans.filter(p => p.reviewDate && (Date.now() - new Date(p.reviewDate).getTime()) <= 365 * DAY)
  const coveredServices = services.filter(s => s.approval === 'approved')

  const note = (en, ar) => ({ en, ar })
  return {
    services_planned: { value: pct(coveredServices.length, services.length), note: note(`${coveredServices.length}/${services.length} services`, `${coveredServices.length}/${services.length} خدمة`) },
    plans_tested:     { value: pct(testedPlans.length, approvedPlans.length), note: note(`${testedPlans.length}/${approvedPlans.length} approved plans tested`, `${testedPlans.length}/${approvedPlans.length} خطة معتمدة مختبَرة`) },
    recovery_success: { value: pct(passedRecovery.length, testedRecovery.length), note: note(`${passedRecovery.length}/${testedRecovery.length} recovery tests passed`, `${passedRecovery.length}/${testedRecovery.length} اختبار تعافٍ ناجح`) },
    avg_response:     { value: avg(respHrs), note: note(`${respHrs.length} incidents`, `${respHrs.length} حادث`) },
    avg_recovery:     { value: avg(recovHrs), note: note(`${recovHrs.length} incidents`, `${recovHrs.length} حادث`) },
    rto_met:          { value: pct(rtoWithin, rtoTotal), note: note(`${rtoWithin}/${rtoTotal} within RTO`, `${rtoWithin}/${rtoTotal} ضمن زمن التعافي`) },
    capa_ontime:      { value: pct(onTimeCapa.length, closedCapa.length), note: note(`${onTimeCapa.length}/${closedCapa.length} closed on time`, `${onTimeCapa.length}/${closedCapa.length} أُغلق في الموعد`) },
    contacts_updated: { value: pct(recentContacts.length, contacts.length), note: note(`${recentContacts.length}/${contacts.length} verified ≤180d`, `${recentContacts.length}/${contacts.length} محدّث خلال 180 يوم`) },
    backup_ready:     { value: pct(readyRecovery.length, recovery.length), note: note(`${readyRecovery.length}/${recovery.length} systems ready`, `${readyRecovery.length}/${recovery.length} نظام جاهز`) },
    plan_review:      { value: pct(reviewedPlans.length, plans.length), note: note(`${reviewedPlans.length}/${plans.length} reviewed ≤1y`, `${reviewedPlans.length}/${plans.length} مُراجَع خلال سنة`) },
  }
}

/* ═══════════════════════ Granular permissions (§22) ═══════════════════════ */
/* These are the fine-grained capability slugs. In this client-Firebase app the
   coarse gate is `permissions.crisis` = view|edit (see usePermissions); the
   slugs below drive intent-revealing checks and are documented for the
   Firestore rules. canManage() = coarse 'edit'. */
export const CRISIS_CAPS = [
  'crisis.view', 'crisis.create', 'crisis.update', 'crisis.activate', 'crisis.escalate',
  'crisis.command', 'crisis.close', 'crisis.approve', 'crisis.manageServices', 'crisis.manageBIA',
  'crisis.manageRisks', 'crisis.managePlans', 'crisis.manageTeams', 'crisis.manageContacts',
  'crisis.manageExercises', 'crisis.manageCorrectiveActions', 'crisis.manageRecovery',
  'crisis.viewReports', 'crisis.export', 'crisis.audit', 'crisis.settings',
]
