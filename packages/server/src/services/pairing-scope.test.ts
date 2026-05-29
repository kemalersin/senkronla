import { describe, expect, it } from 'vitest'
import { AppError } from '../errors/app-error.js'
import { assertPairingAppAllowed } from './pairing-scope-service.js'

describe('pairing-scope-service', () => {
  it('allows redeem when app id is listed', () => {
    expect(() =>
      assertPairingAppAllowed(['esr_app_a', 'esr_app_b'], 'esr_app_b'),
    ).not.toThrow()
  })

  it('allows redeem when scope is unrestricted', () => {
    expect(() => assertPairingAppAllowed(null, 'esr_app_a')).not.toThrow()
    expect(() => assertPairingAppAllowed([], undefined)).not.toThrow()
  })

  it('rejects redeem for unlisted app id', () => {
    expect(() => assertPairingAppAllowed(['esr_app_a'], 'esr_app_b')).toThrow(AppError)
    try {
      assertPairingAppAllowed(['esr_app_a'], 'esr_app_b')
    } catch (error) {
      expect(error).toBeInstanceOf(AppError)
      expect((error as AppError).code).toBe('APP_PAIRING_NOT_ALLOWED')
    }
  })
})
