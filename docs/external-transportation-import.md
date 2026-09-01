# External Transportation import audit

Source: `External_Transportation_Restructured.xlsx`  
Imported: 2026-08-31  
Import version: `external-transport-2026-08-31-v1`

## Result

- 568 historical movements imported from rows 2–569.
- Date coverage: 2025-04-23 through 2026-08-31.
- 559 movements linked to a canonical vehicle registration.
- 9 movements retained as unmatched source records for manual review.
- 23 people created: 15 fleet drivers and 8 club staff members authorized to drive.
- 14 current bus assignments migrated into dated assignment records.
- Re-running the import is idempotent and produces zero additional writes.

## Plate exceptions

The following source values do not match a registered fleet vehicle. They were not silently corrected because doing so would alter historical evidence.

| Source plate | Rows | Likely review candidate |
| --- | ---: | --- |
| 530 | 1 | No safe automatic match |
| 57075 | 1 | C37075 |
| 33676 | 2 | A33876 |
| 99261 | 5 | M99271 |

Each exception retains the original plate, source row number, source-file identity, and source hash. The External Transportation screen exposes these records through the plate-exception filter so an authorized user can reconcile them later.

## Data model

- `fleet_people`: drivers and staff who may drive.
- `fleet_driver_assignments`: dated vehicle-to-person assignment history.
- `fleet_external_transportation`: historical and newly entered non-routine movements.
- `fleet_vehicle_meta.driverId` / `driverName`: compatibility projection of the active assignment for existing Fleet screens.

The assignment collection is authoritative. Changing a bus driver closes the prior active assignment, creates the new dated assignment, and refreshes the compatibility projection without changing the vehicle registration.
