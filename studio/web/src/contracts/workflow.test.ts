import { describe, expect, it } from 'vitest'
import { createStarterWorkflow, validateWorkflow } from './workflow'

describe('workflow validation', () => {
  it('accepts the starter workflow', () => {
    const workflow = createStarterWorkflow()

    expect(validateWorkflow(workflow)).toEqual({ valid: true, issues: [] })
  })

  it('rejects an image node that references a missing template', () => {
    const workflow = createStarterWorkflow()
    workflow.nodes.push({
      id: 'wait-reward',
      type: 'WAIT_IMAGE',
      position: { x: 300, y: 120 },
      config: {
        templateId: 'missing-template',
        threshold: 0.88,
        timeoutMs: 10_000,
        pollIntervalMs: 500,
      },
    })

    const result = validateWorkflow(workflow)

    expect(result.valid).toBe(false)
    expect(result.issues).toContain('Node wait-reward references missing template missing-template')
  })

  it('does not require runtime config for a disabled node', () => {
    const workflow = createStarterWorkflow()
    workflow.nodes.push({
      id: 'disabled-wait',
      type: 'WAIT_IMAGE',
      position: { x: 300, y: 120 },
      config: { templateId: 'missing-template' },
      disabled: true,
    })

    expect(validateWorkflow(workflow)).toEqual({ valid: true, issues: [] })
  })

  it('rejects a workflow without exactly one start node', () => {
    const workflow = createStarterWorkflow()
    workflow.nodes = workflow.nodes.filter((node) => node.type !== 'START')

    expect(validateWorkflow(workflow).issues).toContain('Workflow must contain exactly one START node')
  })
})
