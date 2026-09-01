/**
 * fuelAnalytics — pure month-over-month analytics for the fuel module.
 *
 * No React, no Firebase, no browser APIs: every function takes plain data and
 * returns plain data, so the whole file can be exercised directly with `node`.
 *
 * Shapes:
 *   Vehicle row (one vehicle, one month):  { plate, km, litres, cost }
 *   Fleet totals (one month):              { totalCost, totalLitres, totalKm, pricePerLitre? }
 *
 * Every ratio is guarded: a zero or invalid denominator yields `null`,
 * never Infinity or NaN. UI layers render `null` as an em-dash.
 */

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Division that never yields Infinity/NaN: non-positive/invalid denominator → null. */
export function safeDiv(numerator, denominator) {
  const n = Number(numerator);
  const d = Number(denominator);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return null;
  return n / d;
}

/** { abs, pct } change from previous → current. Any missing side → nulls. */
export function delta(current, previous) {
  if (current == null || previous == null) return { abs: null, pct: null };
  const c = Number(current);
  const p = Number(previous);
  if (!Number.isFinite(c) || !Number.isFinite(p)) return { abs: null, pct: null };
  const abs = c - p;
  return { abs, pct: p !== 0 ? (abs / p) * 100 : null };
}

/** The calendar month before (month 1-12, year) — wraps January → December. */
export function previousPeriod(month, year) {
  const m = num(month);
  const y = num(year);
  return m <= 1 ? { month: 12, year: y - 1 } : { month: m - 1, year: y };
}

/** Sum plain vehicle rows into fleet totals (pricePerLitre is statement-level, pass through). */
export function rowsToTotals(rows = [], pricePerLitre = null) {
  return rows.reduce(
    (acc, r) => ({
      ...acc,
      totalCost: acc.totalCost + num(r?.cost),
      totalLitres: acc.totalLitres + num(r?.litres),
      totalKm: acc.totalKm + num(r?.km),
    }),
    { totalCost: 0, totalLitres: 0, totalKm: 0, pricePerLitre },
  );
}

/**
 * Reduce one stored ADNOC statement to the fleet scope currently selected in
 * the header. Per-vehicle allocations are the source of truth because they
 * keep historic statements responsive to later vehicle classification fixes.
 * The stored bus/other summaries are retained as a safe fallback for older
 * statements that pre-date allocation rows.
 */
export function statementTotalsForScope(statement = {}, scope = 'all', matchesVehicle = () => true) {
  const allocations = Array.isArray(statement.vehicleAllocations)
    ? statement.vehicleAllocations
    : [];

  if (allocations.length > 0) {
    const selected = scope === 'all'
      ? allocations
      : allocations.filter((row) => matchesVehicle(row?.plate || row?.registration));
    const registrations = new Set();
    const totals = selected.reduce((acc, row) => {
      const registration = String(row?.plate || row?.registration || '').trim().toUpperCase();
      if (registration) registrations.add(registration);
      acc.totalCost += num(row?.cost ?? row?.amountAed);
      acc.totalLitres += num(row?.litres);
      return acc;
    }, { totalCost: 0, totalLitres: 0 });
    return { ...totals, vehicleCount: registrations.size, derivedFrom: 'allocations' };
  }

  const summary = scope === 'buses'
    ? statement.busTotals
    : scope === 'others'
      ? statement.otherVehicleTotals
      : statement;
  return {
    totalCost: num(summary?.cost ?? summary?.totalCost),
    totalLitres: num(summary?.litres ?? summary?.totalLitres),
    vehicleCount: num(summary?.vehicleCount ?? statement.vehicleCount),
    derivedFrom: scope === 'all' ? 'statement' : 'scope-summary',
  };
}

/**
 * Fleet-level KPIs for one month.
 * A manually entered price/litre wins; otherwise it is implied from cost ÷ litres.
 */
export function fleetKpis({ totalCost, totalLitres, totalKm, pricePerLitre } = {}) {
  const cost = num(totalCost);
  const litres = num(totalLitres);
  const km = num(totalKm);
  const manual = Number(pricePerLitre);
  const hasManual = Number.isFinite(manual) && manual > 0;
  const implied = safeDiv(cost, litres);
  return {
    totalCost: cost,
    totalLitres: litres,
    totalKm: km,
    costPerKm: safeDiv(cost, km),
    litresPer100km: km > 0 ? (litres / km) * 100 : null,
    pricePerLitre: hasManual ? manual : implied,
    priceSource: hasManual ? 'manual' : implied != null ? 'implied' : null,
  };
}

const FLEET_DELTA_KEYS = ['totalCost', 'totalLitres', 'totalKm', 'costPerKm', 'litresPer100km', 'pricePerLitre'];

/** Current vs previous month at fleet level: KPIs for both plus per-metric deltas. */
export function compareFleet(currentTotals, previousTotals) {
  const current = fleetKpis(currentTotals);
  const previous = previousTotals ? fleetKpis(previousTotals) : null;
  const deltas = {};
  FLEET_DELTA_KEYS.forEach((k) => {
    deltas[k] = previous ? delta(current[k], previous[k]) : { abs: null, pct: null };
  });
  return { current, previous, deltas };
}

/** Per-vehicle metrics for one month; 0 km → null ratios. */
export function vehicleMetrics(row = {}) {
  const km = num(row.km);
  const litres = num(row.litres);
  const cost = num(row.cost);
  return {
    plate: row.plate ?? '',
    km,
    litres,
    cost,
    telemetry: row.telemetry || null,
    litresPer100km: km > 0 ? (litres / km) * 100 : null,
    costPerKm: safeDiv(cost, km),
  };
}

/**
 * Per-vehicle month-over-month comparison.
 * Verdict is based on consumption per km (L/100km):
 *   dropped more than `thresholdPct` → 'improving'
 *   rose more than `thresholdPct`    → 'worsening'
 *   within the band                  → 'stable'
 *   not computable (no previous month / 0 km) → null
 */
export function compareVehicles(currentRows = [], previousRows = [], thresholdPct = 2) {
  const prevByPlate = new Map(previousRows.map((r) => [r?.plate, vehicleMetrics(r)]));
  return currentRows.map((row) => {
    const cur = vehicleMetrics(row);
    const prev = prevByPlate.get(cur.plate) || null;
    /* Cartrack can return only the tail end of a month while the odometer has
       already advanced substantially since the preceding month's final trip.
       The fuel allocation is then complete but the distance denominator is not.
       Never turn that telemetry gap into a fuel-efficiency accusation. */
    const firstOdo = Number(cur.telemetry?.firstOdometer);
    const previousLastOdo = Number(prev?.telemetry?.lastOdometer);
    const untrackedKm = Number.isFinite(firstOdo) && Number.isFinite(previousLastOdo) && firstOdo >= previousLastOdo
      ? (firstOdo - previousLastOdo) / 1000
      : 0;
    const comparisonReliable = !(untrackedKm > Math.max(100, cur.km * 0.1));
    const deltaL100 = prev && comparisonReliable
      ? delta(cur.litresPer100km, prev.litresPer100km)
      : { abs: null, pct: null };
    const deltaCostPerKm = prev && comparisonReliable
      ? delta(cur.costPerKm, prev.costPerKm)
      : { abs: null, pct: null };
    let verdict = null;
    if (deltaL100.pct != null) {
      verdict = deltaL100.pct < -thresholdPct ? 'improving' : deltaL100.pct > thresholdPct ? 'worsening' : 'stable';
    }
    return { ...cur, prev, deltaL100, deltaCostPerKm, verdict, comparisonReliable, untrackedKm };
  });
}

/**
 * Decompose the fleet cost delta into a price effect and a volume effect:
 *   ΔC = (P₁ − P₀) · L₁  +  (L₁ − L₀) · P₀  (+ residual when prices are manual)
 * priceEffect  — what changed because the pump price moved.
 * volumeEffect — what changed because consumption moved.
 */
export function decomposeCostDelta(currentTotals, previousTotals) {
  const cur = fleetKpis(currentTotals);
  const prev = fleetKpis(previousTotals);
  const totalDelta = cur.totalCost - prev.totalCost;
  if (cur.pricePerLitre == null || prev.pricePerLitre == null) {
    return { totalDelta, priceEffect: null, volumeEffect: null, residual: null };
  }
  const priceEffect = (cur.pricePerLitre - prev.pricePerLitre) * cur.totalLitres;
  const volumeEffect = (cur.totalLitres - prev.totalLitres) * prev.pricePerLitre;
  return { totalDelta, priceEffect, volumeEffect, residual: totalDelta - priceEffect - volumeEffect };
}

/* ── Insights generator ─────────────────────────────────────────────────── */

const fmt = (v, d = 1) =>
  v == null ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: d });

const signed = (v, d = 1) => (v == null ? '—' : `${v > 0 ? '+' : ''}${fmt(v, d)}`);

/**
 * Ranked list of noteworthy facts about the selected month.
 * Each insight: { id, tone: 'good'|'bad'|'info', score, en, ar }
 * `names` — optional (plate) => display-name mapper for friendlier strings.
 */
export function generateInsights({ fleet, vehicles = [], decomposition, currency = 'AED', names } = {}) {
  const label = typeof names === 'function' ? (p) => names(p) || p : (p) => p;
  const insights = [];

  /* Fleet trend direction — consumption per km */
  const trendPct = fleet?.deltas?.litresPer100km?.pct;
  if (trendPct != null) {
    const improving = trendPct < -2;
    const worsening = trendPct > 2;
    insights.push({
      id: 'fleet-trend',
      tone: improving ? 'good' : worsening ? 'bad' : 'info',
      score: Math.abs(trendPct) + 10, // headline fact — keep near the top
      en: improving
        ? `Fleet consumption improved ${fmt(Math.abs(trendPct))}% month-over-month (${fmt(fleet.previous?.litresPer100km)} → ${fmt(fleet.current?.litresPer100km)} L/100km).`
        : worsening
          ? `Fleet consumption worsened ${fmt(trendPct)}% month-over-month (${fmt(fleet.previous?.litresPer100km)} → ${fmt(fleet.current?.litresPer100km)} L/100km).`
          : `Fleet consumption is stable month-over-month (${signed(trendPct)}%, ${fmt(fleet.current?.litresPer100km)} L/100km).`,
      ar: improving
        ? `تحسّن استهلاك الأسطول بنسبة ${fmt(Math.abs(trendPct))}% مقارنة بالشهر السابق (من ${fmt(fleet.previous?.litresPer100km)} إلى ${fmt(fleet.current?.litresPer100km)} لتر/100كم).`
        : worsening
          ? `تراجع استهلاك الأسطول بنسبة ${fmt(trendPct)}% مقارنة بالشهر السابق (من ${fmt(fleet.previous?.litresPer100km)} إلى ${fmt(fleet.current?.litresPer100km)} لتر/100كم).`
          : `استهلاك الأسطول مستقر مقارنة بالشهر السابق (${signed(trendPct)}%، ${fmt(fleet.current?.litresPer100km)} لتر/100كم).`,
    });
  }

  /* Biggest improvement / biggest deterioration */
  const rated = vehicles.filter((v) => v.comparisonReliable !== false && v.deltaL100?.pct != null);
  if (rated.length > 0) {
    const best = rated.reduce((a, b) => (b.deltaL100.pct < a.deltaL100.pct ? b : a));
    const worst = rated.reduce((a, b) => (b.deltaL100.pct > a.deltaL100.pct ? b : a));
    if (best.verdict === 'improving') {
      insights.push({
        id: 'best-improver',
        tone: 'good',
        score: Math.abs(best.deltaL100.pct),
        en: `${label(best.plate)} posted the biggest efficiency gain: ${fmt(Math.abs(best.deltaL100.pct))}% less fuel per km (${fmt(best.prev?.litresPer100km)} → ${fmt(best.litresPer100km)} L/100km).`,
        ar: `${label(best.plate)} سجلت أكبر تحسّن في الكفاءة: انخفاض ${fmt(Math.abs(best.deltaL100.pct))}% في استهلاك الوقود لكل كم (من ${fmt(best.prev?.litresPer100km)} إلى ${fmt(best.litresPer100km)} لتر/100كم).`,
      });
    }
    if (worst.verdict === 'worsening' && worst.plate !== best.plate) {
      insights.push({
        id: 'worst-decliner',
        tone: 'bad',
        score: Math.abs(worst.deltaL100.pct) + 1, // deterioration slightly outranks equal-size gain
        en: `${label(worst.plate)} deteriorated the most: ${fmt(worst.deltaL100.pct)}% more fuel per km (${fmt(worst.prev?.litresPer100km)} → ${fmt(worst.litresPer100km)} L/100km).`,
        ar: `${label(worst.plate)} سجلت أكبر تراجع: ارتفاع ${fmt(worst.deltaL100.pct)}% في استهلاك الوقود لكل كم (من ${fmt(worst.prev?.litresPer100km)} إلى ${fmt(worst.litresPer100km)} لتر/100كم).`,
      });
    }
  }

  const withheld = vehicles.filter((v) => v.comparisonReliable === false);
  if (withheld.length > 0) {
    insights.push({
      id: 'telemetry-coverage',
      tone: 'info',
      score: 11,
      en: `${withheld.length} vehicle efficiency comparison${withheld.length === 1 ? ' was' : 's were'} withheld because Cartrack mileage is incomplete for part of the month.`,
      ar: `تم حجب ${fmt(withheld.length, 0)} ${withheld.length === 1 ? 'مقارنة' : 'مقارنات'} لكفاءة المركبات لأن بيانات المسافة من Cartrack غير مكتملة لجزء من الشهر.`,
    });
  }

  /* Most expensive vehicle per km this month */
  const costed = vehicles.filter((v) => v.comparisonReliable !== false && v.costPerKm != null);
  if (costed.length > 1) {
    const priciest = costed.reduce((a, b) => (b.costPerKm > a.costPerKm ? b : a));
    insights.push({
      id: 'priciest-per-km',
      tone: 'info',
      score: 6,
      en: `${label(priciest.plate)} is the most expensive vehicle to run: ${fmt(priciest.costPerKm, 2)} ${currency}/km this month.`,
      ar: `${label(priciest.plate)} هي الأعلى تكلفة في التشغيل: ${fmt(priciest.costPerKm, 2)} ${currency === 'AED' ? 'د.إ' : currency}/كم هذا الشهر.`,
    });
  }

  /* Price effect vs volume effect on total cost */
  if (decomposition && decomposition.priceEffect != null && decomposition.volumeEffect != null) {
    const { totalDelta, priceEffect, volumeEffect } = decomposition;
    if (Math.abs(totalDelta) > 0.5) {
      const cur = currency === 'AED' ? 'د.إ' : currency;
      const rose = totalDelta > 0;
      const priceDominant = Math.abs(priceEffect) >= Math.abs(volumeEffect);
      insights.push({
        id: 'cost-decomposition',
        tone: rose ? 'bad' : 'good',
        score: 9,
        en: `Total fuel spend ${rose ? 'rose' : 'fell'} ${fmt(Math.abs(totalDelta), 0)} ${currency}: ${signed(priceEffect, 0)} ${currency} from the pump-price change and ${signed(volumeEffect, 0)} ${currency} from the consumption change — ${priceDominant ? 'price' : 'consumption'} was the main driver.`,
        ar: `${rose ? 'ارتفع' : 'انخفض'} إجمالي الإنفاق على الوقود بمقدار ${fmt(Math.abs(totalDelta), 0)} ${cur}: منها ${signed(priceEffect, 0)} ${cur} بسبب تغيّر سعر اللتر و ${signed(volumeEffect, 0)} ${cur} بسبب تغيّر الاستهلاك — ${priceDominant ? 'السعر' : 'الاستهلاك'} هو المحرك الرئيسي.`,
      });
    }
  }

  /* Price per litre movement on its own */
  const pricePct = fleet?.deltas?.pricePerLitre?.pct;
  if (pricePct != null && Math.abs(pricePct) > 0.5) {
    const cur = currency === 'AED' ? 'د.إ' : currency;
    insights.push({
      id: 'price-move',
      tone: pricePct > 0 ? 'bad' : 'good',
      score: Math.min(8, Math.abs(pricePct)),
      en: `Fuel price per litre ${pricePct > 0 ? 'increased' : 'decreased'} ${fmt(Math.abs(pricePct))}% (${fmt(fleet.previous?.pricePerLitre, 2)} → ${fmt(fleet.current?.pricePerLitre, 2)} ${currency}/L).`,
      ar: `${pricePct > 0 ? 'ارتفع' : 'انخفض'} سعر لتر الوقود بنسبة ${fmt(Math.abs(pricePct))}% (من ${fmt(fleet.previous?.pricePerLitre, 2)} إلى ${fmt(fleet.current?.pricePerLitre, 2)} ${cur}/لتر).`,
    });
  }

  return insights.sort((a, b) => b.score - a.score);
}
