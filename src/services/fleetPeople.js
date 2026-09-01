import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore'
import { db } from '../firebase'
import { normReg } from './fleetMeta'

export const PERSON_ROLES = [
  { id: 'driver', en: 'Driver', ar: 'سائق' },
  { id: 'staff', en: 'Club staff', ar: 'موظف في النادي' },
]

const normalizePersonName = (value) => String(value || '').trim().replace(/\s+/g, ' ')

export const personIdFromName = (value) => normalizePersonName(value)
  .toLowerCase()
  .replace(/[^a-z0-9\u0600-\u06ff]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 80)

export function subscribeFleetPeople(callback) {
  return onSnapshot(collection(db, 'fleet_people'), (snapshot) => {
    callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))
  }, (error) => {
    console.error('[fleetPeople] people subscription failed:', error)
    callback([])
  })
}

export function subscribeFleetDriverAssignments(callback) {
  return onSnapshot(collection(db, 'fleet_driver_assignments'), (snapshot) => {
    callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))
  }, (error) => {
    console.error('[fleetPeople] assignment subscription failed:', error)
    callback([])
  })
}

export async function saveFleetPerson(person, actorEmail = '') {
  const displayName = normalizePersonName(person.displayName || person.nameEn || person.nameAr)
  if (!displayName) throw new Error('A person name is required')
  const personId = person.id || personIdFromName(displayName)
  if (!personId) throw new Error('Could not create a person identifier')
  await setDoc(doc(db, 'fleet_people', personId), {
    displayName,
    nameEn: normalizePersonName(person.nameEn || displayName),
    nameAr: normalizePersonName(person.nameAr),
    personType: person.personType === 'staff' ? 'staff' : 'driver',
    canDrive: person.canDrive !== false,
    active: person.active !== false,
    employeeId: String(person.employeeId || '').trim(),
    phone: String(person.phone || '').trim(),
    notes: String(person.notes || '').trim(),
    updatedAt: serverTimestamp(),
    updatedBy: actorEmail,
    ...(person.id ? {} : { createdAt: serverTimestamp(), createdBy: actorEmail }),
  }, { merge: true })
  return personId
}

export function currentAssignments(assignments = []) {
  const active = new Map()
  assignments
    .filter((assignment) => assignment.status === 'active' && !assignment.endedAt)
    .forEach((assignment) => active.set(normReg(assignment.vehicleRegistration), assignment))
  return active
}

export async function assignPersonToVehicle({
  vehicleRegistration,
  person,
  effectiveDate,
  reason = '',
  previousAssignment = null,
  actorEmail = '',
}) {
  const registration = normReg(vehicleRegistration)
  if (!registration || !person?.id) throw new Error('Vehicle and person are required')
  const assignmentRef = doc(collection(db, 'fleet_driver_assignments'))
  const batch = writeBatch(db)
  if (previousAssignment?.id) {
    batch.set(doc(db, 'fleet_driver_assignments', previousAssignment.id), {
      status: 'ended',
      endedAt: effectiveDate || new Date().toISOString().slice(0, 10),
      endedBy: actorEmail,
      updatedAt: serverTimestamp(),
    }, { merge: true })
  }
  batch.set(assignmentRef, {
    vehicleRegistration: registration,
    personId: person.id,
    personName: person.displayName || person.nameEn || person.nameAr || '',
    personType: person.personType || 'driver',
    effectiveDate: effectiveDate || new Date().toISOString().slice(0, 10),
    reason: String(reason || '').trim(),
    status: 'active',
    createdAt: serverTimestamp(),
    createdBy: actorEmail,
  })
  // Compatibility projection: legacy Fleet screens continue to read the
  // current name, while the assignment collection remains the dated source.
  batch.set(doc(db, 'fleet_vehicle_meta', registration), {
    driverId: person.id,
    driverName: person.displayName || person.nameEn || person.nameAr || '',
    driverAssignedAt: effectiveDate || new Date().toISOString().slice(0, 10),
    updatedAt: serverTimestamp(),
    updatedBy: actorEmail,
  }, { merge: true })
  await batch.commit()
  return assignmentRef.id
}

export async function createExternalTransportationRecord(record, actorEmail = '') {
  const payload = {
    date: String(record.date || '').trim(),
    personId: String(record.personId || '').trim(),
    personName: normalizePersonName(record.personName),
    personType: record.personType === 'staff' ? 'staff' : 'driver',
    vehicleRegistration: normReg(record.vehicleRegistration),
    sourcePlate: String(record.sourcePlate || record.vehicleRegistration || '').trim(),
    responsibleParty: String(record.responsibleParty || '').trim(),
    reason: String(record.reason || '').trim(),
    details: String(record.details || '').trim(),
    notes: String(record.notes || '').trim(),
    plateMatchStatus: record.vehicleRegistration ? 'matched' : 'unmatched',
    source: 'manual',
    createdAt: serverTimestamp(),
    createdBy: actorEmail,
    updatedAt: serverTimestamp(),
    updatedBy: actorEmail,
  }
  if (!payload.date || !payload.personName || !payload.vehicleRegistration || !payload.reason || !payload.details) {
    throw new Error('Date, person, vehicle, reason and trip details are required')
  }
  return addDoc(collection(db, 'fleet_external_transportation'), payload)
}

export function subscribeExternalTransportation(callback) {
  return onSnapshot(collection(db, 'fleet_external_transportation'), (snapshot) => {
    callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))
  }, (error) => {
    console.error('[fleetPeople] external transportation subscription failed:', error)
    callback([])
  })
}

export function subscribeRidershipCounts(callback) {
  return onSnapshot(collection(db, 'fleet_ridership_counts'), (snapshot) => {
    callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))
  }, (error) => {
    console.error('[fleetPeople] ridership subscription failed:', error)
    callback([])
  })
}
