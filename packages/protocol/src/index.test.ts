import { describe, expect, it } from 'vitest'
import { ESR_DOC1_MAGIC, isValidNamespaceId } from './index.js'

describe('@senkronla/protocol', () => {
  it('exports ESR-DOC1 magic', () => {
    expect(ESR_DOC1_MAGIC).toBe('ESR-DOC1')
  })

  it('validates UUID v4 namespace ids', () => {
    expect(isValidNamespaceId('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
    expect(isValidNamespaceId('not-a-uuid')).toBe(false)
    expect(isValidNamespaceId('550e8400-e29b-51d4-a716-446655440000')).toBe(false)
  })
})
