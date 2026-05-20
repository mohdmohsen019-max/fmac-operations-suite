import { db } from '../firebase';
import { collection, getDocs, writeBatch, doc, deleteDoc } from 'firebase/firestore';

/**
 * Deletes all documents in a specific collection.
 * For sessions, we must also clear subcollections.
 */
export const clearCollection = async (collectionName) => {
  try {
    const q = collection(db, collectionName);
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) return;

    for (const d of snapshot.docs) {
      if (collectionName === 'sessions') {
        // Clear subcollection first
        const attSnap = await getDocs(collection(db, "sessions", d.id, "attendance"));
        const attBatch = writeBatch(db);
        attSnap.docs.forEach(ad => attBatch.delete(ad.ref));
        await attBatch.commit();
      }
      await deleteDoc(d.ref);
    }
    
  } catch (error) {
    console.error(`Error clearing collection ${collectionName}:`, error);
    throw error;
  }
};

/**
 * Specifically clears the sessions collection (History & Analytics).
 */
export const clearAttendanceHistory = async () => {
  // Clear both old logs and new sessions for migration safety
  await clearCollection("attendance_logs");
  await clearCollection("sessions");
};

/**
 * Resets all players to 'absent' status - DEPRECATED for v2 logic.
 * We now keep player records clean.
 */
export const resetDailyAttendanceStatus = async () => {
  console.warn("resetDailyAttendanceStatus is deprecated. Players no longer store status.");
  try {
    const q = collection(db, "players_v2");
    const snapshot = await getDocs(q);
    const batch = writeBatch(db);
    snapshot.docs.forEach((d) => {
      batch.update(d.ref, { 
        status: 'absent', 
        transportation: '',
        lastActionDate: '' 
      });
    });
    await batch.commit();
  } catch (e) {
    console.error(e);
  }
};

/**
 * Resets ONLY the transportation field in players_v2 - DEPRECATED.
 */
export const resetTransportationOnly = async () => {
  console.warn("resetTransportationOnly is deprecated.");
  try {
    const q = collection(db, "players_v2");
    const snapshot = await getDocs(q);
    const batch = writeBatch(db);
    snapshot.docs.forEach((d) => {
      batch.update(d.ref, { transportation: '' });
    });
    await batch.commit();
  } catch (e) {
    console.error(e);
  }
};
