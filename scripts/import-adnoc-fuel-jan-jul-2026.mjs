import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const projectId = 'fmac-attendance'
const actor = 'mohdmohsen019@gmail.com'
const importVersion = 'adnoc-jan-jul-2026-v1'
const sourceDir = 'C:\\Users\\mohdm\\Desktop'
const importData = JSON.parse(await fs.readFile(path.join(repoRoot, 'src', 'data', 'adnocFuelJanJul2026.json'), 'utf8'))
const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8', shell: true }).trim()
const firebaseAuth = require(path.join(globalRoot, 'firebase-tools', 'lib', 'auth.js'))
const account = firebaseAuth.getGlobalDefaultAccount()
if (!account?.tokens?.refresh_token) throw new Error('Firebase CLI is not authenticated')
const tokenResult = await firebaseAuth.getAccessToken(account.tokens.refresh_token, [])
const accessToken = tokenResult.access_token

const trackedRegistrations = new Set([
  'A21248', 'A33867', 'A33876', 'C29769', 'C37069', 'C37072', 'C37074', 'C37075',
  'M85750', 'M85751', 'M85756', 'M85759', 'M99268', 'M99270',
  'M15143', 'M99267', 'M99271', 'M99273',
])
const canonicalToRegistrationDoc = {
  A20107: '20107', A45267: '45267', C26484: '26484', M15143: '15143',
  M99267: '99267', M99271: '99271', M99273: '99273',
}

const timestamp = (value = new Date()) => ({ __firestoreTimestamp: value.toISOString() })
const encode = (value) => {
  if (value && typeof value === 'object' && value.__firestoreTimestamp) return { timestampValue: value.__firestoreTimestamp }
  if (value === null || value === undefined) return { nullValue: null }
  if (typeof value === 'string') return { stringValue: value }
  if (typeof value === 'boolean') return { booleanValue: value }
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } }
  if (typeof value === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, child]) => [key, encode(child)])) } }
  throw new Error(`Unsupported Firestore value: ${typeof value}`)
}
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
const firestoreBase = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`
const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }

async function listCollection(collectionId) {
  const documents = []
  let pageToken = ''
  do {
    const url = new URL(`${firestoreBase}/${collectionId}`)
    url.searchParams.set('pageSize', '1000')
    if (pageToken) url.searchParams.set('pageToken', pageToken)
    const response = await fetch(url, { headers })
    if (response.status === 404) return []
    if (!response.ok) throw new Error(`${collectionId} list failed: ${response.status} ${await response.text()}`)
    const body = await response.json()
    for (const document of body.documents || []) {
      documents.push({ id: document.name.split('/').at(-1), ...Object.fromEntries(Object.entries(document.fields || {}).map(([key, value]) => [key, decode(value)])) })
    }
    pageToken = body.nextPageToken || ''
  } while (pageToken)
  return documents
}

async function patchDocument(collectionId, documentId, patch) {
  const url = new URL(`${firestoreBase}/${collectionId}/${encodeURIComponent(documentId)}`)
  Object.keys(patch).forEach((field) => url.searchParams.append('updateMask.fieldPaths', field))
  const response = await fetch(url, {
    method: 'PATCH', headers,
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(patch).map(([key, value]) => [key, encode(value)])) }),
  })
  if (!response.ok) throw new Error(`${collectionId}/${documentId} write failed: ${response.status} ${await response.text()}`)
  return response.json()
}

async function deleteDocument(collectionId, documentId) {
  const response = await fetch(`${firestoreBase}/${collectionId}/${encodeURIComponent(documentId)}`, { method: 'DELETE', headers })
  if (!response.ok && response.status !== 404) throw new Error(`${collectionId}/${documentId} delete failed: ${response.status} ${await response.text()}`)
}

const round = (value, digits = 2) => {
  const factor = 10 ** digits
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor
}
const periodKey = (statement) => `${Number(statement.year)}-${String(Number(statement.month)).padStart(2, '0')}`
const normalize = (value) => String(value || '').toUpperCase().replace(/\s/g, '')

const [existingStatements, existingRegistrations, existingMeta] = await Promise.all([
  listCollection('fuelStatements'),
  listCollection('fleet_vehicle_registrations'),
  listCollection('fleet_vehicle_meta'),
])

const canonicalStatements = new Map()
const duplicateStatements = []
for (const period of importData.periods) {
  const candidates = existingStatements.filter((row) => periodKey(row) === period.period)
    .sort((a, b) => Number(b.totalLitres || 0) - Number(a.totalLitres || 0))
  if (!candidates.length) throw new Error(`Preflight failed: no existing bus statement for ${period.period}`)
  const canonical = candidates[0]
  const busAllocations = (canonical.vehicleAllocations || []).filter((row) => period.allocations.some((source) => source.vehicleClass === 'bus' && source.registration === normalize(row.plate)))
  if (busAllocations.length !== 14 || Number(canonical.totalLitres) <= 0) {
    throw new Error(`Preflight failed: ${period.period} does not have 14 bus allocations with verified litres`)
  }
  canonicalStatements.set(period.period, canonical)
  duplicateStatements.push(...candidates.slice(1))
}

const currentRoster = importData.periods.find((row) => row.period === importData.currentRosterPeriod)?.allocations.map((row) => row.registration) || []
if (new Set(currentRoster).size !== 23) throw new Error(`Preflight failed: current roster contains ${new Set(currentRoster).size}, expected 23`)

console.log(`Preflight passed: ${currentRoster.length} current vehicles, ${importData.periods.length} source periods, ${duplicateStatements.length} duplicate statement.`)

for (const period of importData.periods) {
  const canonical = canonicalStatements.get(period.period)
  const existingByRegistration = new Map((canonical.vehicleAllocations || []).map((row) => [normalize(row.plate), row]))
  const impliedPrice = period.busAmountAed / Number(canonical.totalLitres)
  const allocations = period.allocations.map((source) => {
    const existing = existingByRegistration.get(source.registration)
    const preservesVerifiedBusLitres = source.vehicleClass === 'bus'
    const litres = preservesVerifiedBusLitres
      ? Number(existing?.litres || 0)
      : round(source.amountAed / impliedPrice, 2)
    return {
      plate: source.registration,
      registration: source.registration,
      vehicleClass: source.vehicleClass,
      cost: source.amountAed,
      litres,
      vatAed: source.vatAed,
      litresEstimated: !preservesVerifiedBusLitres,
      litresBasis: preservesVerifiedBusLitres ? 'preserved-verified-bus-record' : 'derived-from-monthly-bus-implied-price',
      sourceVehicleInfo: source.vehicleInfo,
      sourceRows: source.sourceRows,
    }
  })
  const totalLitres = round(allocations.reduce((sum, row) => sum + row.litres, 0), 2)
  const [year, month] = period.period.split('-').map(Number)
  const sourcePath = path.join(sourceDir, period.sourceFile)
  const sourceBytes = await fs.readFile(sourcePath)
  const sourceHash = crypto.createHash('sha256').update(sourceBytes).digest('hex')
  const attachmentId = period.period

  await patchDocument('fuel_statement_files', attachmentId, {
    period: period.period,
    statementId: canonical.id,
    name: period.sourceFile,
    size: sourceBytes.length,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    dataBase64: sourceBytes.toString('base64'),
    sha256: sourceHash,
    uploadedAt: timestamp(),
    uploadedBy: actor,
    source: 'ADNOC beneficiary vehicle fuel summary',
  })

  await patchDocument('fuelStatements', canonical.id, {
    year,
    month,
    totalCost: period.totalAmountAed,
    totalLitres,
    vehicleAllocations: allocations,
    vehicleCount: period.vehicleCount,
    sourceRowCount: period.rowCount,
    totalVatAed: period.totalVatAed,
    busTotals: {
      cost: period.busAmountAed,
      litres: Number(canonical.totalLitres),
      vehicleCount: 14,
      litresPreserved: true,
    },
    otherVehicleTotals: {
      cost: period.otherAmountAed,
      litres: round(allocations.filter((row) => row.vehicleClass === 'other').reduce((sum, row) => sum + row.litres, 0), 2),
      vehicleCount: period.allocations.filter((row) => row.vehicleClass === 'other').length,
      litresEstimated: true,
    },
    sourceAttachment: {
      fileDocId: attachmentId,
      name: period.sourceFile,
      size: sourceBytes.length,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      sha256: sourceHash,
      storageMode: 'firestore',
    },
    sourceFormat: 'ADNOC beneficiary vehicle fuel summary',
    sourceCostField: 'Total Amount (AED)',
    sourceVatField: 'Total VAT Amount (AED)',
    vatReportedSeparately: true,
    impliedPricePerLitre: round(impliedPrice, 5),
    historicalBusLitresPreserved: true,
    reconciliationVersion: importVersion,
    reconciledAt: timestamp(),
    reconciledBy: actor,
  })
  console.log(`${period.period}: ${period.vehicleCount} vehicles, AED ${period.totalAmountAed.toFixed(2)}, ${totalLitres.toFixed(2)} L recorded.`)
}

const registrationsById = new Map(existingRegistrations.map((row) => [row.id, row]))
for (const canonicalRegistration of currentRoster) {
  const registrationDocId = canonicalToRegistrationDoc[canonicalRegistration] || canonicalRegistration
  const existing = registrationsById.get(registrationDocId)
  const plateMatch = canonicalRegistration.match(/^([A-Z]+)(\d+)$/)
  const registrationPatch = {
    canonicalRegistration,
    fullRegistration: canonicalRegistration,
    plateCode: plateMatch?.[1] || '',
    plateNumber: plateMatch?.[2] || canonicalRegistration,
    clubOwned: true,
    rosterSource: 'ADNOC 2026-06 statement',
    rosterVerifiedAt: timestamp(),
  }
  if (!existing) {
    Object.assign(registrationPatch, {
      registration: registrationDocId,
      make: '', model: '', year: null, vehicleType: '', passengers: null,
      chassisNumber: '', registrationExpiry: '', insuranceExpiry: '',
      registrationCard: null,
      registrationCardStatus: 'missing',
      notes: 'Registration card not uploaded yet.',
    })
  }
  await patchDocument('fleet_vehicle_registrations', registrationDocId, registrationPatch)

  const registrationDetails = existing || {}
  const isTracked = trackedRegistrations.has(canonicalRegistration)
  const existingVehicleMeta = existingMeta.find((row) => row.id === canonicalRegistration) || {}
  await patchDocument('fleet_vehicle_meta', canonicalRegistration, {
    registration: canonicalRegistration,
    canonicalRegistration,
    plateNumber: canonicalRegistration,
    vehicleClass: periodClass(canonicalRegistration),
    manufacturer: existingVehicleMeta.manufacturer || registrationDetails.make || '',
    model: existingVehicleMeta.model || registrationDetails.model || '',
    year: existingVehicleMeta.year ?? registrationDetails.year ?? null,
    vehicleType: existingVehicleMeta.vehicleType || registrationDetails.vehicleType || (periodClass(canonicalRegistration) === 'bus' ? 'Bus' : ''),
    capacity: existingVehicleMeta.capacity ?? registrationDetails.passengers ?? (periodClass(canonicalRegistration) === 'bus' ? 23 : null),
    operationalStatus: existingVehicleMeta.operationalStatus || 'active',
    trackingStatus: isTracked ? 'tracked' : 'not_tracked',
    trackingNote: isTracked ? 'Tracked by Cartrack.' : 'Not tracked by Cartrack; retained as a club-owned fleet vehicle.',
    cartrackRegistration: existingVehicleMeta.cartrackRegistration || (isTracked ? canonicalRegistration : ''),
    cartrackId: existingVehicleMeta.cartrackId || '',
    clubOwned: true,
    ownership: 'club',
    rosterSource: 'ADNOC 2026-06 statement',
    telemetryAliases: canonicalRegistration === 'C37072' || canonicalRegistration === 'A33867'
      ? [`${canonicalRegistration}-CAM`]
      : (existingVehicleMeta.telemetryAliases || []),
    updatedAt: timestamp(),
    updatedBy: actor,
  })
}

function periodClass(registration) {
  return importData.periods.flatMap((period) => period.allocations).find((row) => row.registration === registration)?.vehicleClass || 'other'
}

if (existingMeta.some((row) => row.id === 'C23530')) {
  await patchDocument('fleet_vehicle_meta', 'C23530', {
    clubOwned: false,
    ownership: 'external',
    ownershipNote: 'Cartrack-only Toyota Coaster; absent from the club registration-card and current ADNOC rosters.',
    updatedAt: timestamp(),
    updatedBy: actor,
  })
}

for (const duplicate of duplicateStatements) {
  await patchDocument('fuelStatements_archive', duplicate.id, {
    originalCollection: 'fuelStatements',
    originalId: duplicate.id,
    archivedReason: 'Duplicate monthly statement with zero litres; canonical verified statement retained.',
    originalDocument: duplicate,
    archivedAt: timestamp(),
    archivedBy: actor,
    importVersion,
  })
  await deleteDocument('fuelStatements', duplicate.id)
  console.log(`Archived and removed duplicate fuelStatements/${duplicate.id}.`)
}

console.log('ADNOC Jan-Jul 2026 import completed successfully.')
