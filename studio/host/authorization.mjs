function isAdmin(user) {
  return user?.role === 'ADMIN'
}

function hasGrant(user, resource) {
  return Array.isArray(resource?.grantedUserIds) && resource.grantedUserIds.includes(user?.id)
}

export function canEditWorkflow(user, workflow) {
  return Boolean(user && workflow && (isAdmin(user) || workflow.ownerUserId === user.id || hasGrant(user, workflow)))
}

export function canManageWorkflow(user, workflow) {
  return Boolean(user && workflow && (isAdmin(user) || workflow.ownerUserId === user.id))
}

export function canUseDevice(user, device) {
  return Boolean(user && device && (isAdmin(user) || device.ownerUserId === user.id || hasGrant(user, device)))
}

export function canPairDevice(user, device) {
  return Boolean(user && (!device || isAdmin(user) || device.ownerUserId === user.id))
}
