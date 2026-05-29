import type { ServerConfig } from '../config/schema.js'
import type { DbPool } from '../db/pool.js'
import { generatePairingCode, hashPairingCode } from '../lib/crypto.js'
import {
  enforceRateLimit,
  getPairingTokenRateLimitRule,
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
): Promise<CreatePairingTokenResult> {
  const pairingTokenRateLimit = await enforceRateLimit(pool, config, getPairingTokenRateLimitRule(config), {
    namespaceUuid: namespace.id,
  })

  const limits = await getLimitsForNamespace(
    pool,
    namespace.id,
    namespace.free_device_limit,
    namespace.purchased_slots,
  )

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
