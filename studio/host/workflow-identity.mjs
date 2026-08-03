const MAX_WORKFLOW_ID_LENGTH = 101

export function workflowAccountScope(accountId) {
  const normalized = String(accountId || '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '')
  if (!normalized) throw new Error('Account ID cannot create a workflow namespace')
  return `user-${normalized}`
}

export function isAccountWorkflowId(accountId, workflowId) {
  return typeof workflowId === 'string' && workflowId.startsWith(`${workflowAccountScope(accountId)}-`)
}

export function scopeWorkflowDocument(accountId, workflow) {
  const prefix = `${workflowAccountScope(accountId)}-`
  const id = isAccountWorkflowId(accountId, workflow.id)
    ? workflow.id
    : `${prefix}${workflow.id.slice(0, MAX_WORKFLOW_ID_LENGTH - prefix.length)}`
  return {
    ...workflow,
    id,
    assets: (workflow.assets || []).map((asset) => ({ ...asset, workflowId: id })),
  }
}
