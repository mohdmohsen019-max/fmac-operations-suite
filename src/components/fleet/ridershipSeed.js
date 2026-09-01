import {
  collection, doc, getDoc, getDocs, query, serverTimestamp, where, writeBatch,
} from 'firebase/firestore';

export const RIDERSHIP_SEED_VERSION = 'fujairah-word-2026-v2';
export const RIDERSHIP_BRANCH_SPLIT_VERSION = 'dibba-albidya-2026-v1';
export const RIDERSHIP_SWIMMING_TWO_SESSIONS_VERSION = 'swimming-two-sessions-2026-v1';
export const RIDERSHIP_BUS_CAPACITY = 23;

export const RIDERSHIP_SESSION_TIMES = Object.freeze({
  1: '10:00 AM to 12:00 PM',
  2: '4:30 PM to 5:30 PM',
  3: '5:30 PM to 7:00 PM',
  4: '7:00 PM to 9:00 PM',
});

export const ridershipSessionTime = (busNumber, sessionIndex) => (
  ((Number(busNumber) >= 1 && Number(busNumber) <= 7)
    || (Number(busNumber) >= 11 && Number(busNumber) <= 14))
    ? RIDERSHIP_SESSION_TIMES[Number(sessionIndex)] || ''
    : ''
);

export const RIDERSHIP_BRANCHES = [
  {
    id: 'fujairah',
    nameEn: 'Fujairah',
    nameAr: 'الفجيرة',
    buses: [
      { registration: 'M85750', busNumber: '1', driverEn: 'Zahid', driverAr: 'زاهد', areaAr: 'حمد بن عبد الله يمين + مريشيد + الرغيلات' },
      { registration: 'M85751', busNumber: '2', driverEn: 'Saif Al Rahman', driverAr: 'سيف الرحمن', areaAr: 'حمد بن عبد الله يسار + الغرفة' },
      { registration: 'M85759', busNumber: '3', driverEn: 'Jamshid', driverAr: 'جمشيد', areaAr: 'الفصيل + الشرية' },
      { registration: 'M99268', busNumber: '4', driverEn: 'Mohamed Khalifa', driverAr: 'محمد خليفة', areaAr: 'سكمكم + مربح' },
      { registration: 'C37069', busNumber: '5', driverEn: 'Fouad', driverAr: 'فؤاد', areaAr: 'محمد بن زايد + الحيل + كلباء' },
      { registration: 'A21248', busNumber: '6', driverEn: 'Manzoor', driverAr: 'منظور', areaAr: 'مضب + بارهوز + السفير + نادي الفجيرة' },
      { registration: 'C37075', busNumber: '7', driverEn: 'Kashif', driverAr: 'كاشف', areaAr: 'البثة + البليدة + الفرفار + الخزيمري' },
      { registration: 'A33867', busNumber: '8', driverEn: 'Abdulmalik', driverAr: 'عبد الملك', areaAr: 'دبي + الشارقة + عجمان', sessionCount: 1 },
    ],
  },
  {
    id: 'dibba',
    nameEn: 'Dibba',
    nameAr: 'دبا',
    buses: [
      { registration: 'C37074', busNumber: '12', driverEn: 'Shah Fahad', driverAr: '' },
      { registration: 'M85756', busNumber: '13', driverEn: 'Mohamed Noor', driverAr: '' },
    ],
  },
  {
    id: 'al-bidya',
    nameEn: 'Al-Bidya',
    nameAr: 'البدية',
    buses: [
      { registration: 'M99270', busNumber: '11', driverEn: 'Tafeel Khan', driverAr: '' },
      { registration: 'C29769', busNumber: '14', driverEn: 'Ziaullah', driverAr: '' },
    ],
  },
  {
    id: 'swimming',
    nameEn: 'Swimming',
    nameAr: 'السباحة',
    buses: [
      { registration: 'C37072', busNumber: '10', driverEn: 'Uzair', driverAr: '', sessionCount: 2 },
      { registration: 'A33876', busNumber: '9', driverEn: 'Abdulnawaz', driverAr: '', sessionCount: 2 },
    ],
  },
];

// Extracted from "باصات - الفجيرة.docx". Row order matches the eight
// Fujairah buses above. null preserves the document's "-" cells as missing.
export const FUJAIRAH_HISTORY = [
  ['2026-07-08', [[12,18,7],[10,14,19],[6,2,3],[14,7,3],[6,2,1],[7,13,6],[8,9,4],[7,7,7]]],
  ['2026-07-09', [[6,16,8],[10,18,15],[10,5,6],[16,9,4],[7,4,0],[9,13,5],[10,7,2],[null,null,null]]],
  ['2026-07-10', [[7,8,4],[12,9,10],[4,1,3],[14,7,1],[7,5,2],[6,7,2],[2,0,1],[null,null,null]]],
  ['2026-07-12', [[8,8,5],[6,5,7],[10,5,1],[13,8,4],[2,5,0],[8,9,3],[4,6,1],[null,null,null]]],
  ['2026-07-13', [[9,14,9],[12,16,13],[11,6,5],[9,7,5],[null,null,null],[7,8,3],[7,7,1],[null,null,null]]],
  ['2026-07-14', [[9,13,7],[10,12,17],[11,6,5],[12,8,4],[5,4,1],[7,12,2],[11,6,4],[null,null,null]]],
  ['2026-07-15', [[9,14,5],[12,11,13],[8,2,8],[5,6,3],[5,4,3],[9,12,4],[6,10,3],[null,null,null]]],
  ['2026-07-16', [[12,12,4],[10,12,13],[10,5,7],[16,9,2],[3,4,6],[6,13,2],[5,8,0],[null,null,null]]],
  ['2026-07-17', [[10,11,4],[null,null,null],[8,0,2],[11,3,null],[2,4,1],[6,7,2],[5,1,0],[null,null,null]]],
  ['2026-07-19', [[7,10,7],[5,10,7],[7,3,2],[7,7,1],[1,0,1],[8,11,1],[3,1,2],[null,null,null]]],
  ['2026-07-20', [[14,18,5],[11,10,16],[11,6,4],[10,6,4],[7,4,2],[4,7,4],[11,8,4],[6,6,6]]],
  ['2026-07-21', [[13,19,5],[10,15,13],[7,6,8],[10,7,2],[7,3,2],[6,13,6],[3,6,3],[null,null,null]]],
  ['2026-07-22', [[14,19,6],[10,16,12],[10,6,5],[6,9,4],[5,3,5],[5,15,4],[7,3,1],[null,null,null]]],
  ['2026-07-23', [[17,20,10],[10,16,12],[9,7,6],[14,10,4],[6,2,1],[10,12,3],[7,7,2],[null,null,null]]],
  ['2026-07-24', [[12,9,10],[9,10,8],[5,1,4],[13,7,1],[6,1,1],[9,13,2],[2,1,0],[null,null,null]]],
  ['2026-07-26', [[11,13,null],[7,9,null],[9,3,null],[9,4,null],[4,3,null],[4,18,null],[4,3,0],[null,null,null]]],
  ['2026-07-27', [[10,17,5],[8,20,15],[9,3,10],[12,11,4],[7,2,5],[6,15,7],[13,7,1],[null,null,null]]],
  ['2026-07-28', [[14,17,9],[7,20,13],[9,4,6],[9,5,2],[4,5,2],[9,11,6],[10,9,1],[null,null,null]]],
  ['2026-07-29', [[11,21,11],[3,15,13],[4,3,8],[9,5,2],[4,2,3],[9,11,3],[11,5,0],[null,null,null]]],
  ['2026-07-30', [[12,20,7],[7,15,17],[9,3,4],[5,7,4],[6,3,2],[6,10,4],[12,8,3],[null,null,null]]],
  ['2026-07-31', [[14,11,5],[null,null,null],[5,2,1],[17,6,3],[null,null,null],[8,11,3],[2,0,0],[null,null,null]]],
  ['2026-08-05', [[null,null,null,null],[null,null,null,null],[null,null,null,null],[null,null,null,null],[null,null,null,null],[6,17,17,5],[null,null,null,null],[null,null,null,null]]],
];

export const ridershipClassId = (registration, sessionIndex) =>
  `bus_${registration.toLowerCase()}_s${sessionIndex}`;

export function buildBusRows(classes, metaOf) {
  const classMap = new Map(classes.map((cls) => [cls.id, cls]));
  return RIDERSHIP_BRANCHES.map((branch) => ({
    ...branch,
    buses: branch.buses.map((seedBus) => {
      const liveMeta = typeof metaOf === 'function' ? metaOf(seedBus.registration) : null;
      return {
        ...seedBus,
        busNumber: liveMeta?.busNumber || seedBus.busNumber,
        driverEn: liveMeta?.driverName || seedBus.driverEn,
        sessions: Array.from({ length: seedBus.sessionCount || 4 }, (_, index) => index + 1).map((sessionIndex) =>
          classMap.get(ridershipClassId(seedBus.registration, sessionIndex)) || {
            id: ridershipClassId(seedBus.registration, sessionIndex),
            registration: seedBus.registration,
            sessionIndex,
            branch: branch.nameEn,
            busNumber: seedBus.busNumber,
            driverEn: seedBus.driverEn,
            driverAr: seedBus.driverAr,
            areaAr: seedBus.areaAr || '',
            time: ridershipSessionTime(seedBus.busNumber, sessionIndex),
            capacity: RIDERSHIP_BUS_CAPACITY,
            active: true,
          }
        ),
      };
    }),
  }));
}

export async function ensureRidershipSeed(db, importedBy = '') {
  const migrationRef = doc(db, 'fleet_ridership_migrations', RIDERSHIP_SEED_VERSION);
  if ((await getDoc(migrationRef)).exists()) {
    const branchSplitApplied = await ensureRidershipBranchSplit(db, importedBy);
    const swimmingSessionsApplied = await ensureSwimmingTwoSessions(db, importedBy);
    return branchSplitApplied || swimmingSessionsApplied;
  }

  const writes = [];
  const stamp = serverTimestamp();

  // Bus 8 operates one session only. Remove the extra records created by v1
  // so they cannot leak into historical totals or the insights view.
  const retiredBus8ClassIds = [2, 3, 4].map((sessionIndex) => ridershipClassId('A33867', sessionIndex));
  retiredBus8ClassIds.forEach((classId) => {
    writes.push({ type: 'delete', ref: doc(db, 'fleet_ridership_classes', classId) });
  });
  const retiredBus8Counts = await getDocs(query(
    collection(db, 'fleet_ridership_counts'),
    where('classId', 'in', retiredBus8ClassIds),
  ));
  retiredBus8Counts.docs.forEach((countDoc) => writes.push({ type: 'delete', ref: countDoc.ref }));

  // Retire the old shared "ALL" schedule without deleting any history.
  const oldClasses = await getDocs(collection(db, 'fleet_ridership_classes'));
  oldClasses.docs.forEach((oldDoc) => {
    if (!oldDoc.id.startsWith('bus_')) {
      writes.push({ ref: oldDoc.ref, data: { active: false, migratedToBusTables: true, updatedAt: stamp }, merge: true });
    }
  });

  RIDERSHIP_BRANCHES.forEach((branch, branchIndex) => {
    branch.buses.forEach((bus, busIndex) => {
      writes.push({
        ref: doc(db, 'fleet_vehicle_meta', bus.registration),
        data: { branch: branch.nameEn, branchId: branch.id, updatedAt: stamp },
        merge: true,
      });

      Array.from({ length: bus.sessionCount || 4 }, (_, index) => index + 1).forEach((sessionIndex) => {
        const id = ridershipClassId(bus.registration, sessionIndex);
        writes.push({
          ref: doc(db, 'fleet_ridership_classes', id),
          data: {
            nameEn: `Bus ${bus.busNumber} · Session ${sessionIndex}`,
            nameAr: `الحافلة ${bus.busNumber} · الحصة ${sessionIndex}`,
            registration: bus.registration,
            busNumber: bus.busNumber,
            driverEn: bus.driverEn,
            driverAr: bus.driverAr || '',
            areaAr: bus.areaAr || '',
            branch: branch.nameEn,
            branchId: branch.id,
            sessionIndex,
            days: [0, 1, 2, 3, 4, 5],
            time: ridershipSessionTime(bus.busNumber, sessionIndex),
            capacity: RIDERSHIP_BUS_CAPACITY,
            active: true,
            sortOrder: (branchIndex + 1) * 1000 + (busIndex + 1) * 10 + sessionIndex,
            source: RIDERSHIP_SEED_VERSION,
            updatedAt: stamp,
          },
          merge: true,
        });
      });
    });
  });

  const fujairah = RIDERSHIP_BRANCHES[0];
  FUJAIRAH_HISTORY.forEach(([date, busRows]) => {
    busRows.forEach((sessionValues, busIndex) => {
      const bus = fujairah.buses[busIndex];
      sessionValues.slice(0, bus.sessionCount || 4).forEach((riders, zeroIndex) => {
        if (riders == null) return;
        const sessionIndex = zeroIndex + 1;
        const classId = ridershipClassId(bus.registration, sessionIndex);
        writes.push({
          ref: doc(db, 'fleet_ridership_counts', `${classId}_${date}`),
          data: {
            classId,
            date,
            riders,
            notes: '',
            classSnapshot: {
              nameEn: `Bus ${bus.busNumber}`,
              nameAr: `الحافلة ${bus.busNumber}`,
              registration: bus.registration,
              busNumber: bus.busNumber,
              driverEn: bus.driverEn,
              driverAr: bus.driverAr,
              areaAr: bus.areaAr,
              branch: fujairah.nameEn,
              branchId: fujairah.id,
              sessionIndex,
              time: ridershipSessionTime(bus.busNumber, sessionIndex),
              capacity: RIDERSHIP_BUS_CAPACITY,
            },
            source: RIDERSHIP_SEED_VERSION,
            recordedBy: importedBy,
            importedAt: stamp,
          },
          merge: true,
        });
      });
    });
  });

  for (let offset = 0; offset < writes.length; offset += 400) {
    const batch = writeBatch(db);
    writes.slice(offset, offset + 400).forEach(({ type, ref, data, merge }) => {
      if (type === 'delete') batch.delete(ref);
      else batch.set(ref, data, merge ? { merge: true } : undefined);
    });
    await batch.commit();
  }

  const completionBatch = writeBatch(db);
  completionBatch.set(migrationRef, {
    version: RIDERSHIP_SEED_VERSION,
    sourceFile: 'باصات - الفجيرة.docx',
    importedDates: FUJAIRAH_HISTORY.length,
    fujairahBuses: fujairah.buses.length,
    totalBranches: RIDERSHIP_BRANCHES.length,
    importedBy,
    completedAt: serverTimestamp(),
  });
  await completionBatch.commit();
  await ensureRidershipBranchSplit(db, importedBy);
  await ensureSwimmingTwoSessions(db, importedBy);
  return true;
}

/**
 * Split the former four-bus Dibba roster into Dibba and Al-Bidya without
 * changing class ids, schedules, capacities, or saved rider totals. Existing
 * count snapshots are updated so historical reports group the same records
 * under the corrected branch names.
 */
export async function ensureRidershipBranchSplit(db, updatedBy = '') {
  const migrationRef = doc(db, 'fleet_ridership_migrations', RIDERSHIP_BRANCH_SPLIT_VERSION);
  if ((await getDoc(migrationRef)).exists()) return false;

  const stamp = serverTimestamp();
  const writes = [];
  const affectedClassIds = [];
  const splitBranches = RIDERSHIP_BRANCHES.filter((branch) => ['dibba', 'al-bidya'].includes(branch.id));

  splitBranches.forEach((branch) => {
    const branchIndex = RIDERSHIP_BRANCHES.findIndex((item) => item.id === branch.id);
    branch.buses.forEach((bus, busIndex) => {
      writes.push({
        ref: doc(db, 'fleet_vehicle_meta', bus.registration),
        data: { branch: branch.nameEn, branchId: branch.id, updatedAt: stamp },
        merge: true,
      });

      Array.from({ length: bus.sessionCount || 4 }, (_, index) => index + 1).forEach((sessionIndex) => {
        const classId = ridershipClassId(bus.registration, sessionIndex);
        affectedClassIds.push(classId);
        writes.push({
          ref: doc(db, 'fleet_ridership_classes', classId),
          data: {
            branch: branch.nameEn,
            branchId: branch.id,
            sortOrder: (branchIndex + 1) * 1000 + (busIndex + 1) * 10 + sessionIndex,
            updatedAt: stamp,
          },
          merge: true,
        });
      });
    });
  });

  // Firestore `in` queries accept at most 10 values, so retrieve saved count
  // snapshots in deterministic chunks and change branch fields only.
  for (let offset = 0; offset < affectedClassIds.length; offset += 10) {
    const classIdChunk = affectedClassIds.slice(offset, offset + 10);
    const counts = await getDocs(query(
      collection(db, 'fleet_ridership_counts'),
      where('classId', 'in', classIdChunk),
    ));
    counts.docs.forEach((countDoc) => {
      const count = countDoc.data();
      const registration = count.classSnapshot?.registration;
      const branch = RIDERSHIP_BRANCHES.find((item) => item.buses.some((bus) => bus.registration === registration));
      if (!branch) return;
      writes.push({
        ref: countDoc.ref,
        data: {
          classSnapshot: {
            ...count.classSnapshot,
            branch: branch.nameEn,
            branchId: branch.id,
          },
          updatedAt: stamp,
        },
        merge: true,
      });
    });
  }

  for (let offset = 0; offset < writes.length; offset += 400) {
    const batch = writeBatch(db);
    writes.slice(offset, offset + 400).forEach(({ ref, data, merge }) => {
      batch.set(ref, data, merge ? { merge: true } : undefined);
    });
    await batch.commit();
  }

  const completionBatch = writeBatch(db);
  completionBatch.set(migrationRef, {
    version: RIDERSHIP_BRANCH_SPLIT_VERSION,
    dibbaRegistrations: ['C37074', 'M85756'],
    alBidyaRegistrations: ['M99270', 'C29769'],
    schedulesChanged: false,
    updatedCountSnapshots: writes.filter((item) => item.ref.parent.id === 'fleet_ridership_counts').length,
    updatedBy,
    completedAt: serverTimestamp(),
  });
  await completionBatch.commit();
  return true;
}

/** Retire Swimming sessions 3/4 and keep sessions 1/2 without fixed times. */
export async function ensureSwimmingTwoSessions(db, updatedBy = '') {
  const migrationRef = doc(db, 'fleet_ridership_migrations', RIDERSHIP_SWIMMING_TWO_SESSIONS_VERSION);
  if ((await getDoc(migrationRef)).exists()) return false;

  const swimming = RIDERSHIP_BRANCHES.find((branch) => branch.id === 'swimming');
  const retiredClassIds = swimming.buses.flatMap((bus) => [3, 4].map((sessionIndex) => (
    ridershipClassId(bus.registration, sessionIndex)
  )));
  const retainedClassIds = swimming.buses.flatMap((bus) => [1, 2].map((sessionIndex) => (
    ridershipClassId(bus.registration, sessionIndex)
  )));
  const retiredCounts = await getDocs(query(
    collection(db, 'fleet_ridership_counts'),
    where('classId', 'in', retiredClassIds),
  ));

  const writes = [];
  const stamp = serverTimestamp();
  retiredClassIds.forEach((classId) => {
    writes.push({ type: 'delete', ref: doc(db, 'fleet_ridership_classes', classId) });
  });
  retiredCounts.docs.forEach((countDoc) => writes.push({ type: 'delete', ref: countDoc.ref }));
  retainedClassIds.forEach((classId) => {
    writes.push({
      ref: doc(db, 'fleet_ridership_classes', classId),
      data: { time: '', updatedAt: stamp },
      merge: true,
    });
  });

  for (let offset = 0; offset < writes.length; offset += 400) {
    const batch = writeBatch(db);
    writes.slice(offset, offset + 400).forEach(({ type, ref, data, merge }) => {
      if (type === 'delete') batch.delete(ref);
      else batch.set(ref, data, merge ? { merge: true } : undefined);
    });
    await batch.commit();
  }

  const completionBatch = writeBatch(db);
  completionBatch.set(migrationRef, {
    version: RIDERSHIP_SWIMMING_TWO_SESSIONS_VERSION,
    registrations: swimming.buses.map((bus) => bus.registration),
    retainedSessions: [1, 2],
    fixedTimesRemoved: true,
    deletedCountRecords: retiredCounts.size,
    updatedBy,
    completedAt: serverTimestamp(),
  });
  await completionBatch.commit();
  return true;
}
