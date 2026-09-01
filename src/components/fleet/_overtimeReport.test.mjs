import test from 'node:test'
import assert from 'node:assert/strict'
import { buildOvertimeReportData } from './overtimeReportData.js'
import { OVERTIME_TYPES } from './overtimeCalculations.js'

test('builds monthly totals for drivers and Mohammed Israr without requiring a vehicle', () => {
  const report = buildOvertimeReportData('2026-08', [
    {
      driverName: 'Mohammed Israr', employeeType: 'labor', registration: '', vehicleType: '',
      date: '2026-08-08', day: 'Saturday', startTime: '08:00', finishTime: '11:00',
      durationMinutes: 180, overtimeType: OVERTIME_TYPES.OFF_DAY, reason: 'Warehouse support',
    },
  ], [
    { driverName: 'Bus Driver', employeeType: 'driver', registration: 'A1' },
    { driverName: 'Mohammed Israr', employeeType: 'labor', registration: '' },
  ])
  assert.equal(report.insights.totalMinutes, 180)
  assert.equal(report.totals[0].driverName, 'Mohammed Israr')
  assert.equal(report.totals[0].employeeType, 'labor')
  assert.equal(report.details[0].registration, '')
  assert.equal(report.details[0].role, 'Labor')
})
