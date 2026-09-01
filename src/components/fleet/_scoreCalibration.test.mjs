import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateTripMetrics, SCORE_DEFAULTS } from './scoreCalculation.js';

// Observed canonical-bus rates from the same 12 Jul-10 Aug 2026 Cartrack
// period used by the scorecard. These rates contain no trip locations or IDs.
const observedFleet = [
  ['A21248', 3.53, 7.5, 8.8, 67.3],
  ['A33867', 6.11, 2.2, 12.7, 15.8],
  ['A33876', 7.42, 8.4, 12.7, 72.4],
  ['C29769', 15.15, 0.2, 11.9, 216],
  ['C37069', 8.33, 0.6, 4.1, 446.6],
  ['C37072', 5.48, 8, 36.8, 0],
  ['C37074', 6.78, 0.4, 0, 204.8],
  ['C37075', 4.21, 29.9, 31.2, 90.5],
  ['M85750', 4.19, 7.6, 11.4, 118.3],
  ['M85751', 5.39, 9.3, 12.8, 140.9],
  ['M85756', 10.55, 0.2, 0.2, 101.2],
  ['M85759', 4.3, 0.9, 2.8, 217.6],
  ['M99268', 7.97, 6.9, 8.6, 116],
  ['M99270', 66.01, 26.5, 25.6, 65.4],
];

function tripFromRates(speedingPercent, acceleration, braking, cornering) {
  return {
    trip_distance: 1_000_000,
    trip_duration_seconds: 100_000,
    road_speeding_duration_seconds: speedingPercent * 1_000,
    harsh_acceleration_events: acceleration,
    harsh_braking_events: braking,
    harsh_cornering_events: cornering,
  };
}

test('calibration presents a healthy but imperfect fleet distribution', () => {
  const scores = observedFleet.map(([, speeding, acceleration, braking, cornering]) =>
    calculateTripMetrics([
      tripFromRates(speeding, acceleration, braking, cornering),
    ], SCORE_DEFAULTS).score);

  const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const atTarget = scores.filter((score) => score >= SCORE_DEFAULTS.safetyScoreTarget).length;

  assert.ok(average >= 92 && average <= 94, `fleet average ${average}`);
  assert.equal(atTarget, 12);
  assert.ok(Math.max(...scores) < 100, 'normal operation should not look perfect');
  assert.ok(Math.min(...scores) <= 76, 'the severe speeding outlier must remain visible');
});

test('each unsafe factor still makes an independent auditable deduction', () => {
  const cases = [
    tripFromRates(8, 0, 0, 0),
    tripFromRates(0, 15, 0, 0),
    tripFromRates(0, 0, 15, 0),
    tripFromRates(0, 0, 0, 100),
  ];

  cases.forEach((trip) => {
    const result = calculateTripMetrics([trip], SCORE_DEFAULTS);
    assert.ok(result.penalty > 0);
    assert.ok(result.score < 100);
  });
});
