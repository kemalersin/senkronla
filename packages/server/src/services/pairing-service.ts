import type { ServerConfig } from '../config/schema.js'
import type { DbPool } from '../db/pool.js'
import { generatePairingCode, hashPairingCode } from '../lib/crypto.js'
import { loadLimitContext } from './limit-context-loader.js'
import { resolveRateLimitRule } from './limit-resolution-service.js'
import {
  enforceRateLimit,
  RATE_LIMIT_ACTION,
  type RateLimitQuota,
} from './rate-limit-service.js'
import { assertCanAddDevice, getLimitsForNamespace } from './slot-service.js'
import type { NamespaceRow } from '../types/db.js'
import { assertPairingAppAllowed, normalizeAllowedAppIds } from './pairing-scope-service.js'

export interface CreatePairingTokenInput {
  ttlSeconds?: number
  allowedAppIds?: string[]
}

export interface CreatePairingTokenResult {
  code: string
  expiresAt: string
  qrPayload: string
  allowedAppIds?: string[]
  rateLimit?: RateLimitQuota | null
}

export async function createPairingToken(
  pool: DbPool,
  config: ServerConfig,
  namespace: NamespaceRow,
  hostLabel: string,
  input: CreatePairingTokenInput = {},
  clientIp?: string | null,
): Promise<CreatePairingTokenResult> {
  const ctx = await loadLimitContext(pool, { namespace })
  const pairingRule = resolveRateLimitRule(RATE_LIMIT_ACTION.pairingToken, ctx, config)
  const pairingTokenRateLimit = await enforceRateLimit(pool, config, pairingRule, {
    namespaceUuid: namespace.id,
    clientIp,
  })

  const limits = await getLimitsForNamespace(pool, config, ctx)

  assertCanAddDevice(config, limits)

  const allowedAppIds = config.apps.enabled
    ? await normalizeAllowedAppIds(pool, input.allowedAppIds)
    : null

  const ttlSeconds = Math.min(
    input.ttlSeconds ?? config.pairing.codeTtlSeconds,
    config.pairing.maxTtlSeconds,
  )

  const code = generatePairingCode()
  const codeHash = hashPairingCode(code, namespace.namespace_id)
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000)

  await pool.query(
    `INSERT INTO pairing_tokens (namespace_uuid, code_hash, expires_at, allowed_app_ids)
     VALUES ($1, $2, $3, $4)`,
    [namespace.id, codeHash, expiresAt.toISOString(), allowedAppIds],
  )

  const expUnix = Math.floor(expiresAt.getTime() / 1000)
  const qrPayload = allowedAppIds?.length
    ? `esr://pair/v1/${namespace.namespace_id}?code=${code}&exp=${expUnix}&host=${encodeURIComponent(hostLabel)}&apps=${encodeURIComponent(allowedAppIds.join(','))}`
    : `esr://pair/v1/${namespace.namespace_id}?code=${code}&exp=${expUnix}&host=${encodeURIComponent(hostLabel)}`

  return {
    code,
    expiresAt: expiresAt.toISOString(),
    qrPayload,
    ...(allowedAppIds ? { allowedAppIds } : {}),
    rateLimit: pairingTokenRateLimit,
  }
}
