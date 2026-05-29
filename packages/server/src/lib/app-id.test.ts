import { describe, expect, it } from 'vitest'

import { isValidAppId, normalizeAppId } from './app-id.js'

describe('app-id', () => {
  it('accepts documented slug shapes', () => {
    expect(isValidAppId('esr_app_mynotes')).toBe(true)
    expect(isValidAppId('esr_app_mynotes_mobile')).toBe(true)
    expect(isValidAppId('ESR_APP_MyNotes')).toBe(true)
  })

  it('rejects invalid slugs', () => {
    expect(isValidAppId('esr_app_')).toBe(false)
    expect(isValidAppId('myapp')).toBe(false)
    expect(isValidAppId('esr_app_my-app')).toBe(false)
  })

  it('normalizes casing and whitespace', () => {
    expect(normalizeAppId('  ESR_APP_Demo  ')).toBe('esr_app_demo')
  })
})
