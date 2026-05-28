import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { buildApp } from './app.js'
import { loadConfig } from './config/load-config.js'
import { runMigrations } from './db/migrate.js'
import { createPool } from './db/pool.js'

const ADMIN_TOKEN = 'test-admin-token-01234567890123456789012'

describe('Faz 5 — unlock codes (integration)', () => {
  let container: StartedPostgreSqlContainer | undefined
  let app: Awaited<ReturnType<typeof buildApp>> | undefined

  beforeAll(async () => {
    try {
      container = await new PostgreSqlContainer('postgres:16-alpine').start()
    } catch {
      container = undefined
      return
    }

    const config = loadConfig({
      ESR_DATABASE_URL: container.getConnectionUri(),
      ESR_ON_LIMIT_MODE: 'payment',
      ESR_DEFAULT_FREE_DEVICE_LIMIT: '2',
      ESR_ADMIN_TOKEN: ADMIN_TOKEN,
    })

    const db = createPool(config)
    await runMigrations(db)
    app = await buildApp({ config, db })
    await app.ready()
  }, 120_000)

  afterAll(async () => {
    await app?.close()
    await container?.stop()
  })

  it.skipIf(!container || !app)('unlock + pair flow in payment mode', async () => {
    const namespaceId = randomUUID()
    const hostClientDeviceId = randomUUID()

    const createResponse = await app!.inject({
      method: 'POST',
      url: '/v1/namespaces',
      payload: {
        namespaceId,
        namespaceLabel: 'Unlock Test',
        recoveryKeySalt: 'c2FsdA',
        recoveryKeyHash: 'aGFzaA',
        deviceLabel: 'Host',
        clientDeviceId: hostClientDeviceId,
      },
    })

    expect(createResponse.statusCode).toBe(201)
    const created = createResponse.json()
    const hostToken = created.deviceToken as string

    const pairingResponse = await app!.inject({
      method: 'POST',
      url: `/v1/namespaces/${namespaceId}/pairing-tokens`,
      headers: { authorization: `Bearer ${hostToken}` },
      payload: { ttlSeconds: 600 },
    })

    expect(pairingResponse.statusCode).toBe(201)
    const pairing = pairingResponse.json()

    const joinResponse = await app!.inject({
      method: 'POST',
      url: `/v1/namespaces/${namespaceId}/devices`,
      payload: {
        pairingCode: pairing.code,
        deviceLabel: 'Phone',
        clientDeviceId: randomUUID(),
      },
    })

    expect(joinResponse.statusCode).toBe(201)

    const limitResponse = await app!.inject({
      method: 'POST',
      url: `/v1/namespaces/${namespaceId}/pairing-tokens`,
      headers: { authorization: `Bearer ${hostToken}` },
      payload: {},
    })

    expect(limitResponse.statusCode).toBe(403)
    expect(limitResponse.json().error.code).toBe('DEVICE_LIMIT_PAYMENT_REQUIRED')

    const adminResponse = await app!.inject({
      method: 'POST',
      url: '/v1/admin/unlock-codes',
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      payload: {
        namespaceId,
        slots: 3,
        note: 'Integration test unlock',
      },
    })

    expect(adminResponse.statusCode).toBe(201)
    const generated = adminResponse.json()
    expect(generated.unlockCode).toMatch(/^ESR-UNLK-3-/)

    const redeemResponse = await app!.inject({
      method: 'POST',
      url: `/v1/namespaces/${namespaceId}/unlock`,
      headers: { authorization: `Bearer ${hostToken}` },
      payload: { unlockCode: generated.unlockCode },
    })

    expect(redeemResponse.statusCode).toBe(200)
    const redeemed = redeemResponse.json()
    expect(redeemed.slotsAdded).toBe(3)
    expect(redeemed.purchasedSlots).toBe(3)
    expect(redeemed.maxDevices).toBe(5)
    expect(redeemed.canAddDevice).toBe(true)

    const pairingAfterUnlock = await app!.inject({
      method: 'POST',
      url: `/v1/namespaces/${namespaceId}/pairing-tokens`,
      headers: { authorization: `Bearer ${hostToken}` },
      payload: {},
    })

    expect(pairingAfterUnlock.statusCode).toBe(201)

    const duplicateRedeem = await app!.inject({
      method: 'POST',
      url: `/v1/namespaces/${namespaceId}/unlock`,
      headers: { authorization: `Bearer ${hostToken}` },
      payload: { unlockCode: generated.unlockCode },
    })

    expect(duplicateRedeem.statusCode).toBe(409)
    expect(duplicateRedeem.json().error.code).toBe('UNLOCK_CODE_ALREADY_REDEEMED')
  })

  it.skipIf(!container || !app)('rejects invalid unlock codes and admin auth', async () => {
    const namespaceId = randomUUID()

    const createResponse = await app!.inject({
      method: 'POST',
      url: '/v1/namespaces',
      payload: {
        namespaceId,
        namespaceLabel: 'Invalid Unlock',
        recoveryKeySalt: 'c2FsdA',
        recoveryKeyHash: 'aGFzaA',
        deviceLabel: 'Host',
        clientDeviceId: randomUUID(),
      },
    })

    expect(createResponse.statusCode).toBe(201)
    const hostToken = createResponse.json().deviceToken as string

    const invalidRedeem = await app!.inject({
      method: 'POST',
      url: `/v1/namespaces/${namespaceId}/unlock`,
      headers: { authorization: `Bearer ${hostToken}` },
      payload: { unlockCode: 'ESR-UNLK-3-NOTVALID123' },
    })

    expect(invalidRedeem.statusCode).toBe(400)
    expect(invalidRedeem.json().error.code).toBe('UNLOCK_CODE_INVALID')

    const unauthorizedAdmin = await app!.inject({
      method: 'POST',
      url: '/v1/admin/unlock-codes',
      headers: { authorization: 'Bearer wrong-admin-token-012345678901234567890' },
      payload: {
        namespaceId,
        slots: 3,
      },
    })

    expect(unauthorizedAdmin.statusCode).toBe(401)
  })
})
