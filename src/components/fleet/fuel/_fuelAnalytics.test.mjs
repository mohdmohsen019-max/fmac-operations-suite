/* Throwaway node test for fuelAnalytics.js — delete after running. */
import {
  safeDiv, delta, previousPeriod, rowsToTotals, fleetKpis,
  compareFleet, vehicleMetrics, compareVehicles, decomposeCostDelta, generateInsights,
  statementTotalsForScope,
} from './fuelAnalytics.js';

let failures = 0;
function assert(name, cond) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.error(`FAIL  ${name}`); }
}
const close = (a, b, eps = 1e-9) => a != null && b != null && Math.abs(a - b) < eps;

/* 1 — zero-km / divide-by-zero guards */
assert('safeDiv 10/0 -> null', safeDiv(10, 0) === null);
assert('safeDiv 10/-5 -> null', safeDiv(10, -5) === null);
assert('safeDiv 10/4 -> 2.5', safeDiv(10, 4) === 2.5);
assert('safeDiv NaN denom -> null', safeDiv(10, 'x') === null);

const zeroKm = vehicleMetrics({ plate: 'A1', km: 0, litres: 50, cost: 100 });
assert('0 km -> litresPer100km null', zeroKm.litresPer100km === null);
assert('0 km -> costPerKm null', zeroKm.costPerKm === null);
const noVals = fleetKpis({ totalCost: 0, totalLitres: 0, totalKm: 0 });
assert('empty fleet -> costPerKm null', noVals.costPerKm === null);
assert('empty fleet -> price null', noVals.pricePerLitre === null && noVals.priceSource === null);
const asStrings = JSON.stringify([zeroKm, noVals]);
assert('no Infinity/NaN serialized', !asStrings.includes('null,null') || !/Infinity|NaN/.test(asStrings));

/* delta guards */
assert('delta vs 0 previous -> pct null', delta(5, 0).pct === null && delta(5, 0).abs === 5);
assert('delta with null -> nulls', delta(null, 3).abs === null && delta(3, undefined).pct === null);

/* previousPeriod wrap */
const pp = previousPeriod(1, 2026);
assert('Jan 2026 -> Dec 2025', pp.month === 12 && pp.year === 2025);
assert('Aug 2026 -> Jul 2026', previousPeriod(8, 2026).month === 7 && previousPeriod(8, 2026).year === 2026);

/* 2 — MoM verdicts (threshold 2%) */
const prevRows = [
  { plate: 'B1', km: 1000, litres: 100, cost: 300 }, // 10 L/100km
  { plate: 'B2', km: 1000, litres: 100, cost: 300 },
  { plate: 'B3', km: 1000, litres: 100, cost: 300 },
  { plate: 'B5', km: 0, litres: 20, cost: 60 },      // zero-km previous
];
const currRows = [
  { plate: 'B1', km: 1000, litres: 90, cost: 280 },  // 9.0  -> -10%  improving
  { plate: 'B2', km: 1000, litres: 105, cost: 320 }, // 10.5 -> +5%   worsening
  { plate: 'B3', km: 1000, litres: 101, cost: 305 }, // 10.1 -> +1%   stable
  { plate: 'B4', km: 500, litres: 60, cost: 180 },   // new vehicle   verdict null
  { plate: 'B5', km: 800, litres: 80, cost: 240 },   // prev had 0 km -> verdict null
];
const cmp = compareVehicles(currRows, prevRows);
const by = Object.fromEntries(cmp.map((v) => [v.plate, v]));
assert('B1 improving', by.B1.verdict === 'improving' && close(by.B1.deltaL100.pct, -10));
assert('B2 worsening', by.B2.verdict === 'worsening' && close(by.B2.deltaL100.pct, 5));
assert('B3 stable', by.B3.verdict === 'stable');
assert('B4 (new) verdict null', by.B4.verdict === null && by.B4.deltaL100.pct === null);
assert('B5 (prev 0 km) verdict null, no NaN', by.B5.verdict === null && !Number.isNaN(by.B5.litresPer100km));
assert('costPerKm delta computed', close(by.B1.deltaCostPerKm.pct, ((280 / 1000) - (300 / 1000)) / (300 / 1000) * 100));

const incompleteTelemetry = compareVehicles(
  [{ plate: 'M99270', km: 282, litres: 937, cost: 3000, telemetry: { firstOdometer: 238024000, lastOdometer: 238306000 } }],
  [{ plate: 'M99270', km: 1336, litres: 409, cost: 1300, telemetry: { firstOdometer: 233187000, lastOdometer: 234523000 } }],
)[0];
assert('large odometer coverage gap invalidates comparison', incompleteTelemetry.comparisonReliable === false);
assert('coverage gap cannot produce a deterioration verdict', incompleteTelemetry.verdict === null && incompleteTelemetry.deltaL100.pct === null);

/* 3 — price-vs-volume cost decomposition */
const prevT = { totalCost: 3000, totalLitres: 1000, totalKm: 10000, pricePerLitre: 3.0 };
const currT = { totalCost: 3520, totalLitres: 1100, totalKm: 10500, pricePerLitre: 3.2 };
const d = decomposeCostDelta(currT, prevT);
assert('decomp totalDelta 520', close(d.totalDelta, 520));
assert('decomp priceEffect 220', close(d.priceEffect, 220));   // (3.2-3.0)*1100
assert('decomp volumeEffect 300', close(d.volumeEffect, 300)); // (1100-1000)*3.0
assert('decomp exact (residual 0)', close(d.residual, 0));
const dNoPrice = decomposeCostDelta({ totalCost: 100, totalLitres: 0, totalKm: 0 }, prevT);
assert('decomp without price -> null effects', dNoPrice.priceEffect === null && dNoPrice.volumeEffect === null);

/* implied price fallback */
const k = fleetKpis({ totalCost: 300, totalLitres: 100, totalKm: 1000 });
assert('implied price 3.0', close(k.pricePerLitre, 3) && k.priceSource === 'implied');
const km = fleetKpis({ totalCost: 300, totalLitres: 100, totalKm: 1000, pricePerLitre: 2.9 });
assert('manual price wins', close(km.pricePerLitre, 2.9) && km.priceSource === 'manual');

/* fleet comparison + rowsToTotals */
const totals = rowsToTotals(currRows, 3.2);
assert('rowsToTotals sums', close(totals.totalKm, 4300) && close(totals.totalLitres, 436) && close(totals.totalCost, 1325));

/* scope-aware historical trend totals */
const scopedStatement = {
  totalCost: 1000,
  totalLitres: 300,
  vehicleAllocations: [
    { plate: 'C1', cost: 650, litres: 200 },
    { registration: 'A2', cost: 350, litres: 100 },
  ],
};
const busesTrend = statementTotalsForScope(scopedStatement, 'buses', (plate) => plate === 'C1');
const othersTrend = statementTotalsForScope(scopedStatement, 'others', (plate) => plate === 'A2');
const allTrend = statementTotalsForScope(scopedStatement, 'all', () => false);
assert('bus trend totals use only bus allocations', busesTrend.totalCost === 650 && busesTrend.totalLitres === 200 && busesTrend.vehicleCount === 1);
assert('other-vehicle trend totals use only other allocations', othersTrend.totalCost === 350 && othersTrend.totalLitres === 100 && othersTrend.vehicleCount === 1);
assert('all trend totals use every allocation', allTrend.totalCost === 1000 && allTrend.totalLitres === 300 && allTrend.vehicleCount === 2);

const legacyBusTrend = statementTotalsForScope({ busTotals: { cost: 420, litres: 130, vehicleCount: 14 } }, 'buses');
assert('legacy trend falls back to stored bus summary', legacyBusTrend.totalCost === 420 && legacyBusTrend.totalLitres === 130);

const fc = compareFleet(currT, prevT);
assert('fleet delta cost pct', close(fc.deltas.totalCost.pct, (520 / 3000) * 100));
assert('fleet no-prev -> null deltas', compareFleet(currT, null).deltas.totalCost.pct === null);

/* insights */
const ins = generateInsights({ fleet: fc, vehicles: cmp, decomposition: d, currency: 'AED' });
assert('insights non-empty', ins.length >= 3);
assert('insights ranked desc', ins.every((x, i) => i === 0 || ins[i - 1].score >= x.score));
assert('insights bilingual', ins.every((x) => typeof x.en === 'string' && x.en.length > 0 && typeof x.ar === 'string' && x.ar.length > 0));
assert('has decomposition insight', ins.some((x) => x.id === 'cost-decomposition'));
assert('has best improver', ins.some((x) => x.id === 'best-improver' && x.en.includes('B1')));
assert('has worst decliner', ins.some((x) => x.id === 'worst-decliner' && x.en.includes('B2')));
assert('no NaN in strings', ins.every((x) => !x.en.includes('NaN') && !x.ar.includes('NaN')));

const guardedInsights = generateInsights({ fleet: fc, vehicles: [incompleteTelemetry], decomposition: null, currency: 'AED' });
assert('unreliable telemetry is explained', guardedInsights.some((x) => x.id === 'telemetry-coverage'));
assert('unreliable telemetry is never ranked', !guardedInsights.some((x) => x.id === 'worst-decliner' || x.id === 'priciest-per-km'));

/* insights with no previous data — should not throw, minimal output */
const insNoPrev = generateInsights({ fleet: compareFleet(currT, null), vehicles: compareVehicles(currRows, []), decomposition: null });
assert('no-prev insights safe', Array.isArray(insNoPrev));

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
