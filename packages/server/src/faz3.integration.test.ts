import { randomUUID } from 'node:crypto'
import { mkdtemp, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sha256Hex } from '@senkronla/protocol'
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
  revision: string
  deviceId: string
  data?: string
}) {
  const payload = JSON.stringify({
    magic: 'ENV-RAW1',
    data: input.data ?? '{"hello":"world"}',
  })

  return {
    magic: 'ESR-DOC1',
    schemaVersion: 1,
    namespaceId: input.namespaceId,
    namespaceLabel: input.namespaceLabel,
    documentId: 'primary',
    revision: input.revision,
    deviceId: input.deviceId,
    writtenAt: new Date().toISOString(),
    contentType: 'application/vnd.test.snapshot+json',
    contentMagic: 'ENV-RAW1',
    contentSha256: sha256Hex(payload),
    payload,
  }
}

async function countBlobFiles(root: string): Promise<number> {
  let count = 0

  async function walk(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(path)
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        count += 1
      }
    }
  }

  await walk(root)
  return count
}

describe('Faz 3 — document push/pull (integration)', () => {
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

  it.skipIf(!container || !app)('push → head/meta → head → conflict', async () => {
    const namespaceId = randomUUID()
    const clientDeviceId = randomUUID()

    const createResponse = await app!.inject({
      method: 'POST',
      url: '/v1/namespaces',
      payload: {
        namespaceId,
        namespaceLabel: 'Docs Test',
        recoveryKeySalt: 'c2FsdA',
        recoveryKeyHash: 'aGFzaA',
        deviceLabel: 'Host',
        clientDeviceId,
      },
    })

    expect(createResponse.statusCode).toBe(201)
    const created = createResponse.json()
    const revision1 = ulid()
    const envelope1 = buildEnvelope({
      namespaceId,
      namespaceLabel: 'Docs Test',
      revision: revision1,
      deviceId: clientDeviceId,
    })

    const push1 = await app!.inject({
      method: 'PUT',
      url: `/v1/namespaces/${namespaceId}/documents/primary`,
      headers: { authorization: `Bearer ${created.deviceToken}` },
      payload: { envelope: envelope1 },
    })

    expect(push1.statusCode).toBe(201)
    expect(push1.json().revision).toBe(revision1)

    const meta = await app!.inject({
      method: 'GET',
      url: `/v1/namespaces/${namespaceId}/documents/primary/head/meta`,
      headers: { authorization: `Bearer ${created.deviceToken}` },
    })

    expect(meta.statusCode).toBe(200)
    expect(meta.json().revision).toBe(revision1)

    const head = await app!.inject({
      method: 'GET',
      url: `/v1/namespaces/${namespaceId}/documents/primary/head`,
      headers: { authorization: `Bearer ${created.deviceToken}` },
    })

    expect(head.statusCode).toBe(200)
    expect(head.json().revision).toBe(revision1)
    expect(head.json().payload).toBe(envelope1.payload)

    const revision2 = ulid()
    const envelope2 = buildEnvelope({
      namespaceId,
      namespaceLabel: 'Docs Test',
      revision: revision2,
      deviceId: clientDeviceId,
      data: '{"hello":"updated"}',
    })

    const push2 = await app!.inject({
      method: 'PUT',
      url: `/v1/namespaces/${namespaceId}/documents/primary`,
      headers: { authorization: `Bearer ${created.deviceToken}` },
      payload: { expectedRevision: revision1, envelope: envelope2 },
    })

    expect(push2.statusCode).toBe(201)
    expect(push2.json().revision).toBe(revision2)
    expect(await countBlobFiles(blobPath)).toBe(2)

    const revision3 = ulid()
    const envelope3 = buildEnvelope({
      namespaceId,
      namespaceLabel: 'Docs Test',
      revision: revision3,
      deviceId: clientDeviceId,
      data: '{"hello":"conflict"}',
    })

    const conflict = await app!.inject({
      method: 'PUT',
      url: `/v1/namespaces/${namespaceId}/documents/primary`,
      headers: { authorization: `Bearer ${created.deviceToken}` },
      payload: { expectedRevision: revision1, envelope: envelope3 },
    })

    expect(conflict.statusCode).toBe(409)
    expect(conflict.json().error.code).toBe('REVISION_CONFLICT')
    expect(conflict.json().error.details.actualRevision).toBe(revision2)

    const missingHead = await app!.inject({
      method: 'GET',
      url: `/v1/namespaces/${randomUUID()}/documents/primary/head/meta`,
      headers: { authorization: `Bearer ${created.deviceToken}` },
    })

    expect([401, 404]).toContain(missingHead.statusCode)
  })

  it.skipIf(!container || !app)('rejects invalid envelope', async () => {
    const namespaceId = randomUUID()

    const createResponse = await app!.inject({
      method: 'POST',
      url: '/v1/namespaces',
      payload: {
        namespaceId,
        namespaceLabel: 'Invalid Envelope',
        recoveryKeySalt: 'c2FsdA',
        recoveryKeyHash: 'aGFzaA',
        deviceLabel: 'Host',
        clientDeviceId: randomUUID(),
      },
    })

    const created = createResponse.json()

    const invalid = await app!.inject({
      method: 'PUT',
      url: `/v1/namespaces/${namespaceId}/documents/primary`,
      headers: { authorization: `Bearer ${created.deviceToken}` },
      payload: {
        envelope: {
          magic: 'ESR-DOC1',
          schemaVersion: 1,
          namespaceId,
          namespaceLabel: 'Invalid Envelope',
          documentId: 'primary',
          revision: ulid(),
          deviceId: randomUUID(),
          writtenAt: new Date().toISOString(),
          contentType: 'application/vnd.test.snapshot+json',
          contentMagic: 'ENV-RAW1',
          contentSha256: '0'.repeat(64),
          payload: '{}',
        },
      },
    })

    expect(invalid.statusCode).toBe(422)
    expect(invalid.json().error.code).toBe('ENVELOPE_INVALID')
  })
})
