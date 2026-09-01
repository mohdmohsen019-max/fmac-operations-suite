export const OVERTIME_TYPES = {
  OFF_DAY: 'off_day',
  WORKING_DAY: 'working_day',
}

export function parseTimeToMinutes(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value || ''))
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

export function calculateOvertimeMinutes(startTime, finishTime) {
  const start = parseTimeToMinutes(startTime)
  const finish = parseTimeToMinutes(finishTime)
  if (start == null || finish == null || start === finish) return 0
  return finish > start ? finish - start : (24 * 60 - start) + finish
}

export function dateDayIndex(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return null
  const parsed = new Date(`${date}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? null : parsed.getDay()
}

export function overtimeTypeForDate(date) {
  return dateDayIndex(date) === 6 ? OVERTIME_TYPES.OFF_DAY : OVERTIME_TYPES.WORKING_DAY
}

export function minutesToHours(minutes, maximumFractionDigits = 2) {
  return Number((Math.max(0, Number(minutes) || 0) / 60).toFixed(maximumFractionDigits))
}

export function previousMonthKey(monthKey) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(monthKey || ''))
  if (!match) return ''
  const date = new Date(Number(match[1]), Number(match[2]) - 2, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function buildDriverMonthlyTotals(entries, currentDrivers = []) {
  const groups = new Map()

  currentDrivers.forEach((driver) => {
    const name = String(driver.driverName || '').trim()
    if (!name) return
    const existing = groups.get(name) || {
      driverName: name,
      employeeType: driver.employeeType || 'driver',
      registrations: new Set(),
      workingMinutes: 0,
      offDayMinutes: 0,
      totalMinutes: 0,
      entryCount: 0,
    }
    if (driver.registration) existing.registrations.add(driver.registration)
    if (driver.employeeType) existing.employeeType = driver.employeeType
    groups.set(name, existing)
  })

  entries.forEach((entry) => {
    const name = String(entry.driverName || '').trim() || 'Unassigned'
    const existing = groups.get(name) || {
      driverName: name,
      employeeType: entry.employeeType || 'driver',
      registrations: new Set(),
      workingMinutes: 0,
      offDayMinutes: 0,
      totalMinutes: 0,
      entryCount: 0,
    }
    const minutes = Math.max(0, Number(entry.durationMinutes) || 0)
    if (entry.registration) existing.registrations.add(entry.registration)
    if (entry.employeeType) existing.employeeType = entry.employeeType
    if (entry.overtimeType === OVERTIME_TYPES.OFF_DAY) existing.offDayMinutes += minutes
    else existing.workingMinutes += minutes
    existing.totalMinutes += minutes
    existing.entryCount += 1
    groups.set(name, existing)
  })

  return [...groups.values()]
    .map((row) => ({ ...row, registrations: [...row.registrations].sort() }))
    .sort((a, b) => b.totalMinutes - a.totalMinutes || a.driverName.localeCompare(b.driverName))
}

export function buildOvertimeInsights(entries) {
  const totalMinutes = entries.reduce((sum, entry) => sum + (Number(entry.durationMinutes) || 0), 0)
  const offDayMinutes = entries
    .filter((entry) => entry.overtimeType === OVERTIME_TYPES.OFF_DAY)
    .reduce((sum, entry) => sum + (Number(entry.durationMinutes) || 0), 0)
  const byDay = new Map()
  const byReason = new Map()

  entries.forEach((entry) => {
    const dayIndex = dateDayIndex(entry.date)
    if (dayIndex != null) byDay.set(dayIndex, (byDay.get(dayIndex) || 0) + (Number(entry.durationMinutes) || 0))
    const reason = String(entry.reason || '').trim()
    if (reason) byReason.set(reason, (byReason.get(reason) || 0) + (Number(entry.durationMinutes) || 0))
  })

  const busiestDay = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0] || null
  const topReason = [...byReason.entries()].sort((a, b) => b[1] - a[1])[0] || null
  const longestEntry = [...entries].sort((a, b) => (Number(b.durationMinutes) || 0) - (Number(a.durationMinutes) || 0))[0] || null

  return {
    totalMinutes,
    offDayMinutes,
    workingMinutes: totalMinutes - offDayMinutes,
    weekendShare: totalMinutes ? (offDayMinutes / totalMinutes) * 100 : 0,
    busiestDay,
    topReason,
    longestEntry,
  }
}
