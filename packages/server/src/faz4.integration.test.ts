import { randomUUID } from 'node:crypto'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildRecoveryKeyProof, generateRecoveryPhrase, sha256Hex } from '@senkronla/protocol'
import { ulid } from 'ulid'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { buildApp } from './app.js'
import { loadConfig } from './config/load-config.js'
import { runMigrations } from './db/migrate.js'
import { createPool } from './db/pool.js'

function buildEnvelope(input: {
  namespaceId: string
  revision: string
  deviceId: string
}) {
  const payload = JSON.stringify({
    magic: 'ENV-RAW1',
    data: '{"hello":"world"}',
  })

  return {
    magic: 'ESR-DOC1',
    schemaVersion: 1,
    namespaceId: input.namespaceId,
    namespaceLabel: 'Recovery Test',
    documentId: 'primary',
    revision: input.revision,
    deviceId: input.deviceId,
    writtenAt: new Date().toISOString(),
    contentType: 'application/vnd.test+json',
    contentMagic: 'ENV-RAW1',
    contentSha256: sha256Hex(payload),
    payload,
  }
}

describe('Faz 4 — recovery (integration)', () => {
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
      ESR_RATE_LIMIT_ENABLED: 'true',
      ESR_RECOVER_PER_HOUR: '5',
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

  it.skipIf(!container || !app)('recover revokes old tokens and preserves head', async () => {
    const namespaceId = randomUUID()
    const hostClientDeviceId = randomUUID()
    const recoveryPhrase = generateRecoveryPhrase()
    const recoveryKeyProof = await buildRecoveryKeyProof(recoveryPhrase)

    const createResponse = await app!.inject({
      method: 'POST',
      url: '/v1/namespaces',
      payload: {
        namespaceId,
        namespaceLabel: 'Recovery Test',
        recoveryKeyProof,
        deviceLabel: 'Host',
        clientDeviceId: hostClientDeviceId,
      },
    })

    expect(createResponse.statusCode).toBe(201)
    const created = createResponse.json()
    const oldToken = created.deviceToken as string

    const pairingResponse = await app!.inject({
      method: 'POST',
      url: `/v1/namespaces/${namespaceId}/pairing-tokens`,
      headers: { authorization: `Bearer ${oldToken}` },
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
    const joined = joinResponse.json()
    const secondToken = joined.deviceToken as string

    const revision = ulid()
    const pushResponse = await app!.inject({
      method: 'PUT',
      url: `/v1/namespaces/${namespaceId}/documents/primary`,
      headers: { authorization: `Bearer ${oldToken}` },
      payload: {
        envelope: buildEnvelope({
          namespaceId,
          revision,
          deviceId: hostClientDeviceId,
        }),
      },
    })

    expect(pushResponse.statusCode).toBe(201)

    const recoverProof = await buildRecoveryKeyProof(recoveryPhrase, {
      salt: recoveryKeyProof.salt,
    })
    const recoveredClientDeviceId = randomUUID()

    const recoverResponse = await app!.inject({
      method: 'POST',
      url: `/v1/namespaces/${namespaceId}/recover`,
      payload: {
        recoveryKeyProof: recoverProof,
        deviceLabel: 'Recovered Laptop',
        clientDeviceId: recoveredClientDeviceId,
      },
    })

    expect(recoverResponse.statusCode).toBe(200)
    const recovered = recoverResponse.json()
    expect(recovered.revokedDeviceCount).toBe(2)
    expect(recovered.limits.activeDevices).toBe(1)
    expect(recovered.deviceToken).toMatch(/^dvt_/)

    const oldTokenCheck = await app!.inject({
      method: 'GET',
      url: `/v1/namespaces/${namespaceId}`,
      headers: { authorization: `Bearer ${oldToken}` },
    })

    expect(oldTokenCheck.statusCode).toBe(401)

    const secondTokenCheck = await app!.inject({
      method: 'GET',
      url: `/v1/namespaces/${namespaceId}`,
      headers: { authorization: `Bearer ${secondToken}` },
    })

    expect(secondTokenCheck.statusCode).toBe(401)

    const headMeta = await app!.inject({
      method: 'GET',
      url: `/v1/namespaces/${namespaceId}/documents/primary/head/meta`,
      headers: { authorization: `Bearer ${recovered.deviceToken}` },
    })

    expect(headMeta.statusCode).toBe(200)
    expect(headMeta.json().revision).toBe(revision)
  })

  it.skipIf(!container || !app)('rejects invalid recovery proof', async () => {
    const namespaceId = randomUUID()
    const recoveryKeyProof = await buildRecoveryKeyProof(generateRecoveryPhrase())

    const createResponse = await app!.inject({
      method: 'POST',
      url: '/v1/namespaces',
      payload: {
        namespaceId,
        namespaceLabel: 'Invalid Recovery',
        recoveryKeyProof,
        deviceLabel: 'Host',
        clientDeviceId: randomUUID(),
      },
    })

    expect(createResponse.statusCode).toBe(201)

    const invalidResponse = await app!.inject({
      method: 'POST',
      url: `/v1/namespaces/${namespaceId}/recover`,
      payload: {
        recoveryKeyProof: await buildRecoveryKeyProof(generateRecoveryPhrase(), {
          salt: recoveryKeyProof.salt,
        }),
        deviceLabel: 'Attacker',
        clientDeviceId: randomUUID(),
      },
    })

    expect(invalidResponse.statusCode).toBe(401)
    expect(invalidResponse.json().error.code).toBe('RECOVERY_INVALID')
  })

  it.skipIf(!container || !app)('enforces recovery rate limit', async () => {
    const namespaceId = randomUUID()
    const recoveryKeyProof = await buildRecoveryKeyProof(generateRecoveryPhrase())

    const createResponse = await app!.inject({
      method: 'POST',
      url: '/v1/namespaces',
      payload: {
        namespaceId,
        namespaceLabel: 'Rate Limit',
        recoveryKeyProof,
        deviceLabel: 'Host',
        clientDeviceId: randomUUID(),
      },
    })

    expect(createResponse.statusCode).toBe(201)

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await app!.inject({
        method: 'POST',
        url: `/v1/namespaces/${namespaceId}/recover`,
        payload: {
          recoveryKeyProof: await buildRecoveryKeyProof(generateRecoveryPhrase(), {
            salt: recoveryKeyProof.salt,
          }),
          deviceLabel: 'Attacker',
          clientDeviceId: randomUUID(),
        },
      })

      expect(response.statusCode).toBe(401)
    }

    const limitedResponse = await app!.inject({
      method: 'POST',
      url: `/v1/namespaces/${namespaceId}/recover`,
      payload: {
        recoveryKeyProof: await buildRecoveryKeyProof(generateRecoveryPhrase(), {
          salt: recoveryKeyProof.salt,
        }),
        deviceLabel: 'Attacker',
        clientDeviceId: randomUUID(),
      },
    })

    expect(limitedResponse.statusCode).toBe(429)
    expect(limitedResponse.json().error.code).toBe('RATE_LIMIT_EXCEEDED')
    expect(limitedResponse.headers['retry-after']).toBeDefined()
  })
})
