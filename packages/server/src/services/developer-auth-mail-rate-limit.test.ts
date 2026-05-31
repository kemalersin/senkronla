import { describe, expect, it, vi } from 'vitest'

import { mailConfigSchema } from '../types/mail-settings.js'
import { serverConfigSchema } from '../config/schema.js'
import {
  enforceDeveloperAuthMailIpRateLimit,
  isDeveloperAuthMailPerDeveloperLimitReached,
} from './developer-auth-mail-rate-limit.js'
import { RATE_LIMIT_ACTION } from './rate-limit-service.js'

function baseConfig() {
  return serverConfigSchema.parse({
    limits: {
      rateLimit: {
        enabled: true,
        developerAuthMailPerHourPerIp: 2,
      },
    },
    apps: {
      developerPortal: {
        authMailPerHourPerDeveloper: 2,
      },
    },
    mail: mailConfigSchema.parse({
      enabled: true,
      from: 'noreply@example.com',
      webBaseUrl: 'http://localhost:3000',
      smtp: {
        host: 'smtp.example.com',
        user: 'user',
        password: 'pass',
      },
    }),
  })
}

describe('developer auth mail rate limits', () => {
  it('enforces per-IP quota with developer_auth_mail action', async () => {
    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ count: '0', oldest_at: null }] })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ count: '1', oldest_at: new Date() }] })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ count: '2', oldest_at: new Date() }] }),
    }

    const config = baseConfig()

    await enforceDeveloperAuthMailIpRateLimit(pool as never, config, '203.0.113.10')
    await enforceDeveloperAuthMailIpRateLimit(pool as never, config, '203.0.113.10')

    await expect(
      enforceDeveloperAuthMailIpRateLimit(pool as never, config, '203.0.113.10'),
    ).rejects.toMatchObject({
      statusCode: 429,
      code: 'RATE_LIMIT_EXCEEDED',
      details: {
        action: RATE_LIMIT_ACTION.developerAuthMail,
      },
    })
  })

  it('blocks per-developer mail after hourly token quota', async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [{ count: '2' }] }),
    }

    const reached = await isDeveloperAuthMailPerDeveloperLimitReached(
      pool as never,
      baseConfig(),
      '11111111-1111-1111-1111-111111111111',
      'email_verify',
    )

    expect(reached).toBe(true)
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM developer_auth_tokens'),
      ['11111111-1111-1111-1111-111111111111', 'email_verify', '3600'],
    )
  })

  it('skips per-developer checks when rate limits are disabled', async () => {
    const pool = { query: vi.fn() }
    const config = serverConfigSchema.parse({
      limits: { rateLimit: { enabled: false } },
      apps: { developerPortal: { authMailPerHourPerDeveloper: 1 } },
    })

    const reached = await isDeveloperAuthMailPerDeveloperLimitReached(
      pool as never,
      config,
      '11111111-1111-1111-1111-111111111111',
      'password_reset',
    )

    expect(reached).toBe(false)
    expect(pool.query).not.toHaveBeenCalled()
  })
})
