import { describe, expect, it } from 'vitest'
import { getDatabaseMode, loadConfig } from './load-config.js'
import { DEFAULT_DATABASE_URL } from './schema.js'

describe('loadConfig', () => {
  it('uses defaults when env is empty', () => {
    const config = loadConfig({})

    expect(config.database.url).toBe(DEFAULT_DATABASE_URL)
    expect(config.server.port).toBe(8080)
    expect(config.server.publicUrl).toBe('http://localhost:8080')
    expect(config.limits.onLimitReached.mode).toBe('payment')
    expect(config.logging.redactPaths).toContain('deviceToken')
  })

  it('applies ESR_* environment overrides', () => {
    const config = loadConfig({
      ESR_DATABASE_URL: 'postgresql://custom:secret@db.example.com:5432/esr',
      ESR_PORT: '9090',
      ESR_ON_LIMIT_MODE: 'block',
      ESR_SLOT_PACKAGES: '3,10',
      ESR_CORS_ORIGINS: 'https://app.example.com,https://admin.example.com',
      ESR_RECOVER_PER_HOUR: '10',
      ESR_PUSH_PER_HOUR_PER_DEVICE: '60',
      ESR_GENERAL_PER_MINUTE_PER_IP: '100',
    })

    expect(config.database.url).toBe('postgresql://custom:secret@db.example.com:5432/esr')
    expect(config.server.port).toBe(9090)
    expect(config.limits.onLimitReached.mode).toBe('block')
    expect(config.limits.onLimitReached.slotPackages).toEqual([3, 10])
    expect(config.cors.allowedOrigins).toEqual([
      'https://app.example.com',
      'https://admin.example.com',
    ])
    expect(config.limits.rateLimit.recoverPerHour).toBe(10)
    expect(config.limits.rateLimit.pushPerHourPerDevice).toBe(60)
    expect(config.limits.rateLimit.generalPerMinutePerIp).toBe(100)
  })

  it('detects bundled vs external database mode', () => {
    expect(getDatabaseMode('postgresql://esr:esr@postgres:5432/esr')).toBe('bundled')
    expect(getDatabaseMode('postgresql://esr:esr@localhost:5432/esr')).toBe('external')
  })
})
