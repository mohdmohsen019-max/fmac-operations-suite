// Aggregation engine for the strategic asset reports.
// Each builder takes the live `assets` array and returns a fully-computed,
// render-ready dataset — pure functions, no Firestore access.
//
// Deliverables (from the Strategy Office follow-up sheet):
//   1. buildStrategy   → استراتيجية الأصول والموارد المعتمدة
//   2. buildLinkage    → خريطة الربط الاستراتيجي للأصول المعتمدة
//   3. buildPlan       → خطة الأصول متوسطة المدى المعتمدة (3–5 سنوات)
//   4. buildExecutive  → الملخص التنفيذي لمحفظة الأصول (leadership one-pager)
//
// Every asset always resolves to a strategic goal: an explicit assignment wins,
// otherwise the deterministic classifier in shared.js decides from location +
// category — so the linkage report can never come out empty.

import {
  STRATEGIC_GOALS, goalByCode, withDefaults, normalizeCategory,
  criticalityRank, resolveGoalCode,
} from './shared'

const ACTIVE_STATUSES = new Set(['Active', 'Under Maintenance'])

// Portfolio = everything still owned (exclude Disposed), lifecycle-complete,
// and stamped with its resolved strategic goal.
function portfolio(assets) {
  return (assets || [])
    .filter(a => a.status !== 'Disposed')
    .map(a => {
      const d = withDefaults(a)
      return { ...d, goal_code: resolveGoalCode(d) }
    })
}

const sum = (arr, f) => arr.reduce((t, x) => t + (Number(f(x)) || 0), 0)
const qtyOf = (a) => Number(a.quantity) || 1
const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0)

// Round-robin across a grouping key so no single group monopolises a top list
// (e.g. medical devices crowding out every other category).
function diversify(sorted, keyFn, take) {
  const groups = new Map()
  for (const a of sorted) {
    const k = keyFn(a)
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(a)
  }
  const out = []
  while (out.length < take) {
    let added = false
    for (const g of groups.values()) {
      if (g.length) {
        out.push(g.shift())
        added = true
        if (out.length >= take) break
      }
    }
    if (!added) break
  }
  return out
}

function groupRollup(items, keyFn, fallback) {
  const map = new Map()
  for (const a of items) {
    const k = keyFn(a) || fallback
    if (!map.has(k)) map.set(k, { key: k, count: 0, units: 0, value: 0 })
    const g = map.get(k)
    g.count += 1
    g.units += qtyOf(a)
    g.value += Number(a.est_replacement_cost) || 0
  }
  return [...map.values()]
}

// Reference number so every generated document is traceable/auditable.
export function docRef(prefix) {
  const d = new Date()
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  const rand = Math.random().toString(36).slice(2, 5).toUpperCase()
  return `FMAC-${prefix}-${stamp}-${rand}`
}

// Shared data-quality metrics (transparency block on every report).
function dataQuality(p) {
  const estimated = p.filter(a => a.cost_is_estimate).length
  return {
    total: p.length,
    realCost: p.length - estimated,
    estimatedCost: estimated,
    estimatedPct: pct(estimated, p.length),
    manualGoals: p.filter(a => a.strategic_goal_code).length,
    autoGoals: p.filter(a => !a.strategic_goal_code).length,
  }
}

/* ═══════════════ REPORT 1 — Asset & Resource Strategy ═══════════════ */
export function buildStrategy(assets) {
  const p = portfolio(assets)
  const totalUnits = sum(p, qtyOf)
  const totalValue = sum(p, a => a.est_replacement_cost)

  const byCategory = groupRollup(p, a => normalizeCategory(a.category), 'Other').sort((a, b) => b.value - a.value)
  const byCondition = groupRollup(p, a => a.condition, 'Good')
  const byCriticality = groupRollup(p, a => a.criticality, 'Medium').sort((a, b) => criticalityRank(b.key) - criticalityRank(a.key))
  const byLocation = groupRollup(p, a => a.department, 'غير محدد').sort((a, b) => b.count - a.count)

  // Maintenance backlog: anything not in Good condition.
  const maintenance = p
    .filter(a => a.condition === 'Needs Maintenance' || a.condition === 'Poor')
    .sort((a, b) => criticalityRank(b.criticality) - criticalityRank(a.criticality))

  // Renewal priorities: highest criticality → soonest replacement → value,
  // then diversified across categories so the list reads balanced.
  const rankedForPriority = [...p].sort((a, b) =>
    criticalityRank(b.criticality) - criticalityRank(a.criticality) ||
    (a.replacement_year - b.replacement_year) ||
    (b.est_replacement_cost - a.est_replacement_cost))
  const priorities = diversify(rankedForPriority, a => normalizeCategory(a.category), 12)

  const goodShare = pct(p.filter(a => a.condition === 'Good').length, p.length)
  const highShare = pct(p.filter(a => criticalityRank(a.criticality) >= 3).length, p.length)
  const topCat = byCategory[0]
  const topLoc = byLocation[0]

  // Auto-computed narrative insights (kept factual — every number traceable).
  const insights = [
    `تمثل فئة «${topCat ? topCat.key : '—'}» النصيب الأكبر من قيمة المحفظة بنسبة ${topCat ? pct(topCat.value, totalValue) : 0}%.`,
    `${goodShare}% من الأصول بحالة فنية جيدة، و${maintenance.length} أصلاً ضمن سجل الصيانة المطلوبة.`,
    `${highShare}% من الأصول مصنّفة بأهمية مرتفعة أو حرجة — وهي محور خطط الصيانة الوقائية.`,
    `أعلى تركّز للأصول في «${topLoc ? topLoc.key : '—'}» بواقع ${topLoc ? topLoc.count : 0} أصلاً (${topLoc ? pct(topLoc.count, p.length) : 0}% من السجل).`,
  ]

  return {
    kpi: {
      totalAssets: p.length,
      totalUnits,
      totalValue,
      categories: byCategory.length,
      locations: byLocation.length,
      criticalCount: p.filter(a => a.criticality === 'Critical').length,
      highCount: p.filter(a => a.criticality === 'High').length,
      maintenanceCount: maintenance.length,
      goodShare,
    },
    byCategory, byCondition, byCriticality,
    byLocation: byLocation.slice(0, 12),
    locationsTotal: byLocation.length,
    maintenance, priorities, insights,
    quality: dataQuality(p),
  }
}

/* ═══════════════ REPORT 2 — Strategic Linkage Map ═══════════════ */
export function buildLinkage(assets) {
  const p = portfolio(assets)
  const totalValue = sum(p, a => a.est_replacement_cost)

  const goals = STRATEGIC_GOALS.map(g => {
    const linked = p.filter(a => a.goal_code === g.code)
    const ranked = [...linked].sort((a, b) =>
      criticalityRank(b.criticality) - criticalityRank(a.criticality) ||
      (b.est_replacement_cost - a.est_replacement_cost))
    return {
      goal: g,
      count: linked.length,
      units: sum(linked, qtyOf),
      value: sum(linked, a => a.est_replacement_cost),
      sharePct: pct(linked.length, p.length),
      valuePct: pct(sum(linked, a => a.est_replacement_cost), totalValue),
      highCount: linked.filter(a => criticalityRank(a.criticality) >= 3).length,
      top: diversify(ranked, a => a.department, 6),
      topLocations: groupRollup(linked, a => a.department, 'غير محدد')
        .sort((a, b) => b.count - a.count).slice(0, 3),
    }
  })

  const criticalCare = p
    .filter(a => criticalityRank(a.criticality) >= 3)
    .sort((a, b) => criticalityRank(b.criticality) - criticalityRank(a.criticality) || (b.est_replacement_cost - a.est_replacement_cost))
  const underutilized = p.filter(a => a.utilization === 'Underutilized')
  const autoClassified = p.filter(a => !a.strategic_goal_code).length

  const dominant = [...goals].sort((a, b) => b.count - a.count)[0]
  const thinnest = [...goals].filter(g => g.count > 0).sort((a, b) => a.count - b.count)[0]

  const insights = [
    `جميع أصول النادي (${p.length} أصلاً) مرتبطة بأهداف البيت الاستراتيجي الستة — تغطية 100%.`,
    `الهدف «${dominant ? dominant.goal.shortAr : '—'}» يستحوذ على النصيب الأكبر (${dominant ? dominant.sharePct : 0}% من الأصول).`,
    thinnest ? `الهدف «${thinnest.goal.shortAr}» هو الأقل ارتباطاً بالأصول (${thinnest.count} أصلاً) — فرصة لتعزيز البنية الداعمة له.` : '',
    `${criticalCare.length} أصلاً بأهمية مرتفعة أو حرجة تتطلب عناية خاصة ضمن خطط التشغيل والصيانة.`,
  ].filter(Boolean)

  return {
    kpi: {
      totalAssets: p.length,
      totalValue,
      coverage: 100,
      goalsUsed: goals.filter(g => g.count > 0).length,
      criticalCareCount: criticalCare.length,
      underutilizedCount: underutilized.length,
      autoClassified,
    },
    goals,
    criticalCare: diversify(criticalCare, a => normalizeCategory(a.category), 14),
    criticalCareTotal: criticalCare.length,
    underutilized: underutilized.slice(0, 12),
    insights,
    quality: dataQuality(p),
  }
}

/* ═══════════════ REPORT 3 — Medium-Term Asset Plan (3–5 yrs) ═══════════════ */
export function buildPlan(assets, horizon = 5) {
  const p = portfolio(assets).filter(a => ACTIVE_STATUSES.has(a.status))
  const thisYear = new Date().getFullYear()
  const cutoff = thisYear + horizon

  const due = p
    .filter(a => Number(a.replacement_year) && a.replacement_year <= cutoff)
    .sort((a, b) => a.replacement_year - b.replacement_year || criticalityRank(b.criticality) - criticalityRank(a.criticality))

  // Group by planned replacement year, with a category mix per year.
  const byYearMap = new Map()
  for (const a of due) {
    const y = a.replacement_year
    if (!byYearMap.has(y)) byYearMap.set(y, { year: y, items: [], count: 0, value: 0 })
    const g = byYearMap.get(y)
    g.items.push(a)
    g.count += 1
    g.value += Number(a.est_replacement_cost) || 0
  }
  const byYear = [...byYearMap.values()].sort((a, b) => a.year - b.year).map(y => ({
    ...y,
    categories: groupRollup(y.items, a => normalizeCategory(a.category), 'Other').sort((a, b) => b.value - a.value),
  }))

  // Funding source rollup.
  const byFunding = groupRollup(due, a => a.funding_source, 'الموازنة التشغيلية')
    .sort((a, b) => b.value - a.value)

  // Capital priorities — criticality first, then diversified across categories.
  const ranked = [...due].sort((a, b) =>
    criticalityRank(b.criticality) - criticalityRank(a.criticality) ||
    (a.replacement_year - b.replacement_year) ||
    (b.est_replacement_cost - a.est_replacement_cost))
  const priorities = diversify(ranked, a => normalizeCategory(a.category), 14)

  const totalPlanCost = sum(due, a => a.est_replacement_cost)
  const peak = [...byYear].sort((a, b) => b.value - a.value)[0]
  const nearTerm = due.filter(a => a.replacement_year <= thisYear + 2)

  const insights = [
    `تشمل الخطة ${due.length} أصلاً بتكلفة تقديرية إجمالية ${totalPlanCost.toLocaleString('en-US')} د.إ على مدى ${horizon} سنوات.`,
    peak ? `ذروة الإنفاق المتوقعة في سنة ${peak.year} (${peak.value.toLocaleString('en-US')} د.إ) — يُنصح بتوزيعها على موازنتين.` : '',
    `${nearTerm.length} بنداً مستحقاً خلال السنتين القادمتين ويُدرج ضمن الموازنة القادمة مباشرة.`,
    'التكاليف تقديرات تخطيطية متحفّظة تُستبدل تلقائياً عند تسجيل تكلفة الشراء الفعلية لكل أصل.',
  ].filter(Boolean)

  return {
    kpi: {
      horizon,
      fromYear: thisYear,
      toYear: cutoff,
      dueCount: due.length,
      totalPlanCost,
      urgentCount: nearTerm.length,
      avgPerYear: byYear.length ? Math.round(totalPlanCost / horizon) : 0,
    },
    byYear, byFunding, priorities, insights,
    dueTotal: due.length,
    quality: dataQuality(p),
  }
}

/* ═══════════════ REPORT 4 — Executive Portfolio Summary ═══════════════ */
export function buildExecutive(assets) {
  const strategy = buildStrategy(assets)
  const linkage = buildLinkage(assets)
  const plan = buildPlan(assets, 5)

  // Top 5 recommended actions, synthesised from the three datasets.
  const actions = []
  if (strategy.maintenance.length > 0)
    actions.push(`معالجة سجل الصيانة (${strategy.maintenance.length} أصلاً) قبل نهاية الربع القادم.`)
  actions.push(`اعتماد خطة الاستبدال متوسطة المدى بقيمة ${plan.kpi.totalPlanCost.toLocaleString('en-US')} د.إ ضمن الموازنة الرأسمالية.`)
  if (plan.kpi.urgentCount > 0)
    actions.push(`إدراج ${plan.kpi.urgentCount} بنداً مستحقاً خلال سنتين في الموازنة التشغيلية القادمة.`)
  actions.push('تسجيل تكاليف الشراء الفعلية للأصول ذات التكلفة المُقدّرة لرفع دقة التقارير المالية.')
  actions.push('مراجعة الأصول عالية الأهمية ميدانياً وتحديث حالتها الفنية كل ستة أشهر.')

  return { strategy, linkage, plan, actions: actions.slice(0, 5) }
}

export { goalByCode }
