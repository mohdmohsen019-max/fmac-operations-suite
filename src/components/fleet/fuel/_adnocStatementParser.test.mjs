import fs from 'node:fs'
import * as XLSX from 'xlsx'
import { combineAdnocImports, parseAdnocWorksheet } from './adnocStatementParser.js'

let failures = 0
const assert = (name, condition) => {
  if (condition) console.log(`  ok  ${name}`)
  else { failures += 1; console.error(`FAIL  ${name}`) }
}
const close = (actual, expected, tolerance = 0.01) => Math.abs(actual - expected) <= tolerance
const rowsFrom = (path) => {
  const workbook = XLSX.read(fs.readFileSync(path), { type: 'buffer', cellDates: true })
  return XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {
    header: 1, defval: null, raw: true,
  })
}

const paymentPath = 'C:/Users/mohdm/Downloads/Payment24 - Custom Report - 01092026 - 082233.xlsx'
const transactionPath = 'C:/Users/mohdm/Downloads/august.xlsx'

const payment = parseAdnocWorksheet(rowsFrom(paymentPath))
const ledger = parseAdnocWorksheet(rowsFrom(transactionPath))
const combined = combineAdnocImports([payment, ledger])

assert('Payment24 format detected below metadata rows', payment.format === 'payment24-summary')
assert('Payment24 control total is 66,458.04 AED', close(payment.totalCost, 66458.04))
assert('Payment24 maps full Fujairah plate code', payment.allocations.some((row) => row.plate === 'C37074'))
assert('detailed transaction ledger detected', ledger.format === 'transaction-ledger')
assert('all 343 transaction rows retained', combined.transactions.length === 343)
assert('all 23 vehicles retained', combined.vehicleAllocations.length === 23)
assert('ledger litres total is 18,840.54', close(combined.totalLitres, 18840.54))
assert('ledger amount total is 67,424.93 AED', close(combined.totalCost, 67424.93))
assert('diesel and Special 95 stay separate', combined.fuelTypeSummary.length === 2
  && combined.fuelTypeSummary.some((row) => row.fuelType === 'Diesel')
  && combined.fuelTypeSummary.some((row) => row.fuelType === 'Special 95'))
assert('numeric transaction plates inherit full Payment24 code', combined.transactions.some((row) => row.plate === 'C37074'))
assert('transaction ledger remains authoritative', combined.dataModel === 'transaction-ledger')
assert('966.89 AED control variance is retained', close(combined.reconciliationVariance, 966.89))
assert('per-vehicle Payment24 controls are retained for fleet-scope reconciliation', combined.statementControlAllocations.length === 23)
assert('period detected as August 2026', combined.month === 8 && combined.year === 2026)

if (failures) process.exit(1)
console.log('\nADNOC August import verified against both source workbooks.')
