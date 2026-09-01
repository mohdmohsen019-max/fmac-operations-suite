/**
 * Strategy & Organizational Excellence — the club's full KPI register.
 *
 * Rebuilt 2026-07 from the excellence workbooks:
 *   • مؤشرات الاقسام — the master department KPI register (5 org units)
 *   • تقرير المبادرات — strategic initiatives + their KPI matrices
 *   • تقرير الموظفين — employee-level operational KPIs
 * Workbook readings are intentionally NOT seeded — values come only from the
 * suite's own live calculators or from readings entered in the module.
 *
 * source: 'live'   → auto-computed from suite data (liveKpis.js, key = calc)
 * source: 'manual' → periodic readings stored in `strategy_readings`
 * source: 'meta'   → derived from the register itself (computed in-module)
 *
 * dir: 'up' = higher is better · 'down' = lower is better (attainment is
 * direction-aware and NEVER negative). target: null = not set in the register;
 * admins can set one in-app (stored in `strategy_settings/targets`).
 *
 * ut (unit type): '%' | 'count' | 'days' | 'hours'
 */

export const UNITS = [
  { id: 'technical',  en: 'Technical Preparation', ar: 'قسم الإعداد الفني' },
  { id: 'operations', en: 'Operations',            ar: 'قسم العمليات' },
  { id: 'support',    en: 'Support Services',      ar: 'قسم الخدمات المساندة' },
  { id: 'finance',    en: 'Finance',               ar: 'قسم المالية' },
  { id: 'excellence', en: 'Strategy & Excellence Office', ar: 'مكتب التخطيط الاستراتيجي والتميز' },
]

export const GOALS = [
  { id: 'elite',         en: 'Elite program & Olympic qualification', ar: 'تدعيم برنامج النخبة لتأهيل لاعبين للتصفيات الأولمبية' },
  { id: 'talent',        en: 'Sustainable talent discovery',          ar: 'تطوير آليات مستدامة لاكتشاف واستقطاب المواهب' },
  { id: 'championships', en: 'Host sanctioned championships',         ar: 'تنظيم واستضافة بطولات ذات تصنيف دولي' },
  { id: 'community',     en: 'Fujairah sports community',             ar: 'إنشاء مجتمع رياضي في إمارة الفجيرة' },
  { id: 'tech',          en: 'Modern sports technology',              ar: 'تطبيق أفضل الممارسات التكنولوجية الحديثة' },
  { id: 'awards',        en: 'Global excellence & awards',            ar: 'المشاركة وحصد جوائز التميز عالمياً' },
]

export const NATURES = [
  { id: 'procedural',  en: 'Procedural',  ar: 'مؤشر إجراءات' },
  { id: 'operational', en: 'Operational', ar: 'مؤشر عمليات' },
  { id: 'strategic',   en: 'Strategic',   ar: 'مؤشر استراتيجي' },
  { id: 'excellence',  en: 'Excellence',  ar: 'مؤشر تميز' },
]

/* Weight inside the excellence score, by nature. */
export const NATURE_WEIGHT = { strategic: 3, excellence: 2, operational: 2, procedural: 1 }

export const INITIATIVES = [
  {
    id: 'excellence-awards',
    en: 'Institutional Excellence & International Accreditations',
    ar: 'التميز المؤسسي والاعتمادات الدولية',
    goalEn: 'Compete for and win international excellence awards',
    goalAr: 'المشاركة وحصد جوائز تميز مكانة النادي على مستوى العالم',
    activities: [
      { en: 'Innovation Lab', ar: 'مختبر الابتكار' },
      { en: 'Institutional awards management', ar: 'إدارة الجوائز المؤسسية' },
    ],
  },
  {
    id: 'fuel-optimization',
    en: 'Fleet Fuel Optimization via Smart Monitoring',
    ar: 'ترشيد وخفض تكلفة الوقود لحافلات النادي بأنظمة المراقبة الذكية',
    goalEn: 'Cut fleet fuel cost through telematics-driven operations',
    goalAr: 'تحسين كفاءة تشغيل الأسطول وخفض استهلاك الوقود عبر المراقبة الذكية',
    activities: [
      { en: 'Smart fleet monitoring platform', ar: 'منظومة المراقبة والإدارة الذكية لأسطول النقل' },
      { en: 'Fleet operating-efficiency program', ar: 'برنامج رفع كفاءة تشغيل أسطول النقل' },
    ],
  },
  {
    id: 'leadership-development',
    en: 'Institutional Competencies & Leadership Development',
    ar: 'مشروع تطوير الكفاءات والقيادات المؤسسية',
    goalEn: 'Build an integrated competency & leadership pipeline',
    goalAr: 'بناء منظومة متكاملة لتطوير الكفاءات المؤسسية والقيادية',
    activities: [
      { en: 'Specialized competency program', ar: 'برنامج تطوير الكفاءات التخصصية' },
      { en: 'Leadership & talent sustainability program', ar: 'برنامج بناء القيادات واستدامة المواهب' },
    ],
  },
  {
    id: 'olympic-launch',
    en: 'The Olympic Launch',
    ar: 'الانطلاقة الأولمبية',
    goalEn: 'Develop elite players toward Olympic qualification',
    goalAr: 'تدعيم برنامج النخبة لتطوير لاعبين مؤهلين لخوض التصفيات الأولمبية',
    activities: [
      { en: 'Fencing skills robot trainer', ar: 'جهاز تطوير مهارات لاعبي المبارزة' },
      { en: 'Elite periodic medical screening', ar: 'برنامج الفحص الدوري للاعبي النخبة' },
      { en: 'Olympic athlete preparation (camps & external participation)', ar: 'برنامج إعداد لاعب أولمبي (مشاركات خارجية ومعسكرات)' },
    ],
  },
  {
    id: 'digital-transformation',
    en: 'Digital Transformation',
    ar: 'التحول الرقمي',
    goalEn: 'Automate operations and apply modern sports technology',
    goalAr: 'تطبيق أفضل الممارسات التكنولوجية الحديثة وأتمتة العمليات',
    activities: [
      { en: 'Process automation project', ar: 'مشروع أتمتة العمليات' },
      { en: 'Sports AI project', ar: 'مشروع الذكاء الاصطناعي الرياضي' },
    ],
  },
  {
    id: 'community-sport',
    en: 'Fujairah Sports Community',
    ar: 'مشروع المجتمع الرياضي في الفجيرة',
    goalEn: 'Build an active sporting community across the emirate',
    goalAr: 'تطبيق مبادرات وأنشطة فعالة تسهم في إنشاء مجتمع رياضي في إمارة الفجيرة',
    activities: [
      { en: 'FMAC Run', ar: 'سباقات FMAC Run' },
      { en: 'Fujairah physical-activity challenge', ar: 'تحدي الفجيرة للنشاط البدني' },
      { en: 'Sport in schools', ar: 'الرياضة في المدارس' },
    ],
  },
  {
    id: 'talent-scouting',
    en: 'Sports Talent Discovery & Attraction System',
    ar: 'منظومة اكتشاف واستقطاب المواهب الرياضية',
    goalEn: 'Sustainable pipelines for discovering national sporting talent',
    goalAr: 'تطوير آليات مستدامة لاكتشاف واستقطاب المواهب الرياضية المواطنة',
    activities: [
      { en: 'Tomorrow’s Elite (schools partnership)', ar: 'نخبة الغد' },
      { en: 'Future Generations summer program', ar: 'أجيال المستقبل' },
    ],
  },
  {
    id: 'champions-destination',
    en: 'Fujairah, Destination of Champions',
    ar: 'الفجيرة وجهة الأبطال',
    goalEn: 'Host internationally sanctioned championships',
    goalAr: 'تنظيم واستضافة بطولات ذات تصنيف من الاتحادات الدولية',
    activities: [
      { en: 'Smart championships platform', ar: 'منصة البطولات الذكية' },
      { en: 'International sports marketing program', ar: 'برنامج التسويق الرياضي الدولي' },
    ],
  },
]

/* ── KPI ownership — توزيع المؤشرات على موظفي القسم (يناير 2026) ──
   The "owner" is the measurement owner: the person responsible for collecting
   the data, computing the result, documenting the evidence and filing the
   reading on time. Other staff still supply data tied to their own tasks.
   Approval of results stays with رئيس قسم العمليات, then مدير النادي. */
export const OWNERS = [
  { id: 'head_ops',    en: 'Head of Operations',            ar: 'رئيس قسم العمليات' },
  { id: 'sports',      en: 'Sports Activities Specialist',  ar: 'أخصائي أنشطة رياضية' },
  { id: 'logistics',   en: 'Logistics Support Specialist',  ar: 'أخصائي دعم لوجستي' },
  { id: 'warehouse',   en: 'Senior Warehouse Executive',    ar: 'تنفيذي أول مستودعات' },
  { id: 'media',       en: 'Media Coordination Executive',  ar: 'تنفيذي تنسيق إعلامي' },
  { id: 'customer',    en: 'Customer Service Specialist',   ar: 'أخصائي خدمة متعاملين' },
  { id: 'supervisor',  en: 'Workers’ Supervisor',           ar: 'مشرف عمال' },
  { id: 'workers',     en: 'Workers',                       ar: 'عمال' },
  { id: 'drivers',     en: 'Drivers',                       ar: 'سائقون' },
]
export const ownerById = (id) => OWNERS.find(o => o.id === id) || null
export const ownerLabel = (id, lang) => {
  const o = ownerById(id)
  return o ? (lang === 'ar' ? o.ar : o.en) : null
}

/* Compact KPI definition helper — exported so the Strategy module can build
   admin-added custom KPIs with the exact same shape as the shipped catalog.
   `owner` defaults to null so any KPI without an assigned owner (other
   departments, custom KPIs) keeps working exactly as before. */
export const def = (id, unit, nature, goal, freq, target, en, ar, formulaAr, extra = {}) => ({
  id, unit, nature, goal, freq, target, en, ar, formulaAr,
  ut: '%', dir: 'up', source: 'manual', owner: null, ...extra,
})

export const KPIS = [
  /* ═══════════ TECHNICAL PREPARATION — قسم الإعداد الفني ═══════════ */
  def('training_execution', 'technical', 'procedural', 'elite', 'monthly', 95,
    'Training sessions executed per plan', 'نسبة الالتزام بتنفيذ الحصص التدريبية',
    'عدد الحصص التدريبية المنفذة ÷ إجمالي الحصص المخطط لها'),
  def('training_hours_per_player', 'technical', 'procedural', 'elite', 'monthly', null,
    'Training hours delivered per player', 'معدل الساعات التدريبية المنفذة لكل لاعب',
    'إجمالي الساعات التدريبية المنفذة ÷ عدد اللاعبين', { ut: 'hours' }),
  def('player_attendance', 'technical', 'procedural', 'elite', 'monthly', 95,
    'Player attendance at training sessions', 'نسبة حضور اللاعبين للحصص التدريبية',
    'عدد الحضور ÷ إجمالي عدد اللاعبين', { source: 'live', calc: 'attendanceRate' }),
  def('emirati_players', 'technical', 'strategic', 'talent', 'semiannual', 25,
    'Emirati players in the club', 'نسبة اللاعبين المواطنين في النادي',
    'عدد اللاعبين المواطنين ÷ إجمالي اللاعبين', { initiative: 'talent-scouting' }),
  def('local_champ_participation', 'technical', 'procedural', 'elite', 'monthly', 100,
    'Local championship participation', 'نسبة المشاركة في البطولات المحلية',
    'عدد المشاركات المحلية ÷ إجمالي البطولات المحلية الممكنة'),
  def('players_in_champs', 'technical', 'operational', 'elite', 'quarterly', null,
    'Players participating in championships', 'نسبة اللاعبين المشاركين في البطولات (محلية - عالمية)',
    'عدد المشاركين في البطولات ÷ اللاعبون المسجلون في الاتحاد'),
  def('medals_per_participant', 'technical', 'operational', 'elite', 'quarterly', null,
    'Medals won per participating player', 'نسبة الميداليات المحققة من اللاعبين المشاركين',
    'عدد الميداليات المحققة ÷ عدد المشاركين'),
  def('intl_champ_participation', 'technical', 'procedural', 'elite', 'monthly', 100,
    'International championship participation', 'نسبة المشاركة في البطولات الدولية',
    'عدد المشاركات العالمية ÷ إجمالي البطولات العالمية الممكنة'),
  def('gold_medals_local', 'technical', 'operational', 'elite', 'quarterly', null,
    'Gold medals won locally', 'عدد الميداليات الذهبية المحققة (محلياً)',
    'عدد الميداليات الذهبية', { ut: 'count' }),
  def('intl_participations', 'technical', 'procedural', 'elite', 'monthly', 12,
    'International participations', 'عدد المشاركات الدولية',
    'عدد المشاركات الدولية', { ut: 'count' }),
  def('players_intl_champs', 'technical', 'procedural', 'elite', 'monthly', null,
    'Players in international championships', 'نسبة اللاعبين المشاركين في البطولات الدولية',
    'المشاركون دولياً ÷ اللاعبون المسجلون في الاتحاد'),
  def('national_team_players', 'technical', 'strategic', 'elite', 'semiannual', null,
    'Club players in national teams', 'نسبة لاعبي النادي في المنتخبات الوطنية',
    'اللاعبون في المنتخب الوطني ÷ إجمالي اللاعبين', { initiative: 'olympic-launch' }),
  def('excellence_shields', 'technical', 'strategic', 'awards', 'annual', 4,
    'Excellence shields won this season', 'عدد دروع التفوق المحققة في الموسم الرياضي',
    'عدد الدروع', { ut: 'count' }),
  def('honored_players', 'technical', 'strategic', 'awards', 'annual', null,
    'Players honored by federations', 'عدد اللاعبين المكرمين من الاتحادات',
    'عدد اللاعبين المكرمين', { ut: 'count' }),
  def('camp_participation', 'technical', 'operational', 'elite', 'quarterly', null,
    'Players in training camps (internal & external)', 'نسبة اللاعبين المشاركين في المعسكرات (داخلية - خارجية)',
    'المشاركون في المعسكرات ÷ اللاعبون المسجلون في الاتحاد', { initiative: 'olympic-launch' }),
  def('new_players', 'technical', 'operational', 'talent', 'quarterly', null,
    'Newly registered players', 'نسبة اللاعبين الجدد المسجلين في النادي',
    'اللاعبون الجدد ÷ إجمالي اللاعبين', { initiative: 'talent-scouting' }),
  def('talent_improvement', 'technical', 'strategic', 'talent', 'quarterly', null,
    'Improvement in talent attraction', 'نسبة التحسن في استقطاب المواهب الرياضية',
    '(المسجلون حالياً − المسجلون سابقاً) ÷ المسجلون سابقاً', { initiative: 'talent-scouting' }),
  def('gold_per_coach', 'technical', 'operational', 'elite', 'quarterly', null,
    'Gold medals per coach', 'نسبة الميداليات الذهبية المحققة لكل مدرب',
    'عدد الميداليات الذهبية ÷ عدد المدربين', { ut: 'count' }),
  def('future_gen_registered', 'technical', 'operational', 'talent', 'annual', null,
    'Players registered via Future Generations', 'عدد اللاعبين المسجلين من برنامج أجيال المستقبل',
    'المسجلون من البرنامج ÷ إجمالي المشاركين فيه', { initiative: 'talent-scouting' }),
  def('elite_growth', 'technical', 'strategic', 'talent', 'semiannual', null,
    'Growth of the elite player pool', 'معدل ارتفاع عدد لاعبي النخبة',
    'لاعبو النخبة الجدد ÷ العدد الإجمالي للاعبين', { initiative: 'olympic-launch' }),
  def('external_camps', 'technical', 'procedural', 'elite', 'monthly', null,
    'External training camps held', 'عدد المعسكرات الخارجية',
    'عدد المعسكرات', { ut: 'count', initiative: 'olympic-launch' }),
  def('future_gen_growth', 'technical', 'operational', 'talent', 'annual', null,
    'Growth in Future Generations participants', 'نسبة التحسن في عدد المشاركين ببرنامج أجيال المستقبل',
    '(مشاركو الفترة الحالية − السابقة) ÷ مشاركو الفترة السابقة', { initiative: 'talent-scouting' }),
  def('gold_ratio', 'technical', 'operational', 'elite', 'quarterly', null,
    'Gold medals as a share of all medals', 'نسبة الميداليات الذهبية المحققة',
    'الميداليات الذهبية ÷ إجمالي الميداليات'),
  def('gold_improvement', 'technical', 'strategic', 'elite', 'semiannual', null,
    'Improvement in gold medals (local & global)', 'نسبة التحسن في الميداليات الذهبية (محلي - عالمي)',
    '(ميداليات الفترة الحالية − السابقة) ÷ ميداليات الفترة السابقة'),
  def('external_participation_improvement', 'technical', 'operational', 'elite', 'quarterly', null,
    'Improvement in external participations', 'نسبة التحسن في المشاركات بالبطولات الخارجية',
    '(مشاركات الفترة الحالية − السابقة) ÷ مشاركات الفترة السابقة'),
  def('gold_improvement_intl', 'technical', 'strategic', 'elite', 'semiannual', null,
    'Improvement in international gold medals', 'نسبة التحسن في الميداليات الذهبية عالمياً',
    '(الميداليات الدولية الحالية − السابقة) ÷ الميداليات السابقة'),
  def('tech_performance_improvement', 'technical', 'strategic', 'tech', 'annual', null,
    'Player physical improvement via technology', 'نسبة تحسن الأداء البدني للاعبين بعد استخدام التكنولوجيا',
    'قياسات الأداء قبل وبعد استخدام التقنيات', { initiative: 'digital-transformation' }),
  def('new_technologies', 'technical', 'strategic', 'tech', 'annual', 3,
    'New player-development technologies deployed', 'عدد التقنيات الجديدة المستخدمة لتطوير أداء اللاعبين',
    'عدد التقنيات الجديدة', { ut: 'count', initiative: 'digital-transformation' }),
  def('tech_practices', 'technical', 'excellence', 'tech', 'annual', null,
    'Modern technology practices applied yearly', 'عدد الممارسات التكنولوجية الحديثة المطبقة سنوياً',
    'عدد الممارسات المطبقة', { ut: 'count', initiative: 'digital-transformation' }),
  def('elite_screening', 'technical', 'operational', 'elite', 'quarterly', 100,
    'Elite players’ periodic medical screening', 'نسبة الالتزام بالفحص الدوري للاعبي النخبة',
    'اللاعبون المفحوصون في الربع ÷ لاعبو النخبة', { initiative: 'olympic-launch' }),

  /* ═══════════ OPERATIONS — قسم العمليات ═══════════ */
  /* ── OFFICIAL 2026 SCORECARD (KPIs-2026 export) — featured KPIs ── */
  def('roi_tournaments', 'operations', 'strategic', 'championships', 'annual', 25,
    'Return on investment (ROI)', 'العائد على الاستثمار (ROI)',
    '((الإيرادات − التكاليف) ÷ التكاليف) × 100', { featured: 1, baseYear: 2025, owner: 'head_ops' }),
  def('complaints_rate_tournament', 'operations', 'strategic', 'championships', 'quarterly', 5,
    'Complaints during the tournament', 'الشكاوى خلال البطولة',
    'عدد الشكاوى المستلمة خلال البطولة — المستهدف أقل من 5 شكاوى',
    { ut: 'count', dir: 'down', featured: 2, baseYear: 2025, owner: 'customer' }),
  def('tournaments_plan_execution', 'operations', 'strategic', 'championships', 'quarterly', 100,
    'Annual tournaments plan execution rate', 'نسبة تنفيذ خطة البطولات السنوية',
    '(البطولات المنفذة ÷ البطولات المخططة) × 100', { featured: 3, baseYear: 2025, owner: 'sports' }),
  def('fujairah_residents_share', 'operations', 'strategic', 'community', 'semiannual', 80,
    'Share of Fujairah residents among community-initiative participants',
    'نسبة سكان الفجيرة من المشاركين في المبادرات المجتمعية',
    '(المشاركون من سكان الفجيرة ÷ إجمالي المشاركين) × 100', { featured: 5, baseYear: 2025, owner: 'sports' }),

  def('hosted_championships', 'operations', 'operational', 'championships', 'annual', null,
    'Championships hosted & organized by the club', 'عدد البطولات المستضافة والمنظمة من النادي',
    'عدد البطولات', { ut: 'count', initiative: 'champions-destination', owner: 'sports' }),
  def('sports_events_execution', 'operations', 'strategic', 'championships', 'semiannual', 100,
    'Sports events executed per plan', 'نسبة الالتزام بتنفيذ الفعاليات الرياضية',
    'الفعاليات المنفذة ÷ الفعاليات المخطط لها', { initiative: 'champions-destination', owner: 'sports' }),
  def('breakdowns_per_100k', 'operations', 'procedural', 'awards', 'monthly', 3,
    'Fleet breakdowns per 100,000 km', 'معدل الأعطال الإجمالية لكل 100 ألف كم مقطوع',
    'عدد الأعطال × 100,000 ÷ الكيلومترات المقطوعة للأسطول',
    { ut: 'count', dir: 'down', source: 'live', calc: 'breakdownsPer100k', initiative: 'fuel-optimization', owner: 'logistics' }),
  def('bus_occupancy', 'operations', 'operational', 'championships', 'quarterly', 95,
    'Bus fleet availability', 'نسبة إشغال الحافلات',
    'الحافلات الجاهزة للتشغيل ÷ إجمالي الأسطول (14) × 100',
    { source: 'live', calc: 'busOccupancy', owner: 'logistics' }),
  def('corrective_maintenance_time', 'operations', 'procedural', 'awards', 'monthly', null,
    'Corrective maintenance turnaround', 'البعد الزمني المستغرق للصيانة التصحيحية',
    'تاريخ إتمام الصيانة − تاريخ فتح أمر العمل', { ut: 'days', dir: 'down', owner: 'logistics' }),
  def('suggestions_response', 'operations', 'operational', 'community', 'quarterly', 100,
    'Suggestions answered on time', 'نسبة الالتزام بالرد على الاقتراحات ضمن الوقت المحدد',
    'الاقتراحات المُجاب عليها ÷ الاقتراحات الواردة', { source: 'live', calc: 'responseSuggestions', owner: 'customer' }),
  def('complaints_response', 'operations', 'operational', 'community', 'quarterly', 100,
    'Complaints closed on time', 'نسبة الالتزام بالرد على الشكاوى ضمن الوقت المحدد',
    'الشكاوى المغلقة ÷ الشكاوى الواردة', { source: 'live', calc: 'responseComplaints', owner: 'customer' }),
  def('inquiries_response', 'operations', 'operational', 'community', 'quarterly', 100,
    'Inquiries answered on time', 'نسبة الالتزام بالرد على الاستفسارات ضمن الوقت المحدد',
    'الاستفسارات المُجاب عليها ÷ الاستفسارات الواردة', { source: 'live', calc: 'responseInquiries', owner: 'customer' }),
  def('marketing_plan', 'operations', 'operational', 'talent', 'quarterly', 100,
    'Annual marketing plan execution', 'نسبة الالتزام بتنفيذ خطة التسويق السنوية',
    'الأنشطة التسويقية المنفذة ÷ المخططة', { owner: 'media' }),
  def('social_publishing', 'operations', 'procedural', 'talent', 'monthly', 100,
    'Events published per social plan', 'نسبة الالتزام بنشر الأخبار والفعاليات على قنوات التواصل',
    'الأخبار المنشورة ÷ الفعاليات المنفذة', { owner: 'media' }),
  def('campaigns_execution', 'operations', 'procedural', 'talent', 'monthly', 100,
    'Marketing campaigns executed per plan', 'نسبة الالتزام بتنفيذ الحملات التسويقية حسب الخطة',
    'الحملات المنفذة ÷ الحملات المخططة', { owner: 'media' }),
  def('press_news', 'operations', 'procedural', 'talent', 'monthly', 100,
    'Press releases per publishing plan', 'نسبة الالتزام بخطة نشر الأخبار الصحفية',
    'الأخبار الصحفية المنشورة ÷ المخطط لها', { owner: 'media' }),
  def('social_accounts', 'operations', 'operational', 'community', 'quarterly', 4,
    'Club social media accounts', 'عدد حسابات النادي على قنوات التواصل الاجتماعي',
    'عدد الحسابات النشطة', { ut: 'count', owner: 'media' }),
  def('web_visitors_growth', 'operations', 'operational', 'community', 'quarterly', 20,
    'Website visitor growth', 'معدل النمو في عدد زائري الموقع الإلكتروني',
    '(زوار الفترة الحالية − السابقة) ÷ زوار الفترة السابقة', { owner: 'media' }),
  def('followers_growth', 'operations', 'operational', 'community', 'quarterly', 20,
    'Social follower growth', 'معدل النمو في عدد متابعي حسابات النادي',
    '(متابعو الفترة الحالية − السابقة) ÷ متابعو الفترة السابقة', { owner: 'media' }),
  def('web_update_compliance', 'operations', 'operational', 'community', 'quarterly', 100,
    'Website & channels kept up to date', 'معدل الالتزام بتحديث الموقع وقنوات التواصل',
    'التحديثات المنفذة ÷ التحديثات المخططة', { owner: 'media' }),
  def('new_partnerships', 'operations', 'operational', 'community', 'quarterly', 6,
    'New partnerships contracted', 'عدد الشراكات الجديدة المتعاقد معها',
    'عدد الشراكات الجديدة', { ut: 'count', initiative: 'champions-destination', owner: 'media' }),
  def('events_plan', 'operations', 'operational', 'community', 'quarterly', 100,
    'Events plan compliance', 'نسبة الالتزام بخطة الفعاليات',
    'الفعاليات المنفذة ÷ المخططة', { owner: 'sports' }),
  def('community_initiatives_plan', 'excellence', 'strategic', 'community', 'quarterly', 100,
    'Commitment rate to the community-initiatives plan', 'نسبة الالتزام بخطة المبادرات المجتمعية',
    '(المبادرات المجتمعية المنفذة ÷ المخططة) × 100', { initiative: 'community-sport', baseYear: 2025, owner: 'sports' }),
  def('transport_injuries', 'operations', 'operational', 'community', 'quarterly', 0,
    'Injuries in player transport', 'معدل الإصابات في عمليات نقل اللاعبين',
    'عدد الإصابات المسجلة', { ut: 'count', dir: 'down', owner: 'supervisor' }),
  def('traffic_accidents', 'operations', 'operational', 'community', 'quarterly', 4,
    'Traffic accidents during the year', 'عدد الحوادث المرورية خلال العام',
    'عدد الحوادث المسجلة', { ut: 'count', dir: 'down', owner: 'supervisor' }),
  def('preventive_maintenance', 'operations', 'operational', 'community', 'quarterly', 85,
    'Preventive maintenance plan compliance', 'نسبة الالتزام بخطة الصيانة الوقائية',
    'الصيانات الوقائية المنجزة في موعدها ÷ جميع الصيانات الوقائية المستحقة', { source: 'live', calc: 'preventiveMaintenance', owner: 'logistics' }),
  def('sla_readiness', 'operations', 'operational', 'awards', 'quarterly', 90,
    'Operational readiness & SLA execution', 'كفاءة الجاهزية والتنفيذ التشغيلي (SLA)',
    'التذاكر المغلقة ضمن SLA ÷ إجمالي التذاكر المغلقة', { source: 'live', calc: 'slaReadiness', owner: 'head_ops' }),
  def('task_followup', 'operations', 'operational', 'awards', 'monthly', 95,
    'Tasks completed within their deadline', 'الالتزام بتنفيذ المهام ضمن البعد الزمني المحدد',
    'المهام المنجزة ضمن المهلة ÷ إجمالي المهام', { owner: 'sports' }),
  def('asset_registry', 'operations', 'operational', 'awards', 'quarterly', 100,
    'Assets registered in the unified system', 'تسجيل وتحديث كافة الأصول ضمن النظام الموحد',
    'الأصول مكتملة البيانات ÷ إجمالي الأصول', { source: 'live', calc: 'assetRegistry', owner: 'warehouse' }),
  def('asset_audit', 'operations', 'operational', 'awards', 'semiannual', 100,
    'Semi-annual asset & inventory audit', 'الالتزام بالجرد نصف السنوي للأصول والمخزون',
    'الأصول المدققة في النصف الحالي ÷ إجمالي الأصول', { source: 'live', calc: 'assetAudit', owner: 'warehouse' }),
  def('maintenance_followup', 'operations', 'operational', 'awards', 'quarterly', 100,
    'Asset maintenance plan follow-up', 'متابعة تنفيذ خطة صيانة الأصول ورفع التقارير',
    'الصيانات الوقائية المجدولة والمنجزة ÷ جميع الصيانات الوقائية المستحقة', { source: 'live', calc: 'maintenanceFollowup', owner: 'logistics' }),
  def('driver_safety', 'operations', 'operational', 'community', 'monthly', 100,
    'Driver public-safety compliance', 'نسبة الالتزام بالسلامة العامة للسائقين',
    '(الرحلات − رحلات بمخالفات) ÷ إجمالي الرحلات', { owner: 'drivers' }),
  def('worker_tasks', 'operations', 'procedural', 'awards', 'monthly', 95,
    'Workers’ daily task completion', 'نسبة التزام العمال بتنفيذ المهام اليومية',
    'المهام المنفذة يومياً ÷ المهام الموكلة', { owner: 'workers' }),
  def('supervisor_oversight', 'operations', 'procedural', 'awards', 'monthly', 95,
    'Worker-supervision effectiveness', 'نسبة متابعة مشرف العمال لتنفيذ المهام',
    'مهام متابَعة ومكتملة ÷ إجمالي المهام', { owner: 'supervisor' }),
  def('dept_initiatives', 'operations', 'operational', 'awards', 'quarterly', 90,
    'Departmental initiatives executed on schedule', 'متابعة تنفيذ مشاريع ومبادرات القسم المعتمدة',
    'مبادرات ملتزمة بالجدول ÷ المبادرات المعتمدة', { owner: 'sports' }),
  def('ops_plan', 'operations', 'operational', 'awards', 'quarterly', 95,
    'Operational plan compliance', 'نسبة الالتزام بالخطة التشغيلية',
    'المهام المنفذة ÷ المهام المخططة', { owner: 'head_ops' }),
  def('smart_monitoring', 'operations', 'operational', 'tech', 'quarterly', 100,
    'Smart fleet-monitoring adoption', 'نسبة استخدام نظام المراقبة الذكي في إدارة الأسطول',
    'مركبات مُبلِّغة عبر النظام ÷ إجمالي الأسطول', { source: 'live', calc: 'smartMonitoring', initiative: 'fuel-optimization', owner: 'sports' }),
  def('fuel_efficiency', 'operations', 'operational', 'awards', 'quarterly', 5,
    'Fuel efficiency improvement', 'نسبة تحسن كفاءة استهلاك الوقود',
    '(كم/لتر الحالي − السابق) ÷ السابق', { source: 'live', calc: 'fuelEfficiency', initiative: 'fuel-optimization', owner: 'logistics' }),
  def('route_compliance', 'operations', 'operational', 'tech', 'annual', 100,
    'Route compliance of bus trips', 'نسبة الالتزام بمسارات التشغيل المحددة',
    'الحافلات العاملة على مساراتها ÷ إجمالي الأسطول (14 مساراً — مسار لكل حافلة)',
    { source: 'live', calc: 'routeCompliance', initiative: 'fuel-optimization', owner: 'logistics' }),
  def('attendance_growth', 'technical', 'operational', 'community', 'quarterly', 10,
    'Training attendance growth (QoQ)', 'نمو حضور اللاعبين في الجلسات التدريبية',
    '(حضور الربع الحالي − السابق) ÷ حضور الربع السابق', { source: 'live', calc: 'attendanceGrowth', initiative: 'community-sport' }),
  def('participation_continuity', 'operations', 'strategic', 'community', 'annual', 60,
    'Community participation continuity', 'نسبة الاستمرارية في المشاركة',
    'مشاركون في أكثر من فعالية ÷ إجمالي المشاركين', { initiative: 'community-sport', owner: 'sports' }),
  def('participant_satisfaction', 'operations', 'strategic', 'community', 'quarterly', 90,
    'Participant happiness rate in community initiatives', 'نسبة سعادة المشاركين في المبادرات المجتمعية',
    'متوسط نتائج استبيانات المشاركين الذين عبّروا عن رضاهم', { initiative: 'community-sport', featured: 7, baseYear: 2025, owner: 'customer' }),
  def('category_coverage', 'operations', 'operational', 'community', 'annual', 100,
    'Community categories covered', 'نسبة تغطية الفئات المجتمعية المستهدفة',
    'الفئات المستهدفة فعلياً ÷ إجمالي الفئات المخططة', { initiative: 'community-sport', owner: 'sports' }),
  def('participant_growth', 'operations', 'strategic', 'community', 'quarterly', 10,
    'Growth in community participation in sports activities', 'نسبة نمو المشاركة المجتمعية في الأنشطة الرياضية',
    '((المشاركون الحاليون − مشاركو سنة الأساس) ÷ مشاركو سنة الأساس) × 100', { initiative: 'community-sport', featured: 6, baseYear: 2025, owner: 'sports' }),
  def('fmac_run_races', 'operations', 'operational', 'community', 'annual', 100,
    'FMAC Run races executed per plan', 'نسبة تنفيذ سباقات FMAC Run',
    'السباقات المنفذة ÷ المخطط لها', { initiative: 'community-sport', owner: 'sports' }),
  def('run_avg_participants', 'operations', 'operational', 'community', 'annual', 500,
    'Average participants per race', 'متوسط عدد المشاركين في كل سباق',
    'إجمالي المشاركين ÷ عدد السباقات', { ut: 'count', initiative: 'community-sport', owner: 'sports' }),
  def('challenges_execution', 'operations', 'operational', 'community', 'annual', 100,
    'Physical-activity challenges executed', 'نسبة تنفيذ تحديات النشاط البدني',
    'التحديات المنفذة ÷ المخطط لها', { initiative: 'community-sport', owner: 'sports' }),
  def('challenge_completion', 'operations', 'operational', 'community', 'annual', 80,
    'Participants completing challenges', 'نسبة إكمال المشاركين للتحديات',
    'من أكملوا التحدي ÷ المسجلون', { initiative: 'community-sport', owner: 'sports' }),
  def('hotel_roi', 'operations', 'operational', 'championships', 'annual', 10,
    'Government hotel return from championships', 'نسبة العائد على الحكومة من الفنادق',
    'قيمة حجوزات الفنادق المرتبطة بالبطولات × 10%', { initiative: 'champions-destination', owner: 'sports' }),
  def('team_satisfaction', 'operations', 'strategic', 'championships', 'quarterly', 90,
    'Participating teams’ satisfaction rate', 'نسبة رضا الفرق المشاركة',
    'مجموع التقييمات ÷ عدد المشاركين', { initiative: 'champions-destination', featured: 4, baseYear: 2025, owner: 'customer' }),
  def('followers_growth_champs', 'operations', 'operational', 'championships', 'annual', 20,
    'Follower growth during championships', 'نسبة نمو متابعي النادي خلال البطولات',
    '(المتابعون بعد البطولة − قبلها) ÷ المتابعون قبلها', { initiative: 'champions-destination', owner: 'media' }),
  def('intl_marketing', 'operations', 'operational', 'championships', 'quarterly', 100,
    'International marketing plan execution', 'نسبة تنفيذ خطة التسويق الرياضي الدولي',
    'الحملات المنفذة ÷ المخطط لها', { initiative: 'champions-destination', owner: 'media' }),

  /* ═══════════ SUPPORT SERVICES — قسم الخدمات المساندة ═══════════ */
  def('workforce_budget', 'support', 'excellence', 'awards', 'semiannual', 100,
    'Workforce budget compliance', 'الالتزام بميزانية القوى العاملة',
    'الوظائف الحتمية ÷ الوظائف المعتمدة في الموازنة'),
  def('turnover', 'support', 'excellence', 'awards', 'semiannual', 5,
    'Employee turnover', 'الدوران الوظيفي',
    'الموظفون المنتهية خدماتهم ÷ معدل عدد الموظفين', { dir: 'down' }),
  def('emiratization', 'support', 'excellence', 'awards', 'semiannual', 90,
    'Emiratization rate', 'نسبة التوطين',
    'الموظفون المواطنون ÷ الوظائف القابلة للتوطين'),
  def('trained_employees', 'support', 'excellence', 'awards', 'semiannual', 95,
    'Employees trained (of total)', 'نسبة الموظفين المتدربين من إجمالي الموظفين',
    'الموظفون المتدربون (دون تكرار) ÷ إجمالي الموظفين'),
  def('absence_rate', 'support', 'excellence', 'awards', 'semiannual', 5,
    'Average absence days rate', 'معدل أيام الغياب',
    'مجموع أيام الغياب ÷ معدل عدد الموظفين', { dir: 'down' }),
  def('hiring_plan', 'support', 'excellence', 'awards', 'semiannual', 100,
    'Hiring plan compliance', 'نسبة الالتزام بخطة تعيين الموظفين',
    'المعينون في الفترة ÷ المخطط تعيينهم'),
  def('training_hours_per_employee', 'support', 'excellence', 'awards', 'semiannual', 20,
    'Training hours per employee', 'معدل ساعات التدريب لكل موظف',
    'الساعات التدريبية الفعلية ÷ الموظفون المستهدفون', { ut: 'hours' }),
  def('training_plan', 'support', 'excellence', 'awards', 'semiannual', 100,
    'Training plan compliance', 'نسبة الالتزام بخطة تدريب الموظفين',
    'الدورات المنفذة ÷ الدورات المعتمدة'),
  def('eservices_readiness', 'support', 'excellence', 'awards', 'semiannual', 100,
    'Services available electronically', 'نسبة جاهزية الخدمات إلكترونياً',
    'الخدمات الجاهزة إلكترونياً ÷ إجمالي الخدمات', { initiative: 'digital-transformation' }),

  /* ═══════════ FINANCE — قسم المالية ═══════════ */
  def('annual_budget_prep', 'finance', 'operational', 'awards', 'quarterly', null,
    'Budget change requests during the year', 'طلبات التغيير والمناقلات على الموازنة',
    'عدد طلبات التغيير والمناقلات', { ut: 'count', dir: 'down' }),
  def('budget_projects', 'finance', 'operational', 'awards', 'quarterly', 100,
    'Budgeted projects delivered on time', 'إنجاز المشروعات المدرجة في الموازنة',
    'المشروعات المنجزة في مواعيدها ÷ المدرجة'),
  def('budget_monitoring', 'finance', 'operational', 'awards', 'quarterly', null,
    'Budget performance monitoring', 'مراقبة أداء الموازنات التقديرية',
    'مقارنة المصاريف الفعلية مع البنود التقديرية'),
  def('petty_cash_setup', 'finance', 'operational', 'awards', 'quarterly', 100,
    'Petty cash requests processed within 7 days', 'إنشاء المصروفات النثرية خلال 7 أيام عمل',
    'الطلبات المعالجة خلال 7 أيام ÷ إجمالي الطلبات'),
  def('cash_availability', 'finance', 'operational', 'awards', 'quarterly', 100,
    'Cash availability maintained', 'الحفاظ على توافر النقد',
    'تجديدات النثرية خلال يوم واحد ÷ إجمالي الحالات'),
  def('supplier_invoices', 'finance', 'operational', 'awards', 'quarterly', 3,
    'Supplier invoice posting time', 'ترحيل فواتير الموردين',
    'متوسط الأيام من استلام الفاتورة حتى توريدها', { ut: 'days', dir: 'down' }),
  def('advance_payments', 'finance', 'operational', 'awards', 'quarterly', 5,
    'Advance payment processing time', 'معالجة الدفعات المقدمة للموردين',
    'الأيام من استلام الطلب حتى المعالجة', { ut: 'days', dir: 'down' }),
  def('timely_deposits', 'finance', 'operational', 'awards', 'quarterly', 95,
    'Cash & cheques deposited within one day', 'إيداع النقد والشيكات في الوقت المناسب',
    'قيمة المودع خلال يوم عمل ÷ إجمالي القيمة'),
  def('accrual_entries', 'finance', 'operational', 'awards', 'quarterly', 100,
    'Accrual entries posted on schedule', 'معالجة إدخالات الاستحقاق في الوقت المناسب',
    'الإدخالات المرحلة وفق الجدول ÷ 12'),
  def('vat_returns', 'finance', 'operational', 'awards', 'quarterly', 100,
    'VAT returns filed & paid on time', 'تقديم إقرارات ضريبة القيمة المضافة في وقتها',
    'الإقرارات المقدمة وفق الجدول ÷ المطلوبة'),
  def('revenue_planning_accuracy', 'finance', 'excellence', 'awards', 'quarterly', null,
    'Financial planning accuracy — own revenues', 'دقة التخطيط المالي للإيرادات الذاتية',
    'الإيرادات الفعلية مقابل المخططة'),
  def('expense_planning_accuracy', 'finance', 'excellence', 'awards', 'quarterly', null,
    'Financial planning accuracy — expenses', 'دقة التخطيط المالي للمصروفات',
    'المصروفات الفعلية مقابل المخططة'),
  def('budget_accuracy', 'finance', 'excellence', 'awards', 'quarterly', null,
    'Budget preparation accuracy', 'دقة إعداد الموازنات',
    'انحراف الموازنة الفعلي عن التقديري'),
  def('expense_reduction', 'finance', 'excellence', 'awards', 'quarterly', null,
    'Savings from expense rationalization', 'نتائج الخفض الناتجة عن برامج ترشيد النفقات',
    'قيمة الخفض المحققة'),
  def('core_cost_reduction', 'finance', 'excellence', 'awards', 'quarterly', null,
    'Core services cost reduction', 'نتائج الخفض عن تكاليف الخدمات والعمليات الرئيسية',
    'قيمة الخفض المحققة'),
  def('support_cost_reduction', 'finance', 'excellence', 'awards', 'quarterly', null,
    'Support services cost reduction', 'نتائج الخفض عن تكاليف الخدمات والعمليات المساندة',
    'قيمة الخفض المحققة'),

  /* ═══════ STRATEGY & EXCELLENCE OFFICE — مكتب التخطيط والتميز ═══════ */
  def('happiness_players', 'excellence', 'excellence', 'awards', 'semiannual', 85,
    'Player happiness', 'نسبة سعادة اللاعبين', 'استبيان السعادة المعتمد'),
  def('happiness_employees', 'excellence', 'excellence', 'awards', 'semiannual', 85,
    'Employee happiness', 'نسبة سعادة الموظفين', 'استبيان السعادة المعتمد'),
  def('happiness_partners', 'excellence', 'excellence', 'awards', 'semiannual', 85,
    'Partner happiness', 'نسبة سعادة الشركاء', 'استبيان السعادة المعتمد'),
  def('happiness_parents', 'excellence', 'excellence', 'awards', 'semiannual', 85,
    'Parent happiness', 'نسبة سعادة أولياء الأمور', 'استبيان السعادة المعتمد'),
  def('happiness_customers', 'operations', 'strategic', 'awards', 'quarterly', 90,
    'Customer happiness rate', 'نسبة سعادة المتعاملين',
    '(المشاركون الراضون بتقييم أعلى من 90% ÷ إجمالي المستبينين) × 100', { featured: 8, baseYear: 2025, owner: 'customer' }),
  def('happiness_initiatives', 'excellence', 'excellence', 'awards', 'semiannual', 90,
    'Customer-happiness initiatives success', 'نسبة نجاح مبادرات تعزيز سعادة المتعاملين',
    'مبادرات حققت أهدافها ÷ المبادرات المنفذة'),
  def('new_mous', 'excellence', 'operational', 'awards', 'semiannual', null,
    'New memoranda of understanding', 'عدد مذكرات التفاهم الجديدة للنادي',
    'عدد المذكرات الموقعة', { ut: 'count' }),
  def('risk_plan', 'excellence', 'excellence', 'awards', 'quarterly', 100,
    'Risk plan compliance', 'الالتزام بخطة المخاطر',
    'تقييم الإدارة طبقاً لمعايير إدارة المخاطر'),
  def('projects_execution', 'excellence', 'excellence', 'awards', 'quarterly', 100,
    'Executive-plan projects delivery', 'تنفيذ مشاريع الخطة التنفيذية',
    'النتائج الفعلية لمقاييس المشاريع ÷ المستهدفة'),
  def('meta_achieved', 'excellence', 'strategic', 'awards', 'semiannual', 100,
    'Strategic indicators achieved', 'نسبة المؤشرات الاستراتيجية المحققة',
    'المؤشرات المحققة ÷ إجمالي المؤشرات المُقاسة', { source: 'meta' }),
  def('benchmarks', 'excellence', 'excellence', 'awards', 'quarterly', 100,
    'Benchmarking studies executed', 'نسبة الالتزام بالمقارنات المعيارية',
    'المقارنات المنفذة ÷ المخطط تنفيذها'),
  def('initiatives_achievement', 'excellence', 'strategic', 'awards', 'quarterly', 100,
    'Operational projects & initiatives delivery', 'نسبة الإنجاز في المشاريع والمبادرات التشغيلية',
    'المشاريع المنجزة ÷ المشاريع المخططة'),
  def('report_discipline', 'excellence', 'operational', 'awards', 'monthly', 100,
    'Departmental report sections approved', 'اعتماد أقسام التقرير الشهري (سجلات المؤشرات)',
    'الأقسام المعتمدة ÷ إجمالي أقسام الشهر', { source: 'live', calc: 'reportDiscipline' }),
  def('kpi_measurement', 'excellence', 'operational', 'awards', 'monthly', 100,
    'Operational KPI measurement cadence', 'الالتزام بمتابعة قياس المؤشرات التشغيلية',
    'أشهر لها تقرير ÷ الأشهر المنقضية', { source: 'live', calc: 'kpiMeasurement' }),
  def('digital_adoption', 'excellence', 'strategic', 'tech', 'quarterly', 100,
    'Process automation — active digital workflows', 'نسبة تنفيذ خطة أتمتة العمليات',
    'عمليات رقمية نشطة خلال 30 يوماً ÷ العمليات المؤتمتة',
    { source: 'live', calc: 'digitalAdoption', initiative: 'digital-transformation' }),
  def('systems_integration', 'excellence', 'excellence', 'tech', 'semiannual', 100,
    'Digital systems integration', 'نسبة تكامل الأنظمة الرقمية',
    'الأنظمة المتكاملة إلكترونياً ÷ المستهدفة', { initiative: 'digital-transformation' }),
]

/* ── Period helpers ─────────────────────────────────────────────── */

export function periodKey(freq, d = new Date()) {
  const y = d.getFullYear()
  const m = d.getMonth() // 0-based
  switch (freq) {
    case 'monthly':    return `${y}-M${String(m + 1).padStart(2, '0')}`
    case 'quarterly':  return `${y}-Q${Math.floor(m / 3) + 1}`
    case 'semiannual': return `${y}-H${m < 6 ? 1 : 2}`
    default:           return `${y}`
  }
}

export function periodRange(freq, d = new Date()) {
  const y = d.getFullYear()
  const m = d.getMonth()
  switch (freq) {
    case 'monthly':    return [new Date(y, m, 1), new Date(y, m + 1, 0, 23, 59, 59)]
    case 'quarterly': {
      const q = Math.floor(m / 3) * 3
      return [new Date(y, q, 1), new Date(y, q + 3, 0, 23, 59, 59)]
    }
    case 'semiannual': {
      const h = m < 6 ? 0 : 6
      return [new Date(y, h, 1), new Date(y, h + 6, 0, 23, 59, 59)]
    }
    default:           return [new Date(y, 0, 1), new Date(y, 11, 31, 23, 59, 59)]
  }
}

/* Previous period of the same length (for trends). */
export function prevPeriodRange(freq, d = new Date()) {
  const [start] = periodRange(freq, d)
  const before = new Date(start.getTime() - 86400000)
  return periodRange(freq, before)
}

export function prevPeriodKey(freq, d = new Date()) {
  const [start] = periodRange(freq, d)
  return periodKey(freq, new Date(start.getTime() - 86400000))
}

export const FREQ_LABEL = {
  monthly:    { en: 'Monthly',     ar: 'شهري' },
  quarterly:  { en: 'Quarterly',   ar: 'ربع سنوي' },
  semiannual: { en: 'Semi-annual', ar: 'نصف سنوي' },
  annual:     { en: 'Annual',      ar: 'سنوي' },
}

/**
 * Direction-aware attainment (% of target reached). NEVER negative.
 *  up:   value/target, capped at 120
 *  down: 100 when at/under target; degrades toward 0 as the value overshoots
 * Returns null when unmeasurable (no value or no target).
 */
export function attainment(kpi, value, target = kpi.target) {
  if (value == null || Number.isNaN(value)) return null
  if (target == null) return null
  const v = Math.max(0, value)
  if (kpi.dir === 'down') {
    if (target === 0) return v === 0 ? 100 : 0
    if (v === 0) return 200
    return Math.max(0, Math.min(200, (target / v) * 100))
  }
  if (!target) return null
  return Math.max(0, Math.min(200, (v / target) * 100))
}

export function statusOf(att) {
  if (att == null) return 'nodata'
  if (att >= 110) return 'above'
  if (att >= 95) return 'ontrack'
  if (att >= 70) return 'atrisk'
  return 'offtrack'
}
