const number = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const timestamp = (value) => {
  if (!value) return 0
  if (typeof value?.toMillis === 'function') return value.toMillis()
  if (Number.isFinite(Number(value?.seconds))) return Number(value.seconds) * 1000
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

export const operatingCostPeriodKey = (year, month) => (
  `${Number(year)}-${String(Number(month)).padStart(2, '0')}`
)

export function operatingCostMonthRange(startKey, endKey) {
  if (!/^\d{4}-\d{2}$/.test(startKey || '') || !/^\d{4}-\d{2}$/.test(endKey || '') || startKey > endKey) return []
  const [startYear, startMonth] = startKey.split('-').map(Number)
  const [endYear, endMonth] = endKey.split('-').map(Number)
  const keys = []
  let year = startYear
  let month = startMonth
  while (year < endYear || (year === endYear && month <= endMonth)) {
    keys.push(operatingCostPeriodKey(year, month))
    month += 1
    if (month > 12) { month = 1; year += 1 }
  }
  return keys
}

export function dateKey(value) {
  if (!value) return ''
  if (typeof value?.toDate === 'function') {
    const parsed = value.toDate()
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10)
  }
  if (Number.isFinite(Number(value?.seconds))) {
    return new Date(Number(value.seconds) * 1000).toISOString().slice(0, 10)
  }
  const text = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10)
  const parsed = new Date(text)
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10)
}

/** Keep only the latest uploaded statement for each calendar month. */
export function latestFuelStatements(statements = []) {
  const latest = new Map()
  statements.forEach((statement) => {
    const year = Number(statement?.year)
    const month = Number(statement?.month)
    if (!Number.isInteger(year) || year < 2000 || !Number.isInteger(month) || month < 1 || month > 12) return
    const key = operatingCostPeriodKey(year, month)
    const previous = latest.get(key)
    const currentStamp = timestamp(statement.createdAt || statement.updatedAt)
    const previousStamp = timestamp(previous?.createdAt || previous?.updatedAt)
    if (!previous || currentStamp >= previousStamp) latest.set(key, statement)
  })
  return [...latest.entries()]
    .map(([key, statement]) => ({ key, year: Number(statement.year), month: Number(statement.month), statement }))
    .sort((a, b) => b.key.localeCompare(a.key))
}

const recordMonthKey = (record) => dateKey(record?.date || record?.completedAt).slice(0, 7)
const tripMonthKey = (trip) => dateKey(
  trip?.start_timestamp || trip?.startTimestamp || trip?.start_time || trip?.date,
).slice(0, 7)

/**
 * Combine the three user-defined operating-cost inputs for every physical bus.
 * Fuel is available only when an official statement has per-vehicle allocations.
 * Missing mileage never becomes zero-cost/km: the ratio is withheld instead.
 */
export function buildOperatingCostRows({
  busRegistrations = [],
  statement = null,
  statements = null,
  periodKeys = null,
  maintenanceRecords = [],
  fines = [],
  trips = [],
  canonicalize = (value) => String(value || '').toUpperCase().replace(/\s+/g, ''),
  metadataFor = () => ({}),
} = {}) {
  const statementList = Array.isArray(statements) ? statements : (statement ? [statement] : [])
  const expectedPeriodKeys = Array.isArray(periodKeys) && periodKeys.length
    ? [...new Set(periodKeys)].sort()
    : [...new Set(statementList.map((item) => operatingCostPeriodKey(item?.year, item?.month)).filter((key) => /^\d{4}-\d{2}$/.test(key)))].sort()
  const expectedSet = new Set(expectedPeriodKeys)
  const statementByMonth = new Map()
  statementList.forEach((item) => {
    const key = operatingCostPeriodKey(item?.year, item?.month)
    if (!expectedSet.size || expectedSet.has(key)) statementByMonth.set(key, item)
  })
  const includedPeriodKeys = expectedPeriodKeys.filter((key) => {
    const monthlyStatement = statementByMonth.get(key)
    return Array.isArray(monthlyStatement?.vehicleAllocations) && monthlyStatement.vehicleAllocations.length > 0
  })
  const missingPeriodKeys = expectedPeriodKeys.filter((key) => !includedPeriodKeys.includes(key))
  const includedSet = new Set(includedPeriodKeys)
  const buses = [...new Set(busRegistrations.map(canonicalize).filter(Boolean))].sort()
  const busSet = new Set(buses)
  const add = (map, key, value) => map.set(key, (map.get(key) || 0) + number(value))

  const allocations = includedPeriodKeys.flatMap((key) => statementByMonth.get(key)?.vehicleAllocations || [])
  const fuelAvailable = includedPeriodKeys.length > 0
  const fuelComplete = fuelAvailable && missingPeriodKeys.length === 0
  const fuelCost = new Map()
  const fuelLitres = new Map()
  allocations.forEach((allocation) => {
    const registration = canonicalize(allocation?.plate || allocation?.registration)
    if (!busSet.has(registration)) return
    add(fuelCost, registration, allocation?.cost)
    add(fuelLitres, registration, allocation?.litres)
  })

  const maintenanceCost = new Map()
  const maintenanceEvents = new Map()
  maintenanceRecords.filter((record) => includedSet.has(recordMonthKey(record))).forEach((record) => {
    const registration = canonicalize(record?.canonicalPlate || record?.plateNumber || record?.registration)
    if (!busSet.has(registration)) return
    add(maintenanceCost, registration, record?.total ?? record?.amount)
    add(maintenanceEvents, registration, 1)
  })

  const fineCost = new Map()
  const fineCount = new Map()
  fines.filter((fine) => includedSet.has(recordMonthKey(fine))).forEach((fine) => {
    const registration = canonicalize(fine?.vehicleReg || fine?.plateNumber || fine?.registration)
    if (!busSet.has(registration)) return
    add(fineCost, registration, fine?.amountAed ?? fine?.amount)
    add(fineCount, registration, 1)
  })

  const distanceKm = new Map()
  trips.forEach((trip) => {
    const monthKey = tripMonthKey(trip)
    if (monthKey && !includedSet.has(monthKey)) return
    const registration = canonicalize(trip?.canonicalRegistration || trip?.registration)
    if (!busSet.has(registration)) return
    add(distanceKm, registration, number(trip?.trip_distance) / 1000)
  })

  const rows = buses.map((registration) => {
    const meta = metadataFor(registration) || {}
    const fuel = fuelAvailable ? (fuelCost.get(registration) || 0) : null
    const maintenance = maintenanceCost.get(registration) || 0
    const fine = fineCost.get(registration) || 0
    const total = fuel == null ? null : fuel + maintenance + fine
    const km = distanceKm.get(registration) || 0
    return {
      registration,
      driverName: meta.driverName || '',
      busNumber: meta.busNumber || '',
      fuelCost: fuel,
      fuelLitres: fuelAvailable ? (fuelLitres.get(registration) || 0) : null,
      maintenanceCost: maintenance,
      maintenanceEvents: maintenanceEvents.get(registration) || 0,
      fineCost: fine,
      fineCount: fineCount.get(registration) || 0,
      distanceKm: km > 0 ? km : null,
      totalCost: total,
      costPerKm: total != null && km > 0 ? total / km : null,
    }
  })

  rows.sort((a, b) => {
    if (a.totalCost == null && b.totalCost == null) return a.registration.localeCompare(b.registration)
    if (a.totalCost == null) return 1
    if (b.totalCost == null) return -1
    return b.totalCost - a.totalCost || a.registration.localeCompare(b.registration)
  })
  let rank = 0
  rows.forEach((row) => {
    if (row.totalCost == null) row.rank = null
    else { rank += 1; row.rank = rank }
  })

  const comparable = rows.filter((row) => row.totalCost != null)
  const totalFuel = comparable.reduce((sum, row) => sum + row.fuelCost, 0)
  const totalMaintenance = comparable.reduce((sum, row) => sum + row.maintenanceCost, 0)
  const totalFines = comparable.reduce((sum, row) => sum + row.fineCost, 0)
  const totalCost = comparable.reduce((sum, row) => sum + row.totalCost, 0)
  const distanceCovered = rows.filter((row) => row.distanceKm != null).length
  const categoryTotals = [
    { id: 'fuel', value: totalFuel },
    { id: 'maintenance', value: totalMaintenance },
    { id: 'fines', value: totalFines },
  ].sort((a, b) => b.value - a.value)

  return {
    rows,
    summary: {
      periodKey: expectedPeriodKeys.length === 1 ? expectedPeriodKeys[0] : '',
      expectedPeriodKeys,
      includedPeriodKeys,
      missingPeriodKeys,
      fuelAvailable,
      fuelComplete,
      busCount: rows.length,
      comparableBusCount: comparable.length,
      distanceCoveredBusCount: distanceCovered,
      totalFuel,
      totalMaintenance,
      totalFines,
      totalCost: fuelAvailable ? totalCost : null,
      averagePerBus: fuelAvailable && comparable.length ? totalCost / comparable.length : null,
      highestCostBus: comparable[0] || null,
      primaryCostCategory: categoryTotals[0] || null,
    },
  }
}
