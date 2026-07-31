import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { RunStatus } from '../../api/client'
import { RunLogPanel } from './RunLogPanel'

const failedRun: RunStatus = {
  id: 'run-1',
  state: 'FAILED',
  iteration: 0,
  message: 'Unable to resolve launcher',
  logs: [
    { timestamp: '2026-07-31T06:00:00.000Z', level: 'INFO', nodeId: 'launch', message: 'Chạy thử node LAUNCH_APP' },
    { timestamp: '2026-07-31T06:00:01.000Z', level: 'ERROR', nodeId: 'launch', message: 'Unable to resolve launcher' },
  ],
}

describe('RunLogPanel', () => {
  it('shows detailed executor errors when expanded', () => {
    render(<RunLogPanel run={failedRun} expanded onToggle={vi.fn()} />)

    expect(screen.getAllByText('Unable to resolve launcher')).toHaveLength(2)
    expect(screen.getAllByText('launch')).toHaveLength(2)
  })

  it('keeps the latest log visible in the collapsed header', () => {
    render(<RunLogPanel run={failedRun} expanded={false} onToggle={vi.fn()} />)

    expect(screen.getByRole('button', { name: /mở log/i })).toHaveTextContent('Unable to resolve launcher')
  })
})
