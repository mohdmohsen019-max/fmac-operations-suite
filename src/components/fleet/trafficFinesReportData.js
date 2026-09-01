export function reportingPeriodLabel(month, locale = 'en-AE') {
  if (!/^\d{4}-\d{2}$/.test(String(month || ''))) return 'All recorded dates'
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' })
    .format(new Date(`${month}-01T12:00:00`))
}

export function reportingDateRange(month) {
  if (!/^\d{4}-\d{2}$/.test(String(month || ''))) return { from: '', to: '' }
  const [year, monthNumber] = month.split('-').map(Number)
  const lastDay = new Date(year, monthNumber, 0).getDate()
  return {
    from: `${month}-01`,
    to: `${month}-${String(lastDay).padStart(2, '0')}`,
  }
}

export function scopeName(scope) {
  if (scope === 'buses') return 'Buses'
  if (scope === 'others') return 'Other Vehicles'
  return 'All Vehicles'
}

export function noFinesStatement({ scope, driver = 'all', periodLabel }) {
  if (driver && driver !== 'all') {
    return `No traffic fines recorded for ${driver} during ${periodLabel}.`
  }
  if (scope === 'buses') {
    return `No traffic fines recorded against bus drivers or bus vehicles during ${periodLabel}.`
  }
  if (scope === 'others') {
    return `No traffic fines recorded against other-vehicle drivers or vehicles during ${periodLabel}.`
  }
  return `No traffic fines recorded during ${periodLabel}.`
}

export function buildFinesReportSummary({ scope, month, driver, count, totalAed, generatedAt }) {
  const periodLabel = reportingPeriodLabel(month, 'en-AE')
  const range = reportingDateRange(month)
  return {
    title: 'FMAC Traffic Fines Period Report',
    scope: scopeName(scope),
    periodLabel,
    from: range.from,
    to: range.to,
    driver: driver === 'all' ? 'All drivers' : driver,
    count,
    totalAed,
    result: count === 0
      ? noFinesStatement({ scope, driver, periodLabel })
      : `${count} traffic fine${count === 1 ? '' : 's'} recorded during ${periodLabel}.`,
    generatedAt,
  }
}
