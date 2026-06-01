import { purgeBlobStorage } from '../blob/purge.js'
import type { DbPool } from '../db/pool.js'

export interface PurgeAllRecordsResult {
  deleted: {
    namespaces: number
    unlockCodes: number
    unlockEvents: number
    rateLimitEvents: number
    operatorLimitAudit: number
    developerAuthTokens: number
    apps: number
    developers: number
    blobNamespaceDirs: number
  }
}

export async function purgeAllRecords(pool: DbPool, blobRoot: string): Promise<PurgeAllRecordsResult> {
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const unlockEvents = (await client.query('DELETE FROM unlock_events')).rowCount ?? 0
    const unlockCodes = (await client.query('DELETE FROM unlock_codes')).rowCount ?? 0
    const rateLimitEvents = (await client.query('DELETE FROM rate_limit_events')).rowCount ?? 0
    await client.query('DELETE FROM rate_limit_usage_buckets')
    const operatorLimitAudit = (await client.query('DELETE FROM operator_limit_audit')).rowCount ?? 0
    const namespaces = (await client.query('DELETE FROM namespaces')).rowCount ?? 0
    const developerAuthTokens = (await client.query('DELETE FROM developer_auth_tokens')).rowCount ?? 0
    const apps = (await client.query('DELETE FROM apps')).rowCount ?? 0
    const developers = (await client.query('DELETE FROM developers')).rowCount ?? 0

    await client.query('COMMIT')

    const blobNamespaceDirs = await purgeBlobStorage(blobRoot)

    return {
      deleted: {
        namespaces,
        unlockCodes,
        unlockEvents,
        rateLimitEvents,
        operatorLimitAudit,
        developerAuthTokens,
        apps,
        developers,
        blobNamespaceDirs,
      },
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
