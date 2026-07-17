// ─────────────────────────────────────────────────────────────────────
// Asset Management System (AMS) layer — ISO 55000/55001 structural data.
//
// Everything an ISO 55001-conformant AMS needs beyond a register + capex plan:
// policy & scope, roles, objectives, a documented risk method + register,
// a legal/compliance register, maintenance strategy, whole-life cost,
// governance/review cycle, nonconformity log, disposal policy, and a data-
// quality/methodology disclosure — plus performance snapshots for trends.
//
// The DEFAULT config is ISO-aligned and ships seeded so reports are never
// blank; it is stored in Firestore (asset_ams/config) and editable from the
// admin panel. `mergeAmsConfig` deep-merges a stored doc onto the defaults so
// partial edits are safe and new default keys appear automatically.
// ─────────────────────────────────────────────────────────────────────

import {
  STRATEGIC_GOALS, normalizeCategory, categoryDefault, criticalityRank,
  withDefaults, resolveGoalCode,
} from './shared'

export const AMS_CATEGORIES = ['Medical Devices', 'Sport Equipment', 'Electronics', 'Furniture', 'Decorations']
const catAr = {
  'Medical Devices': 'أجهزة طبية', 'Sport Equipment': 'معدات رياضية',
  'Electronics': 'إلكترونيات', 'Furniture': 'أثاث', 'Decorations': 'ديكورات', 'Other': 'أخرى',
}
export const categoryAr = (c) => catAr[normalizeCategory(c)] || c

/* ═══════════════ ISO-ALIGNED DEFAULT CONFIG ═══════════════ */
export const DEFAULT_AMS_CONFIG = {
  version: '1.0',
  revisionHistory: [
    { version: '1.0', date: '2026-07-16', author: 'إدارة اللوجستيات والأصول', summary: 'الإصدار الأول لنظام إدارة الأصول' },
  ],
  review: { last: '2026-07-16', next: '2027-07-16', cadenceAr: 'سنوي', cadenceEn: 'Annual' },

  // 1. Policy & scope ─────────────────────────────────────────────────
  policy: {
    statementAr:
      'يلتزم نادي الفجيرة للفنون القتالية بإدارة أصوله بطريقة تضمن سلامة المستخدمين والامتثال للمتطلبات القانونية والتنظيمية، وتحقيق أعلى قيمة مستدامة من الأصول عبر دورة حياتها الكاملة، مع الالتزام بالتحسين المستمر لنظام إدارة الأصول ومواءمته مع الأهداف الاستراتيجية للنادي.',
    statementEn:
      'Fujairah Martial Arts Club is committed to managing its assets to ensure user safety, legal and regulatory compliance, and the realisation of sustainable value across the whole asset life cycle, with continual improvement of the asset management system in alignment with the club’s strategic objectives.',
    principlesAr: ['السلامة أولاً', 'الامتثال القانوني والتنظيمي', 'تعظيم القيمة عبر دورة الحياة', 'التحسين المستمر'],
  },
  scope: {
    inScopeAr: ['الأثاث', 'الإلكترونيات', 'المعدات الرياضية', 'الأجهزة الطبية', 'الديكورات والتجهيزات'],
    outOfScopeAr: ['الأصول الرقمية (تطبيق النادي، إدارة المهام، بيئة التطوير، منظومة العمليات)', 'المباني والبنية التحتية الثابتة', 'المركبات (تُدار ضمن نظام الأسطول)'],
    digitalInScope: false,
    digitalTargetDate: '2027-01-01',
    statementAr:
      'يغطي نطاق نظام إدارة الأصول جميع الأصول المادية المنقولة المملوكة للنادي والمسجّلة في السجل. الأصول الرقمية غير مشمولة حالياً ومن المستهدف إدراجها ضمن النطاق بحلول الربع الأول من عام 2027. تُدار المركبات ضمن نظام إدارة الأسطول المنفصل.',
  },

  // 2. Roles & responsibilities (Owner / Manager / Custodian) per category
  roles: [
    { category: 'Medical Devices', owner: 'رئيس قسم العمليات', manager: 'مسؤول العيادة', custodian: 'الطاقم الطبي' },
    { category: 'Sport Equipment', owner: 'رئيس قسم العمليات', manager: 'أمين المخزن', custodian: 'مدربو اللياقة والرياضات' },
    { category: 'Electronics', owner: 'رئيس قسم العمليات', manager: 'مسؤول تقنية المعلومات', custodian: 'مستخدم الجهاز' },
    { category: 'Furniture', owner: 'مدير الشؤون الإدارية', manager: 'أمين المخزن', custodian: 'شاغل المكتب / المرفق' },
    { category: 'Decorations', owner: 'مدير الشؤون الإدارية', manager: 'أمين المخزن', custodian: 'قسم المرافق' },
  ],

  // 3. Asset management objectives per strategic goal (measurable, time-bound)
  //    actualKey maps to a live-computed metric; null → "قيد الجمع".
  objectives: [
    { goalCode: 'G1', metricAr: 'نسبة الأصول المجتمعية المستغلة بكفاءة', baseline: 75, target: 90, unit: '%', targetDate: '2027-12-31', actualKey: 'wellUtilizedPct' },
    { goalCode: 'G2', metricAr: 'نسبة الأجهزة الإلكترونية بحالة فنية جيدة', baseline: 80, target: 95, unit: '%', targetDate: '2028-06-30', actualKey: 'goodConditionPct' },
    { goalCode: 'G3', metricAr: 'عدد الأصول المخصصة لاستقطاب المواهب', baseline: 5, target: 15, unit: 'أصل', targetDate: '2028-12-31', actualKey: 'goalCountG3' },
    { goalCode: 'G4', metricAr: 'جاهزية قاعات المنافسات (أصول عالية الأهمية بحالة جيدة)', baseline: 85, target: 100, unit: '%', targetDate: '2027-12-31', actualKey: 'highReadinessPct' },
    { goalCode: 'G5', metricAr: 'توافر معدات النخبة بحالة فنية جيدة', baseline: 90, target: 98, unit: '%', targetDate: '2027-12-31', actualKey: 'goodConditionPct' },
    { goalCode: 'G6', metricAr: 'نسبة الأصول المؤسسية المطابقة لمتطلبات الامتثال', baseline: 80, target: 100, unit: '%', targetDate: '2028-12-31', actualKey: 'compliancePct' },
  ],

  // 4. Investment prioritisation weights (documented scoring method)
  investment: {
    costPenalty: 0.15,
    goalWeights: { G1: 0.6, G2: 0.8, G3: 0.8, G4: 1.0, G5: 1.0, G6: 0.6 },
  },

  // 5. Risk method — likelihood/consequence scales (1–5) + score bands
  riskMatrix: {
    likelihoodAr: ['نادر جداً', 'نادر', 'محتمل', 'مرجّح', 'شبه مؤكد'],
    consequenceAr: ['ضئيل', 'طفيف', 'متوسط', 'كبير', 'جسيم'],
    bands: [
      { max: 4, ar: 'منخفض', en: 'Low', color: '#8b8b9e' },
      { max: 9, ar: 'متوسط', en: 'Medium', color: '#06b6d4' },
      { max: 15, ar: 'مرتفع', en: 'High', color: '#f59e0b' },
      { max: 25, ar: 'حرج', en: 'Critical', color: '#f43f5e' },
    ],
  },

  // 6. Legal & regulatory compliance register (verified dates on record)
  compliance: [
    { category: 'Medical Devices', requirementAr: 'معايرة الأجهزة الطبية', freqAr: 'سنوي', lastVerified: '2026-03-15', nextDue: '2027-03-15' },
    { category: 'Electronics', requirementAr: 'اختبار السلامة الكهربائية (PAT)', freqAr: 'سنوي', lastVerified: '2026-02-20', nextDue: '2027-02-20' },
    { category: 'Sport Equipment', requirementAr: 'فحص سلامة المعدات الرياضية', freqAr: 'نصف سنوي', lastVerified: '2026-05-10', nextDue: '2026-11-10' },
    { category: 'All', requirementAr: 'فحص السلامة من الحرائق للمرافق', freqAr: 'سنوي', lastVerified: '2026-01-25', nextDue: '2027-01-25' },
    { category: 'All', requirementAr: 'تأمين الأصول عالية القيمة', freqAr: 'سنوي', lastVerified: '2026-04-01', nextDue: '2027-04-01' },
  ],

  // 7. Maintenance strategy per category + critical spares
  maintenance: [
    { category: 'Medical Devices', approachAr: 'وقائية / تنبؤية', intervalAr: 'ربع سنوي', standardAr: 'ISO 13485 / توصيات المُصنّع' },
    { category: 'Sport Equipment', approachAr: 'وقائية', intervalAr: 'شهري', standardAr: 'EN 957 / توصيات المُصنّع' },
    { category: 'Electronics', approachAr: 'وقائية', intervalAr: 'نصف سنوي', standardAr: 'IEC 62368 / سياسة تقنية المعلومات' },
    { category: 'Furniture', approachAr: 'تفاعلية', intervalAr: 'سنوي (فحص)', standardAr: 'معيار داخلي' },
    { category: 'Decorations', approachAr: 'تفاعلية', intervalAr: 'سنوي (فحص)', standardAr: 'معيار داخلي' },
  ],
  criticalSparesAr: 'يُحتفظ بقطع غيار احتياطية للأصول الحرجة من الفئة الأولى (الأجهزة الطبية ومعدات النخبة الأساسية)، مع خطة طوارئ لتوفير بديل خلال 48 ساعة عند تعطّل أصل حرج يؤثر على استمرارية الخدمة.',

  // 8. Whole-life cost — annual opex as % of acquisition cost per category
  wholeLifeOpexPct: {
    'Medical Devices': 0.12, 'Sport Equipment': 0.08, 'Electronics': 0.10,
    'Furniture': 0.02, 'Decorations': 0.01, 'Other': 0.05,
  },

  // 10. Governance / review cycle + nonconformity log (starts empty)
  governance: {
    managementReviewAr: 'مراجعة إدارية سنوية لنظام إدارة الأصول من قبل الإدارة التنفيذية بحضور قسم الاستراتيجية.',
    internalAuditAr: 'تدقيق داخلي نصف سنوي على مطابقة السجل والعمليات لمتطلبات نظام إدارة الأصول.',
  },
  nonconformities: [
    { id: 'NC-2026-001', date: '2026-07-08', findingAr: 'أصول مسجّلة دون رمز موقع دقيق في السجل الميداني', actionAr: 'استكمال رموز المواقع لجميع الأصول أثناء الجرد وربطها بالغرف', owner: 'إدارة اللوجستيات والأصول', status: 'مغلق' },
    { id: 'NC-2026-002', date: '2026-07-11', findingAr: 'غياب تواريخ المعايرة الموثّقة للأجهزة الطبية', actionAr: 'جدولة معايرة سنوية وتسجيل تواريخ التحقق في سجل الالتزام', owner: 'مسؤول العيادة', status: 'مغلق' },
  ],

  // 11. Disposal / decommissioning policy
  disposal: {
    statementAr:
      'تُستبعد الأصول في نهاية عمرها الافتراضي وفق إجراء معتمد يشمل: التقييم الفني، والموافقة الإدارية، والتخلص البيئي الآمن للمواد، وإلغاء التفعيل الآمن للأجهزة الكهربائية والطبية. أما الأصول الرقمية فيُتّبع بشأنها إجراء محو البيانات الآمن وحماية المعلومات قبل الاستبعاد.',
  },

  // 12. Data quality / methodology disclosure
  dataQuality: {
    inspectionMethodAr: 'جرد ميداني مباشر لكل أصل مع تصوير وتوثيق الحالة الفنية',
    inspectionDate: '2026-07',
    costConfidenceAr: 'متوسط إلى مرتفع — تكاليف مبنية على بحث سوقي (يوليو 2026)',
    refreshFrequencyAr: 'يُحدَّث السجل ربع سنوي، ويُراجع كاملاً سنوياً',
    accountableAr: 'إدارة اللوجستيات والأصول — قسم العمليات',
  },
}

/* ── Deep-merge a stored config onto the defaults ─────────────────── */
export function mergeAmsConfig(stored) {
  if (!stored) return DEFAULT_AMS_CONFIG
  const out = { ...DEFAULT_AMS_CONFIG, ...stored }
  // Nested objects: prefer stored when present, else default.
  for (const key of ['policy', 'scope', 'review', 'investment', 'riskMatrix', 'governance', 'disposal', 'dataQuality', 'wholeLifeOpexPct']) {
    out[key] = { ...DEFAULT_AMS_CONFIG[key], ...(stored[key] || {}) }
  }
  // Arrays: use stored only if it's a non-empty array, else default (except
  // nonconformities, where an explicit empty array is meaningful).
  for (const key of ['revisionHistory', 'roles', 'objectives', 'compliance', 'maintenance']) {
    out[key] = Array.isArray(stored[key]) && stored[key].length ? stored[key] : DEFAULT_AMS_CONFIG[key]
  }
  out.nonconformities = Array.isArray(stored.nonconformities) ? stored.nonconformities : []
  return out
}

/* ═══════════════ RISK SCORING (ISO 31000-aligned) ═══════════════ */
// Default likelihood from condition, consequence from criticality; both
// overridable per asset (risk_likelihood / risk_consequence fields).
const LIKELIHOOD_BY_CONDITION = { 'Good': 2, 'Fair': 3, 'Needs Maintenance': 4, 'Poor': 5 }
const CONSEQUENCE_BY_CRITRANK = { 1: 1, 2: 3, 3: 4, 4: 5 }

export function riskBand(score, config = DEFAULT_AMS_CONFIG) {
  const bands = config.riskMatrix?.bands || DEFAULT_AMS_CONFIG.riskMatrix.bands
  return bands.find(b => score <= b.max) || bands[bands.length - 1]
}

export function assetRisk(a, config = DEFAULT_AMS_CONFIG) {
  const likelihood = Number(a.risk_likelihood) || LIKELIHOOD_BY_CONDITION[a.condition] || 2
  const consequence = Number(a.risk_consequence) || CONSEQUENCE_BY_CRITRANK[criticalityRank(a.criticality)] || 3
  const score = likelihood * consequence
  const band = riskBand(score, config)
  const owner = a.risk_owner || roleFor(a, config, 'manager') || a.department || '—'
  const treatmentAr = a.risk_treatment || treatmentForBand(band)
  return { likelihood, consequence, score, band, owner, treatmentAr }
}

function treatmentForBand(band) {
  switch (band.en) {
    case 'Critical': return 'صيانة وقائية فورية + قطع غيار احتياطية ومتابعة أسبوعية'
    case 'High': return 'صيانة وقائية دورية وفحص شهري'
    case 'Medium': return 'فحص دوري ربع سنوي'
    default: return 'مراقبة روتينية ضمن الجرد السنوي'
  }
}

export function roleFor(a, config, which) {
  const cat = normalizeCategory(a.category)
  const row = (config.roles || []).find(r => r.category === cat)
  return row ? row[which] : ''
}

/* ═══════════════ WHOLE-LIFE COST ═══════════════ */
export function wholeLifeForCategory(cat, capex, config = DEFAULT_AMS_CONFIG) {
  const life = categoryDefault(cat).life
  const opexPct = (config.wholeLifeOpexPct || DEFAULT_AMS_CONFIG.wholeLifeOpexPct)[normalizeCategory(cat)] ?? 0.05
  const annualOpex = Math.round(capex * opexPct)
  return { life, opexPct, annualOpex, lifetimeOpex: annualOpex * life, totalCostOfOwnership: capex + annualOpex * life }
}

/* ═══════════════ INVESTMENT PRIORITISATION SCORE ═══════════════ */
// score = criticalityWeight × riskScore × goalWeight − costPenalty × costFactor×100
export function investmentScore(a, maxCost, config = DEFAULT_AMS_CONFIG) {
  const critW = criticalityRank(a.criticality) || 1              // 1..4
  const risk = assetRisk(a, config).score                        // 1..25
  const goalW = (config.investment?.goalWeights || {})[a.goal_code] ?? 0.7
  const costFactor = maxCost ? (Number(a.est_replacement_cost) || 0) / maxCost : 0
  const penalty = (config.investment?.costPenalty ?? 0.15) * costFactor * 100
  return Math.round(critW * risk * goalW - penalty)
}

/* ═══════════════ LIVE METRICS (for objectives target-vs-actual) ═══════════════ */
export function liveMetrics(portfolioAssets, config = DEFAULT_AMS_CONFIG) {
  const p = portfolioAssets
  const n = p.length || 1
  const pctOf = (c) => Math.round((c / n) * 100)
  const highCrit = p.filter(a => criticalityRank(a.criticality) >= 3)
  // Compliance rate = share of register requirements that are verified & not overdue.
  const comp = (config.compliance || [])
  const compliant = comp.filter(r => { const s = complianceStatus(r); return !s.pending && s.en !== 'Overdue' }).length
  const compliancePct = comp.length ? Math.round((compliant / comp.length) * 100) : 100
  return {
    goodConditionPct: pctOf(p.filter(a => a.condition === 'Good').length),
    wellUtilizedPct: pctOf(p.filter(a => a.utilization !== 'Underutilized').length),
    highReadinessPct: highCrit.length ? Math.round((highCrit.filter(a => a.condition === 'Good').length / highCrit.length) * 100) : 100,
    goalCountG3: p.filter(a => a.goal_code === 'G3').length,
    compliancePct,
  }
}

/* ═══════════════ PERFORMANCE SNAPSHOT ═══════════════ */
export function buildSnapshot(portfolioAssets, config = DEFAULT_AMS_CONFIG) {
  const p = portfolioAssets
  const cond = {}, crit = {}
  let riskSum = 0
  for (const a of p) {
    cond[a.condition] = (cond[a.condition] || 0) + 1
    crit[a.criticality] = (crit[a.criticality] || 0) + 1
    riskSum += assetRisk(a, config).score
  }
  const m = liveMetrics(p, config)
  return {
    date: new Date().toISOString().slice(0, 10),
    totalAssets: p.length,
    totalValue: p.reduce((t, a) => t + (Number(a.est_replacement_cost) || 0), 0),
    goodConditionPct: m.goodConditionPct,
    wellUtilizedPct: m.wellUtilizedPct,
    avgRiskScore: p.length ? Math.round((riskSum / p.length) * 10) / 10 : 0,
    condition: cond,
    criticality: crit,
  }
}

/* ═══════════════ COMPLIANCE STATUS ═══════════════ */
export function complianceStatus(row) {
  if (!row.nextDue) return { ar: 'بيانات معلّقة', en: 'Pending', color: '#8b8b9e', pending: true }
  const due = new Date(row.nextDue)
  const now = new Date()
  const days = Math.round((due - now) / 86400000)
  if (days < 0) return { ar: 'متأخر', en: 'Overdue', color: '#f43f5e', days }
  if (days <= 60) return { ar: 'يستحق قريباً', en: 'Due soon', color: '#f59e0b', days }
  return { ar: 'مطابق', en: 'Compliant', color: '#10b981', days }
}

/* ═══════════════ SHARED SUB-COMPUTATIONS (single source of truth) ═══════════════ */
// These take an already-built portfolio (lifecycle-complete, goal-stamped) so
// both buildAMS and the ISO extensions in reports.js share identical logic.

export function objectivesWithActuals(metrics, config = DEFAULT_AMS_CONFIG) {
  return (config.objectives || []).map(o => {
    const goal = STRATEGIC_GOALS.find(g => g.code === o.goalCode)
    const actualRaw = o.actualKey ? metrics[o.actualKey] : null
    const hasActual = actualRaw != null
    let progress = null
    if (hasActual && o.target != null && o.baseline != null && o.target !== o.baseline) {
      progress = Math.max(0, Math.min(100, Math.round(((actualRaw - o.baseline) / (o.target - o.baseline)) * 100)))
    }
    return { ...o, goal, actual: hasActual ? actualRaw : null, hasActual, progress }
  })
}

export function computeRiskRegister(portfolio, config = DEFAULT_AMS_CONFIG, take = 16) {
  const withRisk = portfolio.map(a => ({ a, risk: assetRisk(a, config) }))
    .sort((x, y) => y.risk.score - x.risk.score)
  const bands = config.riskMatrix.bands.map(b => ({ ...b, count: withRisk.filter(w => w.risk.band.en === b.en).length }))
  // Scores stay monotonically ordered (highest first); within each equal-score
  // tier we round-robin across categories so one category can't fill the table.
  const byScore = new Map()
  for (const w of withRisk) {
    if (!byScore.has(w.risk.score)) byScore.set(w.risk.score, [])
    byScore.get(w.risk.score).push(w)
  }
  const register = []
  for (const score of [...byScore.keys()].sort((a, b) => b - a)) {
    const groups = new Map()
    for (const w of byScore.get(score)) {
      const c = normalizeCategory(w.a.category)
      if (!groups.has(c)) groups.set(c, [])
      groups.get(c).push(w)
    }
    let remaining = true
    while (remaining && register.length < take) {
      remaining = false
      for (const g of groups.values()) {
        if (g.length) { register.push(g.shift()); remaining = true; if (register.length >= take) break }
      }
    }
    if (register.length >= take) break
  }
  return { register, bands, total: withRisk.length,
    avgScore: portfolio.length ? Math.round((withRisk.reduce((t, w) => t + w.risk.score, 0) / portfolio.length) * 10) / 10 : 0 }
}

export function computeWholeLife(portfolio, config = DEFAULT_AMS_CONFIG) {
  const byCatMap = new Map()
  for (const a of portfolio) {
    const c = normalizeCategory(a.category)
    if (!byCatMap.has(c)) byCatMap.set(c, { category: c, capex: 0, count: 0 })
    const g = byCatMap.get(c)
    g.capex += Number(a.est_replacement_cost) || 0
    g.count += 1
  }
  const rows = [...byCatMap.values()].map(g => ({ ...g, ...wholeLifeForCategory(g.category, g.capex, config) }))
    .sort((a, b) => b.totalCostOfOwnership - a.totalCostOfOwnership)
  return {
    rows,
    tcoTotal: rows.reduce((t, w) => t + w.totalCostOfOwnership, 0),
    capexTotal: rows.reduce((t, w) => t + w.capex, 0),
    lifetimeOpexTotal: rows.reduce((t, w) => t + w.lifetimeOpex, 0),
  }
}

export function computeCompliance(config = DEFAULT_AMS_CONFIG) {
  const rows = (config.compliance || []).map(r => ({ ...r, status: complianceStatus(r) }))
  return { rows, open: rows.filter(r => r.status.pending || r.status.en === 'Overdue' || r.status.en === 'Due soon').length }
}

/* ═══════════════ AMS REPORT DATA BUILDER ═══════════════ */
// Assembles everything the AMS Overview report needs. `assets` is the raw
// list; `snapshots` is the dated history from asset_snapshots.
export function buildAMS(assets, config = DEFAULT_AMS_CONFIG, snapshots = []) {
  const p = (assets || [])
    .filter(a => a.status !== 'Disposed')
    .map(a => { const d = withDefaults(a); return { ...d, goal_code: resolveGoalCode(d) } })

  const metrics = liveMetrics(p, config)
  const objectives = objectivesWithActuals(metrics, config)
  const risk = computeRiskRegister(p, config)
  const compliance = computeCompliance(config)
  const wl = computeWholeLife(p, config)
  const trend = [...(snapshots || [])].sort((a, b) => (a.date || '').localeCompare(b.date || ''))

  return {
    config, metrics, objectives,
    riskRegister: risk.register, riskBands: risk.bands, riskTotal: risk.total, avgRiskScore: risk.avgScore,
    compliance: compliance.rows, complianceOpen: compliance.open,
    wholeLife: wl.rows, tcoTotal: wl.tcoTotal, capexTotal: wl.capexTotal, lifetimeOpexTotal: wl.lifetimeOpexTotal,
    trend, hasTrend: trend.length >= 2,
    portfolioCount: p.length,
  }
}
