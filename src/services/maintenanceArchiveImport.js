import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore'
import { db, auth } from '../firebase'
import invoiceArchive from '../data/abuThahnunMaintenanceJanJul2026.json'
import { resolveKnownBusRegistration } from './fleetMapping'
import { templateCategoryFromRecord } from '../components/fleet/maintenance/preventiveMaintenance'

export const MAINTENANCE_ARCHIVE_ID = 'abu-thahnun-jan-jul-2026'
export const MAINTENANCE_ARCHIVE_TOTAL = 62353.79

const SUPPLIER = 'Abu Thahnun Garage and Parts Trading Company'
const SOURCE_FILES = {
  1: 'كراج ابو طحنون (1).pdf',
  2: 'كراج ابو طحنون.pdf',
  3: 'كراج ابو طحنون (4).pdf',
  4: 'كراج ابو طحنون (3).pdf',
  5: 'كراج ابوطحنون (1).pdf',
  6: 'كراج ابو طحنون (2).pdf',
  7: 'كراج ابوطحنون.pdf',
}

const cleanDescription = (value) => String(value || '')
  .replace(/Kâ€ž|K,\s*,/g, 'KM')
  .replace(/PLA'I'E|PIAYE|PIATE/g, 'PLATE')
  .replace(/NUMBEER/g, 'NUMBER')
  .replace(/\b(?:ENGTNE|ENGNE|ENGINF|F\.NGINE)\b/g, 'ENGINE')
  .replace(/\b(?:OTL|011,)\b/g, 'OIL')
  .replace(/\bDTESEL\b/g, 'DIESEL')
  .replace(/\s+/g, ' ')
  .trim()

export const VEHICLE_REGISTRATION_ARCHIVE = [
  { plateNumber: '15143', registration: '15143', make: 'Toyota', model: 'Innova', year: 2020, vehicleType: 'Station wagon', passengers: 8, chassisNumber: 'MHFCX8EM3L0117518', registrationDate: '2021-03-30', registrationExpiry: '2027-07-02', insuranceExpiry: '2027-08-02', sourceDocument: 3, sourcePage: 22 },
  { plateNumber: '20107', registration: '20107', make: 'Nissan', model: 'X-Trail', year: 2018, vehicleType: 'SUV', passengers: 5, chassisNumber: 'JN1BT2MWXJW611809', registrationExpiry: '2027-01-12', insuranceExpiry: '2027-02-12', sourceDocument: 4, sourcePage: 26 },
  { plateNumber: '21248', registration: 'A21248', make: 'Toyota', model: 'Coaster', year: 2020, vehicleType: 'Bus', passengers: 23, chassisNumber: 'JTGFK71SXL6006037', registrationDate: '2019-09-30', registrationExpiry: '2027-01-12', insuranceExpiry: '2027-02-12', sourceDocument: 1, sourcePage: 14 },
  { plateNumber: '26484', registration: '26484', make: 'Nissan', model: 'Maxima', year: 2017, vehicleType: 'Sedan', passengers: 5, chassisNumber: '1N4AA6AP6HC360356', registrationDate: '2017-07-24', registrationExpiry: '2027-01-12', insuranceExpiry: '2027-02-12', sourceDocument: 3, sourcePage: 28 },
  { plateNumber: '29769', registration: 'C29769', make: 'Toyota', model: 'Coaster', year: 2017, vehicleType: 'Bus', passengers: 23, chassisNumber: 'JTGFK71S8H6002401', registrationDate: '2017-12-28', registrationExpiry: '2026-06-09', insuranceExpiry: '2026-07-09', sourceDocument: 5, sourcePage: 23 },
  { plateNumber: '33867', registration: 'A33867', make: 'Toyota', model: 'Coaster', year: 2020, vehicleType: 'Bus', passengers: 23, chassisNumber: 'JTGFK71R6L6005953', registrationDate: '2019-09-30', registrationExpiry: '2027-01-12', insuranceExpiry: '2027-02-12', sourceDocument: 1, sourcePage: 8 },
  { plateNumber: '33876', registration: 'A33876', make: 'Toyota', model: 'Coaster', year: 2020, vehicleType: 'Bus', passengers: 23, chassisNumber: 'JTGFK71S5L6005961', registrationDate: '2019-09-30', registrationExpiry: '2027-01-12', insuranceExpiry: '2027-02-12', sourceDocument: 2, sourcePage: 8 },
  { plateNumber: '37069', registration: 'C37069', make: 'Toyota', model: 'Hiace', year: 2019, vehicleType: 'Van', passengers: 13, chassisNumber: 'JTGHN9CP3K6001020', registrationDate: '2019-05-28', registrationExpiry: '2026-11-24', insuranceExpiry: '2026-12-24', sourceDocument: 3, sourcePage: 20 },
  { plateNumber: '37072', registration: 'C37072', make: 'Toyota', model: 'Coaster', year: 2019, vehicleType: 'Bus', passengers: 23, chassisNumber: 'JTGFK71S8K6005213', registrationDate: '2019-05-28', registrationExpiry: '2026-11-24', insuranceExpiry: '2026-12-24', sourceDocument: 5, sourcePage: 15 },
  { plateNumber: '37074', registration: 'C37074', make: 'Toyota', model: 'Coaster', year: 2019, vehicleType: 'Bus', passengers: 23, chassisNumber: 'JTGFK71S8K6005386', registrationDate: '2019-05-28', registrationExpiry: '2026-11-24', insuranceExpiry: '2026-12-24', sourceDocument: 4, sourcePage: 17 },
  { plateNumber: '37075', registration: 'C37075', make: 'Toyota', model: 'Coaster', year: 2019, vehicleType: 'Bus', passengers: 23, chassisNumber: 'JTGFK71S4K6005383', registrationDate: '2019-05-28', registrationExpiry: '2026-11-24', insuranceExpiry: '2026-12-24', sourceDocument: 4, sourcePage: 16 },
  { plateNumber: '45267', registration: '45267', make: 'Nissan', model: 'Altima', year: 2016, vehicleType: 'Sedan', passengers: 5, chassisNumber: '1N4AL3AP5GC106730', registrationDate: '2016-05-24', registrationExpiry: '2027-01-12', insuranceExpiry: '2027-02-12', sourceDocument: 5, sourcePage: 28 },
  { plateNumber: '85750', registration: 'M85750', make: 'Toyota', model: 'Coaster', year: 2022, vehicleType: 'Bus', passengers: 23, chassisNumber: 'JTGCECB89N6936452', registrationDate: '2022-12-14', registrationExpiry: '2027-01-12', insuranceExpiry: '2027-02-12', sourceDocument: 3, sourcePage: 24 },
  { plateNumber: '85751', registration: 'M85751', make: 'Toyota', model: 'Coaster', year: 2022, vehicleType: 'Bus', passengers: 23, chassisNumber: 'JTGCECB8XN6936508', registrationDate: '2022-12-14', registrationExpiry: '2027-01-12', insuranceExpiry: '2027-02-12', sourceDocument: 2, sourcePage: 38 },
  { plateNumber: '85756', registration: 'M85756', make: 'Toyota', model: 'Coaster', year: 2022, vehicleType: 'Bus', passengers: 23, chassisNumber: 'JTGCECB8XN6936444', registrationDate: '2022-12-14', registrationExpiry: '2027-01-12', insuranceExpiry: '2027-02-12', sourceDocument: 4, sourcePage: 25 },
  { plateNumber: '85759', registration: 'M85759', make: 'Toyota', model: 'Coaster', year: 2022, vehicleType: 'Bus', passengers: 23, chassisNumber: 'JTGCECB88N6936510', registrationDate: '2022-12-14', registrationExpiry: '2027-01-12', insuranceExpiry: '2027-02-12', sourceDocument: 3, sourcePage: 16 },
  { plateNumber: '99267', registration: '99267', make: 'Toyota', model: 'Camry', year: 2020, vehicleType: 'Sedan', passengers: 5, chassisNumber: 'JTNBF9HK7L3050684', registrationDate: '2020-10-06', registrationExpiry: '2027-01-12', insuranceExpiry: '2027-02-12', sourceDocument: 4, sourcePage: 22 },
  { plateNumber: '99268', registration: 'M99268', make: 'Toyota', model: 'Coaster', year: 2024, vehicleType: 'Bus', passengers: 23, chassisNumber: 'JTGCECB87R6937508', registrationDate: '2025-01-16', registrationExpiry: '2027-01-26', insuranceExpiry: '2027-02-26', sourceDocument: 5, sourcePage: 19 },
  { plateNumber: '99270', registration: 'M99270', make: 'Toyota', model: 'Coaster', year: 2020, vehicleType: 'Bus', passengers: 23, chassisNumber: 'JTGFK71S8L6007929', registrationDate: '2020-10-06', registrationExpiry: '2026-11-24', insuranceExpiry: '2026-12-24', sourceDocument: 7, sourcePage: 12 },
  { plateNumber: '99271', registration: '99271', make: 'Toyota', model: 'Innova', year: 2020, vehicleType: 'Station wagon', passengers: 8, chassisNumber: 'MHFCX8EM3L0117188', registrationDate: '2020-10-06', registrationExpiry: '2026-11-24', insuranceExpiry: '2026-12-24', sourceDocument: 3, sourcePage: 8 },
  { plateNumber: '99273', registration: '99273', make: 'Ford', model: 'F-150', year: 2020, vehicleType: 'Crew cab pickup', passengers: 5, chassisNumber: '1FTEW1E42LFA44024', registrationDate: '2020-10-05', registrationExpiry: '2026-11-24', insuranceExpiry: '2026-12-24', sourceDocument: 5, sourcePage: 30 },
].map((record) => ({
  ...record,
  sourceFile: SOURCE_FILES[record.sourceDocument],
  insuranceProvider: 'Fujairah National Insurance Company',
  sourceArchive: MAINTENANCE_ARCHIVE_ID,
}))

const PART_RULES = [
  { id: 'invoice_radiator', nameEn: 'Radiator', nameAr: 'الراديتر', lifespanDays: 1460, pattern: /RADIATOR (?:ORIGINAL|JAPAN|3 MONTHS)/ },
  { id: 'invoice_thermostat', nameEn: 'Thermostat', nameAr: 'الثرموستات', lifespanDays: 1095, pattern: /THERMOSTAT/ },
  { id: 'seed_brake_pads', nameEn: 'Brake Pads', nameAr: 'تيل الفرامل', lifespanDays: 730, pattern: /(?:FRONT|REAR) BRAKE PA/ },
  { id: 'invoice_wheel_bearing', nameEn: 'Wheel Bearing', nameAr: 'رولمان العجل', lifespanDays: 1095, pattern: /WHEEL BEARING/ },
  { id: 'invoice_lower_arm_bush', nameEn: 'Lower Arm Bush', nameAr: 'جلدة المقص السفلي', lifespanDays: 1095, pattern: /LOWER ARM BUSH/ },
  { id: 'invoice_coolant_pipe', nameEn: 'Coolant Pipe', nameAr: 'أنبوب سائل التبريد', lifespanDays: 1095, pattern: /COOLANT PIPE/ },
  { id: 'invoice_engine_fan', nameEn: 'Engine Fan', nameAr: 'مروحة المحرك', lifespanDays: 1095, pattern: /ENGINE FAN/ },
  { id: 'invoice_fan_motor', nameEn: 'Fan Motor', nameAr: 'محرك المروحة', lifespanDays: 1095, pattern: /FAN MOTOR/ },
  { id: 'seed_air_filter', nameEn: 'Air Filter', nameAr: 'فلتر الهواء', lifespanDays: 365, pattern: /AIR FILTER/ },
  { id: 'invoice_spark_plugs', nameEn: 'Spark Plugs', nameAr: 'شمعات الاحتراق', lifespanDays: 730, pattern: /\bPLUGS? ORIGINAL/ },
  { id: 'invoice_fuel_filter', nameEn: 'Fuel Filter', nameAr: 'فلتر الوقود', lifespanDays: 365, pattern: /FUEL FILTER/ },
  { id: 'invoice_air_flow_sensor', nameEn: 'Air Flow Sensor', nameAr: 'حساس تدفق الهواء', lifespanDays: 1460, pattern: /AIR FLOW SENSOR|ATR FLOW SENSOR/ },
  { id: 'invoice_oxygen_sensor', nameEn: 'Oxygen Sensor', nameAr: 'حساس الأكسجين', lifespanDays: 1460, pattern: /OXYGEN SENSOR/ },
  { id: 'invoice_dynamo', nameEn: 'Alternator / Dynamo', nameAr: 'الدينمو', lifespanDays: 1460, pattern: /DYNAMO USED/ },
  { id: 'invoice_clutch', nameEn: 'Clutch Assembly', nameAr: 'مجموعة الكلتش', lifespanDays: 1460, pattern: /CLUTCH SET|CLUTCH BEARING|CLUTCH CYLINDER|CYLINDER TOP AND BOTTOM/ },
  { id: 'invoice_ac_belt', nameEn: 'A/C Belt', nameAr: 'سير المكيف', lifespanDays: 1095, pattern: /AC BELT/ },
  { id: 'seed_drive_belt', nameEn: 'Drive Belt', nameAr: 'سير المحرك', lifespanDays: 1095, pattern: /ENGINE BELT|FAN BELT/ },
  { id: 'invoice_ac_compressor', nameEn: 'A/C Compressor', nameAr: 'ضاغط المكيف', lifespanDays: 1460, pattern: /COMPRESSOR JAPAN NEW|COMPRESSOR PULLEY|CLUTCH PULLEY SET/ },
  { id: 'invoice_ac_filter', nameEn: 'A/C Filter', nameAr: 'فلتر المكيف', lifespanDays: 365, pattern: /AC FILTER|CONDENSER FILTER/ },
  { id: 'seed_battery', nameEn: 'Battery', nameAr: 'البطارية', lifespanDays: 730, pattern: /\bBATTERY\b/ },
  { id: 'invoice_engine_gasket', nameEn: 'Engine Gasket Set', nameAr: 'طقم جوان المحرك', lifespanDays: 1460, pattern: /ENGINE KIT|HEAD GASKET/ },
  { id: 'invoice_headlight_bulb', nameEn: 'Lighting Bulbs', nameAr: 'لمبات الإضاءة', lifespanDays: 730, pattern: /HEADLIGHT BULB|REAR BULBS?/ },
  { id: 'invoice_blower', nameEn: 'Blower Assembly', nameAr: 'مجموعة منفاخ المكيف', lifespanDays: 1095, pattern: /BLOWER ASSEMBLY/ },
  { id: 'invoice_water_pump', nameEn: 'Water Pump', nameAr: 'مضخة الماء', lifespanDays: 1095, pattern: /WATER PUMP/ },
]

const validateArchive = () => {
  if (invoiceArchive.length !== 90) throw new Error(`Expected 90 invoices; found ${invoiceArchive.length}.`)
  const uniqueInvoices = new Set(invoiceArchive.map((record) => record.invoiceNumber))
  if (uniqueInvoices.size !== invoiceArchive.length) throw new Error('Duplicate invoice numbers found in the archive.')
  const total = invoiceArchive.reduce((sum, record) => sum + Number(record.total || 0), 0)
  if (Math.abs(total - MAINTENANCE_ARCHIVE_TOTAL) > 0.01) {
    throw new Error(`Archive total mismatch: AED ${total.toFixed(2)}.`)
  }
  if (invoiceArchive.some((record) => !record.description || !record.date || !record.plateNumber)) {
    throw new Error('An invoice is missing required source data.')
  }
}

const commitInChunks = async (items, stage, size = 400) => {
  for (let index = 0; index < items.length; index += size) {
    const batch = writeBatch(db)
    items.slice(index, index + size).forEach((item) => stage(batch, item))
    await batch.commit()
  }
}

const maintenanceDocs = () => invoiceArchive.map((record) => ({
  ...record,
  plateNumberRaw: record.plateNumber,
  plateNumber: resolveKnownBusRegistration(record.plateNumber),
  canonicalPlate: resolveKnownBusRegistration(record.plateNumber),
  completedAt: record.date,
  maintenanceType: 'corrective',
  serviceCategory: templateCategoryFromRecord(record),
  partsServiced: [],
  descriptionRaw: record.description,
  description: cleanDescription(record.description),
  supplier: SUPPLIER,
  status: 'completed',
  sourceArchive: MAINTENANCE_ARCHIVE_ID,
  sourceFile: SOURCE_FILES[record.sourceDocument],
  importedBy: auth.currentUser?.uid || null,
}))

const partInstallDocs = () => {
  const installs = []
  maintenanceDocs().forEach((record) => {
    const description = record.description.toUpperCase()
    PART_RULES.forEach((part) => {
      if (!part.pattern.test(description)) return
      installs.push({
        id: `${record.invoiceNumber}_${part.id}`,
        vehicleReg: record.plateNumber,
        partId: part.id,
        installedDate: record.date,
        installedAtKm: null,
        lifecycleBasis: 'time',
        lifespanDays: part.lifespanDays,
        sourceInvoiceNumber: record.invoiceNumber,
        sourceArchive: MAINTENANCE_ARCHIVE_ID,
        notes: `Replacement recorded on Abu Thahnun invoice #${record.invoiceNumber}. Historical odometer was not printed on the invoice; health is time-based.`,
      })
    })
  })
  return installs
}

export async function replaceMaintenanceWithInvoiceArchive(onProgress = () => {}) {
  validateArchive()
  onProgress('Validating the 90-invoice archive')

  const [oldMaintenance, existingCatalog] = await Promise.all([
    getDocs(collection(db, 'maintenance')),
    getDocs(collection(db, 'fleet_part_catalog')),
  ])
  const backupId = `${MAINTENANCE_ARCHIVE_ID}-${Date.now()}`
  const oldRecords = oldMaintenance.docs.map((snapshot) => ({ id: snapshot.id, data: snapshot.data() }))

  onProgress(`Backing up ${oldRecords.length} previous maintenance records`)
  await commitInChunks(oldRecords, (batch, record) => {
    batch.set(doc(db, 'fleet_import_backups', backupId, 'maintenance_records', record.id), {
      ...record.data,
      originalDocumentId: record.id,
      backedUpAt: serverTimestamp(),
    })
  })

  onProgress('Removing previous maintenance records')
  await commitInChunks(oldRecords, (batch, record) => batch.delete(doc(db, 'maintenance', record.id)))

  const records = maintenanceDocs()
  onProgress('Writing reconciled January–July invoices')
  await commitInChunks(records, (batch, record) => {
    batch.set(doc(db, 'maintenance', `abu-thahnun-${record.invoiceNumber}`), {
      ...record,
      importedAt: serverTimestamp(),
    })
  })

  onProgress('Writing vehicle registration records')
  await commitInChunks(VEHICLE_REGISTRATION_ARCHIVE, (batch, record) => {
    batch.set(doc(db, 'fleet_vehicle_registrations', record.registration), {
      ...record,
      importedAt: serverTimestamp(),
      importedBy: auth.currentUser?.uid || null,
    }, { merge: true })
  })

  const existingPartIds = new Set(existingCatalog.docs.map((snapshot) => snapshot.id))
  const missingParts = PART_RULES.filter((part) => !existingPartIds.has(part.id))
  onProgress(`Adding ${missingParts.length} invoice-derived component types`)
  await commitInChunks(missingParts, (batch, part) => {
    batch.set(doc(db, 'fleet_part_catalog', part.id), {
      nameEn: part.nameEn,
      nameAr: part.nameAr,
      lifespanDays: part.lifespanDays,
      active: true,
      lifecycleBasis: 'time',
      warningThresholdPct: 75,
      dueThresholdPct: 90,
      sourceArchive: MAINTENANCE_ARCHIVE_ID,
    })
  })

  const installs = partInstallDocs()
  onProgress(`Writing ${installs.length} deduplicated component replacements`)
  await commitInChunks(installs, (batch, install) => {
    const { id, ...data } = install
    batch.set(doc(db, 'fleet_part_installs', id), {
      ...data,
      createdAt: serverTimestamp(),
      createdBy: auth.currentUser?.uid || null,
    })
  })

  await commitInChunks([{ id: MAINTENANCE_ARCHIVE_ID }], (batch) => {
    batch.set(doc(db, 'fleet_imports', MAINTENANCE_ARCHIVE_ID), {
      archiveId: MAINTENANCE_ARCHIVE_ID,
      invoiceCount: records.length,
      registrationCount: VEHICLE_REGISTRATION_ARCHIVE.length,
      partInstallCount: installs.length,
      total: MAINTENANCE_ARCHIVE_TOTAL,
      supplier: SUPPLIER,
      backupId,
      sourceFiles: Object.values(SOURCE_FILES),
      completedAt: serverTimestamp(),
      completedBy: auth.currentUser?.uid || null,
    })
  })

  onProgress('Import complete')
  return {
    invoiceCount: records.length,
    registrationCount: VEHICLE_REGISTRATION_ARCHIVE.length,
    partInstallCount: installs.length,
    total: MAINTENANCE_ARCHIVE_TOTAL,
    backupId,
  }
}
