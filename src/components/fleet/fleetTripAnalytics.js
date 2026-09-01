const normReg = (value) => String(value || '').trim().toUpperCase().replace(/\s+/g, '')

export const monthWindow = (month) => {
  const safeMonth = /^\d{4}-\d{2}$/.test(month || '') ? month : new Date().toISOString().slice(0, 7)
  const [year, monthNumber] = safeMonth.split('-').map(Number)
  const endDay = new Date(year, monthNumber, 0).getDate()
  return { month: safeMonth, from: `${safeMonth}-01`, to: `${safeMonth}-${String(endDay).padStart(2, '0')}` }
}

const inWindow = (date, window) => String(date || '') >= window.from && String(date || '') <= window.to

const registrationFromRidership = (entry) => entry?.classSnapshot?.registration
  || entry?.registration
  || String(entry?.classId || '').match(/^bus_([^_]+)_s\d+$/i)?.[1]?.toUpperCase()
  || ''

const activeAssignmentForDate = (assignments, registration, date) => assignments
  .filter((assignment) => normReg(assignment.vehicleRegistration) === normReg(registration))
  .filter((assignment) => assignment.status !== 'ended' || !assignment.endedAt || assignment.endedAt >= date)
  .filter((assignment) => !assignment.effectiveDate || assignment.effectiveDate <= date)
  .sort((left, right) => String(right.effectiveDate || '').localeCompare(String(left.effectiveDate || '')))[0] || null

export function buildDriverMonthlyTrips({ people = [], assignments = [], ridershipCounts = [], externalRecords = [], month, driverIds = [] }) {
  const window = monthWindow(month)
  const suppliedDriverIds = new Set(driverIds.filter(Boolean))
  const isBusDriver = (person) => person?.active !== false
    && person?.personType !== 'staff'
    && (!suppliedDriverIds.size || suppliedDriverIds.has(person.id))
  const rows = new Map(people.filter(isBusDriver).map((person) => [person.id, {
    personId: person.id,
    personName: person.displayName || person.nameEn || person.nameAr || '',
    personType: person.personType || 'driver',
    internalSessions: 0,
    internalTrips: 0,
    externalTrips: 0,
    totalTrips: 0,
    attributedByFallback: 0,
  }]))
  const activeByVehicle = new Map(assignments
    .filter((assignment) => assignment.status === 'active' && !assignment.endedAt)
    .map((assignment) => [normReg(assignment.vehicleRegistration), assignment]))
  const personIdByName = new Map(people.map((person) => [String(person.displayName || '').trim().toLowerCase(), person.id]))

  const ensureRow = (personId, fallback = {}) => {
    if (!personId) return null
    const person = people.find((item) => item.id === personId)
    if (person && !isBusDriver(person)) return null
    if (!person && suppliedDriverIds.size && !suppliedDriverIds.has(personId)) return null
    if (!rows.has(personId)) rows.set(personId, {
      personId,
      personName: fallback.personName || '',
      personType: fallback.personType || 'driver',
      internalSessions: 0,
      internalTrips: 0,
      externalTrips: 0,
      totalTrips: 0,
      attributedByFallback: 0,
    })
    return rows.get(personId)
  }

  const unassignedInternal = []
  ridershipCounts.filter((entry) => inWindow(entry.date, window)).forEach((entry) => {
    const registration = registrationFromRidership(entry)
    const historical = activeAssignmentForDate(assignments, registration, entry.date)
    const fallback = !historical ? activeByVehicle.get(normReg(registration)) : null
    const assignment = historical || fallback
    if (!assignment?.personId) {
      unassignedInternal.push({ id: entry.id, registration, date: entry.date })
      return
    }
    const row = ensureRow(assignment.personId, assignment)
    if (!row) {
      unassignedInternal.push({ id: entry.id, registration, date: entry.date })
      return
    }
    row.internalSessions += 1
    row.internalTrips += 2
    if (fallback) row.attributedByFallback += 1
  })

  const unassignedExternal = []
  externalRecords.filter((entry) => inWindow(entry.date, window)).forEach((entry) => {
    const personId = entry.personId || personIdByName.get(String(entry.personName || '').trim().toLowerCase())
    if (!personId) {
      unassignedExternal.push({ id: entry.id, personName: entry.personName || '', date: entry.date })
      return
    }
    const row = ensureRow(personId, entry)
    if (!row) return
    row.externalTrips += 1
  })

  const ranked = [...rows.values()].map((row) => ({ ...row, totalTrips: row.internalTrips + row.externalTrips }))
    .sort((left, right) => right.totalTrips - left.totalTrips || right.externalTrips - left.externalTrips || left.personName.localeCompare(right.personName))

  return {
    ...window,
    rows: ranked,
    totals: {
      internalSessions: ranked.reduce((sum, row) => sum + row.internalSessions, 0),
      internalTrips: ranked.reduce((sum, row) => sum + row.internalTrips, 0),
      externalTrips: ranked.reduce((sum, row) => sum + row.externalTrips, 0),
      trips: ranked.reduce((sum, row) => sum + row.totalTrips, 0),
    },
    unassignedInternal,
    unassignedExternal,
  }
}

export function buildExternalTransportationInsights({ records = [], people = [], vehicles = [], from = '', to = '' }) {
  const filtered = records.filter((record) => (!from || record.date >= from) && (!to || record.date <= to))
  const personById = new Map(people.map((person) => [person.id, person]))
  const vehicleByReg = new Map(vehicles.map((vehicle) => [normReg(vehicle.registration), vehicle]))
  const countBy = (keyFor) => {
    const tally = new Map()
    filtered.forEach((record) => {
      const item = keyFor(record)
      if (!item?.key) return
      const current = tally.get(item.key) || { ...item, count: 0 }
      current.count += 1
      tally.set(item.key, current)
    })
    return [...tally.values()].sort((left, right) => right.count - left.count || String(left.label).localeCompare(String(right.label)))
  }
  const drivers = countBy((record) => {
    const person = personById.get(record.personId)
    const label = person?.displayName || record.personName || ''
    return label ? { key: record.personId || label.toLowerCase(), label, personType: person?.personType || record.personType || 'driver' } : null
  })
  const vehiclesRanked = countBy((record) => {
    const registration = normReg(record.vehicleRegistration)
    const vehicle = vehicleByReg.get(registration)
    if (!registration && record.plateMatchStatus === 'external_non_club' && record.sourcePlate) {
      return { key: `external-${normReg(record.sourcePlate)}`, label: `${normReg(record.sourcePlate)} · External vehicle`, vehicleClass: 'external' }
    }
    return registration ? { key: registration, label: registration, vehicleClass: vehicle?.vehicleClass || '' } : null
  })
  const reasons = countBy((record) => record.reason ? { key: record.reason, label: record.reason } : null)
  const unmatchedRows = filtered
    .filter((record) => record.plateMatchStatus === 'unmatched')
    .sort((left, right) => String(right.date || '').localeCompare(String(left.date || '')) || Number(left.sourceRow || 0) - Number(right.sourceRow || 0))
  return { records: filtered, drivers, vehicles: vehiclesRanked, reasons, unmatchedRows, unmatched: unmatchedRows.length }
}
