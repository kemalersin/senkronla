import { randomUUID } from 'node:crypto'
import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import type { ServerConfig } from './config/schema.js'
import { loadConfig } from './config/load-config.js'
import { runMigrations } from './db/migrate.js'
import { createPool } from './db/pool.js'
import { buildApp } from './app.js'
import { seedAppsFromConfig } from './services/app-registry-service.js'

function hashClientSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex')
}

function withAppRegistryConfig(base: ServerConfig): ServerConfig {
  const clientSecret = 'native-integration-secret-value'
  return {
    ...base,
    apps: {
      ...base.apps,
      enabled: true,
      allowLocalhostOrigins: true,
      seed: [
        {
          appId: 'esr_app_hostweb',
          name: 'Host Web App',
          type: 'web',
          status: 'active',
          origins: ['http://localhost'],
        },
        {
          appId: 'esr_app_guestweb',
          name: 'Guest Web App',
          type: 'web',
          status: 'active',
          origins: ['http://127.0.0.1:3000'],
        },
        {
          appId: 'esr_app_blocked',
          name: 'Blocked Guest App',
          type: 'web',
          status: 'active',
          origins: ['http://blocked.test'],
        },
        {
          appId: 'esr_app_nativeguest',
          name: 'Native Guest App',
          type: 'native',
          status: 'active',
          origins: [],
          bundleIds: { ios: 'com.example.nativeguest' },
          clientSecretHash: hashClientSecret(clientSecret),
        },
      ],
      native: {
        requireClientSecret: true,
        requireManualReview: false,
      },
    },
  }
}

const nativeSecret = 'native-integration-secret-value'

describe('Faz 8e — native + pairing scope (integration)', () => {
  let container: StartedPostgreSqlContainer | undefined
  let app: Awaited<ReturnType<typeof buildApp>> | undefined

  const hostHeaders = {
    'x-esr-app-id': 'esr_app_hostweb',
    origin: 'http://localhost',
  }

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

  async function createHostNamespace() {
    const namespaceId = randomUUID()
    const createResponse = await app!.inject({
      method: 'POST',
      url: '/v1/namespaces',
      headers: hostHeaders,
      payload: {
        namespaceId,
        namespaceLabel: 'Pairing Scope Test',
        recoveryKeySalt: 'c2FsdA',
        recoveryKeyHash: 'aGFzaA',
        deviceLabel: 'Host',
        clientDeviceId: randomUUID(),
      },
    })

    expect(createResponse.statusCode).toBe(201)
    return {
      namespaceId,
      hostToken: createResponse.json().deviceToken as string,
    }
  }

  it.skipIf(!container || !app)('allowedAppIds blocks guest app on pairing redeem', async () => {
    const { namespaceId, hostToken } = await createHostNamespace()

    const pairingResponse = await app!.inject({
      method: 'POST',
      url: `/v1/namespaces/${namespaceId}/pairing-tokens`,
      headers: {
        ...hostHeaders,
        authorization: `Bearer ${hostToken}`,
      },
      payload: {
        allowedAppIds: ['esr_app_guestweb'],
      },
    })

    expect(pairingResponse.statusCode).toBe(201)
    expect(pairingResponse.json().allowedAppIds).toEqual(['esr_app_guestweb'])

    const blockedResponse = await app!.inject({
      method: 'POST',
      url: `/v1/namespaces/${namespaceId}/devices`,
      headers: {
        'x-esr-app-id': 'esr_app_blocked',
        origin: 'http://blocked.test',
      },
      payload: {
        pairingCode: pairingResponse.json().code,
        deviceLabel: 'Blocked Guest',
        clientDeviceId: randomUUID(),
      },
    })

    expect(blockedResponse.statusCode).toBe(403)
    expect(blockedResponse.json().error.code).toBe('APP_PAIRING_NOT_ALLOWED')

    const allowedResponse = await app!.inject({
      method: 'POST',
      url: `/v1/namespaces/${namespaceId}/devices`,
      headers: {
        'x-esr-app-id': 'esr_app_guestweb',
        origin: 'http://127.0.0.1:3000',
      },
      payload: {
        pairingCode: pairingResponse.json().code,
        deviceLabel: 'Allowed Guest',
        clientDeviceId: randomUUID(),
      },
    })

    expect(allowedResponse.statusCode).toBe(201)
    expect(allowedResponse.json().deviceToken).toBeTruthy()
  })

  it.skipIf(!container || !app)('native app with client secret can pair when allowed', async () => {
    const { namespaceId, hostToken } = await createHostNamespace()

    const pairingResponse = await app!.inject({
      method: 'POST',
      url: `/v1/namespaces/${namespaceId}/pairing-tokens`,
      headers: {
        ...hostHeaders,
        authorization: `Bearer ${hostToken}`,
      },
      payload: {
        allowedAppIds: ['esr_app_nativeguest'],
      },
    })

    expect(pairingResponse.statusCode).toBe(201)

    const withoutSecret = await app!.inject({
      method: 'POST',
      url: `/v1/namespaces/${namespaceId}/devices`,
      headers: {
        'x-esr-app-id': 'esr_app_nativeguest',
        'x-esr-platform': 'ios',
        'x-esr-bundle-id': 'com.example.nativeguest',
      },
      payload: {
        pairingCode: pairingResponse.json().code,
        deviceLabel: 'Native Guest',
        clientDeviceId: randomUUID(),
      },
    })

    expect(withoutSecret.statusCode).toBe(401)
    expect(withoutSecret.json().error.code).toBe('APP_CLIENT_SECRET_INVALID')

    const withSecret = await app!.inject({
      method: 'POST',
      url: `/v1/namespaces/${namespaceId}/devices`,
      headers: {
        'x-esr-app-id': 'esr_app_nativeguest',
        'x-esr-platform': 'ios',
        'x-esr-bundle-id': 'com.example.nativeguest',
        'x-esr-client-secret': nativeSecret,
      },
      payload: {
        pairingCode: pairingResponse.json().code,
        deviceLabel: 'Native Guest',
        clientDeviceId: randomUUID(),
      },
    })

    expect(withSecret.statusCode).toBe(201)
  })
})
