import type { ServerConfig } from '../config/schema.js'
import type { DbPool } from '../db/pool.js'
import type { DeveloperAuthTokenPurpose } from './developer-auth-token-service.js'
import {
  enforceRateLimit,
  getDeveloperAuthMailIpRateLimitRule,
} from './rate-limit-service.js'

const DEVELOPER_AUTH_MAIL_WINDOW_SECONDS = 3600

export async function enforceDeveloperAuthMailIpRateLimit(
  pool: DbPool,
  config: ServerConfig,
  clientIp: string | undefined,
): Promise<void> {
  if (!clientIp) {
    return
  }

  await enforceRateLimit(pool, config, getDeveloperAuthMailIpRateLimitRule(config), {
    clientIp,
  })
}

export async function isDeveloperAuthMailPerDeveloperLimitReached(
  pool: DbPool,
  config: ServerConfig,
  developerUuid: string,
  purpose: DeveloperAuthTokenPurpose,
): Promise<boolean> {
  if (!config.limits.rateLimit.enabled) {
    return false
  }

  const limit = config.apps.developerPortal.authMailPerHourPerDeveloper
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM developer_auth_tokens
     WHERE developer_uuid = $1
       AND purpose = $2
       AND created_at > now() - ($3 || ' seconds')::interval`,
    [developerUuid, purpose, String(DEVELOPER_AUTH_MAIL_WINDOW_SECONDS)],
  )

  return Number(result.rows[0]?.count ?? 0) >= limit
}
