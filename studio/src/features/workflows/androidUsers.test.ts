import { describe, expect, it } from 'vitest'
import { androidUserOptions } from './androidUsers'

describe('androidUserOptions', () => {
  it('offers main app and XSpace for nodes that can target either user', () => {
    expect(androidUserOptions('LAUNCH_APP')).toEqual([
      { value: 0, label: 'App chính' },
      { value: 999, label: 'App kép / XSpace' },
    ])
  })

  it('locks clone lifecycle operations to XSpace', () => {
    expect(androidUserOptions('DELETE_CLONE')).toEqual([
      { value: 999, label: 'App kép / XSpace' },
    ])
  })
})
