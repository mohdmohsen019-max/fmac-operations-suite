import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const manifestUrl = new URL('../src/data/externalTransportationHistorical.json', import.meta.url)

test('external transportation manifest is complete and stable', async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'))
  const records = manifest.records || []
  const matched = records.filter((record) => record.plateMatchStatus === 'matched')
  const unmatched = records.filter((record) => record.plateMatchStatus === 'unmatched')
  const externalNonClub = records.filter((record) => record.plateMatchStatus === 'external_non_club')

  assert.equal(manifest.rowCount, 568)
  assert.equal(records.length, 568)
  assert.equal(new Set(records.map((record) => record.id)).size, 568)
  assert.equal(new Set(records.map((record) => record.sourceRow)).size, 568)
  assert.equal(matched.length, 567)
  assert.equal(unmatched.length, 0)
  assert.equal(externalNonClub.length, 1)
  assert.deepEqual(manifest.dateRange, { from: '2025-04-23', to: '2026-08-31' })
  assert.ok(records.every((record) => record.sourceHash?.length === 64))
  assert.ok(matched.every((record) => record.vehicleRegistration))
  assert.ok(externalNonClub.every((record) => !record.vehicleRegistration && record.sourcePlate === '530'))
})
