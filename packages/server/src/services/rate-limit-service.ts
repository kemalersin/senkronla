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

/** Longest rate-limit window (namespace_create per day) + buffer for bucket retention. */
const USAGE_BUCKET_RETENTION_SECONDS = 90_000

type ScopeQuery = { whereSql: string; params: (string | null)[] }

function buildScopeQuery(action: RateLimitAction, scope: RateLimitScope): ScopeQuery {
  if (scope.deviceUuid) {
    return {
      whereSql: 'device_uuid = $1 AND action = $2',
      params: [scope.deviceUuid, action],
    }
  }

  if (scope.appUuid && scope.clientIp) {
    return {
      whereSql: 'app_uuid = $1 AND client_ip = $2 AND action = $3',
      params: [scope.appUuid, scope.clientIp, action],
    }
  }

  if (scope.clientIp && !scope.namespaceUuid && !scope.deviceUuid) {
    return {
      whereSql: 'client_ip = $1 AND action = $2',
      params: [scope.clientIp, action],
    }
  }

  if (!scope.namespaceUuid) {
    throw new Error('Rate limit scope requires namespaceUuid, deviceUuid, appUuid+clientIp, or clientIp')
  }

  return {
    whereSql: 'namespace_uuid = $1 AND action = $2',
    params: [scope.namespaceUuid, action],
  }
}

function computeRetryAfterSeconds(oldestAt: Date | null, windowSeconds: number): number {
  if (!oldestAt) {
    return windowSeconds
  }

  return Math.max(1, Math.ceil((oldestAt.getTime() + windowSeconds * 1000 - Date.now()) / 1000))
}

async function queryBucketUsage(
  pool: DbPool,
  action: RateLimitAction,
  scope: RateLimitScope,
  windowSeconds: number,
): Promise<{ used: number; resetAfterSeconds: number }> {
  const scopeQuery = buildScopeQuery(action, scope)
  const windowParamIndex = scopeQuery.params.length + 1

  const result = await pool.query<{ count: string; oldest_at: Date | null }>(
    `SELECT COALESCE(SUM(hit_count), 0)::text AS count, MIN(bucket_at) AS oldest_at
     FROM rate_limit_usage_buckets
     WHERE ${scopeQuery.whereSql}
       AND bucket_at > now() - ($${windowParamIndex} || ' seconds')::interval`,
    [...scopeQuery.params, String(windowSeconds)],
  )

  return {
    used: Number(result.rows[0]?.count ?? 0),
    resetAfterSeconds: computeRetryAfterSeconds(result.rows[0]?.oldest_at ?? null, windowSeconds),
  }
}

async function incrementUsageBucket(
  pool: DbPool,
  action: RateLimitAction,
  scope: RateLimitScope,
): Promise<void> {
  await pool.query(
    `INSERT INTO rate_limit_usage_buckets (
       action, namespace_uuid, device_uuid, client_ip, app_uuid, bucket_at, hit_count
     ) VALUES ($1, $2, $3, $4, $5, date_trunc('minute', now()), 1)
     ON CONFLICT (
       action, namespace_uuid, device_uuid, client_ip, app_uuid, bucket_at
     )
     DO UPDATE SET hit_count = rate_limit_usage_buckets.hit_count + 1`,
    [
      action,
      scope.namespaceUuid ?? null,
      scope.deviceUuid ?? null,
      scope.clientIp ?? null,
      scope.appUuid ?? null,
    ],
  )
}

let lastUsageBucketPurgeAt = 0

export async function purgeStaleRateLimitUsageBuckets(pool: DbPool): Promise<number> {
  const result = await pool.query(
    `DELETE FROM rate_limit_usage_buckets
     WHERE bucket_at < now() - ($1 || ' seconds')::interval`,
    [String(USAGE_BUCKET_RETENTION_SECONDS)],
  )

  return result.rowCount ?? 0
}

async function maybePurgeStaleUsageBuckets(pool: DbPool): Promise<void> {
  const now = Date.now()
  if (now - lastUsageBucketPurgeAt < 60_000) {
    return
  }

  lastUsageBucketPurgeAt = now
  await purgeStaleRateLimitUsageBuckets(pool)
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

  const { used, resetAfterSeconds } = await queryBucketUsage(
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

  await recordRateLimitViolation(pool, input.action, input.scope)

  throw new AppError(429, 'RATE_LIMIT_EXCEEDED', input.message, {
    retryAfterSeconds: status.resetAfterSeconds,
    action: input.action,
    rateLimit: status,
  })
}

export async function recordRateLimitViolation(
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

/** @deprecated Use recordRateLimitViolation — kept for tests importing the old name. */
export const recordRateLimitEvent = recordRateLimitViolation

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
    await recordRateLimitViolation(pool, rule.action, scope)
    throw new AppError(429, 'RATE_LIMIT_EXCEEDED', rule.message, {
      retryAfterSeconds: status.resetAfterSeconds,
      action: rule.action,
      rateLimit: status,
      ...(rule.source ? { effectiveLimitSource: rule.source } : {}),
    })
  }

  await incrementUsageBucket(pool, rule.action, scope)
  void maybePurgeStaleUsageBuckets(pool)

  return {
    ...status,
    remaining: status.remaining - 1,
  }
}
