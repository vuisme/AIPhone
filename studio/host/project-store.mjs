import { createHash, randomBytes } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$/
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const MAX_WORKFLOW_BYTES = 2 * 1024 * 1024
const MAX_ASSET_BYTES = 8 * 1024 * 1024

function assertId(value, label) {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) throw new Error(`${label} ID is invalid`)
  return value
}

function assertInside(parent, target) {
  const relative = path.relative(parent, target)
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Resolved path escapes the Studio data directory')
}

function parseWorkflow(input, pathId) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input)
  if (bytes.length > MAX_WORKFLOW_BYTES) throw new Error('Workflow is too large')
  const workflow = JSON.parse(bytes.toString('utf8'))
  if (!workflow || typeof workflow !== 'object' || Array.isArray(workflow)) throw new Error('Workflow must be a JSON object')
  const id = assertId(workflow.id, 'Workflow')
  if (pathId && id !== pathId) throw new Error('Workflow path and body IDs must match')
  if (!Array.isArray(workflow.nodes) || !Array.isArray(workflow.edges) || !Array.isArray(workflow.assets)) {
    throw new Error('Workflow nodes, edges and assets are required')
  }
  return workflow
}

function decodePng(dataUrl) {
  if (typeof dataUrl !== 'string') throw new Error('Asset imageBase64 is required')
  const encoded = dataUrl.includes(',') ? dataUrl.slice(dataUrl.indexOf(',') + 1) : dataUrl
  const bytes = Buffer.from(encoded, 'base64')
  if (bytes.length === 0 || bytes.length > MAX_ASSET_BYTES) throw new Error('Asset image size is invalid')
  if (!bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) throw new Error('Asset image must be a PNG')
  return bytes
}

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

export function defaultStudioDataDirectory(environment = process.env) {
  return path.resolve(environment.AIPHONE_STUDIO_DATA || path.join(os.homedir(), '.aiphone-studio'))
}

export class ProjectStore {
  constructor(root = defaultStudioDataDirectory()) {
    this.root = path.resolve(root)
    this.workflowDirectory = path.join(this.root, 'workflows')
    this.assetDirectory = path.join(this.root, 'assets')
  }

  async initialize() {
    await Promise.all([
      mkdir(this.workflowDirectory, { recursive: true }),
      mkdir(this.assetDirectory, { recursive: true }),
    ])
  }

  workflowPath(id) {
    assertId(id, 'Workflow')
    const target = path.join(this.workflowDirectory, `${id}.json`)
    assertInside(this.workflowDirectory, target)
    return target
  }

  assetPath(workflowId, assetId) {
    assertId(workflowId, 'Workflow')
    assertId(assetId, 'Asset')
    const directory = path.join(this.assetDirectory, workflowId)
    const target = path.join(directory, `${assetId}.png`)
    assertInside(this.assetDirectory, target)
    return target
  }

  async listWorkflows() {
    await this.initialize()
    const files = (await readdir(this.workflowDirectory)).filter((name) => name.endsWith('.json'))
    const workflows = await Promise.all(files.map(async (name) => JSON.parse(await readFile(path.join(this.workflowDirectory, name), 'utf8'))))
    return workflows
      .map((workflow) => ({
        id: workflow.id,
        name: workflow.name || workflow.id,
        revision: Number.isFinite(workflow.revision) ? workflow.revision : 1,
        nodeCount: workflow.nodes?.length || 0,
        assetCount: workflow.assets?.length || 0,
        updatedAt: workflow.updatedAt || '',
      }))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  }

  async readWorkflow(id) {
    return JSON.parse(await readFile(this.workflowPath(id), 'utf8'))
  }

  async createWorkflow(input) {
    const workflow = parseWorkflow(input)
    try {
      await readFile(this.workflowPath(workflow.id))
      throw new Error(`Workflow ${workflow.id} already exists`)
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
    return this.saveWorkflow(workflow.id, Buffer.from(JSON.stringify(workflow)))
  }

  async saveWorkflow(id, input) {
    const workflow = parseWorkflow(input, assertId(id, 'Workflow'))
    await this.initialize()
    await this.writeAtomically(this.workflowPath(id), Buffer.from(JSON.stringify(workflow)))
    return workflow
  }

  async deleteWorkflow(id) {
    await rm(this.workflowPath(id))
    await rm(path.join(this.assetDirectory, assertId(id, 'Workflow')), { recursive: true, force: true })
  }

  async saveImageAsset(workflowId, input) {
    const upload = typeof input === 'string' || Buffer.isBuffer(input) ? JSON.parse(input.toString()) : input
    const record = upload?.record
    if (!record || record.type !== 'IMAGE') throw new Error('Only IMAGE Assets accept PNG uploads')
    const id = assertId(record.id, 'Asset')
    if (record.workflowId !== workflowId) throw new Error('Asset belongs to another workflow')
    await this.readWorkflow(workflowId)
    const bytes = decodePng(upload.imageBase64)
    const target = this.assetPath(workflowId, id)
    await mkdir(path.dirname(target), { recursive: true })
    await this.writeAtomically(target, bytes)
    return { ...record, workflowId, type: 'IMAGE', fileName: `${id}.png`, sha256: sha256(bytes), updatedAt: new Date().toISOString() }
  }

  async readImageAsset(workflowId, assetId) {
    return readFile(this.assetPath(workflowId, assetId))
  }

  async deleteImageAsset(workflowId, assetId) {
    await rm(this.assetPath(workflowId, assetId), { force: true })
  }

  async writeAtomically(target, bytes) {
    const temporary = `${target}.${randomBytes(6).toString('hex')}.tmp`
    await writeFile(temporary, bytes)
    await rename(temporary, target)
  }
}

