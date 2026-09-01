import { calculateTripMetrics, SCORE_DEFAULTS } from './scoreCalculation.js'
import { canonicalFleetRegistration, deduplicateCanonicalTrips, mergeCanonicalVehicles } from '../../services/fleetIdentity.js'

export const FLEET_KPI_CALCULATION_VERSION = 1

export const DEFAULT_FLEET_KPI_SETTINGS = {
  calculationVersion: FLEET_KPI_CALCULATION_VERSION,
  targetYear: 2026,
  overallTarget: 60,
  vehicleSafetyTarget: 90,
  maintenanceComplianceTarget: 85,
  safetyCoverageTarget: 80,
  speedingReductionTarget: 10,
  fineFreeTarget: 100,
  fuelConsumptionTargetL100km: null,
  weights: {
    averageVehicleScore: 25,
    maintenanceCompliance: 25,
    safetyCoverage: 20,
    fuelAttainment: 15,
    speedingReduction: 10,
    fineFreeRate: 5,
  },
}

export function validKpiWeights(weights = DEFAULT_FLEET_KPI_SETTINGS.weights) {
  const values = Object.values(weights).map(Number)
  return values.every((value) => Number.isFinite(value) && value >= 0)
    && Math.abs(values.reduce((sum, value) => sum + value, 0) - 100) < 0.001
}

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Number(value)))
const number = (value) => Number(value) || 0
const iso = (value) => {
  const date = new Date(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function halfYearRange(date = new Date()) {
  const year = date.getFullYear()
  const second = date.getMonth() >= 6
  const start = new Date(year, second ? 6 : 0, 1)
  const end = new Date(year, second ? 12 : 6, 0)
  const previousEnd = new Date(start.getFullYear(), start.getMonth(), 0)
  const previousStart = new Date(previousEnd.getFullYear(), previousEnd.getMonth() - 5, 1)
  return {
    label: `${year} H${second ? 2 : 1}`,
    start: iso(start), end: iso(end),
    previousStart: iso(previousStart), previousEnd: iso(previousEnd),
  }
}

const tripVehicleMetrics = (trips, scoreSettings) => {
  const grouped = new Map()
  trips.forEach((trip) => {
    const registration = canonicalFleetRegistration(trip.registration)
    if (!grouped.has(registration)) grouped.set(registration, [])
    grouped.get(registration).push(trip)
  })
  return [...grouped.entries()].map(([registration, rows]) => ({
    registration,
    ...calculateTripMetrics(rows, scoreSettings),
  }))
}

function speedingRate(trips) {
  const km = trips.reduce((sum, trip) => sum + number(trip.trip_distance) / 1000, 0)
  const events = trips.reduce((sum, trip) => sum + number(trip.road_speeding_events ?? trip.speeding_events), 0)
  return { events, km, rate: km > 0 ? (events / km) * 1000 : null }
}

function finesForRange(fines, start, end, busSet) {
  return fines.filter((fine) => {
    const date = String(fine.date || '').slice(0, 10)
    const registration = canonicalFleetRegistration(fine.vehicleReg || fine.plateNumber || fine.registration)
    return date >= start && date <= end && busSet.has(registration)
  })
}

const targetAttainment = (actual, target, lowerIsBetter = false) => {
  if (actual == null || target == null) return null
  if (!Number.isFinite(Number(actual)) || !Number.isFinite(Number(target)) || Number(target) <= 0) return null
  return lowerIsBetter
    ? clamp((Number(target) / Number(actual)) * 100)
    : clamp((Number(actual) / Number(target)) * 100)
}

/** Pure fleet KPI engine used by Overview, Reports, snapshots and Strategy. */
export function calculateFleetPerformance({
  vehicles = [], currentTrips = [], previousTrips = [], fines = [],
  fuel = null, maintenance = null, settings = DEFAULT_FLEET_KPI_SETTINGS,
  scoreSettings = SCORE_DEFAULTS, now = new Date(),
}) {
  const config = {
    ...DEFAULT_FLEET_KPI_SETTINGS,
    ...settings,
    weights: { ...DEFAULT_FLEET_KPI_SETTINGS.weights, ...(settings.weights || {}) },
  }
  if (!validKpiWeights(config.weights)) throw new Error('Fleet KPI weights must total 100%.')

  const canonicalVehicles = mergeCanonicalVehicles(vehicles)
  const busSet = new Set(canonicalVehicles.map((vehicle) => canonicalFleetRegistration(vehicle.registration)))
  const current = deduplicateCanonicalTrips(currentTrips).filter((trip) => busSet.has(trip.registration))
  const previous = deduplicateCanonicalTrips(previousTrips).filter((trip) => busSet.has(trip.registration))
  const vehicleScores = tripVehicleMetrics(current, { ...SCORE_DEFAULTS, ...scoreSettings })
    .filter((vehicle) => vehicle.score != null)
  const averageVehicleScore = vehicleScores.length
    ? vehicleScores.reduce((sum, vehicle) => sum + vehicle.score, 0) / vehicleScores.length : null
  const safeVehicles = vehicleScores.filter((vehicle) => vehicle.score >= config.vehicleSafetyTarget).length
  const safetyCoverage = vehicleScores.length ? (safeVehicles / vehicleScores.length) * 100 : null
  const scoreDataCoverage = canonicalVehicles.length ? (vehicleScores.length / canonicalVehicles.length) * 100 : 0

  const currentSpeeding = speedingRate(current)
  const previousSpeeding = speedingRate(previous)
  const speedingReduction = currentSpeeding.rate != null && previousSpeeding.rate != null
    ? previousSpeeding.rate === 0
      ? (currentSpeeding.rate === 0 ? 100 : -100)
      : ((previousSpeeding.rate - currentSpeeding.rate) / previousSpeeding.rate) * 100
    : null

  const half = halfYearRange(now)
  const currentFines = finesForRange(fines, half.start, half.end, busSet)
  const previousFines = finesForRange(fines, half.previousStart, half.previousEnd, busSet)
  const affected = new Map()
  currentFines.forEach((fine) => {
    const registration = canonicalFleetRegistration(fine.vehicleReg || fine.plateNumber || fine.registration)
    affected.set(registration, (affected.get(registration) || 0) + 1)
  })
  const fineFreeRate = canonicalVehicles.length
    ? ((canonicalVehicles.length - affected.size) / canonicalVehicles.length) * 100 : null

  const fuelConsumption = fuel && Number(fuel.totalLitres) > 0 && Number(fuel.totalKm) > 0 && fuel.coverageComplete !== false
    ? (Number(fuel.totalLitres) / Number(fuel.totalKm)) * 100 : null
  const previousFuelConsumption = fuel?.previousConsumptionL100km != null && Number.isFinite(Number(fuel.previousConsumptionL100km))
    ? Number(fuel.previousConsumptionL100km) : null
  const fuelChangePercent = fuelConsumption != null && previousFuelConsumption > 0
    ? ((fuelConsumption - previousFuelConsumption) / previousFuelConsumption) * 100 : null
  const fuelTargetVariance = fuelConsumption != null && config.fuelConsumptionTargetL100km != null
    ? fuelConsumption - Number(config.fuelConsumptionTargetL100km) : null
  const fuelAttainment = targetAttainment(fuelConsumption, config.fuelConsumptionTargetL100km, true)

  const maintenanceCompliance = Number.isFinite(Number(maintenance?.value)) ? Number(maintenance.value) : null
  const speedingAttainment = speedingReduction == null
    ? null
    : targetAttainment(Math.max(0, speedingReduction), config.speedingReductionTarget)
  const metrics = {
    averageVehicleScore: { value: averageVehicleScore, subscore: averageVehicleScore == null ? null : clamp(averageVehicleScore), weight: config.weights.averageVehicleScore },
    maintenanceCompliance: { value: maintenanceCompliance, subscore: targetAttainment(maintenanceCompliance, config.maintenanceComplianceTarget), weight: config.weights.maintenanceCompliance },
    safetyCoverage: { value: safetyCoverage, subscore: targetAttainment(safetyCoverage, config.safetyCoverageTarget), weight: config.weights.safetyCoverage },
    fuelAttainment: { value: fuelConsumption, subscore: fuelAttainment, weight: config.weights.fuelAttainment },
    speedingReduction: { value: speedingReduction, subscore: speedingAttainment, weight: config.weights.speedingReduction },
    fineFreeRate: { value: fineFreeRate, subscore: targetAttainment(fineFreeRate, config.fineFreeTarget), weight: config.weights.fineFreeRate },
  }
  const availableWeight = Object.values(metrics).reduce((sum, metric) => sum + (metric.subscore == null ? 0 : metric.weight), 0)
  const weightedPoints = Object.values(metrics).reduce((sum, metric) => sum + (metric.subscore == null ? 0 : metric.subscore * metric.weight), 0)
  const overallScore = availableWeight >= 80 ? weightedPoints / availableWeight : null

  return {
    calculationVersion: FLEET_KPI_CALCULATION_VERSION,
    calculatedAt: now.toISOString(),
    targetYear: config.targetYear,
    overallTarget: config.overallTarget,
    overallScore,
    provisional: overallScore != null && availableWeight < 100,
    availableWeight,
    metrics,
    vehicleScores,
    scoreDataCoverage,
    trafficViolations: {
      period: half.label,
      count: currentFines.length,
      previousCount: previousFines.length,
      affectedVehicles: affected.size,
      repeatVehicles: [...affected.values()].filter((count) => count > 1).length,
    },
    speeding: { current: currentSpeeding, previous: previousSpeeding, reduction: speedingReduction },
    fuel: {
      consumptionL100km: fuelConsumption,
      previousConsumptionL100km: previousFuelConsumption,
      changePercent: fuelChangePercent,
      targetL100km: config.fuelConsumptionTargetL100km,
      targetVariance: fuelTargetVariance,
      coverageComplete: fuel?.coverageComplete === true,
    },
    maintenance: maintenance || { value: null, due: 0, onTime: 0 },
    coverage: { registeredBuses: canonicalVehicles.length, scoredBuses: vehicleScores.length, scorePercent: scoreDataCoverage },
    settings: config,
  }
}
