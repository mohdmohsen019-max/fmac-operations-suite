import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  collection, doc, getDoc, getDocs, onSnapshot, serverTimestamp, setDoc,
} from 'firebase/firestore'
import { endOfDay, format, startOfDay, subDays } from 'date-fns'
import { auth, db } from '../../firebase'
import { cartrackService } from '../../services/cartrackService'
import { isKnownBusRegistration } from '../../services/fleetMapping'
import { buildFleetAliasMap, canonicalFleetRegistration, deduplicateCanonicalTrips, mergeCanonicalVehicles } from '../../services/fleetIdentity'
import { SCORE_DEFAULTS } from './scoreCalculation'
import {
  DEFAULT_FLEET_KPI_SETTINGS, calculateFleetPerformance, validKpiWeights,
} from './fleetPerformance'
import {
  DEFAULT_MAINTENANCE_TEMPLATES, buildPreventiveInsights, buildPreventivePlanRows, maintenanceCompliance,
} from './maintenance/preventiveMaintenance'

const SETTINGS_DOC = 'current'

const monthRange = (statement) => {
  const year = Number(statement?.year)
  const month = Number(statement?.month)
  if (!year || !month) return null
  return {
    start: `${year}-${String(month).padStart(2, '0')}-01`,
    end: format(new Date(year, month, 0), 'yyyy-MM-dd'),
    key: `${year}-${String(month).padStart(2, '0')}`,
  }
}

function fuelInput(statement, trips, vehicles) {
  if (!statement) return null
  const range = monthRange(statement)
  if (!range) return null
  const busSet = new Set(vehicles.map((vehicle) => vehicle.registration))
  const allocations = Array.isArray(statement.vehicleAllocations) ? statement.vehicleAllocations : []
  const busAllocations = allocations.filter((allocation) => isKnownBusRegistration(allocation.plate))
  const totalLitres = busAllocations.length
    ? busAllocations.reduce((sum, allocation) => sum + (Number(allocation.litres) || 0), 0)
    : Number(statement.totalLitres) || 0
  const monthTrips = trips.filter((trip) => {
    const day = String(trip.start_timestamp || trip.clock_start || '').slice(0, 10)
    return day >= range.start && day <= range.end && busSet.has(trip.registration)
  })
  const totalKm = monthTrips.reduce((sum, trip) => sum + (Number(trip.trip_distance) || 0) / 1000, 0)
    || Number(statement.totalKm) || 0
  const allocationsAreBusOnly = !allocations.length || busAllocations.length === allocations.length
  return {
    totalLitres, totalKm,
    coverageComplete: allocationsAreBusOnly && totalLitres > 0 && totalKm > 0,
    statementId: statement.id, period: range.key,
  }
}

export function useFleetPerformance({ enabled = true, scoreSettings = SCORE_DEFAULTS } = {}) {
  const [settings, setSettingsState] = useState(DEFAULT_FLEET_KPI_SETTINGS)
  const [snapshots, setSnapshots] = useState([])
  const [state, setState] = useState({ loading: enabled, refreshing: false, error: '', data: null })

  useEffect(() => {
    if (!enabled) return undefined
    return onSnapshot(doc(db, 'fleet_kpi_settings', SETTINGS_DOC), (snapshot) => {
      const stored = snapshot.exists() ? snapshot.data() : {}
      setSettingsState({
        ...DEFAULT_FLEET_KPI_SETTINGS,
        ...stored,
        weights: { ...DEFAULT_FLEET_KPI_SETTINGS.weights, ...(stored.weights || {}) },
      })
    }, (error) => console.error('Fleet KPI settings subscription failed:', error))
  }, [enabled])

  useEffect(() => {
    if (!enabled) return undefined
    return onSnapshot(collection(db, 'fleet_kpi_snapshots'), (snapshot) => {
      setSnapshots(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
        .sort((a, b) => String(a.period || a.id).localeCompare(String(b.period || b.id))))
    }, (error) => console.error('Fleet KPI snapshots subscription failed:', error))
  }, [enabled])

  const refresh = useCallback(async ({ persist = false } = {}) => {
    if (!enabled) return null
    setState((current) => ({ ...current, loading: !current.data, refreshing: true, error: '' }))
    try {
      const currentEnd = endOfDay(subDays(new Date(), 1))
      const currentStart = startOfDay(subDays(currentEnd, 29))
      const previousStart = startOfDay(subDays(currentStart, 30))
      const [vehicleRows, metaSnap, finesSnap, fuelSnap, maintenanceSnap, plansSnap, templatesSnap] = await Promise.all([
        cartrackService.getVehicles('all'),
        getDocs(collection(db, 'fleet_vehicle_meta')),
        getDocs(collection(db, 'fleet_fines')),
        getDocs(collection(db, 'fuelStatements')),
        getDocs(collection(db, 'maintenance')),
        getDocs(collection(db, 'fleet_maintenance_plans')),
        getDocs(collection(db, 'fleet_maintenance_templates')),
      ])
      const metaMap = new Map(metaSnap.docs.map((item) => [item.id, { id: item.id, ...item.data() }]))
      const aliasMap = buildFleetAliasMap(metaMap)
      const vehicles = mergeCanonicalVehicles(
        (vehicleRows || []).filter((vehicle) => isKnownBusRegistration(canonicalFleetRegistration(vehicle.registration, aliasMap))),
        aliasMap,
      )
        .map((vehicle) => ({ ...vehicle, odoKm: Math.round((Number(vehicle.odometer) || 0) / 1000) }))
      const fuelStatements = fuelSnap.docs.map((item) => ({ id: item.id, ...item.data() }))
        .sort((a, b) => `${b.year || 0}-${String(b.month || 0).padStart(2, '0')}`.localeCompare(`${a.year || 0}-${String(a.month || 0).padStart(2, '0')}`))
      const latestFuel = fuelStatements[0] || null
      const previousFuelStatement = fuelStatements[1] || null
      const fuelRange = monthRange(latestFuel)
      const previousFuelRange = monthRange(previousFuelStatement)
      const tripStart = [format(previousStart, 'yyyy-MM-dd'), fuelRange?.start, previousFuelRange?.start]
        .filter(Boolean).sort()[0]
      const allTrips = await cartrackService.getTrips(
        `${tripStart} 00:00:00`, format(currentEnd, 'yyyy-MM-dd HH:mm:ss'),
      ) || []
      const trips = deduplicateCanonicalTrips(allTrips, aliasMap)
      const currentStartKey = format(currentStart, 'yyyy-MM-dd')
      const previousStartKey = format(previousStart, 'yyyy-MM-dd')
      const currentEndKey = format(currentEnd, 'yyyy-MM-dd')
      const currentTrips = trips.filter((trip) => {
        const day = String(trip.start_timestamp || trip.clock_start || '').slice(0, 10)
        return day >= currentStartKey && day <= currentEndKey
      })
      const previousTrips = trips.filter((trip) => {
        const day = String(trip.start_timestamp || trip.clock_start || '').slice(0, 10)
        return day >= previousStartKey && day < currentStartKey
      })
      const distanceByVehicle = new Map()
      currentTrips.forEach((trip) => distanceByVehicle.set(
        trip.registration,
        (distanceByVehicle.get(trip.registration) || 0) + (Number(trip.trip_distance) || 0) / 1000,
      ))
      const vehiclesWithUsage = vehicles.map((vehicle) => ({
        ...vehicle,
        avgDailyKm: (distanceByVehicle.get(vehicle.registration) || 0) / 30,
      }))
      const records = maintenanceSnap.docs.map((item) => ({ id: item.id, ...item.data() }))
      const plans = plansSnap.docs.map((item) => ({ id: item.id, ...item.data() }))
      const templates = templatesSnap.empty
        ? DEFAULT_MAINTENANCE_TEMPLATES
        : templatesSnap.docs.map((item) => ({ id: item.id, ...item.data() }))
      const planRows = buildPreventivePlanRows({ vehicles: vehiclesWithUsage, templates, plans, records })
      const preventiveInsights = buildPreventiveInsights({ records, rows: planRows })
      const monthStart = format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd')
      const monthEnd = format(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0), 'yyyy-MM-dd')
      const compliance = maintenanceCompliance({ records, rows: planRows, startDate: monthStart, endDate: monthEnd })
      const currentFuel = fuelInput(latestFuel, trips, vehiclesWithUsage)
      const previousFuel = fuelInput(previousFuelStatement, trips, vehiclesWithUsage)
      const fuel = currentFuel ? {
        ...currentFuel,
        previousConsumptionL100km: previousFuel?.coverageComplete
          ? (previousFuel.totalLitres / previousFuel.totalKm) * 100 : null,
      } : null
      const effectiveSettings = settings.fuelConsumptionTargetL100km == null && fuel?.coverageComplete
        ? { ...settings, fuelConsumptionTargetL100km: (fuel.totalLitres / fuel.totalKm) * 100 }
        : settings
      const result = calculateFleetPerformance({
        vehicles: vehiclesWithUsage, currentTrips, previousTrips,
        fines: finesSnap.docs.map((item) => ({ id: item.id, ...item.data() })),
        fuel, maintenance: compliance, settings: effectiveSettings, scoreSettings,
      })
      const enriched = {
        ...result,
        planRows,
        preventiveInsights,
        fuelTargetSeeded: settings.fuelConsumptionTargetL100km == null && fuel?.coverageComplete,
      }
      setState({ loading: false, refreshing: false, error: '', data: enriched })
      if (persist) {
        if (settings.fuelConsumptionTargetL100km == null && fuel?.coverageComplete) {
          await setDoc(doc(db, 'fleet_kpi_settings', SETTINGS_DOC), {
            fuelConsumptionTargetL100km: effectiveSettings.fuelConsumptionTargetL100km,
            fuelTargetSeedPeriod: fuel.period,
            updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.email || '',
          }, { merge: true })
        }
        const period = format(new Date(), 'yyyy-MM')
        const snapshotRef = doc(db, 'fleet_kpi_snapshots', period)
        const existingSnapshot = await getDoc(snapshotRef)
        if (!existingSnapshot.exists()) {
          await setDoc(snapshotRef, {
            ...result, period, refreshedAt: serverTimestamp(), refreshedBy: auth.currentUser?.email || '',
          }, { merge: false })
        }
      }
      return enriched
    } catch (error) {
      console.error('Fleet performance refresh failed:', error)
      setState((current) => ({ ...current, loading: false, refreshing: false, error: error.message || String(error) }))
      return null
    }
  }, [enabled, scoreSettings, settings])

  useEffect(() => { if (enabled) refresh() }, [enabled, refresh])

  const saveSettings = useCallback(async (next) => {
    const merged = {
      ...settings, ...next,
      weights: { ...settings.weights, ...(next.weights || {}) },
    }
    if (!validKpiWeights(merged.weights)) throw new Error('KPI weights must total 100%.')
    await setDoc(doc(db, 'fleet_kpi_settings', SETTINGS_DOC), {
      ...merged, updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.email || '',
    }, { merge: true })
  }, [settings])

  return useMemo(() => ({ ...state, settings, snapshots, refresh, saveSettings }), [state, settings, snapshots, refresh, saveSettings])
}
