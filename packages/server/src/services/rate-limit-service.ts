import type { ServerConfig } from '../config/schema.js'
import type { DbPool } from '../db/pool.js'
import { AppError } from '../errors/app-error.js'

export const RATE_LIMIT_ACTION = {
  recover: 'recover',
  pairDevice: 'pair_device',
  pairingToken: 'pairing_token',
  putDocument: 'put_document',
  namespaceCreate: 'namespace_create',
  globalIp: 'global_ip',
  developerAuthMail: 'developer_auth_mail',
} as const

export type RateLimitAction = (typeof RATE_LIMIT_ACTION)[keyof typeof RATE_LIMIT_ACTION]

export interface RateLimitScope {
  namespaceUuid?: string | null
  deviceUuid?: string | null
  clientIp?: string | null
  appUuid?: string | null
}

export interface RateLimitQuota {
  action: RateLimitAction
  limit: number
  remaining: number
  resetAfterSeconds: number
  windowSeconds: number
}

function buildRateLimitQuery(
  action: RateLimitAction,
  scope: RateLimitScope,
  windowSeconds: number,
) {
  if (scope.deviceUuid) {
    return {
      sql: `SELECT COUNT(*)::text AS count, MIN(created_at) AS oldest_at
            FROM rate_limit_events
            WHERE device_uuid = $1
              AND action = $2
              AND created_at > now() - ($3 || ' seconds')::interval`,
      params: [scope.deviceUuid, action, String(windowSeconds)],
    }
  }

  if (scope.appUuid && scope.clientIp) {
    return {
      sql: `SELECT COUNT(*)::text AS count, MIN(created_at) AS oldest_at
            FROM rate_limit_events
            WHERE app_uuid = $1
              AND client_ip = $2
              AND action = $3
              AND created_at > now() - ($4 || ' seconds')::interval`,
      params: [scope.appUuid, scope.clientIp, action, String(windowSeconds)],
    }
  }

  if (scope.clientIp && !scope.namespaceUuid && !scope.deviceUuid) {
    return {
      sql: `SELECT COUNT(*)::text AS count, MIN(created_at) AS oldest_at
            FROM rate_limit_events
            WHERE client_ip = $1
              AND action = $2
              AND created_at > now() - ($3 || ' seconds')::interval`,
      params: [scope.clientIp, action, String(windowSeconds)],
    }
  }

  if (!scope.namespaceUuid) {
    throw new Error('Rate limit scope requires namespaceUuid, deviceUuid, appUuid+clientIp, or clientIp')
  }

  return {
    sql: `SELECT COUNT(*)::text AS count, MIN(created_at) AS oldest_at
          FROM rate_limit_events
          WHERE namespace_uuid = $1
            AND action = $2
            AND created_at > now() - ($3 || ' seconds')::interval`,
    params: [scope.namespaceUuid, action, String(windowSeconds)],
  }
}

function computeRetryAfterSeconds(oldestAt: Date | null, windowSeconds: number): number {
  if (!oldestAt) {
    return windowSeconds
  }

  return Math.max(1, Math.ceil((oldestAt.getTime() + windowSeconds * 1000 - Date.now()) / 1000))
}

async function queryRateLimitUsage(
  pool: DbPool,
  action: RateLimitAction,
  scope: RateLimitScope,
  windowSeconds: number,
): Promise<{ used: number; resetAfterSeconds: number }> {
  const query = buildRateLimitQuery(action, scope, windowSeconds)
  const result = await pool.query<{ count: string; oldest_at: Date | null }>(
    query.sql,
    query.params,
  )

  return {
    used: Number(result.rows[0]?.count ?? 0),
    resetAfterSeconds: computeRetryAfterSeconds(result.rows[0]?.oldest_at ?? null, windowSeconds),
  }
}

export async function getRateLimitStatus(
  pool: DbPool,
  config: ServerConfig,
  rule: RateLimitRule,
  scope: RateLimitScope,
): Promise<RateLimitQuota | null> {
  if (!config.limits.rateLimit.enabled) {
    return null
  }

  const { used, resetAfterSeconds } = await queryRateLimitUsage(
    pool,
    rule.action,
    scope,
    rule.windowSeconds,
  )

  return {
    action: rule.action,
    limit: rule.limit,
    remaining: Math.max(0, rule.limit - used),
    resetAfterSeconds,
    windowSeconds: rule.windowSeconds,
  }
}

export async function assertRateLimit(
  pool: DbPool,
  config: ServerConfig,
  input: {
    action: RateLimitAction
    limit: number
    windowSeconds: number
    message: string
    scope: RateLimitScope
  },
): Promise<void> {
  const status = await getRateLimitStatus(pool, config, input, input.scope)
  if (!status || status.remaining > 0) {
    return
  }

  throw new AppError(429, 'RATE_LIMIT_EXCEEDED', input.message, {
    retryAfterSeconds: status.resetAfterSeconds,
    action: input.action,
    rateLimit: status,
  })
}

export async function recordRateLimitEvent(
  pool: DbPool,
  action: RateLimitAction,
  scope: RateLimitScope,
): Promise<void> {
  await pool.query(
    `INSERT INTO rate_limit_events (namespace_uuid, device_uuid, client_ip, app_uuid, action)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      scope.namespaceUuid ?? null,
      scope.deviceUuid ?? null,
      scope.clientIp ?? null,
      scope.appUuid ?? null,
      action,
    ],
  )
}

export interface RateLimitRule {
  action: RateLimitAction
  limit: number
  windowSeconds: number
  message: string
  source?: string
}

export function getRecoverRateLimitRule(config: ServerConfig): RateLimitRule {
  return {
    action: RATE_LIMIT_ACTION.recover,
    limit: config.limits.rateLimit.recoverPerHour,
    windowSeconds: 3600,
    message: 'Recovery rate limit exceeded',
  }
}

export function getPairDeviceRateLimitRule(config: ServerConfig): RateLimitRule {
  return {
    action: RATE_LIMIT_ACTION.pairDevice,
    limit: config.limits.rateLimit.pairingPerHour,
    windowSeconds: 3600,
    message: 'Pairing rate limit exceeded',
  }
}

export function getPairingTokenRateLimitRule(config: ServerConfig): RateLimitRule {
  return {
    action: RATE_LIMIT_ACTION.pairingToken,
    limit: config.limits.rateLimit.pairingTokensPerHour,
    windowSeconds: 3600,
    message: 'Pairing token rate limit exceeded',
  }
}

export function getPutDocumentRateLimitRule(config: ServerConfig): RateLimitRule {
  return {
    action: RATE_LIMIT_ACTION.putDocument,
    limit: config.limits.rateLimit.pushPerHourPerDevice,
    windowSeconds: 3600,
    message: 'Document PUT rate limit exceeded',
  }
}

export function getGlobalIpRateLimitRule(config: ServerConfig): RateLimitRule {
  return {
    action: RATE_LIMIT_ACTION.globalIp,
    limit: config.limits.rateLimit.generalPerMinutePerIp,
    windowSeconds: 60,
    message: 'Request rate limit exceeded',
  }
}

export function getDeveloperAuthMailIpRateLimitRule(config: ServerConfig): RateLimitRule {
  return {
    action: RATE_LIMIT_ACTION.developerAuthMail,
    limit: config.limits.rateLimit.developerAuthMailPerHourPerIp,
    windowSeconds: 3600,
    message: 'Developer auth mail rate limit exceeded',
  }
}

export async function assertRecoverRateLimit(
  pool: DbPool,
  config: ServerConfig,
  namespaceUuid: string,
): Promise<void> {
  const rule = getRecoverRateLimitRule(config)
  await assertRateLimit(pool, config, {
    ...rule,
    scope: { namespaceUuid },
  })
}

export async function recordRecoverAttempt(pool: DbPool, namespaceUuid: string): Promise<void> {
  await recordRateLimitEvent(pool, RATE_LIMIT_ACTION.recover, { namespaceUuid })
}

export async function enforceRateLimit(
  pool: DbPool,
  config: ServerConfig,
  rule: RateLimitRule,
  scope: RateLimitScope,
): Promise<RateLimitQuota | null> {
  const status = await getRateLimitStatus(pool, config, rule, scope)
  if (!status) {
    return null
  }

  if (status.remaining <= 0) {
    throw new AppError(429, 'RATE_LIMIT_EXCEEDED', rule.message, {
      retryAfterSeconds: status.resetAfterSeconds,
      action: rule.action,
      rateLimit: status,
      ...(rule.source ? { effectiveLimitSource: rule.source } : {}),
    })
  }

  await recordRateLimitEvent(pool, rule.action, scope)

  return {
    ...status,
    remaining: status.remaining - 1,
  }
}
