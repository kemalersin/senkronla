import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { loadConfig } from '../config/load-config.js'
import { createPool } from './pool.js'
import { runMigrations } from './migrate.js'

describe('runMigrations (integration)', () => {
  let container: StartedPostgreSqlContainer | undefined

  beforeAll(async () => {
    try {
      container = await new PostgreSqlContainer('postgres:16-alpine').start()
    } catch {
      container = undefined
    }
  }, 120_000)

  afterAll(async () => {
    await container?.stop()
  })

  it.skipIf(!container)('applies 001_initial and creates core tables', async () => {
    const config = loadConfig({ ESR_DATABASE_URL: container!.getConnectionUri() })
    const pool = createPool(config)

    const applied = await runMigrations(pool)
    expect(applied).toContain('001_initial')

    const tables = await pool.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
    )

    expect(tables.rows.map((row) => row.tablename)).toEqual(
      expect.arrayContaining([
        'devices',
        'document_heads',
        'namespaces',
        'pairing_tokens',
        'schema_migrations',
        'unlock_codes',
        'unlock_events',
      ]),
    )

    const secondRun = await runMigrations(pool)
    expect(secondRun).toEqual([])

    await pool.end()
  })
})
