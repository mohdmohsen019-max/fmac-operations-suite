import { useAuth } from '../contexts/AuthContext'
import { MASTER_ADMIN_EMAIL } from '../utils/jobTitlePermissions'

export function usePermissions() {
  const { userProfile, user } = useAuth()

  // Support both new format (approved: true) and legacy format (status: 'active')
  const isApproved = userProfile?.approved === true
    || userProfile?.status === 'active'
    || userProfile?.status === 'approved'

  const can = (module, action = 'view') => {
    if (!userProfile || !isApproved) return false
    if (user?.email === MASTER_ADMIN_EMAIL) return true
    if (userProfile.role === 'hod') return true

    const perm = userProfile.permissions?.[module]
    if (action === 'view') return perm === 'edit' || perm === 'view'
    if (action === 'edit') return perm === 'edit'
    return false
  }

  // A submodule can be granted independently while preserving every legacy
  // account that only has a module-level permission. Example:
  // fleet: 'view' + fleetRidership: 'edit' = read-only Fleet except Ridership.
  const canSubmodule = (module, submoduleKey, action = 'view') => {
    if (!userProfile || !isApproved) return false
    if (user?.email === MASTER_ADMIN_EMAIL || userProfile.role === 'hod') return true
    const explicit = userProfile.permissions?.[submoduleKey]
    const effective = explicit || userProfile.permissions?.[module]
    if (action === 'view') return effective === 'edit' || effective === 'view'
    if (action === 'edit') return effective === 'edit'
    return false
  }

  const canSubmitReport = (sectionKey) => {
    if (!userProfile || !isApproved) return false
    if (user?.email === MASTER_ADMIN_EMAIL) return true
    if (userProfile.role === 'hod') return true
    return userProfile.permissions?.reports?.includes(sectionKey) ?? false
  }

  const isMasterAdmin = user?.email === MASTER_ADMIN_EMAIL
  const isHOD = userProfile?.role === 'hod'
  const canManageUsers = isMasterAdmin || isHOD

  return { can, canSubmodule, canSubmitReport, userProfile, user, isMasterAdmin, isHOD, canManageUsers }
}
