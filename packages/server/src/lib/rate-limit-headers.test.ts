import { describe, expect, it } from 'vitest'
import {
  rateLimitHeaderPrefix,
  rateLimitsPayload,
  withRateLimits,
} from './rate-limit-headers.js'
import type { RateLimitQuota } from '../services/rate-limit-service.js'

describe('rate-limit-headers', () => {
  it('maps actions to header prefixes', () => {
    expect(rateLimitHeaderPrefix('global_ip')).toBe('RateLimit')
    expect(rateLimitHeaderPrefix('put_primary')).toBe('RateLimit-Push')
    expect(rateLimitHeaderPrefix('recover')).toBe('RateLimit-Recover')
  })

  it('adds rateLimits object to JSON payloads', () => {
    const quotas: RateLimitQuota[] = [
      {
        action: 'global_ip',
        limit: 300,
        remaining: 299,
        resetAfterSeconds: 42,
        windowSeconds: 60,
      },
      {
        action: 'put_primary',
        limit: 120,
        remaining: 119,
        resetAfterSeconds: 3600,
        windowSeconds: 3600,
      },
    ]

    const payload = withRateLimits(
      {
        rateLimitQuotas: quotas,
      } as Parameters<typeof withRateLimits>[0],
      {
        revision: '01ABC',
      },
    )

    expect(payload.revision).toBe('01ABC')
    expect(payload.rateLimits).toEqual(rateLimitsPayload(quotas))
  })
})
