import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isKnownBusRegistration,
  resolveKnownBusRegistration,
} from './fleetMapping.js'

test('confirmed buses resolve from full and number-only registrations', () => {
  assert.equal(resolveKnownBusRegistration('M85750'), 'M85750')
  assert.equal(resolveKnownBusRegistration('85750'), 'M85750')
  assert.equal(resolveKnownBusRegistration(' 37074 '), 'C37074')
  assert.equal(isKnownBusRegistration('37074'), true)
  assert.equal(resolveKnownBusRegistration('C37072-CAM'), 'C37072')
  assert.equal(resolveKnownBusRegistration('A33867-CAM'), 'A33867')
})

test('unregistered numeric car plates are not classified as buses', () => {
  assert.equal(resolveKnownBusRegistration('15143'), '15143')
  assert.equal(isKnownBusRegistration('15143'), false)
  assert.equal(isKnownBusRegistration('26484'), false)
  assert.equal(isKnownBusRegistration('45267'), false)
})
