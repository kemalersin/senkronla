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

function adminAuth() {
  return { authorization: `Bearer ${ADMIN_TOKEN}` }
}

function withSelfServiceConfig(base: ServerConfig): ServerConfig {
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
      limits: {
        ...base.apps.limits,
        perDeveloper: {
          maxApps: 3,
        },
      },
      native: {
        requireClientSecret: false,
        requireManualReview: false,
      },
    },
  }
}

describe('Admin developers (integration)', () => {
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
      ESR_ADMIN_TOKEN: ADMIN_TOKEN,
      ESR_DEVELOPER_JWT_SECRET: DEV_JWT_SECRET,
    })

    const config = withSelfServiceConfig(baseConfig)
    const db = createPool(config)
    await runMigrations(db)
    app = await buildApp({ config, db })
    await app.ready()
  }, 120_000)

  afterAll(async () => {
    await app?.close()
    await container?.stop()
  })

  it.skipIf(!container || !app)('operator lists, verifies, disables, and re-enables developers', async () => {
    const email = `admin-dev-${randomUUID()}@example.com`
    const password = 'secure-password-12'

    const registerResponse = await app!.inject({
      method: 'POST',
      url: '/v1/developer/register',
      payload: { email, password },
    })

    expect(registerResponse.statusCode).toBe(201)
    const devToken = registerResponse.json().token as string

    const listResponse = await app!.inject({
      method: 'GET',
      url: `/v1/admin/developers?q=${encodeURIComponent(email)}`,
      headers: adminAuth(),
    })

    expect(listResponse.statusCode).toBe(200)
    const listBody = listResponse.json()
    expect(listBody.total).toBeGreaterThanOrEqual(1)
    const developerId = listBody.items[0].id as string
    expect(listBody.items[0].email).toBe(email)

    const unverifyResponse = await app!.inject({
      method: 'PATCH',
      url: `/v1/admin/developers/${developerId}`,
      headers: adminAuth(),
      payload: { emailVerified: false },
    })

    expect(unverifyResponse.statusCode).toBe(200)
    expect(unverifyResponse.json().emailVerified).toBe(false)

    const verifyResponse = await app!.inject({
      method: 'PATCH',
      url: `/v1/admin/developers/${developerId}`,
      headers: adminAuth(),
      payload: { emailVerified: true },
    })

    expect(verifyResponse.statusCode).toBe(200)
    expect(verifyResponse.json().emailVerified).toBe(true)

    const disableResponse = await app!.inject({
      method: 'PATCH',
      url: `/v1/admin/developers/${developerId}`,
      headers: adminAuth(),
      payload: { disabled: true },
    })

    expect(disableResponse.statusCode).toBe(200)
    expect(disableResponse.json().disabled).toBe(true)

    const meWhileDisabled = await app!.inject({
      method: 'GET',
      url: '/v1/developer/me',
      headers: { authorization: `Bearer ${devToken}` },
    })

    expect(meWhileDisabled.statusCode).toBe(403)
    expect(meWhileDisabled.json().error.code).toBe('DEVELOPER_ACCOUNT_DISABLED')

    const loginWhileDisabled = await app!.inject({
      method: 'POST',
      url: '/v1/developer/login',
      payload: { email, password },
    })

    expect(loginWhileDisabled.statusCode).toBe(403)
    expect(loginWhileDisabled.json().error.code).toBe('DEVELOPER_ACCOUNT_DISABLED')

    const enableResponse = await app!.inject({
      method: 'PATCH',
      url: `/v1/admin/developers/${developerId}`,
      headers: adminAuth(),
      payload: { disabled: false },
    })

    expect(enableResponse.statusCode).toBe(200)
    expect(enableResponse.json().disabled).toBe(false)

    const loginAfterEnable = await app!.inject({
      method: 'POST',
      url: '/v1/developer/login',
      payload: { email, password },
    })

    expect(loginAfterEnable.statusCode).toBe(200)
    expect(loginAfterEnable.json().token).toBeTruthy()
  })
})
