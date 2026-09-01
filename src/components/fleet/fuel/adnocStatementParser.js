import { resolveKnownBusRegistration } from '../../../services/fleetMapping.js'

const round = (value, precision = 2) => {
  const factor = 10 ** precision
  return Math.round((Number(value) || 0) * factor) / factor
}

const number = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (value == null || value === '') return 0
  const parsed = Number(String(value).replace(/,/g, '').trim())
  return Number.isFinite(parsed) ? parsed : 0
}

const text = (value) => String(value ?? '').trim()

const key = (value) => text(value).toLowerCase().replace(/[\s\r\n_./()-]+/g, '')

const normalizedRow = (headers, row) => Object.fromEntries(
  headers.map((header, index) => [key(header), row[index]]),
)

const findHeaderIndex = (rows, required) => rows.findIndex((row) => {
  const keys = new Set((row || []).map(key))
  return required.every((candidate) => keys.has(candidate))
})

const cleanFuelType = (value) => {
  const raw = text(value)
  const normalized = raw.toLowerCase()
  if (normalized.includes('diesel')) return 'Diesel'
  if (normalized.includes('special') && normalized.includes('95')) return 'Special 95'
  if (normalized.includes('special') && normalized.includes('98')) return 'Super 98'
  if (normalized.includes('91')) return 'E-Plus 91'
  return raw || 'Unspecified'
}

const plateNumber = (registration) => text(registration).toUpperCase().replace(/[^A-Z0-9]/g, '')

export function extractAdnocPlate({ vehicleInfo, tokenName, registration } = {}) {
  const vehicle = text(vehicleInfo).toUpperCase()
  const fromVehicle = vehicle.match(/FUJAIRAH\s+(\d+)\s+([A-Z])\s+PRIVATE/)
  if (fromVehicle) return `${fromVehicle[2]}${fromVehicle[1]}`

  const token = text(tokenName).toUpperCase().replace(/PVT\s+FUJ\s*/i, '')
  const fromToken = token.match(/(\d+)\s*([A-Z])/)
  if (fromToken) return `${fromToken[2]}${fromToken[1]}`

  const raw = plateNumber(registration)
  return resolveKnownBusRegistration(raw) || raw
}

const parseDate = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString()
  const raw = text(value)
  if (!raw) return null
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? raw : date.toISOString()
}

const periodFromRows = (rows) => {
  for (const row of rows.slice(0, 8)) {
    if (key(row?.[0]) !== 'date') continue
    const match = text(row?.[1]).match(/(\d{1,2})-([A-Za-z]{3})-(\d{4})/)
    if (!match) continue
    const parsed = new Date(`${match[2]} ${match[1]}, ${match[3]}`)
    if (!Number.isNaN(parsed.getTime())) {
      return { month: parsed.getMonth() + 1, year: parsed.getFullYear() }
    }
  }
  return null
}

const periodFromTransactions = (transactions) => {
  const first = transactions.map((item) => new Date(item.date)).find((date) => !Number.isNaN(date.getTime()))
  return first ? { month: first.getMonth() + 1, year: first.getFullYear() } : null
}

function parsePayment24(rows, headerIndex) {
  const headers = rows[headerIndex]
  const allocations = []
  let totalCost = 0
  let totalVat = 0

  rows.slice(headerIndex + 1).forEach((row) => {
    const item = normalizedRow(headers, row)
    const vehicleInfo = text(item.vehicleinfo)
    const tokenName = text(item.tokenname)
    if (vehicleInfo.toUpperCase() === 'TOTAL' || tokenName.toUpperCase() === 'TOTAL') return
    const cost = number(item.totalamountaed ?? item.totalamount)
    const vatAed = number(item.totalvatamountaed ?? item.totalvatamount)
    const litres = number(item.totalquantity)
    const plate = extractAdnocPlate({ vehicleInfo, tokenName })
    if (!plate || (cost <= 0 && litres <= 0)) return
    allocations.push({
      plate,
      registration: plate,
      litres: round(litres),
      cost: round(cost),
      vatAed: round(vatAed),
      sourceVehicleInfo: vehicleInfo || tokenName,
      transactionCount: 0,
      fuelTypes: [],
    })
    totalCost += cost
    totalVat += vatAed
  })

  return {
    format: allocations.some((item) => item.litres > 0) ? 'legacy-summary' : 'payment24-summary',
    period: periodFromRows(rows),
    allocations,
    totalCost: round(totalCost),
    totalLitres: round(allocations.reduce((sum, item) => sum + item.litres, 0)),
    totalVat: round(totalVat),
    transactions: [],
  }
}

function parseTransactions(rows, headerIndex) {
  const headers = rows[headerIndex]
  const transactions = []

  rows.slice(headerIndex + 1).forEach((row, sourceIndex) => {
    const item = normalizedRow(headers, row)
    const amount = number(item.amount)
    const litres = number(item.litres)
    const rawRegistration = plateNumber(item.registration)
    if (!rawRegistration || (amount <= 0 && litres <= 0)) return
    const fuelType = cleanFuelType(item.product)
    transactions.push({
      id: text(item.id) || `row-${headerIndex + sourceIndex + 2}`,
      date: parseDate(item.date),
      plate: resolveKnownBusRegistration(rawRegistration) || rawRegistration,
      rawRegistration,
      fuelType,
      costPerLitre: round(number(item.cpl), 3),
      litres: round(litres),
      amount: round(amount),
      merchant: text(item.merchant),
      merchantNumber: text(item.merchantnumber),
      cardNumber: text(item.cardnumber),
      make: text(item.make),
      model: text(item.model),
      sourceRow: headerIndex + sourceIndex + 2,
    })
  })

  return {
    format: 'transaction-ledger',
    period: periodFromTransactions(transactions),
    allocations: [],
    totalCost: round(transactions.reduce((sum, item) => sum + item.amount, 0)),
    totalLitres: round(transactions.reduce((sum, item) => sum + item.litres, 0)),
    totalVat: 0,
    transactions,
  }
}

export function parseAdnocWorksheet(rows = []) {
  const transactionHeader = findHeaderIndex(rows, ['registration', 'product', 'cpl', 'litres', 'amount'])
  if (transactionHeader >= 0) return parseTransactions(rows, transactionHeader)

  const paymentHeader = findHeaderIndex(rows, ['tokenname', 'vehicleinfo', 'totalamountaed'])
  if (paymentHeader >= 0) return parsePayment24(rows, paymentHeader)

  throw new Error('Unsupported ADNOC workbook. Upload a Payment24 summary or the detailed transaction export.')
}

const numericSuffix = (plate) => plateNumber(plate).replace(/^[A-Z]+/, '')

const buildFuelTypeSummary = (transactions) => {
  const grouped = new Map()
  transactions.forEach((item) => {
    const existing = grouped.get(item.fuelType) || {
      fuelType: item.fuelType,
      transactionCount: 0,
      litres: 0,
      cost: 0,
    }
    existing.transactionCount += 1
    existing.litres += number(item.litres)
    existing.cost += number(item.amount)
    grouped.set(item.fuelType, existing)
  })
  return [...grouped.values()].map((item) => ({
    ...item,
    litres: round(item.litres),
    cost: round(item.cost),
    averageCostPerLitre: item.litres > 0 ? round(item.cost / item.litres, 3) : null,
  })).sort((a, b) => b.litres - a.litres)
}

const buildTransactionAllocations = (transactions) => {
  const grouped = new Map()
  transactions.forEach((item) => {
    const existing = grouped.get(item.plate) || {
      plate: item.plate,
      registration: item.plate,
      litres: 0,
      cost: 0,
      vatAed: 0,
      transactionCount: 0,
      fuelTypes: new Set(),
    }
    existing.litres += number(item.litres)
    existing.cost += number(item.amount)
    existing.transactionCount += 1
    existing.fuelTypes.add(item.fuelType)
    grouped.set(item.plate, existing)
  })
  return [...grouped.values()].map((item) => ({
    ...item,
    litres: round(item.litres),
    cost: round(item.cost),
    fuelTypes: [...item.fuelTypes].sort(),
  })).sort((a, b) => b.cost - a.cost)
}

/**
 * Combine one or two ADNOC exports. The detailed transaction ledger is the
 * source of truth for August 2026 onward. Payment24 remains a control total
 * and supplies the full plate code when the transaction file contains only
 * the numeric registration.
 */
export function combineAdnocImports(imports = []) {
  const transactionSource = imports.find((item) => item?.format === 'transaction-ledger') || null
  const summarySource = imports.find((item) => item?.format === 'payment24-summary')
    || imports.find((item) => item?.format === 'legacy-summary')
    || null
  if (!transactionSource && !summarySource) throw new Error('No supported ADNOC data was found.')

  const periods = imports.map((item) => item?.period).filter(Boolean)
  const firstPeriod = periods[0] || null
  if (periods.some((period) => period.month !== firstPeriod.month || period.year !== firstPeriod.year)) {
    throw new Error('The selected ADNOC files cover different reporting months.')
  }

  if (!transactionSource) {
    return {
      month: firstPeriod?.month || null,
      year: firstPeriod?.year || null,
      importVersion: summarySource.format === 'legacy-summary' ? 1 : 2,
      dataModel: summarySource.format,
      totalCost: summarySource.totalCost,
      totalLitres: summarySource.totalLitres,
      totalVat: summarySource.totalVat,
      vehicleAllocations: summarySource.allocations,
      transactions: [],
      fuelTypeSummary: [],
      statementControlTotal: summarySource.totalCost,
      statementControlAllocations: summarySource.allocations,
      reconciliationVariance: 0,
      dataCoverage: summarySource.totalLitres > 0 ? 'summary' : 'cost-only',
    }
  }

  const prefixByNumber = new Map((summarySource?.allocations || []).map((item) => [
    numericSuffix(item.plate), item.plate,
  ]))
  const transactions = transactionSource.transactions.map((item) => ({
    ...item,
    plate: prefixByNumber.get(numericSuffix(item.plate)) || item.plate,
  }))
  const vehicleAllocations = buildTransactionAllocations(transactions)
  const totalCost = round(transactions.reduce((sum, item) => sum + item.amount, 0))
  const totalLitres = round(transactions.reduce((sum, item) => sum + item.litres, 0))
  const statementControlTotal = summarySource?.totalCost ?? null

  return {
    month: firstPeriod?.month || null,
    year: firstPeriod?.year || null,
    importVersion: 2,
    dataModel: 'transaction-ledger',
    totalCost,
    totalLitres,
    totalVat: summarySource?.totalVat ?? null,
    vehicleAllocations,
    transactions,
    fuelTypeSummary: buildFuelTypeSummary(transactions),
    statementControlTotal,
    statementControlAllocations: summarySource?.allocations || [],
    reconciliationVariance: statementControlTotal == null ? null : round(totalCost - statementControlTotal),
    dataCoverage: 'transaction-detail',
  }
}
