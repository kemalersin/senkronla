import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { buildApp } from './app.js'
import { loadConfig } from './config/load-config.js'
import { runMigrations } from './db/migrate.js'
import { createPool } from './db/pool.js'

describe('Faz 2 — namespace and pairing (integration)', () => {
  let container: StartedPostgreSqlContainer | undefined
  let app: Awaited<ReturnType<typeof buildApp>> | undefined
  let db: ReturnType<typeof createPool> | undefined

  beforeAll(async () => {
    try {
      container = await new PostgreSqlContainer('postgres:16-alpine').start()
    } catch {
      container = undefined
      return
    }

    const config = loadConfig({
      ESR_DATABASE_URL: container.getConnectionUri(),
      ESR_ON_LIMIT_MODE: 'block',
      ESR_DEFAULT_FREE_DEVICE_LIMIT: '2',
    })

    db = createPool(config)
    await runMigrations(db)
    app = await buildApp({ config, db })
    await app.ready()
  }, 120_000)

  afterAll(async () => {
    await app?.close()
    await container?.stop()
  })

  it.skipIf(!container || !app)('create → pair → list → revoke flow', async () => {
    const namespaceId = randomUUID()
    const hostClientDeviceId = randomUUID()

    const createResponse = await app!.inject({
      method: 'POST',
      url: '/v1/namespaces',
      payload: {
        namespaceId,
        namespaceLabel: 'Test Workspace',
        recoveryKeySalt: 'c2FsdA',
        recoveryKeyHash: 'aGFzaA',
        deviceLabel: 'Host Laptop',
        clientDeviceId: hostClientDeviceId,
      },
    })

    expect(createResponse.statusCode).toBe(201)
    const created = createResponse.json()
    expect(created.namespaceId).toBe(namespaceId)
    expect(created.deviceToken).toMatch(/^dvt_/)
    expect(created.limits.activeDevices).toBe(1)
    expect(created.limits.maxDevices).toBe(2)

    const pairingResponse = await app!.inject({
      method: 'POST',
      url: `/v1/namespaces/${namespaceId}/pairing-tokens`,
      headers: { authorization: `Bearer ${created.deviceToken}` },
      payload: { ttlSeconds: 600 },
    })

    expect(pairingResponse.statusCode).toBe(201)
    const pairing = pairingResponse.json()
    expect(pairing.code).toMatch(/^\d{6}$/)

    const pairingUsage = await db!.query<{ client_device_id: string; device_label: string }>(
      `SELECT d.client_device_id, d.label AS device_label
       FROM rate_limit_usage_buckets rlub
       INNER JOIN devices d ON d.id = rlub.device_uuid
       WHERE rlub.action = 'pairing_token'
       ORDER BY rlub.bucket_at DESC
       LIMIT 1`,
    )

    expect(pairingUsage.rows[0]?.client_device_id).toBe(hostClientDeviceId)
    expect(pairingUsage.rows[0]?.device_label).toBe('Host Laptop')

    const phoneClientDeviceId = randomUUID()

    const joinResponse = await app!.inject({
      method: 'POST',
      url: `/v1/namespaces/${namespaceId}/devices`,
      payload: {
        pairingCode: pairing.code,
        deviceLabel: 'Phone',
        clientDeviceId: phoneClientDeviceId,
      },
    })

    expect(joinResponse.statusCode).toBe(201)
    const joined = joinResponse.json()
    expect(joined.limits.activeDevices).toBe(2)

    const listResponse = await app!.inject({
      method: 'GET',
      url: `/v1/namespaces/${namespaceId}/devices`,
      headers: { authorization: `Bearer ${created.deviceToken}` },
    })

    expect(listResponse.statusCode).toBe(200)
    expect(listResponse.json().devices).toHaveLength(2)

    const limitResponse = await app!.inject({
      method: 'POST',
      url: `/v1/namespaces/${namespaceId}/pairing-tokens`,
      headers: { authorization: `Bearer ${created.deviceToken}` },
      payload: {},
    })

    expect(limitResponse.statusCode).toBe(403)
    expect(limitResponse.json().error.code).toBe('DEVICE_LIMIT_BLOCKED')

    const revokeResponse = await app!.inject({
      method: 'DELETE',
      url: `/v1/namespaces/${namespaceId}/devices/${joined.deviceId}`,
      headers: { authorization: `Bearer ${joined.deviceToken}` },
    })

    expect(revokeResponse.statusCode).toBe(204)

    const lastDeviceResponse = await app!.inject({
      method: 'DELETE',
      url: `/v1/namespaces/${namespaceId}/devices/${created.deviceId}`,
      headers: { authorization: `Bearer ${created.deviceToken}` },
    })

    expect(lastDeviceResponse.statusCode).toBe(403)
    expect(lastDeviceResponse.json().error.code).toBe('LAST_DEVICE_PROTECTED')

    const rejoinPairingResponse = await app!.inject({
      method: 'POST',
      url: `/v1/namespaces/${namespaceId}/pairing-tokens`,
      headers: { authorization: `Bearer ${created.deviceToken}` },
      payload: { ttlSeconds: 600 },
    })

    expect(rejoinPairingResponse.statusCode).toBe(201)
    const rejoinPairing = rejoinPairingResponse.json()

    const rejoinResponse = await app!.inject({
      method: 'POST',
      url: `/v1/namespaces/${namespaceId}/devices`,
      payload: {
        pairingCode: rejoinPairing.code,
        deviceLabel: 'Phone Again',
        clientDeviceId: phoneClientDeviceId,
      },
    })

    expect(rejoinResponse.statusCode).toBe(201)
    const rejoined = rejoinResponse.json()
    expect(rejoined.deviceToken).toMatch(/^dvt_/)
    expect(rejoined.limits.activeDevices).toBe(2)

    const rejoinedListResponse = await app!.inject({
      method: 'GET',
      url: `/v1/namespaces/${namespaceId}/devices`,
      headers: { authorization: `Bearer ${rejoined.deviceToken}` },
    })

    expect(rejoinedListResponse.statusCode).toBe(200)
    expect(rejoinedListResponse.json().devices).toHaveLength(2)
    expect(
      rejoinedListResponse.json().devices.some((device: { label: string }) => device.label === 'Phone Again'),
    ).toBe(true)
  })

  it.skipIf(!container || !app)('returns NAMESPACE_EXISTS on duplicate create', async () => {
    const namespaceId = randomUUID()

    const payload = {
      namespaceId,
      namespaceLabel: 'Dup',
      recoveryKeySalt: 'c2FsdA',
      recoveryKeyHash: 'aGFzaA',
      deviceLabel: 'Host',
      clientDeviceId: randomUUID(),
    }

    const first = await app!.inject({ method: 'POST', url: '/v1/namespaces', payload })
    expect(first.statusCode).toBe(201)

    const second = await app!.inject({ method: 'POST', url: '/v1/namespaces', payload })
    expect(second.statusCode).toBe(409)
    expect(second.json().error.code).toBe('NAMESPACE_EXISTS')
  })
})
