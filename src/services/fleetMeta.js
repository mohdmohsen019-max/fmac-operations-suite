/**
 * Fleet vehicle metadata — Firestore-backed and fully editable.
 *
 * Replaces the hardcoded FLEET_MAPPING as the source of truth. Every vehicle
 * registered on Cartrack gets a metadata document here that staff can edit in
 * the Ecosystem tab: class (bus / other), bus number, driver, make, model,
 * label and notes. The old hardcoded map survives only as the SEED for the 14
 * buses, so the first load looks identical to today and every field is
 * correctable from the website thereafter.
 *
 * Collection: fleet_vehicle_meta / {REGISTRATION}
 *   { registration, vehicleClass: 'bus'|'other', busNumber, driverName,
 *     manufacturer, model, label, notes, updatedAt, updatedBy }
 *
 * Classification default for vehicles with no document is based only on the
 * confirmed bus registry. Unknown registrations remain `other` until staff
 * explicitly classify them as buses.
 * Historical number-only plates are linked to the known full bus plate when
 * the numeric suffix is unique (for example 85750 → M85750).
 */
import { db } from '../firebase'
import {
  collection, doc, onSnapshot, setDoc, serverTimestamp,
} from 'firebase/firestore'
import { FLEET_MAPPING, resolveKnownBusRegistration } from './fleetMapping'
import { buildFleetAliasMap, canonicalFleetRegistration } from './fleetIdentity'

/* The 14 bus registrations — used ONLY as the default classification seed.
   The live class of any vehicle is whatever fleet_vehicle_meta says. */
export const BUS_REGS = Object.keys(FLEET_MAPPING)

export const VEHICLE_CLASSES = [
  { id: 'bus',   en: 'Bus Fleet',      ar: 'أسطول الحافلات' },
  { id: 'other', en: 'Other Vehicles', ar: 'المركبات الأخرى' },
]

export const normReg = (reg) => String(reg || '').toUpperCase().replace(/\s/g, '')

/* Default (pre-edit) metadata for a registration. */
export function defaultMetaFor(registration) {
  const reg = normReg(registration)
  const canonicalReg = resolveKnownBusRegistration(reg)
  const seed = FLEET_MAPPING[canonicalReg]
  if (seed) {
    return {
      registration: reg,
      vehicleClass: 'bus',
      busNumber: seed.busNumber,
      driverName: seed.driverName,
      manufacturer: seed.manufacturer,
      model: seed.model,
      label: '',
      plateNumber: canonicalReg,
      cartrackRegistration: reg,
      cartrackId: '',
      category: 'Passenger Transport',
      vehicleType: 'Bus',
      internalIdentifier: seed.busNumber,
      year: '',
      capacity: '',
      operationalStatus: 'active',
      trackingStatus: 'tracked',
      trackingNote: 'Tracked by Cartrack.',
      clubOwned: true,
      ownership: 'club',
      notes: '',
    }
  }
  return {
    registration: reg,
    vehicleClass: 'other',
    busNumber: '',
    driverName: '',
    manufacturer: '',
    model: '',
    label: '',
    plateNumber: reg,
    cartrackRegistration: reg,
    cartrackId: '',
    category: '',
    vehicleType: '',
    internalIdentifier: '',
    year: '',
    capacity: '',
    operationalStatus: 'active',
    trackingStatus: 'not_tracked',
    trackingNote: 'Not tracked by Cartrack; retained as a club-owned fleet vehicle.',
    clubOwned: true,
    ownership: 'club',
    notes: '',
  }
}

/* Live subscription to the whole meta collection.
   cb receives Map<registration, meta>. Returns unsubscribe. */
export function subscribeFleetMeta(cb) {
  return onSnapshot(
    collection(db, 'fleet_vehicle_meta'),
    (snap) => {
      const map = new Map()
      snap.docs.forEach((d) => map.set(normReg(d.id), { ...d.data(), registration: normReg(d.id) }))
      cb(map)
    },
    (err) => {
      console.error('[fleetMeta] subscription failed:', err)
      cb(new Map()) // fall back to seeds — the UI must never blank out
    },
  )
}

/* Effective metadata: stored doc merged over the seed defaults. */
export function effectiveMeta(registration, metaMap) {
  const reg = normReg(registration)
  const canonicalReg = canonicalFleetRegistration(reg, buildFleetAliasMap(metaMap))
  const base = defaultMetaFor(reg)
  const stored = metaMap?.get?.(reg) || (canonicalReg !== reg ? metaMap?.get?.(canonicalReg) : null)
  if (!stored) return base

  const merged = {
    ...base,
    ...stored,
    registration: reg,
    canonicalRegistration: canonicalReg,
    telemetryAliases: Array.isArray(stored.telemetryAliases) ? stored.telemetryAliases : [],
  }
  // Explicit edits win. Older metadata without a class inherits the confirmed
  // registry default, so an unrelated numeric car plate never becomes a bus.
  merged.vehicleClass = ['bus', 'other'].includes(stored.vehicleClass)
    ? stored.vehicleClass
    : base.vehicleClass
  if (merged.vehicleClass === 'bus') {
    merged.vehicleType = merged.vehicleType || 'Bus'
    merged.category = merged.category || 'Passenger Transport'
  }
  // Preserve a deliberately entered full plate, but repair old number-only
  // metadata when its unique known plate prefix can be recovered.
  const storedPlate = normReg(stored.plateNumber)
  if (canonicalReg !== reg && (!storedPlate || storedPlate === reg)) merged.plateNumber = canonicalReg
  return merged
}

export function classOf(registration, metaMap) {
  return effectiveMeta(registration, metaMap).vehicleClass === 'bus' ? 'bus' : 'other'
}

/* Does a registration belong in the given scope? */
export function matchesScope(registration, scope, metaMap) {
  if (effectiveMeta(registration, metaMap).clubOwned === false) return false
  if (scope === 'all') return true
  const cls = classOf(registration, metaMap)
  return scope === 'others' ? cls === 'other' : cls === 'bus'
}

/* Persist an edit. Doc id = registration, merge-write so partial edits are safe. */
export async function saveVehicleMeta(registration, patch, actorEmail = '') {
  const reg = normReg(registration)
  await setDoc(doc(db, 'fleet_vehicle_meta', reg), {
    ...patch,
    registration: reg,
    updatedAt: serverTimestamp(),
    updatedBy: actorEmail,
  }, { merge: true })
}

/* Display name for a vehicle: bus number for buses, label/model for others. */
export function displayNameOf(registration, metaMap, lang = 'en') {
  const m = effectiveMeta(registration, metaMap)
  if (m.vehicleClass === 'bus' && m.busNumber) {
    return lang === 'ar' ? `حافلة ${m.busNumber}` : `Bus ${m.busNumber}`
  }
  return m.label || [m.manufacturer, m.model].filter(Boolean).join(' ') || m.registration
}
