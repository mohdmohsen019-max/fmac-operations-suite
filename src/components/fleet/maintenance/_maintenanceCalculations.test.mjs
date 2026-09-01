import assert from 'node:assert/strict'
import test from 'node:test'
import { componentLifecycle, oilStatusOf, partStatusOf } from './maintenanceCalculations.js'

test('configurable lifecycle status thresholds and boundaries', () => {
  assert.equal(partStatusOf(0.69, 70, 90), 'healthy')
  assert.equal(partStatusOf(0.70, 70, 90), 'due-soon')
  assert.equal(partStatusOf(0.90, 70, 90), 'due')
  assert.equal(partStatusOf(1, 70, 90), 'due')
  assert.equal(partStatusOf(1.01, 70, 90), 'overdue')
})

test('distance lifecycle handles missing and decreasing odometers safely', () => {
  const result = componentLifecycle({ currentKm: 9000, installedAtKm: 10000, part: { lifespanKm: 10000 } })
  assert.equal(result.usedKm, 0)
  assert.equal(result.pct, 0)
  assert.equal(result.status, 'healthy')
})

test('time lifecycle uses stored service date', () => {
  const result = componentLifecycle({
    currentKm: 0,
    installedAtKm: 0,
    installedDate: '2026-01-01',
    nowMs: new Date('2026-10-01T00:00:00Z').getTime(),
    part: { lifecycleBasis: 'time', lifespanDays: 365, warningThresholdPct: 70, dueThresholdPct: 90 },
  })
  assert.equal(result.usedDays, 273)
  assert.equal(result.status, 'due-soon')
})

test('oil status protects invalid intervals and detects overdue', () => {
  assert.equal(oilStatusOf(100, 0), 'none')
  assert.equal(oilStatusOf(-1, 10000), 'overdue')
  assert.equal(oilStatusOf(1000, 10000), 'due-soon')
  assert.equal(oilStatusOf(24366, 10000, 451557, 465923), 'invalid')
})
