import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import type { ServerConfig } from './config/schema.js'
import { loadConfig } from './config/load-config.js'
import { runMigrations } from './db/migrate.js'
import { createPool } from './db/pool.js'
import { buildApp } from './app.js'

const ADMIN_TOKEN = 'test-admin-token-01234567890123456789012'

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
      requireRegistration: true,
      allowLocalhostOrigins: true,
      seed: [],
    },
  }
}

describe('Faz 8b — admin app registry API (integration)', () => {
  let container: StartedPostgreSqlContainer | undefined
  let app: Awaited<ReturnType<typeof buildApp>> | undefined

  const adminAuth = { authorization: `Bearer ${ADMIN_TOKEN}` }

  beforeAll(async () => {
    try {
      container = await new PostgreSqlContainer('postgres:16-alpine').start()
    } catch {
      container = undefined
      return
    }

    const baseConfig = loadConfig({
      ESR_DATABASE_URL: container.getConnectionUri(),
      ESR_ADMIN_TOKEN: ADMIN_TOKEN,
    })

    const config = withAppRegistryConfig(baseConfig)
    const db = createPool(config)
    await runMigrations(db)
    app = await buildApp({ config, db })
    await app.ready()
  }, 120_000)

  afterAll(async () => {
    await app?.close()
    await container?.stop()
  })

  it.skipIf(!container || !app)('admin CRUD: create, list, suspend, restore, archive', async () => {
    const appId = 'esr_app_admintest'
    const origin = 'http://localhost:5173'

    const createResponse = await app!.inject({
      method: 'POST',
      url: '/v1/admin/apps',
      headers: adminAuth,
      payload: {
        appId,
        name: 'Admin Test App',
        type: 'web',
        status: 'active',
        origins: [origin],
      },
    })

    expect(createResponse.statusCode).toBe(201)
    const created = createResponse.json()
    expect(created.appId).toBe(appId)
    expect(created.origins).toHaveLength(1)
    expect(created.origins[0].origin).toBe(origin)

    const listResponse = await app!.inject({
      method: 'GET',
      url: '/v1/admin/apps?q=admintest',
      headers: adminAuth,
    })

    expect(listResponse.statusCode).toBe(200)
    const list = listResponse.json()
    expect(list.total).toBeGreaterThanOrEqual(1)
    expect(list.items.some((item: { appId: string }) => item.appId === appId)).toBe(true)

    const detailResponse = await app!.inject({
      method: 'GET',
      url: `/v1/admin/apps/${appId}`,
      headers: adminAuth,
    })

    expect(detailResponse.statusCode).toBe(200)

    const namespaceId = randomUUID()
    const createNs = await app!.inject({
      method: 'POST',
      url: '/v1/namespaces',
      headers: {
        ...adminAuth,
        'x-esr-app-id': appId,
        origin,
      },
      payload: {
        namespaceId,
        namespaceLabel: 'Admin App Workspace',
        recoveryKeySalt: 'c2FsdA',
        recoveryKeyHash: 'aGFzaA',
        deviceLabel: 'Host',
        clientDeviceId: randomUUID(),
      },
    })

    expect(createNs.statusCode).toBe(201)
    expect(createNs.json().appId).toBe(appId)

    const suspendResponse = await app!.inject({
      method: 'PATCH',
      url: `/v1/admin/apps/${appId}`,
      headers: adminAuth,
      payload: { status: 'suspended' },
    })

    expect(suspendResponse.statusCode).toBe(200)
    expect(suspendResponse.json().status).toBe('suspended')

    const blockedResponse = await app!.inject({
      method: 'POST',
      url: '/v1/namespaces',
      headers: {
        'x-esr-app-id': appId,
        origin,
      },
      payload: {
        namespaceId: randomUUID(),
        namespaceLabel: 'Blocked',
        recoveryKeySalt: 'c2FsdA',
        recoveryKeyHash: 'aGFzaA',
        deviceLabel: 'Host',
        clientDeviceId: randomUUID(),
      },
    })

    expect(blockedResponse.statusCode).toBe(403)
    expect(blockedResponse.json().error.code).toBe('APP_SUSPENDED')

    const restoreResponse = await app!.inject({
      method: 'PATCH',
      url: `/v1/admin/apps/${appId}`,
      headers: adminAuth,
      payload: { status: 'active' },
    })

    expect(restoreResponse.statusCode).toBe(200)

    const addOriginResponse = await app!.inject({
      method: 'POST',
      url: `/v1/admin/apps/${appId}/origins`,
      headers: adminAuth,
      payload: { origin: 'http://127.0.0.1:3000' },
    })

    expect(addOriginResponse.statusCode).toBe(201)
    expect(addOriginResponse.json().origins).toHaveLength(2)

    const archiveResponse = await app!.inject({
      method: 'DELETE',
      url: `/v1/admin/apps/${appId}`,
      headers: adminAuth,
    })

    expect(archiveResponse.statusCode).toBe(200)
    expect(archiveResponse.json().status).toBe('archived')

    const blockedAddOriginResponse = await app!.inject({
      method: 'POST',
      url: `/v1/admin/apps/${appId}/origins`,
      headers: adminAuth,
      payload: { origin: 'https://blocked.example.com' },
    })

    expect(blockedAddOriginResponse.statusCode).toBe(403)
    expect(blockedAddOriginResponse.json().error.code).toBe('APP_ARCHIVED')
  })

  it.skipIf(!container || !app)('rejects admin app routes without token', async () => {
    const response = await app!.inject({
      method: 'GET',
      url: '/v1/admin/apps',
    })

    expect(response.statusCode).toBe(401)
  })

  it.skipIf(!container || !app)('creates native app with bundle approve flow', async () => {
    const appId = 'esr_app_nativeadm'

    const createResponse = await app!.inject({
      method: 'POST',
      url: '/v1/admin/apps',
      headers: adminAuth,
      payload: {
        appId,
        name: 'Native Admin Test',
        type: 'native',
        status: 'pending_verification',
      },
    })

    expect(createResponse.statusCode).toBe(201)

    const addBundleResponse = await app!.inject({
      method: 'POST',
      url: `/v1/admin/apps/${appId}/bundles`,
      headers: adminAuth,
      payload: {
        platform: 'ios',
        bundleId: 'com.example.admintest',
        verified: false,
      },
    })

    expect(addBundleResponse.statusCode).toBe(201)
    const bundleId = addBundleResponse.json().bundles[0].id

    const approveResponse = await app!.inject({
      method: 'POST',
      url: `/v1/admin/apps/${appId}/bundles/${bundleId}/approve`,
      headers: adminAuth,
    })

    expect(approveResponse.statusCode).toBe(200)
    expect(approveResponse.json().bundles[0].verifiedAt).toBeTruthy()

    const searchResponse = await app!.inject({
      method: 'GET',
      url: '/v1/admin/apps?q=com.example.admintest',
      headers: adminAuth,
    })

    expect(searchResponse.statusCode).toBe(200)
    const searchList = searchResponse.json()
    expect(searchList.items.some((item: { appId: string }) => item.appId === appId)).toBe(true)
  })
})
