import pg from 'pg'
import type { ServerConfig } from '../config/schema.js'

export type DbPool = pg.Pool
export type DbQueryable = Pick<pg.Pool, 'query'>

export function createPool(config: ServerConfig): DbPool {
  return new pg.Pool({
    connectionString: config.database.url,
    max: config.database.poolSize,
    ssl: config.database.ssl ? { rejectUnauthorized: false } : undefined,
  })
}

export async function checkDatabase(pool: DbQueryable): Promise<void> {
  await pool.query('SELECT 1')
}
