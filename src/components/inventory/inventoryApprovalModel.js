export const INVENTORY_REQUEST_STATUS = Object.freeze({
  PENDING_SPECIALIST: 'pending_specialist',
  PENDING_HEAD: 'pending_head',
  APPROVED: 'approved',
  REJECTED: 'rejected',
})

export const INVENTORY_WORKFLOW_ROLES = Object.freeze({
  REQUESTER: 'Warehouse/Store Manager',
  SPECIALIST: 'Sports Activities Specialist',
  HEAD: 'Head of Operations',
})

export function inventoryWorkflowRole(userProfile, { isHOD = false, isMasterAdmin = false } = {}) {
  if (isMasterAdmin || isHOD || userProfile?.role === 'hod' || userProfile?.jobTitle === INVENTORY_WORKFLOW_ROLES.HEAD) return 'head'
  if (userProfile?.jobTitle === INVENTORY_WORKFLOW_ROLES.SPECIALIST) return 'specialist'
  if (userProfile?.jobTitle === INVENTORY_WORKFLOW_ROLES.REQUESTER || userProfile?.role === 'store_manager') return 'requester'
  return 'viewer'
}

export function approvalTransition(status, actor) {
  if (actor === 'specialist' && status === INVENTORY_REQUEST_STATUS.PENDING_SPECIALIST) {
    return { status: INVENTORY_REQUEST_STATUS.PENDING_HEAD, specialist: 'approved', head: 'pending' }
  }
  if (actor === 'head' && status === INVENTORY_REQUEST_STATUS.PENDING_SPECIALIST) {
    return { status: INVENTORY_REQUEST_STATUS.APPROVED, specialist: 'overridden', head: 'approved' }
  }
  if (actor === 'head' && status === INVENTORY_REQUEST_STATUS.PENDING_HEAD) {
    return { status: INVENTORY_REQUEST_STATUS.APPROVED, specialist: 'approved', head: 'approved' }
  }
  return null
}
