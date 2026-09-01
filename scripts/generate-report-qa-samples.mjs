import fs from 'node:fs/promises'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const require = createRequire(import.meta.url)
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pdfDir = path.join(repoRoot, 'output', 'pdf')
const excelDir = path.join(repoRoot, 'outputs', 'reporting-overhaul')
await fs.mkdir(pdfDir, { recursive: true })
await fs.mkdir(excelDir, { recursive: true })

const globalRoot = process.platform === 'win32'
  ? path.join(process.env.APPDATA, 'npm', 'node_modules')
  : execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim()
const firebaseAuth = require(path.join(globalRoot, 'firebase-tools', 'lib', 'auth.js'))
const account = firebaseAuth.getGlobalDefaultAccount()
if (!account?.tokens?.refresh_token) throw new Error('Firebase CLI is not authenticated.')
const token = await firebaseAuth.getAccessToken(account.tokens.refresh_token, [])
const headers = { Authorization: `Bearer ${token.access_token}` }
const firestoreBase = 'https://firestore.googleapis.com/v1/projects/fmac-attendance/databases/(default)/documents'

const decode = (value = {}) => {
  if ('nullValue' in value) return null
  if ('stringValue' in value) return value.stringValue
  if ('integerValue' in value) return Number(value.integerValue)
  if ('doubleValue' in value) return Number(value.doubleValue)
  if ('booleanValue' in value) return Boolean(value.booleanValue)
  if ('timestampValue' in value) return value.timestampValue
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decode)
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, child]) => [key, decode(child)]))
  return null
}

async function listCollection(collectionId) {
  const records = []
  let pageToken = ''
  do {
    const url = new URL(`${firestoreBase}/${collectionId}`)
    url.searchParams.set('pageSize', '1000')
    if (pageToken) url.searchParams.set('pageToken', pageToken)
    const response = await fetch(url, { headers })
    if (!response.ok) throw new Error(`${collectionId} read failed: HTTP ${response.status}`)
    const body = await response.json()
    for (const document of body.documents || []) {
      records.push({ id: document.name.split('/').at(-1), ...Object.fromEntries(Object.entries(document.fields || {}).map(([key, value]) => [key, decode(value)])) })
    }
    pageToken = body.nextPageToken || ''
  } while (pageToken)
  return records
}

const statements = (await listCollection('fuelStatements'))
  .filter((row) => Number(row.year) === 2026 && Number(row.month) >= 1 && Number(row.month) <= 7)
  .sort((a, b) => Number(a.month) - Number(b.month))
const current = statements.find((row) => Number(row.month) === 7)
const previous = statements.find((row) => Number(row.month) === 6)
if (!current || !previous) throw new Error('Verified June and July 2026 fuel statements are required for QA.')
const maintenanceRecords = await listCollection('maintenance')
const fineRecords = await listCollection('fleet_fines')
const ridershipClasses = await listCollection('fleet_ridership_classes')
const ridershipEntries = await listCollection('fleet_ridership_counts')
const inventoryMovements = await listCollection('inventory_movements')
const inventoryItems = await listCollection('inventory_items')
const overtimeEntries = await listCollection('fleet_driver_overtime')
const fleetKpiSnapshots = await listCollection('fleet_kpi_snapshots')

const totalFor = (row) => ({
  totalCost: Number(row.totalCost || 0), totalLitres: Number(row.totalLitres || 0), totalKm: null,
  costPerKm: null, litresPer100km: null,
  pricePerLitre: Number(row.pricePerLitre || (Number(row.totalLitres) ? Number(row.totalCost) / Number(row.totalLitres) : 0)),
})
const pct = (a, b) => Number.isFinite(a) && Number.isFinite(b) && b !== 0 ? ((a - b) / b) * 100 : null
const currentTotals = totalFor(current)
const previousTotals = totalFor(previous)
const deltas = Object.fromEntries(Object.keys(currentTotals).map((key) => [key, {
  abs: Number.isFinite(currentTotals[key]) && Number.isFinite(previousTotals[key]) ? currentTotals[key] - previousTotals[key] : null,
  pct: pct(currentTotals[key], previousTotals[key]),
}]))
const previousByPlate = new Map((previous.vehicleAllocations || []).map((row) => [String(row.plate || row.registration).toUpperCase(), row]))
const vehicles = (current.vehicleAllocations || []).map((row) => {
  const plate = String(row.plate || row.registration).toUpperCase()
  const prior = previousByPlate.get(plate)
  return {
    plate, km: null, litres: Number(row.litres || 0), cost: Number(row.cost || 0),
    litresPer100km: null, costPerKm: null,
    deltaL100: { pct: null },
    verdict: null,
    priorCostChangePct: prior ? pct(Number(row.cost || 0), Number(prior.cost || 0)) : null,
  }
}).sort((a, b) => b.cost - a.cost)
const trend = statements.map((row) => ({ year: row.year, month: row.month, totalCost: row.totalCost, totalLitres: row.totalLitres, pricePerLitre: row.pricePerLitre }))
const decomposition = {
  totalDelta: currentTotals.totalCost - previousTotals.totalCost,
  priceEffect: (currentTotals.pricePerLitre - previousTotals.pricePerLitre) * previousTotals.totalLitres,
  volumeEffect: (currentTotals.totalLitres - previousTotals.totalLitres) * currentTotals.pricePerLitre,
}
const topVehicle = vehicles[0]
const payload = {
  month: 7, year: 2026, scope: 'all', currency: 'AED',
  fleet: { current: currentTotals, previous: previousTotals, deltas },
  vehicles, decomposition, trend,
  insights: [
    { en: `${topVehicle.plate} had the highest fuel allocation in July at ${topVehicle.cost.toLocaleString('en-AE', { maximumFractionDigits: 0 })} AED.`, ar: `سجلت المركبة ${topVehicle.plate} أعلى تخصيص للوقود في يوليو بقيمة ${topVehicle.cost.toLocaleString('ar-AE', { maximumFractionDigits: 0 })} درهم.`, type: 'warning' },
    { en: `The July statement contains ${vehicles.length} vehicle allocations.`, ar: `يتضمن بيان يوليو ${vehicles.length} تخصيصاً للمركبات.`, type: 'neutral' },
  ],
}

const vite = await createServer({ root: repoRoot, appType: 'custom', server: { middlewareMode: true }, logLevel: 'error' })
try {
  const { buildFuelManagementReport } = await vite.ssrLoadModule('/src/components/fleet/fuel/fuelReportExport.js')
  const { createManagementPdfBuffer } = await vite.ssrLoadModule('/src/services/reporting/pdfReportBuilder.js')
  const { createManagementWorkbook } = await vite.ssrLoadModule('/src/services/reporting/excelReportBuilder.js')
  const { REPORT_PDF_ASSETS } = await vite.ssrLoadModule('/src/services/reporting/reportAssets.js')
  const { buildOperatingCostRows } = await vite.ssrLoadModule('/src/components/fleet/operatingCost.js')
  const { buildOperatingCostManagementReport } = await vite.ssrLoadModule('/src/components/fleet/operatingCostReport.js')
  const { buildTrafficFinesManagementReport } = await vite.ssrLoadModule('/src/components/fleet/trafficFinesReport.js')
  const { buildRidershipManagementReport } = await vite.ssrLoadModule('/src/components/fleet/ridershipReport.js')
  const { buildRidershipStats } = await vite.ssrLoadModule('/src/components/fleet/ridershipAnalytics.js')
  const { buildInventoryMovementReport } = await vite.ssrLoadModule('/src/components/inventory/inventoryMovementReport.js')
  const { buildInventoryAnalyticsReport } = await vite.ssrLoadModule('/src/components/inventory/inventoryAnalyticsReport.js')
  const { buildStockManagementReport } = await vite.ssrLoadModule('/src/components/inventory/inventoryStockExport.js')
  const { buildOvertimeManagementReport } = await vite.ssrLoadModule('/src/components/fleet/overtimeReport.js')
  const { buildFleetPerformanceManagementReport } = await vite.ssrLoadModule('/src/components/fleet/fleetPerformanceExport.js')
  const { FLEET_MAPPING, resolveKnownBusRegistration, isKnownBusRegistration, getVehicleMeta } = await vite.ssrLoadModule('/src/services/fleetMapping.js')
  for (const locale of ['en-AE', 'ar-AE']) {
    const language = locale.startsWith('ar') ? 'AR' : 'EN'
    const report = buildFuelManagementReport({ ...payload, locale })
    const pdfBytes = await createManagementPdfBuffer(report, REPORT_PDF_ASSETS)
    await fs.writeFile(path.join(pdfDir, `FMAC-Fuel-Report-2026-07-${language}.pdf`), pdfBytes)
    const workbook = createManagementWorkbook(report)
    await workbook.xlsx.writeFile(path.join(excelDir, `FMAC-Fuel-Report-2026-07-${language}.xlsx`))
  }

  const operatingResult = buildOperatingCostRows({
    busRegistrations: Object.keys(FLEET_MAPPING),
    statements: [current],
    periodKeys: ['2026-07'],
    maintenanceRecords,
    fines: fineRecords,
    trips: [],
    canonicalize: resolveKnownBusRegistration,
    metadataFor: getVehicleMeta,
  })
  const julyBusFines = fineRecords.filter((fine) => String(fine.date || '').startsWith('2026-07') && isKnownBusRegistration(fine.vehicleReg))
  const fineVehicleCounts = new Map()
  julyBusFines.forEach((fine) => fineVehicleCounts.set(resolveKnownBusRegistration(fine.vehicleReg), (fineVehicleCounts.get(resolveKnownBusRegistration(fine.vehicleReg)) || 0) + 1))
  const fineTotals = {
    count: julyBusFines.length,
    totalAed: julyBusFines.reduce((sum, fine) => sum + (Number(fine.amountAed) || 0), 0),
    affectedVehicles: fineVehicleCounts.size,
    repeatVehicles: [...fineVehicleCounts.values()].filter((count) => count > 1).length,
    topVehicle: [...fineVehicleCounts.entries()].sort((a, b) => b[1] - a[1])[0] || null,
  }

  for (const locale of ['en-AE', 'ar-AE']) {
    const language = locale.startsWith('ar') ? 'AR' : 'EN'
    const periodLabel = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date('2026-07-01T12:00:00'))
    const operatingReport = buildOperatingCostManagementReport({
      result: operatingResult,
      periodLabel,
      locale,
      includedMonthLabels: [periodLabel],
      missingMonthLabels: [],
      distanceError: true,
    })
    await fs.writeFile(path.join(pdfDir, `FMAC-Operating-Cost-2026-07-${language}.pdf`), await createManagementPdfBuffer(operatingReport, REPORT_PDF_ASSETS))
    await createManagementWorkbook(operatingReport).xlsx.writeFile(path.join(excelDir, `FMAC-Operating-Cost-2026-07-${language}.xlsx`))

    const finesReport = buildTrafficFinesManagementReport({
      fines: julyBusFines,
      totals: fineTotals,
      scope: 'buses',
      driver: 'all',
      periodLabel,
      from: '2026-07-01',
      to: '2026-07-31',
      locale,
      resolveDriver: (fine) => getVehicleMeta(fine.vehicleReg).driverName || fine.driverName || '',
      vehicleLabel: (registration) => resolveKnownBusRegistration(registration),
    })
    await fs.writeFile(path.join(pdfDir, `FMAC-Traffic-Fines-Buses-2026-07-${language}.pdf`), await createManagementPdfBuffer(finesReport, REPORT_PDF_ASSETS))
    await createManagementWorkbook(finesReport).xlsx.writeFile(path.join(excelDir, `FMAC-Traffic-Fines-Buses-2026-07-${language}.xlsx`))
  }

  const ridershipMonths = [...new Set(ridershipEntries.map((entry) => String(entry.date || '').slice(0, 7)).filter((value) => /^\d{4}-\d{2}$/.test(value)))].sort()
  const ridershipMonth = ridershipMonths.at(-1)
  if (ridershipMonth) {
    const currentRidership = ridershipEntries.filter((entry) => String(entry.date || '').startsWith(ridershipMonth))
    const [ridershipYear, ridershipMonthNumber] = ridershipMonth.split('-').map(Number)
    const previousMonthDate = new Date(ridershipYear, ridershipMonthNumber - 2, 1)
    const previousMonthKey = `${previousMonthDate.getFullYear()}-${String(previousMonthDate.getMonth() + 1).padStart(2, '0')}`
    const previousRidership = ridershipEntries.filter((entry) => String(entry.date || '').startsWith(previousMonthKey))
    const ridershipStats = buildRidershipStats(currentRidership, ridershipClasses)
    const previousRidershipStats = buildRidershipStats(previousRidership, ridershipClasses)
    for (const locale of ['en-AE', 'ar-AE']) {
      const language = locale.startsWith('ar') ? 'AR' : 'EN'
      const periodLabel = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(`${ridershipMonth}-01T12:00:00`))
      const report = buildRidershipManagementReport({
        periodKey: ridershipMonth,
        periodLabel,
        entries: currentRidership,
        stats: ridershipStats,
        previousStats: previousRidershipStats,
        classes: ridershipClasses,
        locale,
      })
      await fs.writeFile(path.join(pdfDir, `FMAC-Ridership-${ridershipMonth}-${language}.pdf`), await createManagementPdfBuffer(report, REPORT_PDF_ASSETS))
      await createManagementWorkbook(report).xlsx.writeFile(path.join(excelDir, `FMAC-Ridership-${ridershipMonth}-${language}.xlsx`))
    }
  }

  const inventoryMonths = [...new Set(inventoryMovements.map((entry) => String(entry.createdAt || '').slice(0, 7)).filter((value) => /^\d{4}-\d{2}$/.test(value)))].sort()
  const inventoryMonth = inventoryMonths.at(-1)
  if (inventoryMonth) {
    const currentInventoryMovements = inventoryMovements
      .filter((entry) => String(entry.createdAt || '').startsWith(inventoryMonth))
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    const [inventoryYear, inventoryMonthNumber] = inventoryMonth.split('-').map(Number)
    for (const locale of ['en-AE', 'ar-AE']) {
      const arabic = locale.startsWith('ar')
      const language = arabic ? 'AR' : 'EN'
      const periodLabel = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(`${inventoryMonth}-01T12:00:00`))
      const dateFormatter = new Intl.DateTimeFormat('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Dubai' })
      const stableDateTime = (value) => {
        if (!value) return null
        const parts = Object.fromEntries(dateFormatter.formatToParts(new Date(value)).map((part) => [part.type, part.value]))
        return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`
      }
      const movementReport = buildInventoryMovementReport({
        movements: currentInventoryMovements,
        period: periodLabel,
        locale,
        sportLabel: (value) => value,
        formatDate: stableDateTime,
      })
      await fs.writeFile(path.join(pdfDir, `FMAC-Inventory-Movements-${inventoryMonth}-${language}.pdf`), await createManagementPdfBuffer(movementReport, REPORT_PDF_ASSETS))
      await createManagementWorkbook(movementReport).xlsx.writeFile(path.join(excelDir, `FMAC-Inventory-Movements-${inventoryMonth}-${language}.xlsx`))

      const bySport = {}
      currentInventoryMovements.filter((movement) => movement.type === 'stock_out').forEach((movement) => {
        const sport = movement.issuedTo?.sport || 'general'
        if (!bySport[sport]) bySport[sport] = { orders: new Set(), totalQty: 0, items: {} }
        bySport[sport].orders.add(movement.receiptId || movement.id)
        bySport[sport].totalQty += Number(movement.quantity || 0)
        const itemName = arabic ? (movement.itemNameAr || movement.itemSku) : (movement.itemNameEn || movement.itemNameAr || movement.itemSku)
        bySport[sport].items[itemName] = (bySport[sport].items[itemName] || 0) + Number(movement.quantity || 0)
      })
      const monthlyRows = Object.entries(bySport).map(([sportId, data]) => ({
        sportId,
        sport: sportId,
        orders: data.orders.size,
        totalQty: data.totalQty,
        topItems: Object.entries(data.items).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, quantity]) => `${name} (${quantity})`).join(', '),
      })).sort((a, b) => b.totalQty - a.totalQty)
      const analyticsReport = buildInventoryAnalyticsReport({ reportData: { type: 'monthly', rows: monthlyRows, period: periodLabel, month: inventoryMonthNumber - 1, year: inventoryYear }, locale })
      await fs.writeFile(path.join(pdfDir, `FMAC-Inventory-Monthly-Issuance-${inventoryMonth}-${language}.pdf`), await createManagementPdfBuffer(analyticsReport, REPORT_PDF_ASSETS))
      await createManagementWorkbook(analyticsReport).xlsx.writeFile(path.join(excelDir, `FMAC-Inventory-Monthly-Issuance-${inventoryMonth}-${language}.xlsx`))
    }
  }

  for (const locale of ['en-AE', 'ar-AE']) {
    const language = locale.startsWith('ar') ? 'AR' : 'EN'
    const stockReport = buildStockManagementReport(inventoryItems, { locale, lang: locale.startsWith('ar') ? 'ar' : 'en' })
    await createManagementWorkbook(stockReport).xlsx.writeFile(path.join(excelDir, `FMAC-Inventory-Stock-2026-08-13-${language}.xlsx`))
  }

  const overtimeMonths = [...new Set(overtimeEntries.map((entry) => String(entry.date || '').slice(0, 7)).filter((value) => /^\d{4}-\d{2}$/.test(value)))].sort()
  const overtimeMonth = overtimeMonths.at(-1) || '2026-08'
  const overtimeStaff = [
    ...Object.entries(FLEET_MAPPING).map(([registration, meta]) => ({
      driverName: meta.driverName, employeeType: 'driver', registration,
    })),
    { driverName: 'Mohammed Israr', employeeType: 'labor', registration: '' },
  ]
  for (const locale of ['en-AE', 'ar-AE']) {
    const language = locale.startsWith('ar') ? 'AR' : 'EN'
    const monthName = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(`${overtimeMonth}-01T12:00:00`))
    const overtimeReport = buildOvertimeManagementReport({
      month: overtimeMonth,
      entries: overtimeEntries.filter((entry) => String(entry.date || '').startsWith(overtimeMonth)),
      staff: overtimeStaff,
      monthName,
      locale,
    })
    await createManagementWorkbook(overtimeReport).xlsx.writeFile(path.join(excelDir, `FMAC-Overtime-${overtimeMonth}-${language}.xlsx`))
  }

  const orderedSnapshots = fleetKpiSnapshots
    .slice()
    .sort((a, b) => String(a.period || a.id).localeCompare(String(b.period || b.id)))
  const latestFleetSnapshot = orderedSnapshots.at(-1)
  if (latestFleetSnapshot) {
    for (const locale of ['en-AE', 'ar-AE']) {
      const language = locale.startsWith('ar') ? 'AR' : 'EN'
      const fleetReport = buildFleetPerformanceManagementReport({
        data: latestFleetSnapshot,
        snapshots: orderedSnapshots,
        locale,
        periodLabel: latestFleetSnapshot.period || latestFleetSnapshot.id,
      })
      await createManagementWorkbook(fleetReport).xlsx.writeFile(path.join(excelDir, `FMAC-Fleet-Performance-${latestFleetSnapshot.period || latestFleetSnapshot.id}-${language}.xlsx`))
    }
  }
  await fs.writeFile(path.join(excelDir, 'FMAC-Fuel-Report-2026-07-source.json'), JSON.stringify({
    statementIds: [previous.id, current.id],
    generatedAt: new Date().toISOString(),
    currentTotals,
    previousTotals,
    vehicleCount: vehicles.length,
    operatingCost: operatingResult.summary,
    julyBusFines: fineTotals,
    ridership: {
      availableMonths: ridershipMonths,
      generatedMonth: ridershipMonth || null,
      entryCount: ridershipMonth ? ridershipEntries.filter((entry) => String(entry.date || '').startsWith(ridershipMonth)).length : 0,
    },
    inventory: {
      availableMonths: [...new Set(inventoryMovements.map((entry) => String(entry.createdAt || '').slice(0, 7)).filter((value) => /^\d{4}-\d{2}$/.test(value)))].sort(),
      movementCount: inventoryMovements.length,
      itemCount: inventoryItems.length,
    },
    overtime: { availableMonths: overtimeMonths, entryCount: overtimeEntries.length },
    fleetPerformance: { snapshotCount: fleetKpiSnapshots.length, latestPeriod: latestFleetSnapshot?.period || latestFleetSnapshot?.id || null },
  }, null, 2))
} finally {
  await vite.close()
}

console.log(`Generated verified QA artifacts from Firestore fuel statements ${previous.id} and ${current.id}.`)
