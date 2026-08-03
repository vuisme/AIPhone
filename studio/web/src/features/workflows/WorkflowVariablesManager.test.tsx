import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createStarterWorkflow } from '../../contracts/workflow'
import { WorkflowVariablesManager } from './WorkflowVariablesManager'

afterEach(cleanup)

describe('workflow input expressions', () => {
  it('supports expressions in global variable default values', () => {
    const workflow = createStarterWorkflow()
    workflow.parameters = [{ name: 'delay', type: 'NUMBER', defaultValue: 500 }]
    const onChange = vi.fn()
    render(<WorkflowVariablesManager workflow={workflow} onChange={onChange} />)

    screen.getByRole('button', { name: 'Dùng expression cho giá trị mặc định delay' }).click()

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      parameters: [expect.objectContaining({ defaultValue: '{{ 500 }}' })],
    }))
  })

  it('edits an existing global expression without coercing it to NaN', () => {
    const workflow = createStarterWorkflow()
    workflow.parameters = [{ name: 'delay', type: 'NUMBER', defaultValue: '{{ random(500, 1000) }}' }]
    const onChange = vi.fn()
    render(<WorkflowVariablesManager workflow={workflow} onChange={onChange} />)

    const editor = screen.getByLabelText('Expression mặc định delay')
    fireEvent.change(editor, { target: { value: '{{ 750 }}' } })

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      parameters: [expect.objectContaining({ defaultValue: '{{ 750 }}' })],
    }))
  })
})
