import { OVERTIME_TYPES, buildDriverMonthlyTotals, buildOvertimeInsights, minutesToHours } from './overtimeCalculations.js'

const hours = (minutes) => minutesToHours(minutes, 2)

export function buildOvertimeReportData(month, entries, staff) {
  const sortedEntries = [...entries].sort((a, b) => `${a.date || ''} ${a.startTime || ''}`.localeCompare(`${b.date || ''} ${b.startTime || ''}`))
  const totals = buildDriverMonthlyTotals(sortedEntries, staff)
  const insights = buildOvertimeInsights(sortedEntries)
  return {
    month,
    insights,
    totals,
    details: sortedEntries.map((entry) => ({
      staffName: entry.driverName || '',
      role: entry.employeeType === 'labor' ? 'Labor' : 'Driver',
      vehicleType: entry.vehicleType || '',
      registration: entry.registration || '',
      date: entry.date || '',
      day: entry.day || '',
      overtimeType: entry.overtimeType === OVERTIME_TYPES.OFF_DAY ? 'Saturday off day' : 'Working-day extra',
      startTime: entry.startTime || '',
      finishTime: entry.finishTime || '',
      hours: hours(entry.durationMinutes),
      reason: entry.reason || '',
    })),
  }
}
