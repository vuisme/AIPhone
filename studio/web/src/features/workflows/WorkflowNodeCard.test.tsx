import { render, screen } from '@testing-library/react'
import { ReactFlowProvider } from '@xyflow/react'
import type { ComponentProps } from 'react'
import { describe, expect, it } from 'vitest'
import { WorkflowNodeCard } from './WorkflowNodeCard'

describe('workflow node display name', () => {
  it('shows the custom name while retaining the node type description', () => {
    const props = {
      id: 'claim-reward',
      data: { nodeType: 'TAP_POINT', displayName: 'Nhận quà hằng ngày', config: { x: 100, y: 200 } },
      selected: false,
    } as unknown as ComponentProps<typeof WorkflowNodeCard>
    render(<ReactFlowProvider><WorkflowNodeCard {...props} /></ReactFlowProvider>)

    expect(screen.getByText('Nhận quà hằng ngày')).toBeInTheDocument()
    expect(screen.getByText('Tap tại vị trí X / Y')).toBeInTheDocument()
  })
})
