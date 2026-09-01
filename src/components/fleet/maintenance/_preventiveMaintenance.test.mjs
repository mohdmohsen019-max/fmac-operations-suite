import test from 'node:test'
import assert from 'node:assert/strict'
import { FLEET_MAPPING } from '../../../services/fleetMapping.js'
import {
  DEFAULT_MAINTENANCE_TEMPLATES,
  buildPreventiveInsights,
  buildPreventivePlanRows,
  calculatePlanStatus,
  maintenanceCompliance,
  planDocumentId,
  templateCategoryFromRecord,
} from './preventiveMaintenance.js'

const now = new Date('2026-08-11T00:00:00')

test('all 14 confirmed buses receive every active preventive template', () => {
  const vehicles = Object.keys(FLEET_MAPPING).map((registration) => ({ registration, odoKm: 100000 }))
  const rows = buildPreventivePlanRows({ vehicles, templates: DEFAULT_MAINTENANCE_TEMPLATES, now })
  assert.equal(new Set(rows.map((row) => row.vehicleReg)).size, 14)
  assert.equal(rows.length, 14 * DEFAULT_MAINTENANCE_TEMPLATES.length)
})

test('the first mileage or calendar threshold controls the plan status', () => {
  assert.equal(calculatePlanStatus({ currentKm: 109500, lastServiceKm: 100000, lastServiceDate: '2026-08-01', intervalKm: 10000, intervalDays: 180, now }), 'due-soon')
  assert.equal(calculatePlanStatus({ currentKm: 101000, lastServiceKm: 100000, lastServiceDate: '2026-01-01', intervalKm: 10000, intervalDays: 180, now }), 'overdue')
  assert.equal(calculatePlanStatus({ currentKm: 111000, lastServiceKm: 100000, lastServiceDate: '2026-08-01', intervalKm: 10000, intervalDays: 180, now }), 'overdue')
  assert.equal(calculatePlanStatus({ currentKm: 101000, lastServiceKm: 100000, lastServiceDate: '2026-07-01', intervalKm: 10000, intervalDays: 30, now }), 'overdue')
  assert.equal(calculatePlanStatus({ currentKm: 101000, lastServiceKm: 100000, lastServiceDate: '2026-08-01', intervalKm: 10000, intervalDays: 180, now }), 'upcoming')
})

test('ordinary corrective workshop records do not create preventive due baselines', () => {
  const [row] = buildPreventivePlanRows({
    vehicles: [{ registration: 'C37074', odoKm: 213135 }],
    templates: [{ id: 'brakes', nameEn: 'Brakes', category: 'brakes', intervalKm: 10000, intervalDays: 90, active: true }],
    records: [{ registration: 'C37074', date: '2026-01-13', odometerKm: 211118, description: 'Brake repair', maintenanceType: 'corrective' }],
    now: new Date('2026-08-13T00:00:00'),
  })
  assert.equal(row.status, 'unconfigured')
  assert.equal(row.lastServiceKm, null)
  assert.equal(row.lastServiceDate, '')
})

test('preventive insights provide complete Arabic and English copy', () => {
  const [insight] = buildPreventiveInsights({
    rows: [{
      id: 'M99270__oil-service', vehicleReg: 'M99270', status: 'due-soon',
      template: { category: 'oil', nameEn: 'Engine oil service', nameAr: 'خدمة زيت المحرك' },
      remainingKm: 2500, remainingDays: 26, nextDueDate: '2026-09-08', controllingDueDate: '2026-09-08', nextDueKm: 249000,
    }],
  })
  assert.equal(insight.categoryEn, 'Engine oil')
  assert.equal(insight.categoryAr, 'زيت المحرك')
  assert.equal(insight.evidenceEn, '26 days remaining')
  assert.equal(insight.evidenceAr, 'متبقي 26 يوم')
  assert.match(insight.recommendationAr, /خدمة زيت المحرك/)
})

test('a future booking overrides calculated due status', () => {
  assert.equal(calculatePlanStatus({ currentKm: 120000, lastServiceKm: 100000, intervalKm: 10000, scheduledFor: '2026-08-15', now }), 'scheduled')
})

test('oil filters stay part of oil service instead of a standalone filter category', () => {
  assert.equal(templateCategoryFromRecord({ description: 'Engine oil and oil filter service' }), 'oil')
})

test('projected mileage gives an auditable expected service date', () => {
  const [row] = buildPreventivePlanRows({
    vehicles: [{ registration: 'C37072', odoKm: 105000, avgDailyKm: 100 }],
    templates: [{ id: 'brakes', nameEn: 'Brakes', category: 'brakes', intervalKm: 10000, intervalDays: 365, active: true }],
    plans: [{ id: planDocumentId('C37072', 'brakes'), vehicleReg: 'C37072', templateId: 'brakes', lastServiceKm: 100000, lastServiceDate: '2026-07-01' }],
    now: new Date('2026-08-11T00:00:00'),
  })
  assert.equal(row.projectedMileageDueDate, '2026-09-30')
  assert.equal(row.controllingDueDate, '2026-09-30')
})

test('compliance counts only work completed by its original due date', () => {
  const result = maintenanceCompliance({
    startDate: '2026-08-01', endDate: '2026-08-31', rows: [],
    records: [
      { maintenanceType: 'preventive', preventivePlanId: 'a', originalDueDate: '2026-08-10', completedAt: '2026-08-09' },
      { maintenanceType: 'preventive', preventivePlanId: 'b', originalDueDate: '2026-08-10', completedAt: '2026-08-12' },
    ],
  })
  assert.equal(result.due, 2)
  assert.equal(result.onTime, 1)
  assert.equal(result.value, 50)
})
