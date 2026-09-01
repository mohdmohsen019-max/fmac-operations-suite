import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const projectId = 'fmac-attendance'
const actor = 'mohdmohsen019@gmail.com'
const globalRoot = process.platform === 'win32'
  ? path.join(process.env.APPDATA, 'npm', 'node_modules')
  : execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim()
const firebaseAuth = require(path.join(globalRoot, 'firebase-tools', 'lib', 'auth.js'))
const account = firebaseAuth.getGlobalDefaultAccount()
if (!account?.tokens?.refresh_token) throw new Error('Firebase CLI is not authenticated')

const token = await firebaseAuth.getAccessToken(account.tokens.refresh_token, [])
const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`
const headers = { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' }
const now = new Date().toISOString()

const resolutions = [
  { id: 'external-transport-row-0332', sourcePlate: '57075', vehicleRegistration: 'C37075', plateMatchStatus: 'matched' },
  { id: 'external-transport-row-0337', sourcePlate: '33676', vehicleRegistration: 'A33876', plateMatchStatus: 'matched' },
  { id: 'external-transport-row-0338', sourcePlate: '33676', vehicleRegistration: 'A33876', plateMatchStatus: 'matched' },
  { id: 'external-transport-row-0368', sourcePlate: '99261', vehicleRegistration: 'M99271', plateMatchStatus: 'matched' },
  { id: 'external-transport-row-0421', sourcePlate: '99261', vehicleRegistration: 'M99271', plateMatchStatus: 'matched' },
  { id: 'external-transport-row-0445', sourcePlate: '99261', vehicleRegistration: 'M99271', plateMatchStatus: 'matched' },
  { id: 'external-transport-row-0446', sourcePlate: '99261', vehicleRegistration: 'M99271', plateMatchStatus: 'matched' },
  { id: 'external-transport-row-0454', sourcePlate: '99261', vehicleRegistration: 'M99271', plateMatchStatus: 'matched' },
  { id: 'external-transport-row-0073', sourcePlate: '530', vehicleRegistration: '', plateMatchStatus: 'external_non_club' },
]

const encode = (value) => typeof value === 'boolean' ? { booleanValue: value } : { stringValue: String(value) }

async function patchRecord(resolution) {
  const fields = {
    sourcePlate: encode(resolution.sourcePlate),
    vehicleRegistration: encode(resolution.vehicleRegistration),
    plateMatchStatus: encode(resolution.plateMatchStatus),
    plateResolution: encode(resolution.plateMatchStatus === 'external_non_club' ? 'Confirmed external non-club vehicle; retained as a staff-driven external transport record.' : `Confirmed source correction: ${resolution.sourcePlate} → ${resolution.vehicleRegistration}.`),
    updatedAt: encode(now),
    updatedBy: encode(actor),
  }
  const url = new URL(`${base}/fleet_external_transportation/${resolution.id}`)
  Object.keys(fields).forEach((field) => url.searchParams.append('updateMask.fieldPaths', field))
  const response = await fetch(url, { method: 'PATCH', headers, body: JSON.stringify({ fields }) })
  if (!response.ok) throw new Error(`${resolution.id}: ${response.status} ${await response.text()}`)
}

async function addAuditRecord() {
  const id = 'external-transportation-plate-resolution-2026-08-31'
  const fields = {
    module: encode('fleet'), submodule: encode('externalTransportation'), action: encode('plate_review_resolved'),
    titleEn: encode('External transportation plate review resolved'),
    titleAr: encode('تمت معالجة مراجعة لوحات النقل الخارجي'),
    detailEn: encode('Eight source plate corrections were confirmed. Plate 530 was retained as an external non-club vehicle driven by club staff.'),
    detailAr: encode('تم تأكيد تصحيح ثماني لوحات مصدر. وتم الإبقاء على اللوحة 530 كمركبة خارجية غير مملوكة للنادي قادها موظف بالنادي.'),
    recordId: encode(id), path: encode('/fleet/external-transportation'), actorEmail: encode(actor), actorName: encode(actor), createdAt: encode(now),
  }
  const response = await fetch(`${base}/activity_events?documentId=${id}`, { method: 'POST', headers, body: JSON.stringify({ fields }) })
  if (response.status === 409) return
  if (!response.ok) throw new Error(`Activity record: ${response.status} ${await response.text()}`)
}

console.log('Planned resolutions:')
resolutions.forEach(({ id, sourcePlate, vehicleRegistration, plateMatchStatus }) => console.log(`- ${id}: ${sourcePlate} → ${vehicleRegistration || 'external non-club'} (${plateMatchStatus})`))
if (!process.argv.includes('--apply')) {
  console.log('Dry run only. Re-run with --apply to update Firestore.')
  process.exit(0)
}

for (const resolution of resolutions) await patchRecord(resolution)
await addAuditRecord()
console.log(`Applied ${resolutions.length} plate resolutions and one audit record.`)
