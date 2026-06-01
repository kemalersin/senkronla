import { describe, expect, it, vi } from 'vitest'

import { serverConfigSchema } from '../config/schema.js'
import {
  enforceRateLimit,
  getGlobalIpRateLimitRule,
  RATE_LIMIT_ACTION,
} from './rate-limit-service.js'

function baseConfig() {
  return serverConfigSchema.parse({
    limits: {
      rateLimit: {
        enabled: true,
        generalPerMinutePerIp: 2,
      },
    },
  })
}

describe('rate-limit-service', () => {
  it('uses minute buckets for counters without writing violations', async () => {
    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ count: '0', oldest_at: null }] })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ count: '1', oldest_at: new Date() }] })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ count: '2', oldest_at: new Date() }] }),
    }

    const config = baseConfig()
    const rule = getGlobalIpRateLimitRule(config)
    const scope = { clientIp: '203.0.113.10' }

    await enforceRateLimit(pool as never, config, rule, scope)
    await enforceRateLimit(pool as never, config, rule, scope)

    await expect(enforceRateLimit(pool as never, config, rule, scope)).rejects.toMatchObject({
      statusCode: 429,
      code: 'RATE_LIMIT_EXCEEDED',
    })

    expect(pool.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('rate_limit_usage_buckets'),
      ['203.0.113.10', RATE_LIMIT_ACTION.globalIp, '60'],
    )

    expect(pool.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO rate_limit_usage_buckets'),
      expect.arrayContaining([RATE_LIMIT_ACTION.globalIp, null, null, '203.0.113.10', null]),
    )

    expect(
      pool.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO rate_limit_events')),
    ).toBe(false)
  })
})
