import { describe, expect, it } from 'vitest'
import { isValidDocumentId } from './document-id.js'

describe('documentId', () => {
  it('accepts primary and common ids', () => {
    expect(isValidDocumentId('primary')).toBe(true)
    expect(isValidDocumentId('settings')).toBe(true)
    expect(isValidDocumentId('vault_notes')).toBe(true)
    expect(isValidDocumentId('notes-v2')).toBe(true)
  })

  it('rejects invalid ids', () => {
    expect(isValidDocumentId('Primary')).toBe(false)
    expect(isValidDocumentId('1bad')).toBe(false)
    expect(isValidDocumentId('')).toBe(false)
    expect(isValidDocumentId('has.dot')).toBe(false)
  })
})
