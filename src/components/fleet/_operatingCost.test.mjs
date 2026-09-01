import assert from 'node:assert/strict'
import { buildOperatingCostRows, latestFuelStatements, operatingCostMonthRange } from './operatingCost.js'

const aliases = new Map([
  ['37072', 'C37072'], ['C37072', 'C37072'], ['C37072-CAM', 'C37072'],
  ['33867', 'A33867'], ['A33867', 'A33867'], ['A33867-CAM', 'A33867'],
])
const canonicalize = (value) => aliases.get(String(value || '').toUpperCase()) || String(value || '').toUpperCase()

const statements = latestFuelStatements([
  { id: 'old', year: 2026, month: 7, createdAt: { seconds: 1 }, vehicleAllocations: [] },
  { id: 'new', year: 2026, month: 7, createdAt: { seconds: 2 }, vehicleAllocations: [{ plate: '37072', cost: 100 }] },
  { id: 'june', year: 2026, month: 6, createdAt: { seconds: 3 }, vehicleAllocations: [] },
])
assert.deepEqual(statements.map((item) => item.statement.id), ['new', 'june'])
assert.deepEqual(operatingCostMonthRange('2026-11', '2027-02'), ['2026-11', '2026-12', '2027-01', '2027-02'])

const result = buildOperatingCostRows({
  busRegistrations: ['C37072', 'A33867'],
  statement: {
    year: 2026,
    month: 7,
    vehicleAllocations: [
      { plate: '37072', cost: 1000, litres: 300 },
      { plate: 'A33867', cost: 500, litres: 150 },
    ],
  },
  maintenanceRecords: [
    { plateNumber: 'C37072', date: '2026-07-10', total: 250 },
    { plateNumber: 'A33867', date: '2026-06-30', total: 999 },
  ],
  fines: [
    { vehicleReg: '37072', date: '2026-07-20', amountAed: 150, status: 'ignored' },
    { vehicleReg: 'A33867', date: '2026-07-21', amountAed: 300 },
  ],
  // Parent and -CAM duplicates have already been removed by fleetIdentity.
  trips: [
    { registration: 'C37072', trip_distance: 4000000 },
    { registration: 'A33867', trip_distance: 7000000 },
  ],
  canonicalize,
  metadataFor: (registration) => ({ driverName: registration === 'C37072' ? 'Driver One' : 'Driver Two' }),
})

assert.equal(result.rows[0].registration, 'C37072')
assert.equal(result.rows[0].totalCost, 1400)
assert.equal(result.rows[0].costPerKm, 0.35)
assert.equal(result.rows[1].totalCost, 800)
assert.equal(result.summary.totalFuel, 1500)
assert.equal(result.summary.totalMaintenance, 250)
assert.equal(result.summary.totalFines, 450)
assert.equal(result.summary.totalCost, 2200)

const multiMonth = buildOperatingCostRows({
  busRegistrations: ['C37072'],
  periodKeys: ['2026-06', '2026-07', '2026-08'],
  statements: [
    { year: 2026, month: 6, vehicleAllocations: [{ plate: 'C37072', cost: 600, litres: 180 }] },
    { year: 2026, month: 7, vehicleAllocations: [{ plate: 'C37072-CAM', cost: 700, litres: 210 }] },
  ],
  maintenanceRecords: [
    { plateNumber: 'C37072', date: '2026-06-10', total: 100 },
    { plateNumber: 'C37072', date: '2026-08-10', total: 900 },
  ],
  fines: [
    { vehicleReg: 'C37072', date: '2026-07-02', amountAed: 200 },
    { vehicleReg: 'C37072', date: '2026-08-02', amountAed: 500 },
  ],
  trips: [
    { registration: 'C37072', start_timestamp: '2026-06-04 10:00:00', trip_distance: 1000000 },
    { registration: 'C37072', start_timestamp: '2026-07-04 10:00:00', trip_distance: 2000000 },
    { registration: 'C37072', start_timestamp: '2026-08-04 10:00:00', trip_distance: 9000000 },
  ],
  canonicalize,
})
assert.deepEqual(multiMonth.summary.includedPeriodKeys, ['2026-06', '2026-07'])
assert.deepEqual(multiMonth.summary.missingPeriodKeys, ['2026-08'])
assert.equal(multiMonth.summary.fuelComplete, false)
assert.equal(multiMonth.rows[0].fuelCost, 1300)
assert.equal(multiMonth.rows[0].maintenanceCost, 100)
assert.equal(multiMonth.rows[0].fineCost, 200)
assert.equal(multiMonth.rows[0].distanceKm, 3000)
assert.equal(multiMonth.rows[0].totalCost, 1600)

const unavailable = buildOperatingCostRows({ busRegistrations: ['C37072'], statement: { year: 2026, month: 7 } })
assert.equal(unavailable.rows[0].fuelCost, null)
assert.equal(unavailable.rows[0].totalCost, null)
assert.equal(unavailable.summary.totalCost, null)

console.log('operatingCost tests passed')
