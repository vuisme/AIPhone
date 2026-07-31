import { describe, expect, it } from 'vitest'
import type { WorkflowEdge } from '../../contracts/workflow'
import { removeEdgeById, toggleNodeDisabled } from './workflowGraph'

describe('removeEdgeById', () => {
  it('removes only the selected edge', () => {
    const edges: WorkflowEdge[] = [
      { id: 'start-delay', source: 'start', target: 'delay' },
      { id: 'delay-success', source: 'delay', target: 'success' },
    ]

    expect(removeEdgeById(edges, 'start-delay')).toEqual([
      { id: 'delay-success', source: 'delay', target: 'success' },
    ])
  })

  it('returns the original edges when the id is unknown', () => {
    const edges: WorkflowEdge[] = [{ id: 'start-success', source: 'start', target: 'success' }]

    expect(removeEdgeById(edges, 'missing')).toBe(edges)
  })
})

describe('toggleNodeDisabled', () => {
  it('toggles only the requested node without changing its config', () => {
    const nodes = [
      { id: 'start', type: 'START' as const, position: { x: 0, y: 0 }, config: {} },
      { id: 'delay', type: 'DELAY' as const, position: { x: 100, y: 0 }, config: { durationMs: 1000 } },
    ]

    const disabled = toggleNodeDisabled(nodes, 'delay')

    expect(disabled[0]).toBe(nodes[0])
    expect(disabled[1]).toEqual({ ...nodes[1], disabled: true })
    expect(toggleNodeDisabled(disabled, 'delay')[1].disabled).toBe(false)
  })
})
