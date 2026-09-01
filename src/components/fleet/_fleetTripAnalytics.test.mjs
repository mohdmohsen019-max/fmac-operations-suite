import assert from 'node:assert/strict'
import test from 'node:test'
import { buildDriverMonthlyTrips, buildExternalTransportationInsights } from './fleetTripAnalytics.js'

const people = [
  { id: 'driver-1', displayName: 'Driver One', personType: 'driver', active: true },
  { id: 'staff-1', displayName: 'Staff One', personType: 'staff', active: true },
]

test('monthly driver trips count each ridership session as an outbound and return trip', () => {
  const result = buildDriverMonthlyTrips({
    people,
    assignments: [{ id: 'assignment-1', vehicleRegistration: 'M85750', personId: 'driver-1', personName: 'Driver One', status: 'active', effectiveDate: '2026-01-01' }],
    ridershipCounts: [
      { id: 'session-1', date: '2026-08-02', classId: 'bus_m85750_s1', classSnapshot: { registration: 'M85750' } },
      { id: 'session-2', date: '2026-08-03', classId: 'bus_m85750_s2', classSnapshot: { registration: 'M85750' } },
      { id: 'old-session', date: '2026-07-31', classSnapshot: { registration: 'M85750' } },
    ],
    externalRecords: [{ id: 'external-1', date: '2026-08-04', personId: 'driver-1' }, { id: 'external-2', date: '2026-08-05', personId: 'staff-1' }],
    month: '2026-08',
  })

  assert.equal(result.totals.internalSessions, 2)
  assert.equal(result.totals.internalTrips, 4)
  assert.equal(result.totals.externalTrips, 1)
  assert.equal(result.totals.trips, 5)
  assert.deepEqual(result.rows.map((row) => [row.personId, row.internalTrips, row.externalTrips, row.totalTrips]), [
    ['driver-1', 4, 1, 5],
  ])
})

test('external transportation insights rank people, vehicles and reasons for the selected dates', () => {
  const result = buildExternalTransportationInsights({
    people,
    vehicles: [{ registration: 'M85750', vehicleClass: 'bus' }, { registration: 'A15143', vehicleClass: 'car' }],
    records: [
      { id: '1', date: '2026-08-01', personId: 'driver-1', vehicleRegistration: 'M85750', reason: 'Competition', plateMatchStatus: 'matched' },
      { id: '2', date: '2026-08-01', personId: 'driver-1', vehicleRegistration: 'M85750', reason: 'Competition', plateMatchStatus: 'matched' },
      { id: '3', date: '2026-08-02', personId: 'staff-1', vehicleRegistration: 'A15143', reason: 'Airport', plateMatchStatus: 'matched' },
      { id: '4', date: '2026-07-31', personId: 'staff-1', vehicleRegistration: '', reason: 'Old', plateMatchStatus: 'unmatched' },
    ],
    from: '2026-08-01',
    to: '2026-08-31',
  })

  assert.equal(result.records.length, 3)
  assert.deepEqual(result.vehicles[0], { key: 'M85750', label: 'M85750', vehicleClass: 'bus', count: 2 })
  assert.deepEqual(result.drivers[0], { key: 'driver-1', label: 'Driver One', personType: 'driver', count: 2 })
  assert.deepEqual(result.reasons[0], { key: 'Competition', label: 'Competition', count: 2 })
  assert.equal(result.unmatched, 0)
})
