import { describe, expect, it } from 'vitest'
import {
  formatUnlockCode,
  generateUnlockCodeRandomPart,
  secureCompareTokens,
} from './unlock-service.js'

describe('unlock-service helpers', () => {
  it('formats unlock codes with prefix, slots, and random suffix', () => {
    expect(formatUnlockCode('ESR-UNLK', 3, 'K7M9P2Q4R6T8')).toBe('ESR-UNLK-3-K7M9P2Q4R6T8')
  })

  it('generates a 12-character random suffix', () => {
    const randomPart = generateUnlockCodeRandomPart()
    expect(randomPart).toHaveLength(12)
    expect(randomPart).toMatch(/^[A-Z0-9]+$/)
  })

  it('compares admin tokens in constant time', () => {
    expect(secureCompareTokens('same-token-value-1234567890', 'same-token-value-1234567890')).toBe(true)
    expect(secureCompareTokens('same-token-value-1234567890', 'other-token-value-123456789')).toBe(false)
  })
})
