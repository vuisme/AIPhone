import { randomUUID } from 'node:crypto'
import { canEditWorkflow, canManageWorkflow, canPairDevice, canUseDevice } from './authorization.mjs'
import { conflict, forbidden, validation } from './errors.mjs'
import { assertId, decodePng, parseWorkflow, sha256 } from './project-store.mjs'
import { normalizeEmail } from './security.mjs'

function mapUser(row) {
  if (!row) return undefined
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    passwordHash: row.password_hash,
    role: row.role,
    status: row.status,
    createdAt: row.created_at?.toISOString?.() || row.created_at,
    updatedAt: row.updated_at?.toISOString?.() || row.updated_at,
  }
}

function validateDisplayName(value) {
  const displayName = String(value || '').trim()
  if (displayName.length < 2 || displayName.length > 80) throw validation('Display name must contain 2 to 80 characters')
  return displayName
}

function validateRole(value) {
  if (!['ADMIN', 'USER'].includes(value)) throw validation('Role is invalid')
  return value
}

function validateStatus(value) {
  if (!['ACTIVE', 'DISABLED'].includes(value)) throw validation('Account status is invalid')
  return value
}

function validateWorkflow(input, pathId) {
  try {
    return parseWorkflow(input, pathId === undefined ? undefined : assertId(pathId, 'Workflow'))
  } catch (error) {
    throw validation(error instanceof Error ? error.message : 'Workflow is invalid')
  }
}

function workflowSummary(row) {
  const document = row.document
  return {
    id: document.id,
    name: document.name || document.id,
    revision: Number.isFinite(document.revision) ? document.revision : 1,
    nodeCount: document.nodes?.length || 0,
    assetCount: document.assets?.length || 0,
    updatedAt: document.updatedAt || row.updated_at?.toISOString?.() || '',
    ownerUserId: row.owner_user_id,
    ownerDisplayName: row.owner_display_name,
    access: row.access || 'OWNER',
  }
}

function mapDevice(row) {
  if (!row) return undefined
  return {
    id: row.id,
    serial: row.serial,
    label: row.label,
    model: row.model,
    ownerUserId: row.owner_user_id,
    ownerDisplayName: row.owner_display_name,
    grantedUserIds: row.granted_user_ids || [],
    hasCredential: Boolean(row.credential_ciphertext),
    credential: row.credential_ciphertext ? {
      ciphertext: row.credential_ciphertext,
      iv: row.credential_iv,
      authTag: row.credential_auth_tag,
    } : undefined,
    createdAt: row.created_at?.toISOString?.() || row.created_at,
    updatedAt: row.updated_at?.toISOString?.() || row.updated_at,
  }
}

export class StudioRepository {
  constructor(database, credentialCipher) {
    this.database = database
    this.credentialCipher = credentialCipher
  }

  async hasUsers() {
    const result = await this.database.query('SELECT EXISTS(SELECT 1 FROM studio_users) AS exists')
    return result.rows[0].exists
  }

  async createInitialAdmin({ email, displayName, passwordHash }) {
    return this.database.transaction(async (client) => {
      await client.query('LOCK TABLE studio_users IN EXCLUSIVE MODE')
      const existing = await client.query('SELECT 1 FROM studio_users LIMIT 1')
      if (existing.rowCount > 0) throw conflict('SETUP_COMPLETE', 'Setup is already complete')
      const id = randomUUID()
      const result = await client.query(
        `INSERT INTO studio_users(id, email, display_name, password_hash, role, status)
         VALUES ($1, $2, $3, $4, 'ADMIN', 'ACTIVE') RETURNING *`,
        [id, normalizeEmail(email), validateDisplayName(displayName), passwordHash],
      )
      return mapUser(result.rows[0])
    })
  }

  async findUserByEmail(email) {
    const result = await this.database.query('SELECT * FROM studio_users WHERE email = $1', [normalizeEmail(email)])
    return mapUser(result.rows[0])
  }

  async findUserById(id) {
    const result = await this.database.query('SELECT * FROM studio_users WHERE id = $1', [id])
    return mapUser(result.rows[0])
  }

  async listUsers() {
    const result = await this.database.query('SELECT * FROM studio_users ORDER BY created_at ASC')
    return result.rows.map(mapUser)
  }

  async createUser({ actorUserId, email, displayName, passwordHash, role = 'USER' }) {
    try {
      const result = await this.database.query(
        `INSERT INTO studio_users(id, email, display_name, password_hash, role, status, created_by)
         VALUES ($1, $2, $3, $4, $5, 'ACTIVE', $6) RETURNING *`,
        [randomUUID(), normalizeEmail(email), validateDisplayName(displayName), passwordHash, validateRole(role), actorUserId],
      )
      return mapUser(result.rows[0])
    } catch (error) {
      if (error?.code === '23505') throw conflict('EMAIL_EXISTS', 'An account with this email already exists')
      throw error
    }
  }

  async updateUser(id, changes) {
    return this.database.transaction(async (client) => {
      // Serialize administrator role/status changes so concurrent requests cannot remove every active admin.
      await client.query('LOCK TABLE studio_users IN SHARE ROW EXCLUSIVE MODE')
      const existingResult = await client.query('SELECT * FROM studio_users WHERE id = $1 FOR UPDATE', [id])
      const existing = mapUser(existingResult.rows[0])
      if (!existing) throw new Error('User not found')
      const role = changes.role === undefined ? existing.role : validateRole(changes.role)
      const status = changes.status === undefined ? existing.status : validateStatus(changes.status)
      const displayName = changes.displayName === undefined ? existing.displayName : validateDisplayName(changes.displayName)
      if (existing.role === 'ADMIN' && existing.status === 'ACTIVE' && (role !== 'ADMIN' || status !== 'ACTIVE')) {
        const count = await client.query("SELECT count(*)::integer AS count FROM studio_users WHERE role = 'ADMIN' AND status = 'ACTIVE'")
        if (count.rows[0].count <= 1) throw conflict('LAST_ADMIN', 'The final active administrator cannot be disabled or demoted')
      }
      const result = await client.query(
        `UPDATE studio_users SET display_name = $2, role = $3, status = $4, updated_at = now()
         WHERE id = $1 RETURNING *`,
        [id, displayName, role, status],
      )
      return mapUser(result.rows[0])
    })
  }

  async resetUserPassword(id, passwordHash) {
    const result = await this.database.query(
      'UPDATE studio_users SET password_hash = $2, updated_at = now() WHERE id = $1 RETURNING *',
      [id, passwordHash],
    )
    if (result.rowCount === 0) throw new Error('User not found')
    return mapUser(result.rows[0])
  }

  async recordAudit({ actorUserId, action, targetType, targetId, metadata = {} }) {
    await this.database.query(
      `INSERT INTO studio_audit_events(actor_user_id, action, target_type, target_id, metadata)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [actorUserId || null, action, targetType, targetId || null, JSON.stringify(metadata)],
    )
  }

  async workflowAccess(user, id, queryable = this.database) {
    assertId(id, 'Workflow')
    const result = await queryable.query(
      `SELECT w.*, u.display_name AS owner_display_name,
        COALESCE(array_agg(g.user_id) FILTER (WHERE g.user_id IS NOT NULL), '{}') AS granted_user_ids
       FROM studio_workflows w
       JOIN studio_users u ON u.id = w.owner_user_id
       LEFT JOIN studio_workflow_grants g ON g.workflow_id = w.id
       WHERE w.id = $1
       GROUP BY w.id, u.display_name`,
      [id],
    )
    const row = result.rows[0]
    if (!row) return undefined
    return {
      ...row,
      ownerUserId: row.owner_user_id,
      grantedUserIds: row.granted_user_ids || [],
    }
  }

  async listWorkflows(user) {
    const admin = user.role === 'ADMIN'
    const result = await this.database.query(
      `SELECT w.*, u.display_name AS owner_display_name,
        CASE WHEN $1::boolean THEN 'ADMIN' WHEN w.owner_user_id = $2 THEN 'OWNER' ELSE 'GRANTED' END AS access
       FROM studio_workflows w
       JOIN studio_users u ON u.id = w.owner_user_id
       WHERE $1::boolean OR w.owner_user_id = $2 OR EXISTS (
         SELECT 1 FROM studio_workflow_grants g WHERE g.workflow_id = w.id AND g.user_id = $2
       )
       ORDER BY w.updated_at DESC`,
      [admin, user.id],
    )
    return result.rows.map(workflowSummary)
  }

  async readWorkflow(user, id) {
    const access = await this.workflowAccess(user, id)
    if (!access || !canEditWorkflow(user, access)) throw forbidden()
    return access.document
  }

  async createWorkflow(user, input) {
    const workflow = validateWorkflow(input)
    try {
      await this.database.query(
        `INSERT INTO studio_workflows(id, owner_user_id, document, updated_at)
         VALUES ($1, $2, $3::jsonb, now())`,
        [workflow.id, user.id, JSON.stringify(workflow)],
      )
      return workflow
    } catch (error) {
      if (error?.code === '23505') throw conflict('WORKFLOW_EXISTS', `Workflow ${workflow.id} already exists`)
      throw error
    }
  }

  async saveWorkflow(user, id, input) {
    const workflow = validateWorkflow(input, id)
    const access = await this.workflowAccess(user, id)
    if (!access) return this.createWorkflow(user, workflow)
    if (!canEditWorkflow(user, access)) throw forbidden()
    await this.database.query(
      'UPDATE studio_workflows SET document = $2::jsonb, updated_at = now() WHERE id = $1',
      [id, JSON.stringify(workflow)],
    )
    return workflow
  }

  async deleteWorkflow(user, id) {
    const access = await this.workflowAccess(user, id)
    if (!access || !canManageWorkflow(user, access)) throw forbidden()
    await this.database.query('DELETE FROM studio_workflows WHERE id = $1', [id])
  }

  async saveImageAsset(user, workflowId, input) {
    const access = await this.workflowAccess(user, workflowId)
    if (!access || !canEditWorkflow(user, access)) throw forbidden()
    let record
    let assetId
    let image
    try {
      const upload = Buffer.isBuffer(input) || typeof input === 'string' ? JSON.parse(input.toString()) : input
      record = upload?.record
      if (!record || record.type !== 'IMAGE' || record.workflowId !== workflowId) throw new Error('Only an IMAGE Asset belonging to this workflow can be uploaded')
      assetId = assertId(record.id, 'Asset')
      image = decodePng(upload.imageBase64)
    } catch (error) {
      throw validation(error instanceof Error ? error.message : 'Asset upload is invalid')
    }
    const digest = sha256(image)
    await this.database.query(
      `INSERT INTO studio_workflow_assets(workflow_id, asset_id, image_png, sha256, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (workflow_id, asset_id) DO UPDATE
       SET image_png = EXCLUDED.image_png, sha256 = EXCLUDED.sha256, updated_at = now()`,
      [workflowId, assetId, image, digest],
    )
    return { ...record, workflowId, fileName: `${assetId}.png`, sha256: digest, updatedAt: new Date().toISOString() }
  }

  async readImageAsset(user, workflowId, assetId) {
    const access = await this.workflowAccess(user, workflowId)
    if (!access || !canEditWorkflow(user, access)) throw forbidden()
    const result = await this.database.query(
      'SELECT image_png FROM studio_workflow_assets WHERE workflow_id = $1 AND asset_id = $2',
      [assertId(workflowId, 'Workflow'), assertId(assetId, 'Asset')],
    )
    if (result.rowCount === 0) throw new Error('Asset not found')
    return result.rows[0].image_png
  }

  async deleteImageAsset(user, workflowId, assetId) {
    const access = await this.workflowAccess(user, workflowId)
    if (!access || !canEditWorkflow(user, access)) throw forbidden()
    await this.database.query(
      'DELETE FROM studio_workflow_assets WHERE workflow_id = $1 AND asset_id = $2',
      [assertId(workflowId, 'Workflow'), assertId(assetId, 'Asset')],
    )
  }

  async listWorkflowGrants(workflowId) {
    const result = await this.database.query(
      `SELECT g.user_id, g.permission, u.email, u.display_name
       FROM studio_workflow_grants g JOIN studio_users u ON u.id = g.user_id
       WHERE g.workflow_id = $1 ORDER BY u.display_name`,
      [assertId(workflowId, 'Workflow')],
    )
    return result.rows.map((row) => ({ userId: row.user_id, permission: row.permission, email: row.email, displayName: row.display_name }))
  }

  async grantWorkflow(actorUserId, workflowId, userId) {
    await this.database.query(
      `INSERT INTO studio_workflow_grants(workflow_id, user_id, permission, granted_by)
       VALUES ($1, $2, 'EDIT', $3)
       ON CONFLICT (workflow_id, user_id) DO UPDATE SET permission = 'EDIT', granted_by = EXCLUDED.granted_by`,
      [assertId(workflowId, 'Workflow'), userId, actorUserId],
    )
  }

  async revokeWorkflowGrant(workflowId, userId) {
    await this.database.query('DELETE FROM studio_workflow_grants WHERE workflow_id = $1 AND user_id = $2', [assertId(workflowId, 'Workflow'), userId])
  }

  async deviceBySerial(serial, queryable = this.database) {
    const result = await queryable.query(
      `SELECT d.*, u.display_name AS owner_display_name,
        COALESCE(array_agg(g.user_id) FILTER (WHERE g.user_id IS NOT NULL), '{}') AS granted_user_ids
       FROM studio_devices d
       JOIN studio_users u ON u.id = d.owner_user_id
       LEFT JOIN studio_device_grants g ON g.device_id = d.id
       WHERE d.serial = $1
       GROUP BY d.id, u.display_name`,
      [serial],
    )
    return mapDevice(result.rows[0])
  }

  async listDevices(user) {
    const result = await this.database.query(
      `SELECT d.*, u.display_name AS owner_display_name,
        COALESCE(array_agg(g.user_id) FILTER (WHERE g.user_id IS NOT NULL), '{}') AS granted_user_ids
       FROM studio_devices d
       JOIN studio_users u ON u.id = d.owner_user_id
       LEFT JOIN studio_device_grants g ON g.device_id = d.id
       WHERE $1::boolean OR d.owner_user_id = $2 OR EXISTS (
         SELECT 1 FROM studio_device_grants visible WHERE visible.device_id = d.id AND visible.user_id = $2
       )
       GROUP BY d.id, u.display_name
       ORDER BY d.updated_at DESC`,
      [user.role === 'ADMIN', user.id],
    )
    return result.rows.map((row) => {
      const device = mapDevice(row)
      delete device.credential
      return device
    })
  }

  async connectedDeviceStatus(user, serial) {
    const device = await this.deviceBySerial(serial)
    if (!device) return { claimed: false, paired: false, canPair: true }
    if (!canUseDevice(user, device)) return { claimed: true, authorized: false }
    return {
      claimed: true,
      authorized: true,
      paired: device.hasCredential,
      canPair: canPairDevice(user, device),
      deviceId: device.id,
      ownerUserId: device.ownerUserId,
      ownerDisplayName: device.ownerDisplayName,
    }
  }

  async saveDeviceCredential(user, { serial, model, label, token }) {
    if (typeof serial !== 'string' || serial.length < 1 || serial.length > 255) throw validation('ADB serial is invalid')
    return this.database.transaction(async (client) => {
      const locked = await client.query('SELECT id FROM studio_devices WHERE serial = $1 FOR UPDATE', [serial])
      let device = locked.rowCount > 0 ? await this.deviceBySerial(serial, client) : undefined
      if (!canPairDevice(user, device)) throw forbidden('Only the device owner or an administrator can replace its pairing credential')
      const id = device?.id || randomUUID()
      let encrypted
      try { encrypted = this.credentialCipher.encrypt(token, id, serial) } catch (error) { throw validation(error.message) }
      if (!device) {
        await client.query(
          `INSERT INTO studio_devices(id, serial, label, model, owner_user_id, credential_ciphertext, credential_iv, credential_auth_tag)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [id, serial, label || model || serial, model || null, user.id, encrypted.ciphertext, encrypted.iv, encrypted.authTag],
        )
      } else {
        await client.query(
          `UPDATE studio_devices SET label = COALESCE($2, label), model = COALESCE($3, model),
           credential_ciphertext = $4, credential_iv = $5, credential_auth_tag = $6, updated_at = now()
           WHERE id = $1`,
          [id, label || null, model || null, encrypted.ciphertext, encrypted.iv, encrypted.authTag],
        )
      }
      device = await this.deviceBySerial(serial, client)
      delete device.credential
      return device
    })
  }

  async credentialForUse(user, serial) {
    const device = await this.deviceBySerial(serial)
    if (!device || !canUseDevice(user, device)) throw forbidden('This account cannot use the selected device')
    if (!device.credential) return undefined
    return this.credentialCipher.decrypt(device.credential, device.id, device.serial)
  }

  async forgetDeviceCredential(user, serial) {
    const device = await this.deviceBySerial(serial)
    if (!device || !canPairDevice(user, device)) throw forbidden('Only the device owner or an administrator can forget its pairing credential')
    await this.database.query(
      `UPDATE studio_devices SET credential_ciphertext = NULL, credential_iv = NULL,
       credential_auth_tag = NULL, updated_at = now() WHERE id = $1`,
      [device.id],
    )
  }

  async listDeviceGrants(deviceId) {
    const result = await this.database.query(
      `SELECT g.user_id, g.permission, u.email, u.display_name
       FROM studio_device_grants g JOIN studio_users u ON u.id = g.user_id
       WHERE g.device_id = $1 ORDER BY u.display_name`,
      [deviceId],
    )
    return result.rows.map((row) => ({ userId: row.user_id, permission: row.permission, email: row.email, displayName: row.display_name }))
  }

  async grantDevice(actorUserId, deviceId, userId) {
    await this.database.query(
      `INSERT INTO studio_device_grants(device_id, user_id, permission, granted_by)
       VALUES ($1, $2, 'USE', $3)
       ON CONFLICT (device_id, user_id) DO UPDATE SET permission = 'USE', granted_by = EXCLUDED.granted_by`,
      [deviceId, userId, actorUserId],
    )
  }

  async revokeDeviceGrant(deviceId, userId) {
    await this.database.query('DELETE FROM studio_device_grants WHERE device_id = $1 AND user_id = $2', [deviceId, userId])
  }

  async legacyImportComplete() {
    const result = await this.database.query("SELECT value FROM studio_settings WHERE key = 'legacy_import_v2_complete'")
    return result.rowCount > 0 && result.rows[0].value === true
  }

  async markLegacyImportComplete() {
    await this.database.query(
      `INSERT INTO studio_settings(key, value) VALUES ('legacy_import_v2_complete', 'true'::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = 'true'::jsonb, updated_at = now()`,
    )
  }
}
