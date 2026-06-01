import { randomUUID } from 'node:crypto'
import { access, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sha256Hex } from '@senkronla/protocol'
import { ulid } from 'ulid'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { buildApp } from './app.js'
import { resolveBlobPath } from './blob/store.js'
import { loadConfig } from './config/load-config.js'
import { runMigrations } from './db/migrate.js'
import { createPool } from './db/pool.js'

function buildEnvelope(input: {
  namespaceId: string
  namespaceLabel: string
  revision: string
  deviceId: string
}) {
  const payload = JSON.stringify({ magic: 'ENV-RAW1', data: '{"hello":"world"}' })

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

describe('Revision retention (integration)', () => {
  let container: StartedPostgreSqlContainer | undefined
  let app: Awaited<ReturnType<typeof buildApp>> | undefined
  let blobPath: string
  let adminToken: string

  beforeAll(async () => {
    blobPath = await mkdtemp(join(tmpdir(), 'senkronla-blob-'))
    adminToken = 'x'.repeat(32)

    try {
      container = await new PostgreSqlContainer('postgres:16-alpine').start()
    } catch {
      container = undefined
      return
    }

    const config = loadConfig({
      ESR_DATABASE_URL: container.getConnectionUri(),
      ESR_BLOB_PATH: blobPath,
      ESR_ADMIN_TOKEN: adminToken,
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

  it.skipIf(!container || !app)('stores revision history and purges non-head revisions by date', async () => {
    const namespaceId = randomUUID()
    const clientDeviceId = randomUUID()

    const createResponse = await app!.inject({
      method: 'POST',
      url: '/v1/namespaces',
      payload: {
        namespaceId,
        namespaceLabel: 'Retention Test',
        recoveryKeySalt: 'c2FsdA',
        recoveryKeyHash: 'aGFzaA',
        deviceLabel: 'Host',
        clientDeviceId,
      },
    })

    expect(createResponse.statusCode).toBe(201)
    const created = createResponse.json()

    const revision1 = ulid()
    const push1 = await app!.inject({
      method: 'PUT',
      url: `/v1/namespaces/${namespaceId}/documents/primary`,
      headers: { authorization: `Bearer ${created.deviceToken}` },
      payload: {
        envelope: buildEnvelope({
          namespaceId,
          namespaceLabel: 'Retention Test',
          revision: revision1,
          deviceId: clientDeviceId,
        }),
      },
    })
    expect(push1.statusCode).toBe(201)

    const revision2 = ulid()
    const push2 = await app!.inject({
      method: 'PUT',
      url: `/v1/namespaces/${namespaceId}/documents/primary`,
      headers: { authorization: `Bearer ${created.deviceToken}` },
      payload: {
        expectedRevision: revision1,
        envelope: buildEnvelope({
          namespaceId,
          namespaceLabel: 'Retention Test',
          revision: revision2,
          deviceId: clientDeviceId,
        }),
      },
    })
    expect(push2.statusCode).toBe(201)

    const blobKey1 = `${namespaceId}/primary/${revision1}.json`
    const blobKey2 = `${namespaceId}/primary/${revision2}.json`

    await expect(access(resolveBlobPath(blobPath, blobKey1))).resolves.toBeUndefined()
    await expect(access(resolveBlobPath(blobPath, blobKey2))).resolves.toBeUndefined()

    const purge = await app!.inject({
      method: 'POST',
      url: '/v1/admin/revisions/purge',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        mode: 'date',
        before: new Date(Date.now() + 60_000).toISOString(),
        scope: 'namespace',
        namespaceId,
      },
    })

    expect(purge.statusCode).toBe(200)
    expect(purge.json()).toMatchObject({ deletedRevisions: 1, deletedBlobFiles: 1 })

    await expect(access(resolveBlobPath(blobPath, blobKey1))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(access(resolveBlobPath(blobPath, blobKey2))).resolves.toBeUndefined()
  })

  it.skipIf(!container || !app)(
    'purges revisions by count including head in the keep limit',
    async () => {
      const namespaceId = randomUUID()
      const clientDeviceId = randomUUID()

      const createResponse = await app!.inject({
        method: 'POST',
        url: '/v1/namespaces',
        payload: {
          namespaceId,
          namespaceLabel: 'Count Retention Test',
          recoveryKeySalt: 'c2FsdA',
          recoveryKeyHash: 'aGFzaA',
          deviceLabel: 'Host',
          clientDeviceId,
        },
      })

      expect(createResponse.statusCode).toBe(201)
      const created = createResponse.json()

      let expectedRevision: string | undefined
      const blobKeys: string[] = []

      for (let index = 0; index < 3; index += 1) {
        const revision = ulid()
        const push = await app!.inject({
          method: 'PUT',
          url: `/v1/namespaces/${namespaceId}/documents/primary`,
          headers: { authorization: `Bearer ${created.deviceToken}` },
          payload: {
            ...(expectedRevision ? { expectedRevision } : {}),
            envelope: buildEnvelope({
              namespaceId,
              namespaceLabel: 'Count Retention Test',
              revision,
              deviceId: clientDeviceId,
            }),
          },
        })

        expect(push.statusCode).toBe(201)
        expectedRevision = revision
        blobKeys.push(`${namespaceId}/primary/${revision}.json`)
      }

      for (const blobKey of blobKeys) {
        await expect(access(resolveBlobPath(blobPath, blobKey))).resolves.toBeUndefined()
      }

      const purge = await app!.inject({
        method: 'POST',
        url: '/v1/admin/revisions/purge',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          mode: 'count',
          keepLastRevisions: 1,
          scope: 'namespace',
          namespaceId,
        },
      })

      expect(purge.statusCode).toBe(200)
      expect(purge.json()).toMatchObject({ deletedRevisions: 2, deletedBlobFiles: 2 })

      await expect(access(resolveBlobPath(blobPath, blobKeys[0]!))).rejects.toMatchObject({
        code: 'ENOENT',
      })
      await expect(access(resolveBlobPath(blobPath, blobKeys[1]!))).rejects.toMatchObject({
        code: 'ENOENT',
      })
      await expect(access(resolveBlobPath(blobPath, blobKeys[2]!))).resolves.toBeUndefined()
    },
  )
})
