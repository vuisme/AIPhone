import { describe, expect, it } from 'vitest'
import type { UiHierarchyNode } from '../../api/client'
import { inspectorCandidates } from './UiInspectorEditor'

const node = (overrides: Partial<UiHierarchyNode> = {}): UiHierarchyNode => ({
  id: 1,
  text: 'Đ.KÝ SAU',
  contentDescription: '',
  resourceId: '',
  className: 'android.widget.Button',
  packageName: 'com.garena.game.kgvn',
  clickable: true,
  enabled: true,
  visible: true,
  bounds: { left: 1800, top: 200, right: 1980, bottom: 280 },
  ...overrides,
})

describe('inspectorCandidates', () => {
  it('keeps visible enabled text nodes with usable bounds', () => {
    expect(inspectorCandidates([node()])).toHaveLength(1)
  })

  it('hides disabled, invisible, empty and zero-sized nodes', () => {
    expect(inspectorCandidates([
      node({ id: 2, enabled: false }),
      node({ id: 3, visible: false }),
      node({ id: 4, text: '', contentDescription: '', resourceId: '' }),
      node({ id: 5, bounds: { left: 0, top: 0, right: 0, bottom: 0 } }),
    ])).toEqual([])
  })
})
