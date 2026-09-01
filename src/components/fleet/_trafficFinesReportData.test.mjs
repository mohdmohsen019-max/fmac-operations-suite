import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildFinesReportSummary, noFinesStatement, reportingDateRange,
} from './trafficFinesReportData.js'

test('turns a selected month into its complete date range', () => {
  assert.deepEqual(reportingDateRange('2026-07'), { from: '2026-07-01', to: '2026-07-31' })
  assert.deepEqual(reportingDateRange('2028-02'), { from: '2028-02-01', to: '2028-02-29' })
})

test('produces an explicit no-fines statement for the bus fleet', () => {
  assert.equal(
    noFinesStatement({ scope: 'buses', driver: 'all', periodLabel: 'July 2026' }),
    'No traffic fines recorded against bus drivers or bus vehicles during July 2026.',
  )
  const summary = buildFinesReportSummary({
    scope: 'buses', month: '2026-07', driver: 'all', count: 0, totalAed: 0,
    generatedAt: '2026-08-12T10:00:00.000Z',
  })
  assert.equal(summary.from, '2026-07-01')
  assert.equal(summary.to, '2026-07-31')
  assert.match(summary.result, /^No traffic fines recorded/)
})
