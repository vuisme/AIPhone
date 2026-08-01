import { describe, expect, it } from 'vitest'
import { createStarterWorkflow, normalizeWorkflow, validateWorkflow } from './workflow'

describe('workflow validation', () => {
  it('accepts the starter workflow', () => {
    const workflow = createStarterWorkflow()

    expect(validateWorkflow(workflow)).toEqual({ valid: true, issues: [] })
  })

  it('rejects an image node that references a missing Asset', () => {
    const workflow = createStarterWorkflow()
    workflow.nodes.push({
      id: 'wait-reward',
      type: 'WAIT_IMAGE',
      position: { x: 300, y: 120 },
      config: {
        assetId: 'missing-asset',
        threshold: 0.88,
        timeoutMs: 10_000,
        pollIntervalMs: 500,
      },
    })

    const result = validateWorkflow(workflow)

    expect(result.valid).toBe(false)
    expect(result.issues).toContain('Node wait-reward references missing IMAGE Asset missing-asset')
  })

  it('does not require runtime config for a disabled node', () => {
    const workflow = createStarterWorkflow()
    workflow.nodes.push({
      id: 'disabled-wait',
      type: 'WAIT_IMAGE',
      position: { x: 300, y: 120 },
      config: { assetId: 'missing-asset' },
      disabled: true,
    })

    expect(validateWorkflow(workflow)).toEqual({ valid: true, issues: [] })
  })

  it('rejects a workflow without exactly one start node', () => {
    const workflow = createStarterWorkflow()
    workflow.nodes = workflow.nodes.filter((node) => node.type !== 'START')

    expect(validateWorkflow(workflow).issues).toContain('Workflow must contain exactly one START node')
  })

  it('migrates legacy templates and templateId fields to workflow Assets', () => {
    const legacy = {
      schemaVersion: 1,
      id: 'legacy-flow',
      name: 'Legacy flow',
      revision: 4,
      nodes: [{ id: 'start', type: 'START', position: { x: 0, y: 0 }, config: {} }, {
        id: 'tap', type: 'TAP_IMAGE', position: { x: 100, y: 0 }, config: { templateId: 'skip-button', threshold: 0.9 },
      }],
      edges: [{ id: 'edge', source: 'start', target: 'tap' }],
      templates: [{ id: 'skip-button', name: 'Skip', fileName: 'skip-button.png', threshold: 0.9, width: 100, height: 40, updatedAt: '2026-07-31T00:00:00.000Z' }],
      createdAt: '2026-07-31T00:00:00.000Z',
      updatedAt: '2026-07-31T00:00:00.000Z',
    }

    const workflow = normalizeWorkflow(legacy)

    expect(workflow.schemaVersion).toBe(2)
    expect(workflow.assets).toEqual([expect.objectContaining({ id: 'skip-button', workflowId: 'legacy-flow', type: 'IMAGE' })])
    expect(workflow.nodes[1].config).toMatchObject({ assetId: 'skip-button', threshold: 0.9 })
    expect(workflow.nodes[1].config).not.toHaveProperty('templateId')
  })

  it('requires TAP_TEXT to reference a UI selector Asset', () => {
    const workflow = createStarterWorkflow()
    workflow.assets.push({
      id: 'confirm-text',
      workflowId: workflow.id,
      type: 'UI_SELECTOR',
      name: 'Confirm',
      selector: { text: 'Có', matchMode: 'EXACT' },
      updatedAt: '2026-07-31T00:00:00.000Z',
    })
    workflow.nodes.push({ id: 'tap-confirm', type: 'TAP_TEXT', position: { x: 200, y: 100 }, config: { assetId: 'confirm-text' } })

    expect(validateWorkflow(workflow)).toEqual({ valid: true, issues: [] })
  })
})
