import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateFleetPerformance, halfYearRange, validKpiWeights } from './fleetPerformance.js'

test('half-year boundaries are calendar correct', () => {
  assert.deepEqual(halfYearRange(new Date('2026-01-01T12:00:00')).start, '2026-01-01')
  assert.deepEqual(halfYearRange(new Date('2026-06-30T12:00:00')).end, '2026-06-30')
  assert.deepEqual(halfYearRange(new Date('2026-07-01T12:00:00')).start, '2026-07-01')
  assert.deepEqual(halfYearRange(new Date('2026-12-31T12:00:00')).end, '2026-12-31')
})

test('weight validation rejects settings that do not total 100', () => {
  assert.equal(validKpiWeights({ a: 50, b: 50 }), true)
  assert.equal(validKpiWeights({ a: 40, b: 50 }), false)
})

test('missing weighted data does not turn into a false zero score', () => {
  const result = calculateFleetPerformance({ vehicles: [{ registration: 'C37072', odometer: 1 }] })
  assert.equal(result.overallScore, null)
  assert.equal(result.availableWeight, 5)
})

test('parent and camera trips produce one scored bus', () => {
  const trip = {
    start_timestamp: '2026-08-01 08:00:00', end_timestamp: '2026-08-01 09:00:00',
    trip_distance: 10000, trip_duration_seconds: 3600, road_speeding_duration_seconds: 0,
    road_speeding_events: 0,
  }
  const result = calculateFleetPerformance({
    vehicles: [{ registration: 'C37072' }, { registration: 'C37072-CAM' }],
    currentTrips: [{ ...trip, registration: 'C37072', trip_id: 'a' }, { ...trip, registration: 'C37072-CAM', trip_id: 'b' }],
  })
  assert.equal(result.coverage.registeredBuses, 1)
  assert.equal(result.coverage.scoredBuses, 1)
})

test('fuel KPI exposes verified prior-period and target variance', () => {
  const result = calculateFleetPerformance({
    vehicles: [{ registration: 'C37072' }],
    fuel: { totalLitres: 800, totalKm: 4000, previousConsumptionL100km: 25, coverageComplete: true },
    settings: { fuelConsumptionTargetL100km: 22 },
  })
  assert.equal(result.fuel.consumptionL100km, 20)
  assert.equal(result.fuel.changePercent, -20)
  assert.equal(result.fuel.targetVariance, -2)
})
