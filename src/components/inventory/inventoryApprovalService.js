import {
  collection, deleteDoc, doc, getDoc, runTransaction, serverTimestamp, setDoc,
} from 'firebase/firestore'
import {
  deleteObject, getDownloadURL, ref as storageRef, uploadBytes,
} from 'firebase/storage'
import { auth, db, storage } from '../../firebase'
import {
  approvalTransition, INVENTORY_REQUEST_STATUS, INVENTORY_WORKFLOW_ROLES, inventoryWorkflowRole,
} from './inventoryApprovalModel'

export { approvalTransition, INVENTORY_REQUEST_STATUS, INVENTORY_WORKFLOW_ROLES, inventoryWorkflowRole }

const MAX_EVIDENCE_SIZE = 15 * 1024 * 1024
const MAX_FIRESTORE_FALLBACK_SIZE = 650 * 1024
const ALLOWED_EVIDENCE = /\.(pdf|jpe?g|png|webp|docx?|xlsx?)$/i

function isStorageQuotaError(error) {
  return error?.code === 'storage/quota-exceeded'
    || /quota.*exceeded/i.test(error?.message || '')
}

async function fileToBase64(file) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let index = 0; index < bytes.length; index += 32768) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 32768))
  }
  return btoa(binary)
}

async function storeEvidenceInFirestore(requestId, file) {
  if (file.size > MAX_FIRESTORE_FALLBACK_SIZE) {
    throw new Error(
      `Storage capacity is currently full. ${file.name} is too large for the temporary 650KB document fallback. Ask an administrator to restore Firebase Storage capacity.`,
    )
  }
  const fileRef = doc(collection(db, 'inventory_evidence_files'))
  await setDoc(fileRef, {
    requestId,
    name: file.name,
    dataBase64: await fileToBase64(file),
    size: file.size,
    contentType: file.type || 'application/octet-stream',
    uploadedBy: auth.currentUser?.uid || null,
    uploadedAt: serverTimestamp(),
  })
  return {
    name: file.name,
    fileDocId: fileRef.id,
    storageMode: 'firestore',
    size: file.size,
    contentType: file.type || 'application/octet-stream',
    uploadedAt: new Date().toISOString(),
  }
}

async function removeEvidenceFile(file) {
  if (file?.path) await deleteObject(storageRef(storage, file.path)).catch(() => null)
  if (file?.fileDocId) await deleteDoc(doc(db, 'inventory_evidence_files', file.fileDocId)).catch(() => null)
}

export async function openInventoryEvidence(file) {
  if (file?.url) {
    window.open(file.url, '_blank', 'noopener,noreferrer')
    return
  }
  if (!file?.fileDocId) throw new Error('The evidence file reference is missing')

  const viewer = window.open('', '_blank')
  try {
    const snapshot = await getDoc(doc(db, 'inventory_evidence_files', file.fileDocId))
    const data = snapshot.data()
    if (!snapshot.exists() || !data?.dataBase64) throw new Error('The attached evidence file is missing')
    const binary = atob(data.dataBase64)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    const blobUrl = URL.createObjectURL(new Blob([bytes], { type: data.contentType || file.contentType || 'application/octet-stream' }))
    if (viewer) viewer.location.href = blobUrl
    else window.open(blobUrl, '_blank', 'noopener,noreferrer')
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60000)
  } catch (error) {
    if (viewer) viewer.close()
    throw error
  }
}

function actorSnapshot(userProfile) {
  const user = auth.currentUser
  return {
    uid: user?.uid || 'unknown',
    name: userProfile?.displayName || user?.displayName || user?.email || 'Unknown',
    email: user?.email || null,
    jobTitle: userProfile?.jobTitle || null,
  }
}

function validateEvidence(files) {
  for (const file of files) {
    if (!ALLOWED_EVIDENCE.test(file.name || '')) throw new Error(`Unsupported evidence file: ${file.name}`)
    if (file.size > MAX_EVIDENCE_SIZE) throw new Error(`${file.name} exceeds the 15MB limit`)
  }
}

async function uploadEvidence(requestId, files) {
  validateEvidence(files)
  const uploaded = []
  try {
    for (const file of files) {
      const safeName = file.name.replace(/[^\w.\-()\s]/g, '_')
      const path = `inventory_evidence/${requestId}/${Date.now()}_${safeName}`
      const ref = storageRef(storage, path)
      try {
        await uploadBytes(ref, file, { contentType: file.type || 'application/octet-stream' })
        uploaded.push({
          name: file.name,
          path,
          url: await getDownloadURL(ref),
          size: file.size,
          contentType: file.type || 'application/octet-stream',
          uploadedAt: new Date().toISOString(),
        })
      } catch (error) {
        if (!isStorageQuotaError(error)) throw error
        await deleteObject(ref).catch(() => null)
        uploaded.push(await storeEvidenceInFirestore(requestId, file))
      }
    }
    return uploaded
  } catch (error) {
    await Promise.all(uploaded.map(removeEvidenceFile))
    throw error
  }
}

export async function submitInventoryRequest({ type, items, details = {}, notes = null }, evidenceFiles = [], userProfile = null) {
  if (inventoryWorkflowRole(userProfile) !== 'requester') {
    throw new Error('Only the Warehouse/Store Manager can submit inventory requests')
  }
  if (type !== 'stock_in' && type !== 'stock_out') throw new Error('Invalid inventory request type')
  if (!Array.isArray(items) || items.length === 0) throw new Error('At least one item is required')
  if (items.some((item) => !item.itemId || !Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0)) {
    throw new Error('Every requested item must have a valid item and quantity')
  }

  const requestRef = doc(collection(db, 'inventory_requests'))
  const requestCode = `INV-${new Date().getFullYear()}-${requestRef.id.slice(0, 8).toUpperCase()}`
  const evidence = await uploadEvidence(requestRef.id, Array.from(evidenceFiles || []))
  const requester = actorSnapshot(userProfile)

  try {
    await setDoc(requestRef, {
      requestCode,
      type,
      items: items.map((item) => ({ ...item, quantity: Number(item.quantity) })),
      details,
      notes: notes || null,
      evidence,
      status: INVENTORY_REQUEST_STATUS.PENDING_SPECIALIST,
      requestedBy: requester.uid,
      requestedByName: requester.name,
      requestedAt: serverTimestamp(),
      approval: {
        requester: { status: 'requested', ...requester, at: serverTimestamp() },
        specialist: { status: 'pending' },
        head: { status: 'pending' },
      },
      appliedAt: null,
      receiptId: null,
      receiptNumber: null,
    })
  } catch (error) {
    await Promise.all(evidence.map(removeEvidenceFile))
    throw error
  }

  return { id: requestRef.id, requestCode, status: INVENTORY_REQUEST_STATUS.PENDING_SPECIALIST }
}

function ensureActor(actor, allowed) {
  if (!allowed.includes(actor)) throw new Error('You are not authorised for this approval action')
}

export async function approveInventoryRequest(requestId, userProfile, roleOptions = {}) {
  const actor = inventoryWorkflowRole(userProfile, roleOptions)
  ensureActor(actor, ['specialist', 'head'])
  const requestRef = doc(db, 'inventory_requests', requestId)
  const approvedBy = actorSnapshot(userProfile)

  if (actor === 'specialist') {
    return runTransaction(db, async (tx) => {
      const snap = await tx.get(requestRef)
      if (!snap.exists()) throw new Error('Request no longer exists')
      const request = snap.data()
      const transition = approvalTransition(request.status, actor)
      if (!transition) throw new Error('This request is no longer awaiting specialist approval')
      tx.update(requestRef, {
        status: transition.status,
        'approval.specialist': { status: 'approved', ...approvedBy, at: serverTimestamp() },
        updatedAt: serverTimestamp(),
      })
      return { status: transition.status }
    })
  }

  return runTransaction(db, async (tx) => {
    const requestSnap = await tx.get(requestRef)
    if (!requestSnap.exists()) throw new Error('Request no longer exists')
    const request = requestSnap.data()
    const transition = approvalTransition(request.status, actor)
    if (!transition) throw new Error('This request is not awaiting final approval')

    const itemRefs = request.items.map((item) => doc(db, 'inventory_items', item.itemId))
    const itemSnaps = await Promise.all(itemRefs.map((ref) => tx.get(ref)))
    const configRef = doc(db, 'inventory_config', 'main')
    const configSnap = request.type === 'stock_out' ? await tx.get(configRef) : null

    const receiptRef = request.type === 'stock_out' ? doc(collection(db, 'issuance_receipts')) : null
    const receiptSequence = request.type === 'stock_out'
      ? (configSnap?.exists() ? Number(configSnap.data().lastReceiptNumber || 0) : 0) + 1
      : null
    const receiptNumber = request.type === 'stock_out'
      ? `ISS-${new Date().getFullYear()}-${String(receiptSequence).padStart(4, '0')}`
      : null

    request.items.forEach((requestedItem, index) => {
      const itemSnap = itemSnaps[index]
      if (!itemSnap.exists()) throw new Error(`${requestedItem.itemSku || requestedItem.itemId} no longer exists`)
      const item = itemSnap.data()
      const previousStock = Number(item.currentStock || 0)
      const quantity = Number(requestedItem.quantity)
      if (request.type === 'stock_out' && quantity > previousStock) {
        throw new Error(`${requestedItem.itemNameEn || requestedItem.itemSku} has only ${previousStock} available`)
      }
      const newStock = request.type === 'stock_in' ? previousStock + quantity : previousStock - quantity
      const threshold = item.minThreshold ?? 5
      const update = { currentStock: newStock, updatedAt: serverTimestamp() }
      if (request.type === 'stock_in' && newStock > threshold && item.low_stock_notified === true) update.low_stock_notified = false
      if (request.type === 'stock_out' && newStock <= threshold) update.low_stock_notified = true
      tx.update(itemRefs[index], update)

      const movementRef = doc(collection(db, 'inventory_movements'))
      tx.set(movementRef, {
        itemId: requestedItem.itemId,
        itemNameAr: requestedItem.itemNameAr || item.nameAr || null,
        itemNameEn: requestedItem.itemNameEn || item.nameEn || null,
        itemSku: requestedItem.itemSku || item.sku || null,
        type: request.type,
        quantity,
        previousStock,
        newStock,
        reason: request.type === 'stock_in' ? (requestedItem.reason || request.details?.reason || 'purchase') : 'issued',
        issuedTo: request.type === 'stock_out' ? (request.details?.issuedTo || null) : null,
        deliveryNoteRef: request.type === 'stock_in' ? (request.details?.deliveryNoteRef || null) : null,
        receiptId: receiptRef?.id || null,
        supplierId: request.details?.supplierId || null,
        approvalRequestId: requestId,
        evidence: request.evidence || [],
        performedBy: approvedBy.uid,
        performedByName: approvedBy.name,
        requestedBy: request.requestedBy,
        requestedByName: request.requestedByName,
        createdAt: serverTimestamp(),
        notes: request.notes || null,
      })
    })

    if (request.type === 'stock_out') {
      tx.set(configRef, { lastReceiptNumber: receiptSequence }, { merge: true })
      tx.set(receiptRef, {
        receiptNumber,
        issuedTo: request.details?.issuedTo || null,
        items: request.items,
        issuedBy: request.requestedBy,
        issuedByName: request.requestedByName,
        issuedAt: serverTimestamp(),
        approvedBy: approvedBy.uid,
        approvedByName: approvedBy.name,
        approvedAt: serverTimestamp(),
        status: 'approved',
        notes: request.notes || null,
        evidence: request.evidence || [],
        approvalRequestId: requestId,
        pdfUrl: null,
      })
    }

    const specialistApproval = transition.specialist === 'overridden'
      ? { status: 'overridden', overriddenBy: approvedBy.uid, overriddenByName: approvedBy.name, at: serverTimestamp() }
      : request.approval?.specialist

    tx.update(requestRef, {
      status: INVENTORY_REQUEST_STATUS.APPROVED,
      'approval.specialist': specialistApproval,
      'approval.head': { status: 'approved', ...approvedBy, at: serverTimestamp() },
      appliedAt: serverTimestamp(),
      receiptId: receiptRef?.id || null,
      receiptNumber,
      updatedAt: serverTimestamp(),
    })

    return { status: INVENTORY_REQUEST_STATUS.APPROVED, receiptNumber }
  })
}

export async function rejectInventoryRequest(requestId, reason, userProfile, roleOptions = {}) {
  const actor = inventoryWorkflowRole(userProfile, roleOptions)
  ensureActor(actor, ['specialist', 'head'])
  const requestRef = doc(db, 'inventory_requests', requestId)
  const rejectedBy = actorSnapshot(userProfile)

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(requestRef)
    if (!snap.exists()) throw new Error('Request no longer exists')
    const request = snap.data()
    const allowed = actor === 'specialist'
      ? request.status === INVENTORY_REQUEST_STATUS.PENDING_SPECIALIST
      : [INVENTORY_REQUEST_STATUS.PENDING_SPECIALIST, INVENTORY_REQUEST_STATUS.PENDING_HEAD].includes(request.status)
    if (!allowed) throw new Error('This request is no longer awaiting your decision')
    tx.update(requestRef, {
      status: INVENTORY_REQUEST_STATUS.REJECTED,
      [`approval.${actor}`]: { status: 'rejected', ...rejectedBy, at: serverTimestamp(), reason: reason || null },
      rejectedAt: serverTimestamp(),
      rejectionReason: reason || null,
      updatedAt: serverTimestamp(),
    })
    return { status: INVENTORY_REQUEST_STATUS.REJECTED }
  })
}
