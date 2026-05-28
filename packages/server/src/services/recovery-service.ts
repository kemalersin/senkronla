import { verifyStoredRecoveryProof, type RecoveryKeyProof } from '@senkronla/protocol'
import { ulid } from 'ulid'
import type { ServerConfig } from '../config/schema.js'
import type { DbPool } from '../db/pool.js'
import { AppError } from '../errors/app-error.js'
import { generateDeviceToken, hashDeviceToken } from '../lib/crypto.js'
import { buildLimitsResponse, getLimitsForNamespace } from './slot-service.js'
import { enforceRateLimit, getRecoverRateLimitRule, type RateLimitQuota } from './rate-limit-service.js'
import type { NamespaceRow } from '../types/db.js'

export interface RecoverNamespaceInput {
  recoveryKeyProof: RecoveryKeyProof
  deviceLabel: string
  clientDeviceId: string
}

export interface RecoverNamespaceResult {
  deviceToken: string
  deviceId: string
  revokedDeviceCount: number
  limits: ReturnType<typeof buildLimitsResponse>
  rateLimit?: RateLimitQuota | null
}

function assertRecoveryProof(namespace: NamespaceRow, proof: RecoveryKeyProof): void {
  const valid = verifyStoredRecoveryProof(
    namespace.recovery_salt,
    namespace.recovery_hash,
    proof,
  )

  if (!valid) {
    throw new AppError(401, 'RECOVERY_INVALID', 'Recovery proof could not be verified')
  }
}

export async function recoverNamespace(
  pool: DbPool,
  config: ServerConfig,
  namespace: NamespaceRow,
  input: RecoverNamespaceInput,
): Promise<RecoverNamespaceResult> {
  const recoverRateLimit = await enforceRateLimit(pool, config, getRecoverRateLimitRule(config), {
    namespaceUuid: namespace.id,
  })
  assertRecoveryProof(namespace, input.recoveryKeyProof)

  const deviceToken = generateDeviceToken()
  const tokenHash = hashDeviceToken(deviceToken)
  const devicePublicId = ulid()

  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const activeDevices = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM devices
       WHERE namespace_uuid = $1 AND revoked_at IS NULL`,
      [namespace.id],
    )
    const revokedDeviceCount = Number(activeDevices.rows[0]?.count ?? 0)

    await client.query(
      `UPDATE devices
       SET revoked_at = now()
       WHERE namespace_uuid = $1 AND revoked_at IS NULL`,
      [namespace.id],
    )

    await client.query(
      `UPDATE pairing_tokens
       SET redeemed_at = now()
       WHERE namespace_uuid = $1 AND redeemed_at IS NULL`,
      [namespace.id],
    )

    await client.query(
      `INSERT INTO devices (
         namespace_uuid, device_id, client_device_id, label, token_hash, is_host
       ) VALUES ($1, $2, $3, $4, $5, true)`,
      [namespace.id, devicePublicId, input.clientDeviceId, input.deviceLabel, tokenHash],
    )

    await client.query('COMMIT')

    const limits = await getLimitsForNamespace(
      pool,
      namespace.id,
      namespace.free_device_limit,
      namespace.purchased_slots,
    )

    return {
      deviceToken,
      deviceId: devicePublicId,
      revokedDeviceCount,
      limits: buildLimitsResponse(config, limits),
      rateLimit: recoverRateLimit,
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
