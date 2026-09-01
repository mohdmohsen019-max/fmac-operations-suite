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
const sourcePath = 'C:\\Users\\mohdm\\Desktop\\External_Transportation_Restructured.xlsx'
const source = JSON.parse(await fs.readFile(path.join(repoRoot, 'src', 'data', 'externalTransportationHistorical.json'), 'utf8'))
const sourceBytes = await fs.readFile(sourcePath)
const sourceSha256 = crypto.createHash('sha256').update(sourceBytes).digest('hex')

const globalRoot = process.platform === 'win32'
  ? path.join(process.env.APPDATA, 'npm', 'node_modules')
  : execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim()
const firebaseAuth = require(path.join(globalRoot, 'firebase-tools', 'lib', 'auth.js'))
const account = firebaseAuth.getGlobalDefaultAccount()
if (!account?.tokens?.refresh_token) throw new Error('Firebase CLI is not authenticated')
const tokenResult = await firebaseAuth.getAccessToken(account.tokens.refresh_token, [])
const accessToken = tokenResult.access_token
const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`
const databaseName = `projects/${projectId}/databases/(default)/documents`
const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }

const encode = (value) => {
  if (value === null || value === undefined) return { nullValue: null }
  if (typeof value === 'string') return { stringValue: value }
  if (typeof value === 'boolean') return { booleanValue: value }
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } }
  if (typeof value === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, child]) => [key, encode(child)])) } }
  throw new Error(`Unsupported value ${typeof value}`)
}

async function listIds(collectionId) {
  const ids = new Set()
  let pageToken = ''
  do {
    const url = new URL(`${base}/${collectionId}`)
    url.searchParams.set('pageSize', '1000')
    if (pageToken) url.searchParams.set('pageToken', pageToken)
    const response = await fetch(url, { headers })
    if (response.status === 404) return ids
    if (!response.ok) throw new Error(`${collectionId} list failed: ${response.status} ${await response.text()}`)
    const body = await response.json()
    for (const document of body.documents || []) ids.add(document.name.split('/').at(-1))
    pageToken = body.nextPageToken || ''
  } while (pageToken)
  return ids
}

const write = (collectionId, id, data, updateMask = null) => ({
  update: {
    name: `${databaseName}/${collectionId}/${id}`,
    fields: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, encode(value)])),
  },
  ...(updateMask ? { updateMask: { fieldPaths: updateMask } } : { currentDocument: { exists: false } }),
})

async function commit(writes) {
  for (let index = 0; index < writes.length; index += 250) {
    const batch = writes.slice(index, index + 250)
    const response = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`, {
      method: 'POST', headers, body: JSON.stringify({ writes: batch }),
    })
    if (!response.ok) throw new Error(`Commit ${index / 250 + 1} failed: ${response.status} ${await response.text()}`)
    console.log(`Committed ${Math.min(index + 250, writes.length)} / ${writes.length} writes.`)
  }
}

const idFromName = (value) => String(value || '').trim().toLowerCase()
  .replace(/[^a-z0-9\u0600-\u06ff]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
const displayNames = [...new Set(source.records.map((record) => record.personName))]
const currentBusAssignments = {
  M85750: 'Zahid', M85751: 'Uzair Ahmed', M85759: 'Jamshaid Ullah', M99268: 'Mohamed Khalifa',
  C37069: 'Fouad', A21248: 'Manzoor', C37075: 'Mohamed Kashif', A33867: 'Abdulmalik',
  A33876: 'Mohamed Ishaq', C37072: 'Abdul nawaz', M99270: 'Tafeel Khan', C37074: 'Shah Fahad',
  M85756: 'Mohamed Noor', C29769: 'Ziaullah',
}
const knownDrivers = new Set([...Object.values(currentBusAssignments), 'Saif ur Rahman'])
const importedAt = new Date().toISOString()

const [existingPeople, existingAssignments, existingTrips, existingActivity] = await Promise.all([
  listIds('fleet_people'), listIds('fleet_driver_assignments'), listIds('fleet_external_transportation'), listIds('activity_events'),
])
const writes = []

for (const name of [...new Set([...displayNames, ...Object.values(currentBusAssignments)])]) {
  const id = idFromName(name)
  if (existingPeople.has(id)) continue
  writes.push(write('fleet_people', id, {
    displayName: name,
    nameEn: name,
    nameAr: '',
    personType: knownDrivers.has(name) ? 'driver' : 'staff',
    canDrive: true,
    active: true,
    employeeId: '', phone: '', notes: '',
    source: displayNames.includes(name) ? source.sourceFile : 'current bus roster',
    createdAt: importedAt, createdBy: actor, updatedAt: importedAt, updatedBy: actor,
  }))
}

for (const [vehicleRegistration, personName] of Object.entries(currentBusAssignments)) {
  const id = `current-${vehicleRegistration.toLowerCase()}`
  const personId = idFromName(personName)
  if (!existingAssignments.has(id)) {
    writes.push(write('fleet_driver_assignments', id, {
      vehicleRegistration, personId, personName, personType: 'driver', effectiveDate: '2026-08-31',
      reason: 'Initial dated assignment created from the confirmed current bus roster.', status: 'active',
      createdAt: importedAt, createdBy: actor, importVersion: source.importVersion,
    }))
    writes.push(write('fleet_vehicle_meta', vehicleRegistration, {
      driverId: personId, driverName: personName, driverAssignedAt: '2026-08-31', updatedAt: importedAt, updatedBy: actor,
    }, ['driverId', 'driverName', 'driverAssignedAt', 'updatedAt', 'updatedBy']))
  }
}

for (const record of source.records) {
  if (existingTrips.has(record.id)) continue
  writes.push(write('fleet_external_transportation', record.id, {
    ...record,
    personId: idFromName(record.personName),
    personType: knownDrivers.has(record.personName) ? 'driver' : 'staff',
    source: 'historical_import', sourceFile: source.sourceFile, sourceSheet: source.sheet,
    sourceFileSha256: sourceSha256, importVersion: source.importVersion,
    createdAt: importedAt, createdBy: actor, updatedAt: importedAt, updatedBy: actor,
  }))
}

const activityId = 'external-transportation-import-2026-08-31'
if (!existingActivity.has(activityId)) writes.push(write('activity_events', activityId, {
  module: 'fleet', submodule: 'externalTransportation', action: 'historical_import',
  titleEn: `External transportation history imported · ${source.rowCount} rows`,
  titleAr: `تم استيراد سجل النقل الخارجي · ${source.rowCount} سجلاً`,
  detailEn: `${source.dateRange.from} to ${source.dateRange.to}; source-plate resolutions are retained with the imported records.`,
  detailAr: `من ${source.dateRange.from} إلى ${source.dateRange.to}؛ يتم الاحتفاظ بقرارات مطابقة لوحات المصدر مع السجلات المستوردة.`,
  recordId: source.importVersion, path: '/fleet/external-transportation',
  metadata: { sourceFile: source.sourceFile, sourceFileSha256: sourceSha256, rowCount: source.rowCount },
  actorUid: '', actorEmail: actor, actorName: actor, createdAt: importedAt,
}))

console.log(`Preflight: ${source.rowCount} source rows; ${source.records.filter((record) => record.plateMatchStatus === 'matched').length} matched and ${source.records.filter((record) => record.plateMatchStatus === 'unmatched').length} unmatched.`)
console.log(`Ready to apply ${writes.length} idempotent writes (${existingTrips.size} trip rows already present).`)
if (process.argv.includes('--apply')) {
  await commit(writes)
  console.log('External transportation import completed.')
} else {
  console.log('Dry run only. Re-run with --apply after reviewing the preflight output.')
}
