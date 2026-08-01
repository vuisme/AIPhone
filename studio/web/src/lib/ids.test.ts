import { describe, expect, it } from 'vitest'
import { slugifyId } from './ids'

describe('slugifyId', () => {
  it('normalizes Vietnamese labels into safe IDs', () => {
    expect(slugifyId('Đăng ký sau', 'asset')).toBe('dang-ky-sau')
  })

  it('limits generated IDs before timestamp and uniqueness suffixes are added', () => {
    expect(slugifyId('a'.repeat(200), 'asset')).toHaveLength(72)
  })
})
