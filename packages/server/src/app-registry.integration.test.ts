import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import type { ServerConfig } from './config/schema.js'
import { loadConfig } from './config/load-config.js'
import { runMigrations } from './db/migrate.js'
import { createPool } from './db/pool.js'
import { buildApp } from './app.js'
import { seedAppsFromConfig } from './services/app-registry-service.js'

function withAppRegistryConfig(base: ServerConfig): ServerConfig {
  return {
    ...base,
    apps: {
      ...base.apps,
      enabled: true,
      requireRegistration: true,
      allowLocalhostOrigins: true,
      seed: [
        {
          appId: 'esr_app_testweb',
          name: 'Integration Test Web',
          type: 'web',
          status: 'active',
          origins: ['http://localhost'],
        },
        {
          appId: 'esr_app_other',
          name: 'Other App',
          type: 'web',
          status: 'active',
          origins: ['http://other.test'],
        },
      ],
    },
  }
}

const appHeaders = {
  'x-esr-app-id': 'esr_app_testweb',
  origin: 'http://localhost',
}

describe('Faz 8a — app registry (integration)', () => {
  let container: StartedPostgreSqlContainer | undefined
  let app: Awaited<ReturnType<typeof buildApp>> | undefined

  beforeAll(async () => {
    try {
      container = await new PostgreSqlContainer('postgres:16-alpine').start()
    } catch {
      container = undefined
      return
    }

    const baseConfig = loadConfig({
      ESR_DATABASE_URL: container.getConnectionUri(),
      ESR_ON_LIMIT_MODE: 'block',
      ESR_DEFAULT_FREE_DEVICE_LIMIT: '2',
    })

    const config = withAppRegistryConfig(baseConfig)
    const db = createPool(config)
    await runMigrations(db)
    await seedAppsFromConfig(db, config)
    app = await buildApp({ config, db })
    await app.ready()
  }, 120_000)

  afterAll(async () => {
    await app?.close()
    await container?.stop()
  })

  it.skipIf(!container || !app)('rejects namespace create without app headers', async () => {
    const response = await app!.inject({
      method: 'POST',
      url: '/v1/namespaces',
      payload: {
        namespaceId: randomUUID(),
        namespaceLabel: 'No App',
        recoveryKeySalt: 'c2FsdA',
        recoveryKeyHash: 'aGFzaA',
        deviceLabel: 'Host',
        clientDeviceId: randomUUID(),
      },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('APP_ID_REQUIRED')
  })

  it.skipIf(!container || !app)('rejects wrong origin for registered app', async () => {
    const response = await app!.inject({
      method: 'POST',
      url: '/v1/namespaces',
      headers: {
        'x-esr-app-id': 'esr_app_testweb',
        origin: 'https://evil.example.com',
      },
      payload: {
        namespaceId: randomUUID(),
        namespaceLabel: 'Wrong Origin',
        recoveryKeySalt: 'c2FsdA',
        recoveryKeyHash: 'aGFzaA',
        deviceLabel: 'Host',
        clientDeviceId: randomUUID(),
      },
    })

    expect(response.statusCode).toBe(403)
    expect(response.json().error.code).toBe('APP_ORIGIN_NOT_ALLOWED')
  })

  it.skipIf(!container || !app)('creates namespace bound to app and blocks cross-app access', async () => {
    const namespaceId = randomUUID()
    const clientDeviceId = randomUUID()

    const createResponse = await app!.inject({
      method: 'POST',
      url: '/v1/namespaces',
      headers: appHeaders,
      payload: {
        namespaceId,
        namespaceLabel: 'App Bound Workspace',
        recoveryKeySalt: 'c2FsdA',
        recoveryKeyHash: 'aGFzaA',
        deviceLabel: 'Host Laptop',
        clientDeviceId,
      },
    })

    expect(createResponse.statusCode).toBe(201)
    const created = createResponse.json()
    expect(created.namespaceId).toBe(namespaceId)
    expect(created.appId).toBe('esr_app_testweb')

    const crossAppResponse = await app!.inject({
      method: 'GET',
      url: `/v1/namespaces/${namespaceId}`,
      headers: {
        authorization: `Bearer ${created.deviceToken}`,
        'x-esr-app-id': 'esr_app_other',
        origin: 'http://other.test',
      },
    })

    expect(crossAppResponse.statusCode).toBe(403)
    expect(crossAppResponse.json().error.code).toBe('APP_NAMESPACE_MISMATCH')

    const sameAppResponse = await app!.inject({
      method: 'GET',
      url: `/v1/namespaces/${namespaceId}`,
      headers: {
        authorization: `Bearer ${created.deviceToken}`,
        ...appHeaders,
      },
    })

    expect(sameAppResponse.statusCode).toBe(200)
  })
})
