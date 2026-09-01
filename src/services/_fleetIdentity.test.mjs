import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildFleetAliasMap,
  canonicalFleetRegistration,
  deduplicateCanonicalTrips,
  mergeCanonicalVehicles,
  preferredTelemetryRegistration,
  telemetryRegistrationsForVehicle,
} from './fleetIdentity.js'

test('camera device aliases resolve to their physical bus', () => {
  assert.equal(canonicalFleetRegistration(' C37072-CAM '), 'C37072')
  assert.equal(canonicalFleetRegistration('A33867-CAM'), 'A33867')
})

test('C37072 uses only its camera telemetry row while retaining its canonical plate', () => {
  const vehicles = mergeCanonicalVehicles([
    { registration: 'C37072', odometer: 99900000 },
    { registration: 'C37072-CAM', odometer: 50100000 },
  ])
  assert.equal(vehicles.length, 1)
  assert.equal(vehicles[0].registration, 'C37072')
  assert.equal(vehicles[0].odometer, 50100000)
  assert.equal(vehicles[0].telemetrySourceRegistration, 'C37072-CAM')
  assert.equal(vehicles[0].sourceRegistration, undefined)
  assert.deepEqual(vehicles[0].telemetryAliases, ['C37072-CAM'])
})

test('C37072 parent trips are excluded instead of combined with camera trips', () => {
  const common = {
    start_timestamp: '2026-07-10 08:00:00',
    end_timestamp: '2026-07-10 08:30:00',
    trip_distance: 25000,
    trip_duration_seconds: 1800,
  }
  const trips = deduplicateCanonicalTrips([
    { ...common, trip_id: 'parent-1', registration: 'C37072' },
    { ...common, trip_id: 'camera-9', registration: 'C37072-CAM' },
  ])
  assert.equal(trips.length, 1)
  assert.equal(trips[0].registration, 'C37072')
  assert.equal(trips[0].sourceRegistration, 'C37072-CAM')
  assert.equal(trips[0].trip_id, 'camera-9')
})

test('preferred telemetry source can be configured without changing canonical identity', () => {
  const metaMap = new Map([['C37072', {
    plateNumber: 'C37072',
    telemetryAliases: ['C37072-CAM'],
    preferredTelemetryRegistration: 'C37072-CAM',
  }]])
  const aliases = buildFleetAliasMap(metaMap)
  assert.equal(canonicalFleetRegistration('C37072-CAM', aliases), 'C37072')
  assert.equal(preferredTelemetryRegistration('C37072', aliases), 'C37072-CAM')
  assert.deepEqual(telemetryRegistrationsForVehicle({
    registration: 'C37072', telemetryAliases: ['C37072-CAM'],
  }, aliases), ['C37072-CAM'])
})

test('manual Cartrack odometer correction advances with the CAM terminal', () => {
  const metaMap = new Map([['C37072', {
    plateNumber: 'C37072',
    telemetryAliases: ['C37072-CAM'],
    preferredTelemetryRegistration: 'C37072-CAM',
    odometerOffsetKm: 290317,
  }]])
  const aliases = buildFleetAliasMap(metaMap)
  const [vehicle] = mergeCanonicalVehicles([
    { registration: 'C37072', odometer: 328703000 },
    { registration: 'C37072-CAM', odometer: 50263000 },
  ], aliases)

  assert.equal(vehicle.registration, 'C37072')
  assert.equal(vehicle.telemetrySourceRegistration, 'C37072-CAM')
  assert.equal(vehicle.telemetryRawOdometer, 50263000)
  assert.equal(vehicle.odometerOffsetKm, 290317)
  assert.equal(vehicle.odometer, 340580000)
})

test('A33867 applies its verified universal odometer calibration', () => {
  const [vehicle] = mergeCanonicalVehicles([
    { registration: 'A33867', odometer: 451557000 },
  ])

  assert.equal(vehicle.registration, 'A33867')
  assert.equal(vehicle.telemetryRawOdometer, 451557000)
  assert.equal(vehicle.odometerOffsetKm, 16163)
  assert.equal(vehicle.odometer, 467720000)
})

test('M85756 applies its verified negative universal odometer calibration', () => {
  const [vehicle] = mergeCanonicalVehicles([
    { registration: 'M85756', odometer: 241158000 },
  ])

  assert.equal(vehicle.registration, 'M85756')
  assert.equal(vehicle.telemetryRawOdometer, 241158000)
  assert.equal(vehicle.odometerOffsetKm, -125520)
  assert.equal(vehicle.odometer, 115638000)
})
