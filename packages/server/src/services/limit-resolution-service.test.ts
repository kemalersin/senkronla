import { describe, expect, it } from 'vitest'
import type { ServerConfig } from '../config/schema.js'
import type { AppRow, DeveloperRow, NamespaceRow } from '../types/db.js'
import {
  resolveEffectiveLimits,
  resolveLimitKey,
  resolveRateLimitRule,
  resolveSlotLimits,
} from './limit-resolution-service.js'
import { RATE_LIMIT_ACTION } from './rate-limit-service.js'

const config = {
  limits: {
    defaultFreeDeviceLimit: 2,
    rateLimit: {
      recoverPerHour: 10,
      pairingPerHour: 20,
      pairingTokensPerHour: 30,
      pushPerHourPerDevice: 40,
    },
  },
  apps: {
    limits: {
      perApp: {
        namespacesPerDay: 50,
      },
    },
  },
} as ServerConfig

const namespace: NamespaceRow = {
  id: 'ns-uuid',
  namespace_id: '550e8400-e29b-41d4-a716-446655440000',
  namespace_label: 'Test',
  free_device_limit: 3,
  purchased_slots: 1,
  recovery_salt: 'salt',
  recovery_hash: 'hash',
  app_uuid: 'app-uuid',
  limit_overrides: { recoverPerHour: 5 },
  created_at: new Date(),
  updated_at: new Date(),
}

const app: AppRow = {
  id: 'app-uuid',
  app_id: 'esr_app_test',
  developer_uuid: 'dev-uuid',
  name: 'Test App',
  type: 'web',
  status: 'active',
  client_secret_hash: null,
  limit_overrides: { pairingPerHour: 15 },
  created_at: new Date(),
  updated_at: new Date(),
}

const developer: DeveloperRow = {
  id: 'dev-uuid',
  email: 'dev@example.com',
  email_verified_at: new Date(),
  disabled_at: null,
  limit_overrides: { pushPerHourPerDevice: 100 },
  created_at: new Date(),
}

describe('limit-resolution-service', () => {
  it('prefers namespace override over app and config', () => {
    const result = resolveLimitKey('recoverPerHour', { namespace, app, developer }, config)
    expect(result).toEqual({ value: 5, source: 'namespace' })
  })

  it('falls back to app override when namespace has no key', () => {
    const result = resolveLimitKey('pairingPerHour', { namespace, app, developer }, config)
    expect(result).toEqual({ value: 15, source: 'app' })
  })

  it('falls back to developer override when namespace and app have no key', () => {
    const result = resolveLimitKey('pushPerHourPerDevice', { namespace, app, developer }, config)
    expect(result).toEqual({ value: 100, source: 'developer' })
  })

  it('uses namespace row for slot keys before config', () => {
    const result = resolveLimitKey('freeDeviceLimit', { namespace, app, developer }, config)
    expect(result).toEqual({ value: 3, source: 'row' })
  })

  it('uses config default when no overrides or row fallback', () => {
    const result = resolveLimitKey('namespacesPerDay', { namespace, app, developer }, config)
    expect(result).toEqual({ value: 50, source: 'config' })
  })

  it('resolves slot limits from cascade', () => {
    const slots = resolveSlotLimits(
      {
        namespace: {
          ...namespace,
          limit_overrides: { freeDeviceLimit: 7, purchasedSlots: 4 },
        },
        app,
        developer,
      },
      config,
    )

    expect(slots).toEqual({ freeDeviceLimit: 7, purchasedSlots: 4 })
  })

  it('builds rate limit rule with resolved source', () => {
    const rule = resolveRateLimitRule(
      RATE_LIMIT_ACTION.recover,
      { namespace, app, developer },
      config,
    )

    expect(rule.limit).toBe(5)
    expect(rule.source).toBe('namespace')
    expect(rule.windowSeconds).toBe(3600)
  })

  it('resolves all effective limits', () => {
    const effective = resolveEffectiveLimits({ namespace, app, developer }, config)
    expect(effective.recoverPerHour.value).toBe(5)
    expect(effective.pairingPerHour.value).toBe(15)
    expect(effective.pushPerHourPerDevice.value).toBe(100)
    expect(effective.freeDeviceLimit.value).toBe(3)
  })
})
