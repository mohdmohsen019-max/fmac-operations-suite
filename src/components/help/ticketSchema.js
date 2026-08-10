/* ══════════════════════════════════════════════════════════════════════════
   Help Desk — ticket submission schema (single source of truth)
   مخطط تقديم الطلبات

   Every public request type declares ONLY its own fields here. The wizard, the
   review screen and the Firestore write are all driven from this file, so a
   complaint can never carry a meeting's fields again (the previous bug was a
   shared `details` object seeded with every type's defaults).

   Each type also declares HOW its priority is decided — on a real, explicit
   basis the submitter provides — instead of a blind "Medium" default. The
   admin ticket page (ServiceSpecifics) reads the same field keys defined here.
   ════════════════════════════════════════════════════════════════════════ */

/* ── Priority levels (الأولوية) — shared with the admin + reports ── */
export const PRIORITY = {
  Low:       { ar: 'منخفضة', en: 'Low',       hex: '#64748b' },
  Medium:    { ar: 'متوسطة', en: 'Medium',    hex: '#d97706' },
  High:      { ar: 'عالية',  en: 'High',       hex: '#ea580c' },
  Emergency: { ar: 'طارئة',  en: 'Emergency',  hex: '#dc2626' },
}
export const priorityMetaOf = (level) => PRIORITY[level] || PRIORITY.Medium

/* The stored value for a select option — a bilingual label so the admin page
   and reports render it directly, in either language, with no lookup. */
export const optValue = (o) => `${o.ar} / ${o.en}`

/* ── Field kinds ──────────────────────────────────────────────────────────
   select     — single choice (CustomSelect)
   text       — one-line input
   textarea   — multi-line
   date       — native date picker
   checkgroup — multi-select checkboxes (stored as an array)
   A field may carry:
     required  — must be filled to advance
     showIf    — (details) => bool, conditionally rendered
     driver    — this field's chosen option decides the ticket priority (its
                 options carry a `pri` level)
   ────────────────────────────────────────────────────────────────────────── */

export const TYPE_SCHEMA = {
  /* ───────────────────────── INQUIRY — استفسار ───────────────────────── */
  inquiry: {
    /* which field feeds the top-level content.description shown to staff */
    narrative: 'notes',
    /* informational by design — stated basis, not a hidden default */
    baseline: { level: 'Low', ar: 'استفسار عام — طابع معلوماتي', en: 'General inquiry — informational' },
    fields: [
      {
        key: 'categories', kind: 'checkgroup',
        ar: 'فئات الاستفسار', en: 'Inquiry categories',
        options: [
          { ar: 'البرامج والجداول', en: 'Programs & Schedules' },
          { ar: 'الرسوم والاشتراكات', en: 'Fees & Subscriptions' },
          { ar: 'التسجيل', en: 'Registration' },
          { ar: 'المرافق', en: 'Facilities' },
          { ar: 'البطولات والفعاليات', en: 'Events & Tournaments' },
          { ar: 'أخرى', en: 'Other' },
        ],
      },
      {
        key: 'notes', kind: 'textarea', required: true,
        ar: 'تفاصيل الاستفسار', en: 'Your question',
        placeholderAr: 'اكتب سؤالك بالتفصيل…', placeholderEn: 'Write your question in detail…',
      },
    ],
  },

  /* ──────────────────────── COMPLAINT — شكوى ─────────────────────────── */
  complaint: {
    narrative: 'description',
    fields: [
      {
        /* the real priority basis — the submitter states the nature of the issue */
        key: 'severity', kind: 'select', required: true, driver: true,
        ar: 'طبيعة الشكوى', en: 'Nature of the complaint',
        options: [
          { ar: 'سلامة أو صحة أحد الأطفال أو الأعضاء', en: "Child or member safety or health", pri: 'Emergency' },
          { ar: 'سوء سلوك أو سوء معاملة', en: 'Misconduct or mistreatment', pri: 'High' },
          { ar: 'جودة الخدمة أو التنظيم', en: 'Service quality or organisation', pri: 'Medium' },
          { ar: 'ملاحظة عامة', en: 'General remark', pri: 'Low' },
        ],
      },
      {
        key: 'against', kind: 'select', required: true,
        ar: 'الشكوى ضد', en: 'Complaint against',
        options: [
          { ar: 'مدرب', en: 'Coach' },
          { ar: 'موظف إداري', en: 'Admin Staff' },
          { ar: 'سائق حافلة', en: 'Bus Driver' },
          { ar: 'لاعب آخر', en: 'Other Player' },
          { ar: 'المنشأة', en: 'Facility' },
          { ar: 'أخرى', en: 'Other' },
        ],
      },
      {
        key: 'targetName', kind: 'text',
        ar: 'اسم الشخص أو رقم الحافلة', en: 'Name or bus number',
        showIf: (d) => ['مدرب / Coach', 'سائق حافلة / Bus Driver', 'لاعب آخر / Other Player'].includes(d.against),
      },
      {
        key: 'description', kind: 'textarea', required: true,
        ar: 'وصف الشكوى', en: 'Complaint description',
        placeholderAr: 'صف ما حدث بوضوح — التاريخ والمكان والأشخاص إن أمكن…',
        placeholderEn: 'Describe clearly what happened — date, place, people if possible…',
      },
    ],
  },

  /* ─────────────────────── SUGGESTION — اقتراح ───────────────────────── */
  suggestion: {
    narrative: 'description',
    fields: [
      {
        key: 'department', kind: 'select',
        ar: 'القسم', en: 'Department',
        options: [
          { ar: 'التدريب', en: 'Coaching' },
          { ar: 'الإدارة', en: 'Administration' },
          { ar: 'النقل', en: 'Transport' },
          { ar: 'المرافق', en: 'Facilities' },
          { ar: 'الفعاليات', en: 'Events' },
          { ar: 'أخرى', en: 'Other' },
        ],
      },
      {
        /* the submitter's own impact assessment drives priority — admin reads sd.priority */
        key: 'priority', kind: 'select', required: true, driver: true,
        ar: 'مدى تأثير الاقتراح', en: 'Expected impact',
        options: [
          { ar: 'تحسين كبير للخدمة', en: 'Major service improvement', pri: 'High' },
          { ar: 'تحسين متوسط', en: 'Moderate improvement', pri: 'Medium' },
          { ar: 'تحسين بسيط', en: 'Minor improvement', pri: 'Low' },
        ],
      },
      {
        key: 'outcome', kind: 'textarea',
        ar: 'النتيجة المتوقعة', en: 'Expected outcome',
        placeholderAr: 'ما الذي سيتحسن لو طُبّق اقتراحك؟', placeholderEn: 'What would improve if applied?',
      },
      {
        key: 'description', kind: 'textarea', required: true,
        ar: 'وصف الاقتراح', en: 'Suggestion details',
        placeholderAr: 'اشرح فكرتك…', placeholderEn: 'Explain your idea…',
      },
    ],
  },

  /* ───────────────────────── MEETING — اجتماع ────────────────────────── */
  meeting: {
    narrative: 'reason',
    fields: [
      {
        key: 'meetingWith', kind: 'select', required: true,
        ar: 'الاجتماع مع', en: 'Meeting with',
        options: [
          { ar: 'مدير النادي', en: 'Club Director' },
          { ar: 'مدير العمليات', en: 'Operations Manager' },
          { ar: 'المدرب الرئيسي', en: 'Head Coach' },
          { ar: 'الفريق الإداري', en: 'Admin Team' },
        ],
      },
      {
        /* stated basis for priority — routine vs. time-sensitive */
        key: 'timing', kind: 'select', required: true, driver: true,
        ar: 'طبيعة الموعد', en: 'Meeting timing',
        options: [
          { ar: 'أمر عاجل لا يحتمل التأخير', en: 'Urgent — cannot wait', pri: 'High' },
          { ar: 'موعد اعتيادي', en: 'Routine appointment', pri: 'Low' },
        ],
      },
      {
        key: 'preferredDate', kind: 'date', required: true,
        ar: 'التاريخ المفضل', en: 'Preferred date',
      },
      {
        key: 'reason', kind: 'textarea', required: true,
        ar: 'سبب الاجتماع', en: 'Reason for the meeting',
        placeholderAr: 'ما الذي تودّ مناقشته؟', placeholderEn: 'What would you like to discuss?',
      },
    ],
  },

  /* ────────────────────────── CALL — مكالمة ──────────────────────────── */
  call: {
    narrative: 'subject',
    baseline: { level: 'Medium', ar: 'طلب اتصال — يُعامَل بأولوية قياسية وسرعة استجابة عالية', en: 'Callback request — standard priority, fast response window' },
    fields: [
      {
        key: 'role', kind: 'select',
        ar: 'صفتك', en: 'Your role',
        options: [
          { ar: 'ولي أمر', en: 'Parent' },
          { ar: 'لاعب', en: 'Player' },
          { ar: 'مدرب', en: 'Coach' },
          { ar: 'زائر', en: 'Visitor' },
          { ar: 'أخرى', en: 'Other' },
        ],
      },
      {
        key: 'subject', kind: 'text', required: true,
        ar: 'موضوع المكالمة', en: 'Call subject',
        placeholderAr: 'باختصار، ما موضوع المكالمة؟', placeholderEn: 'Briefly, what is the call about?',
      },
      {
        key: 'bestTime', kind: 'select',
        ar: 'الوقت المفضل للاتصال', en: 'Best time to call',
        options: [
          { ar: 'الصباح 8–12', en: 'Morning 8-12' },
          { ar: 'الظهر 12–4', en: 'Afternoon 12-4' },
          { ar: 'المساء 4–8', en: 'Evening 4-8' },
        ],
      },
    ],
  },

  /* ─────────────────────── MAINTENANCE — صيانة ───────────────────────── */
  maintenance: {
    narrative: 'description',
    fields: [
      {
        key: 'location', kind: 'select', required: true,
        ar: 'الموقع', en: 'Location',
        options: [
          { ar: 'المبنى الرئيسي', en: 'Main Building' },
          { ar: 'الحافلة', en: 'Bus' },
          { ar: 'أرض التدريب', en: 'Training Ground' },
          { ar: 'غرف التبديل', en: 'Changing Rooms' },
          { ar: 'أخرى', en: 'Other' },
        ],
      },
      {
        key: 'busNumber', kind: 'text',
        ar: 'رقم الحافلة', en: 'Bus number',
        showIf: (d) => d.location === 'الحافلة / Bus',
      },
      {
        key: 'categories', kind: 'checkgroup',
        ar: 'فئة المشكلة', en: 'Issue category',
        options: [
          { ar: 'كهرباء', en: 'Electrical' },
          { ar: 'سباكة', en: 'Plumbing' },
          { ar: 'تكييف', en: 'AC & Cooling' },
          { ar: 'نظافة', en: 'Cleaning' },
          { ar: 'معدات', en: 'Equipment' },
          { ar: 'أخرى', en: 'Other' },
        ],
      },
      {
        /* real priority basis — how urgent the fault is */
        key: 'urgency', kind: 'select', required: true, driver: true,
        ar: 'درجة الخطورة', en: 'Severity',
        options: [
          { ar: 'خطر على السلامة أو تعطّل كامل', en: 'Safety hazard or total outage', pri: 'Emergency' },
          { ar: 'يعيق التشغيل', en: 'Disrupts operations', pri: 'High' },
          { ar: 'يحتاج إصلاحاً غير عاجل', en: 'Needs a non-urgent fix', pri: 'Medium' },
          { ar: 'تحسين بسيط', en: 'Minor improvement', pri: 'Low' },
        ],
      },
      {
        key: 'description', kind: 'textarea', required: true,
        ar: 'وصف المشكلة', en: 'Issue description',
        placeholderAr: 'صف العطل ومكانه بدقة…', placeholderEn: 'Describe the fault and its exact location…',
      },
    ],
  },
}

export const TICKET_TYPES = Object.keys(TYPE_SCHEMA)
export const isKnownType = (type) => Object.prototype.hasOwnProperty.call(TYPE_SCHEMA, type)

/* Fresh, EMPTY details object holding ONLY this type's own keys. This is what
   guarantees no cross-type field can ever leak into the review or the record. */
export const emptyDetailsFor = (type) => {
  const schema = TYPE_SCHEMA[type]
  if (!schema) return { description: '' }
  const out = {}
  schema.fields.forEach((f) => { out[f.key] = f.kind === 'checkgroup' ? [] : '' })
  return out
}

/* Visible fields for the current answers (applies showIf). */
export const visibleFields = (type, details) => {
  const schema = TYPE_SCHEMA[type]
  if (!schema) return []
  return schema.fields.filter((f) => !f.showIf || f.showIf(details))
}

/* Is the step-3 form complete enough to advance? */
export const detailsComplete = (type, details) => {
  return visibleFields(type, details).every((f) => {
    if (!f.required) return true
    const v = details[f.key]
    return f.kind === 'checkgroup' ? Array.isArray(v) && v.length > 0 : !!(v && String(v).trim())
  })
}

/* The real priority decision — returns the level AND the basis it was decided
   on, so nothing is ever "Medium for no reason". */
export const derivePriority = (type, details) => {
  const schema = TYPE_SCHEMA[type]
  if (schema) {
    const driver = schema.fields.find((f) => f.driver)
    if (driver) {
      const chosen = driver.options.find((o) => optValue(o) === details[driver.key])
      if (chosen?.pri) {
        return {
          level: chosen.pri,
          basisAr: `${driver.ar}: ${chosen.ar}`,
          basisEn: `${driver.en}: ${chosen.en}`,
        }
      }
    }
    if (schema.baseline) {
      return { level: schema.baseline.level, basisAr: schema.baseline.ar, basisEn: schema.baseline.en }
    }
  }
  return { level: 'Medium', basisAr: 'أولوية قياسية', basisEn: 'Standard priority' }
}

/* The narrative text staff read first (content.description). */
export const narrativeOf = (type, details) => {
  const key = TYPE_SCHEMA[type]?.narrative
  return (key && details[key]) ? String(details[key]) : ''
}

/* Render a stored field value for the review screen. */
export const displayValue = (field, value) => {
  if (Array.isArray(value)) return value.map((v) => (typeof v === 'string' ? v : optValue(v))).join('، ')
  return value == null ? '' : String(value)
}
