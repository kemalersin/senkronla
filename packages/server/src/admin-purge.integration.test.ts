import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { buildApp } from './app.js'
import { loadConfig } from './config/load-config.js'
import { runMigrations } from './db/migrate.js'
import { createPool } from './db/pool.js'
import { getAdminOverview } from './services/admin-dashboard-service.js'

const ADMIN_TOKEN = 'test-admin-token-01234567890123456789012'

describe('Admin purge all records (integration)', () => {
  let container: StartedPostgreSqlContainer | undefined
  let app: Awaited<ReturnType<typeof buildApp>> | undefined
  let db: ReturnType<typeof createPool> | undefined
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
      ESR_ADMIN_TOKEN: ADMIN_TOKEN,
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

  it.skipIf(!container || !app)('requires admin auth and confirmation phrase', async () => {
    const unauthenticated = await app!.inject({
      method: 'POST',
      url: '/v1/admin/danger/purge-all-records',
      payload: { confirm: 'purge-all-records' },
    })

    expect(unauthenticated.statusCode).toBe(401)

    const invalidBody = await app!.inject({
      method: 'POST',
      url: '/v1/admin/danger/purge-all-records',
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      payload: { confirm: 'wrong' },
    })

    expect(invalidBody.statusCode).toBe(400)
  })

  it.skipIf(!container || !app || !db)('deletes all relay records and blob namespaces', async () => {
    const namespaceId = randomUUID()

    const create = await app!.inject({
      method: 'POST',
      url: '/v1/namespaces',
      payload: {
        namespaceId,
        namespaceLabel: 'Purge test',
        recoveryKeySalt: 'c2FsdA',
        recoveryKeyHash: 'aGFzaA',
        deviceLabel: 'Host',
        clientDeviceId: randomUUID(),
      },
    })

    expect(create.statusCode).toBe(201)

    const before = await getAdminOverview(db!)
    expect(before.namespaces).toBeGreaterThan(0)

    const purge = await app!.inject({
      method: 'POST',
      url: '/v1/admin/danger/purge-all-records',
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      payload: { confirm: 'purge-all-records' },
    })

    expect(purge.statusCode).toBe(200)

    const body = purge.json() as { deleted: { namespaces: number } }
    expect(body.deleted.namespaces).toBeGreaterThan(0)

    const after = await getAdminOverview(db!)
    expect(after.namespaces).toBe(0)
    expect(after.documents).toBe(0)
    expect(after.activeDevices).toBe(0)
  })
})
