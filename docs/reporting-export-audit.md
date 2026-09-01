# FMAC reporting export audit

Audit date: 12 August 2026

## Shared reporting architecture

The new management-report path is schema driven. A module supplies title, scope, period, KPI, narrative, table, data-quality and source metadata once. The same schema is rendered by:

- `src/services/reporting/pdfReportBuilder.js` for portable A4 PDF documents using `@react-pdf/renderer` and embedded Cairo font files.
- `src/services/reporting/excelReportBuilder.js` for structured Excel workbooks using ExcelJS.
- `src/services/reporting/reportTheme.js` for branding, localized labels, formats and report metadata.
- `src/services/reporting/reportAssets.js` for the embedded FMAC logo and Cairo assets.

The shared path has been applied to Fuel, Fleet Performance, Operating Cost, Traffic Fines, Ridership, Overtime, Inventory Stock, Inventory Movement History and Inventory Analytics. These exports now have consistent management summaries, explicit filters, data-quality notes and detailed tables.

## Repository export-path inventory

| Area | Existing path | Engine before audit | Current status | Risk / next action |
|---|---|---|---|---|
| Fuel Core | `fleet/fuel/fuelReportExport.js` | SheetJS + jsPDF/AutoTable | Migrated to shared PDF and Excel engines | Verified in English and Arabic with live July data |
| Fleet performance | `fleet/fleetPerformanceExport.js` | SheetJS + jsPDF | Migrated to shared PDF and Excel engines | Uses the same KPI source as the screen |
| Overtime | `fleet/overtimeReport.js` | SheetJS + jsPDF | Migrated to shared PDF and Excel engines | Selected month and nil-return state retained |
| Inventory stock | `inventory/inventoryStockExport.js` | CSV-style workbook | Migrated to shared Excel engine | Active search/category/sport/status filters included |
| Department compiled reports | `services/reportExportService.js` | jsPDF + AutoTable | Existing specialist engine retained; Cairo source corrected | Longer-term candidate for the shared schema after section-model parity |
| Department statement workbooks | `services/statementExcelService.js` | SheetJS | Existing workflow retained | Needs staged migration because import and export share one service |
| Fleet operating cost | `fleet/FleetOperatingCost.jsx` | SheetJS | Migrated to shared PDF and Excel engines | Verified with live July fuel, maintenance and fines; unavailable distance remains explicit |
| Traffic fines | `fleet/FleetRiskManagement.jsx` | SheetJS | Migrated to shared PDF and Excel engines | Includes a formal nil-return report and excludes payment status completely |
| Ridership | `fleet/FleetRidership.jsx` | SheetJS + jsPDF | Migrated to shared PDF and Excel engines | Summary and complete daily register use one calculation source |
| General fleet reports | `fleet/FleetReports.jsx` | Component-specific | Legacy | Consolidate after the six report types above share period semantics |
| Inventory movement/history | `inventory/InventoryHistory.jsx` | SheetJS | Migrated to shared PDF and Excel engines | All period records are loaded; evidence coverage and audit detail are reported |
| Inventory analytical reports | `inventory/InventoryReports.jsx` | SheetJS + browser print | Shared PDF and Excel added | Monthly issuance, low stock, movement summary and selected-item reports now use the shared engine; legacy browser print remains available during transition |
| Inventory issue voucher | `inventory/InventoryIssueVoucher.jsx` | html2canvas + jsPDF | Transactional form retained | Dedicated voucher layout is preferable to a dashboard screenshot; keep until approval signatures are regression-tested |
| Inventory reorder | `inventory/InventoryReorder.jsx` | browser print | Legacy | Add purchasing workbook through shared engine |
| Asset reports | `assets/AssetReports.jsx`, `assets/AssetSystem.jsx` | html2canvas + jsPDF, SheetJS | Highest-risk legacy | Replace screenshot PDF with a dedicated asset report schema |
| Asset KPI evidence | `assets/AssetKpiEvidence.jsx` | SheetJS + browser print | Legacy | Migrate formal KPI evidence to shared report metadata |
| Strategic asset reports | `assets/StrategicReportDoc.jsx` | off-screen HTML + html2canvas | Legacy | Formal institutional report requires dedicated paginated renderer |
| Help desk reports | `help/admin/HelpAdminDashboard.jsx` | html2canvas + jsPDF, SheetJS | Highest-risk legacy | Replace screenshot PDF; preserve request evidence and SLA data |
| General reports module | `ReportsModule.jsx` | html2canvas + jsPDF | Legacy compiled workflow | Replace after approved-section parity is tested |
| Transportation | `TransportationModule.jsx`, `utils/exportEngine.js` | generic SheetJS/CSV/browser print | Legacy generic path | Convert to shared workbook after column metadata is explicit |
| Crisis reports | `crisis/CrisisReports.jsx` | CSV | Legacy lightweight export | Keep CSV as data interchange; add management PDF only where required |
| Strategy backup | `StrategyModule.jsx` | SheetJS | Data backup, not a management report | Retain as recovery/export format |
| Maintenance PDF service | `services/pdfService.js` | jsPDF | Legacy isolated path | Migrate when its active caller and record contract are confirmed |
| General report service | `services/reportService.js` | jsPDF | Legacy isolated path | Remove only after caller audit confirms it is unused |

## Libraries and presentation dependencies

- PDF: `@react-pdf/renderer` (new shared engine), `jsPDF`, `jspdf-autotable`, `html2canvas` (legacy paths).
- Excel: ExcelJS (new shared engine), SheetJS/xlsx (legacy import and export paths).
- No pdfmake, Puppeteer or server-side Playwright PDF route was found.
- Browser automation is used only for local visual QA, not production report generation.
- Application typography and locale state are supplied through the existing English/Arabic locale flow.

## QA acceptance evidence

- Real source documents: Firestore `fuelStatements/yWqAY8mQTN4y0QpKpb5K` (June 2026) and `fuelStatements/CecGCqnLbQfK6cAI4NQq` (July 2026).
- July totals used without synthetic telemetry: AED 65,255.60; 19,834.53 litres; 22 vehicle allocations. The bus-only operating-cost report correctly uses the July bus allocation of AED 55,628.43.
- Missing distance is labelled unavailable; it is not converted to zero.
- English and Arabic PDFs were rasterized page by page and visually reviewed.
- English and Arabic workbooks were imported with `artifact_tool`, rendered, and scanned for formula errors.
- Real July operating-cost and bus-fine reports, real August ridership reports, and real August inventory movement and issuance reports were generated in both languages and inspected page by page.
- The August inventory QA set contains 28 real movements, 1,307 issued units and 2 evidence-backed stock-in/issue records; the workbook retains the complete audit columns while the PDF uses a readable operational subset.
- The first workbook render exposed false `29` values in unavailable numeric cells. The writer now stores an em dash without a numeric format for unavailable values.
- Later renders exposed raw percentage decimals and overcrowded PDF tables. KPI number formats and PDF-only column visibility are now part of the shared schema.
- The first PDF implementation exposed disconnected/missing Arabic glyphs in jsPDF with genuine Cairo. The shared PDF engine was replaced with a Fontkit-based shaping renderer.

## Compatibility boundaries

Legacy transactional documents and complex compiled reports remain on their existing paths to avoid silently changing approval, evidence or archive workflows. The shared reporting engine is additive and backward compatible; no Firebase records, routes or deployed assets are changed by this audit.
