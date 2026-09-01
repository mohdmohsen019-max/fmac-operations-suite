import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../firebase'

/**
 * Writes a normalized operational activity event without blocking the action
 * that triggered it. The Activity Log consumes this stream alongside legacy
 * collection adapters, so new features only need one small call to become
 * auditable.
 */
export async function recordActivity({
  module,
  submodule = '',
  action,
  titleEn,
  titleAr = '',
  detailEn = '',
  detailAr = '',
  recordId = '',
  path = '',
  metadata = {},
  actor,
} = {}) {
  if (!module || !action || !titleEn) return
  try {
    const currentUser = auth.currentUser
    await addDoc(collection(db, 'activity_events'), {
      module,
      submodule,
      action,
      titleEn,
      titleAr,
      detailEn,
      detailAr,
      recordId: String(recordId || ''),
      path,
      metadata,
      actorUid: actor?.uid || currentUser?.uid || '',
      actorEmail: actor?.email || currentUser?.email || '',
      actorName: actor?.name || currentUser?.displayName || currentUser?.email || '',
      createdAt: serverTimestamp(),
    })
  } catch (error) {
    // Audit telemetry must never make the primary user action fail.
    console.error('[activity] event write failed:', error)
  }
}
