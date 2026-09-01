import test from 'node:test'
import assert from 'node:assert/strict'
import {
  OVERTIME_TYPES,
  calculateOvertimeMinutes,
  overtimeTypeForDate,
  previousMonthKey,
  buildDriverMonthlyTotals,
} from './overtimeCalculations.js'

test('calculates same-day and overnight overtime', () => {
  assert.equal(calculateOvertimeMinutes('17:30', '20:00'), 150)
  assert.equal(calculateOvertimeMinutes('22:30', '01:15'), 165)
  assert.equal(calculateOvertimeMinutes('08:00', '08:00'), 0)
})

test('classifies Saturday as the off day', () => {
  assert.equal(overtimeTypeForDate('2026-08-08'), OVERTIME_TYPES.OFF_DAY)
  assert.equal(overtimeTypeForDate('2026-08-09'), OVERTIME_TYPES.WORKING_DAY)
})

test('returns the previous calendar month', () => {
  assert.equal(previousMonthKey('2026-01'), '2025-12')
  assert.equal(previousMonthKey('2026-08'), '2026-07')
})

test('keeps zero-hour drivers and combines entries per driver', () => {
  const totals = buildDriverMonthlyTotals([
    { driverName: 'A', registration: 'M1', durationMinutes: 120, overtimeType: OVERTIME_TYPES.WORKING_DAY },
    { driverName: 'A', registration: 'M1', durationMinutes: 180, overtimeType: OVERTIME_TYPES.OFF_DAY },
  ], [
    { driverName: 'A', employeeType: 'driver', registration: 'M1' },
    { driverName: 'B', employeeType: 'driver', registration: 'M2' },
    { driverName: 'Mohammed Israr', employeeType: 'labor', registration: '' },
  ])
  assert.equal(totals[0].driverName, 'A')
  assert.equal(totals[0].totalMinutes, 300)
  assert.equal(totals[0].offDayMinutes, 180)
  assert.equal(totals[1].driverName, 'B')
  assert.equal(totals[1].totalMinutes, 0)
  assert.equal(totals[2].driverName, 'Mohammed Israr')
  assert.equal(totals[2].employeeType, 'labor')
})
