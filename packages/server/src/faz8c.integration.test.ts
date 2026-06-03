import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import type { ServerConfig } from './config/schema.js'
import { loadConfig } from './config/load-config.js'
import { runMigrations } from './db/migrate.js'
import { createPool } from './db/pool.js'
import { buildApp } from './app.js'

const ADMIN_TOKEN = 'test-admin-token-01234567890123456789012'
const DEV_JWT_SECRET = 'test-developer-jwt-secret-012345678901234567890'

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
      registrationMode: 'self_service',
      allowLocalhostOrigins: true,
      seed: [],
      developerPortal: {
        ...base.apps.developerPortal,
        enabled: true,
        jwtSecret: DEV_JWT_SECRET,
        sessionTtlHours: 24,
        requireEmailVerification: false,
        emailVerifyTtlSeconds: 86_400,
        passwordResetTtlSeconds: 3600,
      },
    },
  }
}

describe('Faz 8c — origin verification (integration)', () => {
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
      ESR_DEVELOPER_JWT_SECRET: DEV_JWT_SECRET,
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

  it.skipIf(!container || !app)(
    'localhost origin auto-verifies when allowLocalhostOrigins is enabled',
    async () => {
      const appId = 'esr_app_verifytest'
      const origin = 'http://localhost:4321'

      const createResponse = await app!.inject({
        method: 'POST',
        url: '/v1/admin/apps',
        headers: adminAuth,
        payload: {
          appId,
          name: 'Verify Test App',
          type: 'web',
          status: 'pending_verification',
        },
      })

      expect(createResponse.statusCode).toBe(201)

      const addOriginResponse = await app!.inject({
        method: 'POST',
        url: `/v1/admin/apps/${appId}/origins`,
        headers: adminAuth,
        payload: { origin, verified: false },
      })

      expect(addOriginResponse.statusCode).toBe(201)
      const added = addOriginResponse.json()
      const originRow = added.origins.find((row: { origin: string }) => row.origin === origin)

      expect(originRow).toBeTruthy()
      expect(originRow.verifiedAt).toBeTruthy()
      expect(originRow.verification).toBeNull()
      expect(added.status).toBe('active')
    },
  )

  it.skipIf(!container || !app)('verification failure returns APP_ORIGIN_VERIFICATION_FAILED', async () => {
    const origin = 'https://example.com'

    const registerResponse = await app!.inject({
      method: 'POST',
      url: '/v1/developer/register',
      payload: {
        email: `dev-${randomUUID()}@example.com`,
        password: 'secure-password-12',
      },
    })

    expect(registerResponse.statusCode).toBe(201)
    const devToken = registerResponse.json().token as string

    const createAppResponse = await app!.inject({
      method: 'POST',
      url: '/v1/developer/apps',
      headers: { authorization: `Bearer ${devToken}` },
      payload: {
        name: 'Verify Fail App',
        type: 'web',
      },
    })

    expect(createAppResponse.statusCode).toBe(201)
    const appId = createAppResponse.json().appId as string

    const addOriginResponse = await app!.inject({
      method: 'POST',
      url: `/v1/developer/apps/${appId}/origins`,
      headers: { authorization: `Bearer ${devToken}` },
      payload: { origin },
    })

    expect(addOriginResponse.statusCode).toBe(201)
    const originRow = addOriginResponse.json().origins[0]

    const verifyResponse = await app!.inject({
      method: 'POST',
      url: `/v1/developer/apps/${appId}/origins/${originRow.id}/verify`,
      headers: { authorization: `Bearer ${devToken}` },
    })

    expect(verifyResponse.statusCode).toBe(422)
    expect(verifyResponse.json().error.code).toBe('APP_ORIGIN_VERIFICATION_FAILED')
    expect(verifyResponse.json().error.details.instructions.dnsHost).toBe('_esr-verify.example.com')
  })

  it.skipIf(!container || !app)('verified origin allows namespace creation', async () => {
    const appId = 'esr_app_verifyns'
    const origin = 'http://127.0.0.1:3000'

    await app!.inject({
      method: 'POST',
      url: '/v1/admin/apps',
      headers: adminAuth,
      payload: {
        appId,
        name: 'Verify NS App',
        type: 'web',
        status: 'active',
        origins: [origin],
      },
    })

    const namespaceId = randomUUID()
    const createNs = await app!.inject({
      method: 'POST',
      url: '/v1/namespaces',
      headers: {
        'x-esr-app-id': appId,
        origin,
      },
      payload: {
        namespaceId,
        namespaceLabel: 'Verified Origin Workspace',
        recoveryKeySalt: 'c2FsdA',
        recoveryKeyHash: 'aGFzaA',
        deviceLabel: 'Host',
        clientDeviceId: randomUUID(),
      },
    })

    expect(createNs.statusCode).toBe(201)
    expect(createNs.json().appId).toBe(appId)
  })
})
