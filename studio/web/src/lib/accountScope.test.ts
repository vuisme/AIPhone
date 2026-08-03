import { describe, expect, it } from 'vitest'
import { accountScope, accountStorageKey } from './accountScope'

describe('account scope', () => {
  it('separates browser storage for different signed-in accounts', () => {
    expect(accountStorageKey('aiphone.workflows.v2', 'owner-a'))
      .not.toBe(accountStorageKey('aiphone.workflows.v2', 'owner-b'))
  })

  it('produces an ID-safe namespace from the immutable account ID', () => {
    expect(accountScope('A7A67C8B-1111-2222-3333-ABCDEF012345')).toBe('user-a7a67c8b-1111-2222-3333-abcdef012345')
  })
})
