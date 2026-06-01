import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import type { ServerConfig } from './config/schema.js'
import { loadConfig } from './config/load-config.js'
import { runMigrations } from './db/migrate.js'
import { createPool } from './db/pool.js'
import { buildApp } from './app.js'
import { seedAppsFromConfig } from './services/app-registry-service.js'

const ADMIN_TOKEN = 'test-admin-token-01234567890123456789012'

function adminAuth() {
  return { authorization: `Bearer ${ADMIN_TOKEN}` }
}

function withAppRegistryConfig(base: ServerConfig): ServerConfig {
  return {
    ...base,
    auth: {
      ...base.auth,
      adminApiToken: ADMIN_TOKEN,
    },
    apps: {
      ...base.apps,
      enabled: true,
      allowLocalhostOrigins: true,
      seed: [
        {
          appId: 'esr_app_limit_test',
          name: 'Limit Test Web',
          type: 'web',
          status: 'active',
          origins: ['http://localhost'],
        },
      ],
    },
  }
}

const appHeaders = {
  'x-esr-app-id': 'esr_app_limit_test',
  origin: 'http://localhost',
}

describe('Operator limit overrides (integration)', () => {
  let container: StartedPostgreSqlContainer | undefined
  let app: Awaited<ReturnType<typeof buildApp>> | undefined

  beforeAll(async () => {
    try {
      container = await new PostgreSqlContainer('postgres:16-alpine').start()
    } catch {
      container = undefined
      return
    }

    const env = {
      ESR_DATABASE_URL: container.getConnectionUri(),
      ESR_ADMIN_TOKEN: ADMIN_TOKEN,
      ESR_ON_LIMIT_MODE: 'block',
      ESR_DEFAULT_FREE_DEVICE_LIMIT: '2',
      ESR_PAIRING_PER_HOUR: '100',
    }

    const baseConfig = loadConfig(env)
    const config = withAppRegistryConfig(baseConfig)
    const db = createPool(config)
    await runMigrations(db)
    await seedAppsFromConfig(db, config)
    app = await buildApp({ config, db, env })
    await app.ready()
  }, 120_000)

  afterAll(async () => {
    await app?.close()
    await container?.stop()
  })

  async function createNamespace() {
    const namespaceId = randomUUID()
    const response = await app!.inject({
      method: 'POST',
      url: '/v1/namespaces',
      headers: appHeaders,
      payload: {
        namespaceId,
        namespaceLabel: 'Limit Override Test',
        recoveryKeySalt: 'c2FsdA',
        recoveryKeyHash: 'aGFzaA',
        deviceLabel: 'Host',
        clientDeviceId: randomUUID(),
      },
    })

    expect(response.statusCode).toBe(201)
    return namespaceId
  }

  it.skipIf(!container || !app)('admin GET/PATCH namespace limits round-trip', async () => {
    const namespaceId = await createNamespace()

    const getResponse = await app!.inject({
      method: 'GET',
      url: `/v1/admin/namespaces/${namespaceId}/limits`,
      headers: adminAuth(),
    })

    expect(getResponse.statusCode).toBe(200)
    expect(getResponse.json().effective.recoverPerHour).toBeGreaterThan(0)
    expect(getResponse.json().sources.recoverPerHour).toBe('config')

    const patchResponse = await app!.inject({
      method: 'PATCH',
      url: `/v1/admin/namespaces/${namespaceId}/limits`,
      headers: { ...adminAuth(), 'content-type': 'application/json' },
      payload: { recoverPerHour: 1 },
    })

    expect(patchResponse.statusCode).toBe(200)
    expect(patchResponse.json().effective.recoverPerHour).toBe(1)
    expect(patchResponse.json().sources.recoverPerHour).toBe('namespace')
  })

  it.skipIf(!container || !app)('namespace override lowers pairing rate limit', async () => {
    const namespaceId = await createNamespace()

    await app!.inject({
      method: 'PATCH',
      url: `/v1/admin/namespaces/${namespaceId}/limits`,
      headers: { ...adminAuth(), 'content-type': 'application/json' },
      payload: { pairingPerHour: 1 },
    })

    const pairPayload = {
      pairingCode: '000000',
      deviceLabel: 'Guest',
      clientDeviceId: randomUUID(),
    }

    const first = await app!.inject({
      method: 'POST',
      url: `/v1/namespaces/${namespaceId}/devices`,
      headers: appHeaders,
      payload: pairPayload,
    })

    expect(first.statusCode).toBe(400)

    const second = await app!.inject({
      method: 'POST',
      url: `/v1/namespaces/${namespaceId}/devices`,
      headers: appHeaders,
      payload: pairPayload,
    })

    expect(second.statusCode).toBe(429)
    expect(second.json().error.code).toBe('RATE_LIMIT_EXCEEDED')
    expect(second.json().error.details.effectiveLimitSource).toBe('namespace')
  })

  it.skipIf(!container || !app)('app override enforces namespacesPerDay', async () => {
    await app!.inject({
      method: 'PATCH',
      url: '/v1/admin/apps/esr_app_limit_test/limits',
      headers: { ...adminAuth(), 'content-type': 'application/json' },
      payload: { namespacesPerDay: 1 },
    })

    const first = await app!.inject({
      method: 'POST',
      url: '/v1/namespaces',
      headers: appHeaders,
      payload: {
        namespaceId: randomUUID(),
        namespaceLabel: 'First',
        recoveryKeySalt: 'c2FsdA',
        recoveryKeyHash: 'aGFzaA',
        deviceLabel: 'Host',
        clientDeviceId: randomUUID(),
      },
    })

    expect(first.statusCode).toBe(201)

    const second = await app!.inject({
      method: 'POST',
      url: '/v1/namespaces',
      headers: appHeaders,
      payload: {
        namespaceId: randomUUID(),
        namespaceLabel: 'Second',
        recoveryKeySalt: 'c2FsdA',
        recoveryKeyHash: 'aGFzaA',
        deviceLabel: 'Host',
        clientDeviceId: randomUUID(),
      },
    })

    expect(second.statusCode).toBe(429)
    expect(second.json().error.details.effectiveLimitSource).toBe('app')
  })

  it.skipIf(!container || !app)('app slot override affects effective limits', async () => {
    const namespaceId = await createNamespace()

    await app!.inject({
      method: 'PATCH',
      url: '/v1/admin/apps/esr_app_limit_test/limits',
      headers: { ...adminAuth(), 'content-type': 'application/json' },
      payload: { freeDeviceLimit: 9 },
    })

    const limitsResponse = await app!.inject({
      method: 'GET',
      url: `/v1/admin/namespaces/${namespaceId}/limits`,
      headers: adminAuth(),
    })

    expect(limitsResponse.statusCode).toBe(200)
    expect(limitsResponse.json().effective.freeDeviceLimit).toBe(9)
    expect(limitsResponse.json().sources.freeDeviceLimit).toBe('app')
  })

  it.skipIf(!container || !app)('operator global override applies when no entity override', async () => {
    const namespaceId = await createNamespace()

    await app!.inject({
      method: 'PATCH',
      url: '/v1/admin/settings/limits',
      headers: { ...adminAuth(), 'content-type': 'application/json' },
      payload: { recoverPerHour: 2 },
    })

    const limitsResponse = await app!.inject({
      method: 'GET',
      url: `/v1/admin/namespaces/${namespaceId}/limits`,
      headers: adminAuth(),
    })

    expect(limitsResponse.statusCode).toBe(200)
    expect(limitsResponse.json().effective.recoverPerHour).toBe(2)
    expect(limitsResponse.json().sources.recoverPerHour).toBe('operator')
  })

  it.skipIf(!container || !app)('app override wins over operator global override', async () => {
    await app!.inject({
      method: 'PATCH',
      url: '/v1/admin/settings/limits',
      headers: { ...adminAuth(), 'content-type': 'application/json' },
      payload: { namespacesPerDay: 2 },
    })

    await app!.inject({
      method: 'PATCH',
      url: '/v1/admin/apps/esr_app_limit_test/limits',
      headers: { ...adminAuth(), 'content-type': 'application/json' },
      payload: { namespacesPerDay: 5 },
    })

    const limitsResponse = await app!.inject({
      method: 'GET',
      url: '/v1/admin/apps/esr_app_limit_test/limits',
      headers: adminAuth(),
    })

    expect(limitsResponse.statusCode).toBe(200)
    expect(limitsResponse.json().effective.namespacesPerDay).toBe(5)
    expect(limitsResponse.json().sources.namespacesPerDay).toBe('app')
  })
})
