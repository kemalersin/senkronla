import { describe, expect, it } from 'vitest'
import { shouldSkipAppAuth } from './auth-app.js'

describe('shouldSkipAppAuth', () => {
  it('skips app auth for websocket notifications upgrade', () => {
    expect(
      shouldSkipAppAuth('/v1/namespaces/11111111-1111-4111-8111-111111111111/notifications'),
    ).toBe(true)
  })

  it('does not skip app auth for other v1 routes', () => {
    expect(shouldSkipAppAuth('/v1/namespaces/11111111-1111-4111-8111-111111111111/devices')).toBe(
      false,
    )
  })
})
