import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { sha256Hex } from '@senkronla/protocol'
import { ulid } from 'ulid'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { buildApp } from './app.js'
import { loadConfig } from './config/load-config.js'
import { createLoggerOptions } from './health/checks.js'
import { runMigrations } from './db/migrate.js'
import { createPool } from './db/pool.js'

const ADMIN_TOKEN = 'test-admin-token-01234567890123456789012'

describe('Faz 7 — hardening (integration)', () => {
  let container: StartedPostgreSqlContainer | undefined
  let app: Awaited<ReturnType<typeof buildApp>> | undefined
  let blobPath: string

  beforeAll(async () => {
    blobPath = await mkdtemp(join(tmpdir(), 'senkronla-blob-'))

    try {
      container = await new PostgreSqlContainer('postgres:16-alpine').start()
    } catch {
      container = undefined
      return
    }

    const config = loadConfig({
      ESR_DATABASE_URL: container.getConnectionUri(),
      ESR_BLOB_PATH: blobPath,
      ESR_ON_LIMIT_MODE: 'block',
      ESR_DEFAULT_FREE_DEVICE_LIMIT: '2',
      ESR_ADMIN_TOKEN: ADMIN_TOKEN,
      ESR_PAIRING_PER_HOUR: '3',
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

  it.skipIf(!container || !app)('rejects invalid and cross-namespace device tokens', async () => {
    const namespaceA = randomUUID()
    const namespaceB = randomUUID()

    const createA = await app!.inject({
      method: 'POST',
      url: '/v1/namespaces',
      payload: {
        namespaceId: namespaceA,
        namespaceLabel: 'A',
        recoveryKeySalt: 'c2FsdA',
        recoveryKeyHash: 'aGFzaA',
        deviceLabel: 'Host',
        clientDeviceId: randomUUID(),
      },
    })

    const createB = await app!.inject({
      method: 'POST',
      url: '/v1/namespaces',
      payload: {
        namespaceId: namespaceB,
        namespaceLabel: 'B',
        recoveryKeySalt: 'c2FsdA',
        recoveryKeyHash: 'aGFzaA',
        deviceLabel: 'Host',
        clientDeviceId: randomUUID(),
      },
    })

    const tokenA = createA.json().deviceToken as string

    const crossNamespace = await app!.inject({
      method: 'GET',
      url: `/v1/namespaces/${namespaceB}`,
      headers: { authorization: `Bearer ${tokenA}` },
    })

    expect(crossNamespace.statusCode).toBe(401)

    const invalid = await app!.inject({
      method: 'GET',
      url: `/v1/namespaces/${namespaceA}`,
      headers: { authorization: 'Bearer dvt_invalid' },
    })

    expect(invalid.statusCode).toBe(401)
  })

  it.skipIf(!container || !app)('rejects tampered envelope sha256 and oversized envelope', async () => {
    const namespaceId = randomUUID()
    const clientDeviceId = randomUUID()

    const tightConfig = loadConfig({
      ESR_DATABASE_URL: container!.getConnectionUri(),
      ESR_BLOB_PATH: blobPath,
      ESR_MAX_ENVELOPE_BYTES: '512',
    })
    const tightDb = createPool(tightConfig)
    const tightApp = await buildApp({ config: tightConfig, db: tightDb })
    await tightApp.ready()

    const create = await tightApp.inject({
      method: 'POST',
      url: '/v1/namespaces',
      payload: {
        namespaceId,
        namespaceLabel: 'Security',
        recoveryKeySalt: 'c2FsdA',
        recoveryKeyHash: 'aGFzaA',
        deviceLabel: 'Host',
        clientDeviceId,
      },
    })

    const token = create.json().deviceToken as string
    const payload = JSON.stringify({ magic: 'ENV-RAW1', data: '{}' })

    const invalidSha = await tightApp.inject({
      method: 'PUT',
      url: `/v1/namespaces/${namespaceId}/documents/primary`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        envelope: {
          magic: 'ESR-DOC1',
          schemaVersion: 1,
          namespaceId,
          namespaceLabel: 'Security',
          documentId: 'primary',
          revision: ulid(),
          deviceId: clientDeviceId,
          writtenAt: new Date().toISOString(),
          contentType: 'application/vnd.test+json',
          contentMagic: 'ENV-RAW1',
          contentSha256: '0'.repeat(64),
          payload,
        },
      },
    })

    expect(invalidSha.statusCode).toBe(422)
    expect(invalidSha.json().error.code).toBe('ENVELOPE_INVALID')

    const hugePayload = 'x'.repeat(2048)
    const hugeEnvelopePayload = JSON.stringify({ magic: 'ENV-RAW1', data: hugePayload })
    const oversized = await tightApp.inject({
      method: 'PUT',
      url: `/v1/namespaces/${namespaceId}/documents/primary`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        envelope: {
          magic: 'ESR-DOC1',
          schemaVersion: 1,
          namespaceId,
          namespaceLabel: 'Security',
          documentId: 'primary',
          revision: ulid(),
          deviceId: clientDeviceId,
          writtenAt: new Date().toISOString(),
          contentType: 'application/vnd.test+json',
          contentMagic: 'ENV-RAW1',
          contentSha256: sha256Hex(hugeEnvelopePayload),
          payload: hugeEnvelopePayload,
        },
      },
    })

    expect(oversized.statusCode).toBe(413)
    expect(oversized.json().error.code).toBe('ENVELOPE_TOO_LARGE')

    await tightApp.close()
    await tightDb.end()
  })

  it.skipIf(!container || !app)('enforces pairing rate limit', async () => {
    const namespaceId = randomUUID()

    const create = await app!.inject({
      method: 'POST',
      url: '/v1/namespaces',
      payload: {
        namespaceId,
        namespaceLabel: 'Pair Limit',
        recoveryKeySalt: 'c2FsdA',
        recoveryKeyHash: 'aGFzaA',
        deviceLabel: 'Host',
        clientDeviceId: randomUUID(),
      },
    })

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await app!.inject({
        method: 'POST',
        url: `/v1/namespaces/${namespaceId}/devices`,
        payload: {
          pairingCode: '000000',
          deviceLabel: 'Attacker',
          clientDeviceId: randomUUID(),
        },
      })

      expect(response.statusCode).toBe(400)
    }

    const limited = await app!.inject({
      method: 'POST',
      url: `/v1/namespaces/${namespaceId}/devices`,
      payload: {
        pairingCode: '000000',
        deviceLabel: 'Attacker',
        clientDeviceId: randomUUID(),
      },
    })

    expect(limited.statusCode).toBe(429)
    expect(limited.json().error.code).toBe('RATE_LIMIT_EXCEEDED')
  })
})

describe('Faz 7 — security logging', () => {
  it('redacts sensitive log paths from config', () => {
    const config = loadConfig()
    const logger = createLoggerOptions(config)

    expect(logger).toMatchObject({
      redact: {
        paths: expect.arrayContaining(['envelope.payload', 'deviceToken', 'recoveryKeyProof']),
      },
    })
  })
})
