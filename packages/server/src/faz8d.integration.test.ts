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
      requireRegistration: true,
      allowLocalhostOrigins: true,
      seed: [],
      developerPortal: {
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

function developerAuth(token: string) {
  return { authorization: `Bearer ${token}` }
}

describe('Faz 8d — developer portal (integration)', () => {
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

  it.skipIf(!container || !app)('self_service flow: register, app, verify origin, namespace', async () => {
    const email = `dev-${randomUUID()}@example.com`
    const password = 'secure-password-12'

    const registerResponse = await app!.inject({
      method: 'POST',
      url: '/v1/developer/register',
      payload: { email, password },
    })

    expect(registerResponse.statusCode).toBe(201)
    const registerBody = registerResponse.json()
    expect(registerBody.token).toBeTruthy()
    const devToken = registerBody.token as string

    const meResponse = await app!.inject({
      method: 'GET',
      url: '/v1/developer/me',
      headers: developerAuth(devToken),
    })

    expect(meResponse.statusCode).toBe(200)
    expect(meResponse.json().email).toBe(email)

    const createAppResponse = await app!.inject({
      method: 'POST',
      url: '/v1/developer/apps',
      headers: developerAuth(devToken),
      payload: {
        name: 'Self Service Web App',
        type: 'web',
      },
    })

    expect(createAppResponse.statusCode).toBe(201)
    const createdApp = createAppResponse.json()
    const appId = createdApp.appId as string
    expect(appId).toMatch(/^esr_app_/)
    expect(createdApp.status).toBe('pending')

    const origin = 'http://localhost:5173'
    const addOriginResponse = await app!.inject({
      method: 'POST',
      url: `/v1/developer/apps/${appId}/origins`,
      headers: developerAuth(devToken),
      payload: { origin },
    })

    expect(addOriginResponse.statusCode).toBe(201)
    expect(addOriginResponse.json().status).toBe('pending_verification')
    const originRow = addOriginResponse.json().origins[0]

    const verifyResponse = await app!.inject({
      method: 'POST',
      url: `/v1/developer/apps/${appId}/origins/${originRow.id}/verify`,
      headers: developerAuth(devToken),
    })

    expect(verifyResponse.statusCode).toBe(200)
    expect(verifyResponse.json().app.status).toBe('active')

    const activeListResponse = await app!.inject({
      method: 'GET',
      url: '/v1/developer/apps?status=active',
      headers: developerAuth(devToken),
    })

    expect(activeListResponse.statusCode).toBe(200)
    expect(
      activeListResponse.json().items.some((item: { appId: string }) => item.appId === appId),
    ).toBe(true)

    const pendingListResponse = await app!.inject({
      method: 'GET',
      url: '/v1/developer/apps?status=pending',
      headers: developerAuth(devToken),
    })

    expect(pendingListResponse.statusCode).toBe(200)
    expect(
      pendingListResponse.json().items.some((item: { appId: string }) => item.appId === appId),
    ).toBe(false)

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
        namespaceLabel: 'Developer Portal Workspace',
        recoveryKeySalt: 'c2FsdA',
        recoveryKeyHash: 'aGFzaA',
        deviceLabel: 'Host',
        clientDeviceId: randomUUID(),
      },
    })

    expect(createNs.statusCode).toBe(201)
    expect(createNs.json().appId).toBe(appId)
  })

  it.skipIf(!container || !app)('rejects cross-developer app access', async () => {
    const password = 'secure-password-12'

    const firstRegister = await app!.inject({
      method: 'POST',
      url: '/v1/developer/register',
      payload: { email: `dev-a-${randomUUID()}@example.com`, password },
    })

    const secondRegister = await app!.inject({
      method: 'POST',
      url: '/v1/developer/register',
      payload: { email: `dev-b-${randomUUID()}@example.com`, password },
    })

    const firstToken = firstRegister.json().token as string
    const secondToken = secondRegister.json().token as string

    const createAppResponse = await app!.inject({
      method: 'POST',
      url: '/v1/developer/apps',
      headers: developerAuth(firstToken),
      payload: { name: 'Owned App', type: 'web' },
    })

    const appId = createAppResponse.json().appId as string

    const forbiddenResponse = await app!.inject({
      method: 'GET',
      url: `/v1/developer/apps/${appId}`,
      headers: developerAuth(secondToken),
    })

    expect(forbiddenResponse.statusCode).toBe(403)
    expect(forbiddenResponse.json().error.code).toBe('DEVELOPER_FORBIDDEN')
  })

  it.skipIf(!container || !app)('invalidates JWT after logout', async () => {
    const registerResponse = await app!.inject({
      method: 'POST',
      url: '/v1/developer/register',
      payload: {
        email: `dev-logout-${randomUUID()}@example.com`,
        password: 'secure-password-12',
      },
    })

    const token = registerResponse.json().token as string

    const logoutResponse = await app!.inject({
      method: 'POST',
      url: '/v1/developer/logout',
      headers: developerAuth(token),
    })

    expect(logoutResponse.statusCode).toBe(200)

    const meResponse = await app!.inject({
      method: 'GET',
      url: '/v1/developer/me',
      headers: developerAuth(token),
    })

    expect(meResponse.statusCode).toBe(401)
  })

  it.skipIf(!container || !app)('changes password with current password verification', async () => {
    const email = `dev-password-${randomUUID()}@example.com`
    const currentPassword = 'secure-password-12'
    const nextPassword = 'another-secure-password-9'

    const registerResponse = await app!.inject({
      method: 'POST',
      url: '/v1/developer/register',
      payload: { email, password: currentPassword },
    })

    const token = registerResponse.json().token as string

    const wrongPasswordResponse = await app!.inject({
      method: 'PATCH',
      url: '/v1/developer/password',
      headers: developerAuth(token),
      payload: {
        currentPassword: 'wrong-password-value',
        newPassword: nextPassword,
      },
    })

    expect(wrongPasswordResponse.statusCode).toBe(401)
    expect(wrongPasswordResponse.json().error.code).toBe('DEVELOPER_INVALID_CREDENTIALS')

    const changePasswordResponse = await app!.inject({
      method: 'PATCH',
      url: '/v1/developer/password',
      headers: developerAuth(token),
      payload: {
        currentPassword,
        newPassword: nextPassword,
      },
    })

    expect(changePasswordResponse.statusCode).toBe(200)
    expect(changePasswordResponse.json()).toEqual({ ok: true })

    const oldLoginResponse = await app!.inject({
      method: 'POST',
      url: '/v1/developer/login',
      payload: { email, password: currentPassword },
    })

    expect(oldLoginResponse.statusCode).toBe(401)

    const newLoginResponse = await app!.inject({
      method: 'POST',
      url: '/v1/developer/login',
      payload: { email, password: nextPassword },
    })

    expect(newLoginResponse.statusCode).toBe(200)
    expect(newLoginResponse.json().token).toBeTruthy()
  })

  it.skipIf(!container || !app)('returns DEVELOPER_PORTAL_DISABLED in operator_managed mode', async () => {
    const baseConfig = loadConfig({
      ESR_DATABASE_URL: container!.getConnectionUri(),
      ESR_ADMIN_TOKEN: ADMIN_TOKEN,
    })

    const operatorConfig: ServerConfig = {
      ...withSelfServiceConfig(baseConfig),
      apps: {
        ...withSelfServiceConfig(baseConfig).apps,
        registrationMode: 'operator_managed',
      },
    }

    const db = createPool(operatorConfig)
    const operatorApp = await buildApp({ config: operatorConfig, db })
    await operatorApp.ready()

    const response = await operatorApp.inject({
      method: 'POST',
      url: '/v1/developer/register',
      payload: {
        email: `blocked-${randomUUID()}@example.com`,
        password: 'secure-password-12',
      },
    })

    expect(response.statusCode).toBe(503)
    expect(response.json().error.code).toBe('DEVELOPER_PORTAL_DISABLED')

    await operatorApp.close()
  })
})
