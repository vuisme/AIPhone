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

  it('normalizes typed workflow parameters for reusable runs', () => {
    const workflow = normalizeWorkflow({
      ...createStarterWorkflow(),
      parameters: [
        { name: 'rewardCount', type: 'NUMBER', defaultValue: 3, description: 'Số quà cần nhận' },
        { name: 'accountReady', type: 'BOOLEAN', defaultValue: false },
      ],
    })

    expect(workflow.parameters).toEqual([
      { name: 'rewardCount', type: 'NUMBER', defaultValue: 3, description: 'Số quà cần nhận' },
      { name: 'accountReady', type: 'BOOLEAN', defaultValue: false },
    ])
  })

  it('validates variable node names and duplicate workflow parameters', () => {
    const workflow = createStarterWorkflow()
    workflow.parameters = [
      { name: 'rewardCount', type: 'NUMBER', defaultValue: 0 },
      { name: 'rewardCount', type: 'NUMBER', defaultValue: 1 },
    ]
    workflow.nodes.push({
      id: 'set-invalid',
      type: 'SET_VARIABLE',
      position: { x: 300, y: 120 },
      config: { name: 'not valid', valueType: 'STRING', value: 'x' },
    })

    expect(validateWorkflow(workflow).issues).toEqual(expect.arrayContaining([
      'Duplicate workflow parameter rewardCount',
      'Node set-invalid has invalid variable name not valid',
    ]))
  })

  it('validates the optional TTS output variable', () => {
    const workflow = createStarterWorkflow()
    workflow.nodes.push({
      id: 'speak-result',
      type: 'TTS_SPEAK',
      position: { x: 300, y: 120 },
      config: { text: 'Xin chào', outputVariable: 'audio result' },
    })

    expect(validateWorkflow(workflow).issues).toContain('Node speak-result has invalid output variable audio result')
  })

  it('accepts a nested runtime field as an IF variable reference', () => {
    const workflow = createStarterWorkflow()
    workflow.nodes.push({
      id: 'check-audio-size',
      type: 'IF',
      position: { x: 300, y: 120 },
      config: { leftVariable: 'ttsResult.file.sizeBytes', operator: 'GREATER_THAN', rightSource: 'LITERAL', rightType: 'NUMBER', rightValue: 0 },
    })

    expect(validateWorkflow(workflow).issues).not.toContain('Node check-audio-size has invalid left variable ttsResult.file.sizeBytes')
  })

  it('defers validation for node inputs produced by expressions at runtime', () => {
    const workflow = createStarterWorkflow()
    workflow.nodes.push(
      { id: 'dynamic-variable', type: 'SET_VARIABLE', position: { x: 200, y: 100 }, config: { name: '{{ outputName }}', valueType: 'NUMBER', value: '{{ random(5, 10) }}' } },
      { id: 'dynamic-if', type: 'IF', position: { x: 400, y: 100 }, config: { leftVariable: '{{ variablePath }}', operator: 'EQUALS', rightSource: 'LITERAL', rightType: 'STRING', rightValue: 'ok' } },
      { id: 'dynamic-image', type: 'WAIT_IMAGE', position: { x: 600, y: 100 }, config: { assetId: '{{ targetAssetId }}', timeoutMs: '{{ random(500, 1000) }}' } },
    )

    const issues = validateWorkflow(workflow).issues

    expect(issues).not.toContain('Node dynamic-variable has invalid variable name {{ outputName }}')
    expect(issues).not.toContain('Node dynamic-if has invalid left variable {{ variablePath }}')
    expect(issues.some((issue) => issue.includes('dynamic-image references missing'))).toBe(false)
  })
})
