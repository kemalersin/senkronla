import { randomUUID } from 'node:crypto'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ENVELOPE_SCHEMA_VERSION_V2, sha256Hex } from '@senkronla/protocol'
import { ulid } from 'ulid'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { buildApp } from './app.js'
import { loadConfig } from './config/load-config.js'
import { runMigrations } from './db/migrate.js'
import { createPool } from './db/pool.js'

function buildEnvelope(input: {
  namespaceId: string
  namespaceLabel: string
  documentId: string
  revision: string
  deviceId: string
  schemaVersion?: 1 | 2
  data?: string
}) {
  const payload = JSON.stringify({
    magic: 'ENV-RAW1',
    data: input.data ?? '{"hello":"world"}',
  })

  const schemaVersion = input.schemaVersion ?? (input.documentId === 'primary' ? 1 : 2)

  return {
    magic: 'ESR-DOC1',
    schemaVersion,
    namespaceId: input.namespaceId,
    namespaceLabel: input.namespaceLabel,
    documentId: input.documentId,
    revision: input.revision,
    deviceId: input.deviceId,
    writtenAt: new Date().toISOString(),
    contentType: 'application/vnd.test.snapshot+json',
    contentMagic: 'ENV-RAW1' as const,
    contentSha256: sha256Hex(payload),
    payload,
  }
}

describe('multi-document per namespace (integration)', () => {
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

  it.skipIf(!container || !app)('primary alias and settings document sync independently', async () => {
    const namespaceId = randomUUID()
    const clientDeviceId = randomUUID()

    const createResponse = await app!.inject({
      method: 'POST',
      url: '/v1/namespaces',
      payload: {
        namespaceId,
        namespaceLabel: 'Multi Doc',
        recoveryKeySalt: 'c2FsdA',
        recoveryKeyHash: 'aGFzaA',
        deviceLabel: 'Host',
        clientDeviceId,
      },
    })

    expect(createResponse.statusCode).toBe(201)
    const created = createResponse.json()
    const auth = { authorization: `Bearer ${created.deviceToken}` }

    const primaryRevision = ulid()
    const pushPrimary = await app!.inject({
      method: 'PUT',
      url: `/v1/namespaces/${namespaceId}/documents/primary`,
      headers: auth,
      payload: {
        envelope: buildEnvelope({
          namespaceId,
          namespaceLabel: 'Multi Doc',
          documentId: 'primary',
          revision: primaryRevision,
          deviceId: clientDeviceId,
        }),
      },
    })
    expect(pushPrimary.statusCode).toBe(201)

    const settingsRevision = ulid()
    const pushSettings = await app!.inject({
      method: 'PUT',
      url: `/v1/namespaces/${namespaceId}/documents/settings`,
      headers: auth,
      payload: {
        envelope: buildEnvelope({
          namespaceId,
          namespaceLabel: 'Multi Doc',
          documentId: 'settings',
          revision: settingsRevision,
          deviceId: clientDeviceId,
          schemaVersion: ENVELOPE_SCHEMA_VERSION_V2,
          data: '{"theme":"dark"}',
        }),
      },
    })
    expect(pushSettings.statusCode).toBe(201)

    const list = await app!.inject({
      method: 'GET',
      url: `/v1/namespaces/${namespaceId}/documents`,
      headers: auth,
    })
    expect(list.statusCode).toBe(200)
    const { documents } = list.json() as { documents: { documentId: string }[] }
    expect(documents.map((d) => d.documentId).sort()).toEqual(['primary', 'settings'])

    const settingsMeta = await app!.inject({
      method: 'GET',
      url: `/v1/namespaces/${namespaceId}/documents/settings/head/meta`,
      headers: auth,
    })
    expect(settingsMeta.statusCode).toBe(200)
    expect(settingsMeta.json().revision).toBe(settingsRevision)

    const nsInfo = await app!.inject({
      method: 'GET',
      url: `/v1/namespaces/${namespaceId}`,
      headers: auth,
    })
    expect(nsInfo.statusCode).toBe(200)
    const info = nsInfo.json() as { documents: unknown[]; head: { revision: string } }
    expect(info.documents).toHaveLength(2)
    expect(info.head.revision).toBe(primaryRevision)
  })

  it.skipIf(!container || !app)('rejects envelope documentId mismatch with path', async () => {
    const namespaceId = randomUUID()
    const clientDeviceId = randomUUID()

    const createResponse = await app!.inject({
      method: 'POST',
      url: '/v1/namespaces',
      payload: {
        namespaceId,
        namespaceLabel: 'Mismatch',
        recoveryKeySalt: 'c2FsdA',
        recoveryKeyHash: 'aGFzaA',
        deviceLabel: 'Host',
        clientDeviceId,
      },
    })

    const created = createResponse.json()
    const response = await app!.inject({
      method: 'PUT',
      url: `/v1/namespaces/${namespaceId}/documents/settings`,
      headers: { authorization: `Bearer ${created.deviceToken}` },
      payload: {
        envelope: buildEnvelope({
          namespaceId,
          namespaceLabel: 'Mismatch',
          documentId: 'primary',
          revision: ulid(),
          deviceId: clientDeviceId,
        }),
      },
    })

    expect(response.statusCode).toBe(422)
    expect(response.json().code).toBe('ENVELOPE_DOCUMENT_MISMATCH')
  })
})
