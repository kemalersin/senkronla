import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { DbPool } from './pool.js'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')

async function ensureMigrationsTable(pool: DbPool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)
}

async function getAppliedVersions(pool: DbPool): Promise<Set<string>> {
  const result = await pool.query<{ version: string }>(
    'SELECT version FROM schema_migrations ORDER BY version',
  )
  return new Set(result.rows.map((row) => row.version))
}

export async function runMigrations(pool: DbPool): Promise<string[]> {
  await ensureMigrationsTable(pool)

  const migrationsDir = join(packageRoot, 'migrations')
  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith('.sql'))
    .sort()

  const applied = await getAppliedVersions(pool)
  const newlyApplied: string[] = []

  for (const file of files) {
    const version = file.replace(/\.sql$/, '')
    if (applied.has(version)) continue

    const sql = await readFile(join(migrationsDir, file), 'utf8')
    const client = await pool.connect()

    try {
      await client.query('BEGIN')
      await client.query(sql)
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version])
      await client.query('COMMIT')
      newlyApplied.push(version)
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  return newlyApplied
}
