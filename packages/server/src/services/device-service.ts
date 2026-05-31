import { ulid } from 'ulid'
import type { ServerConfig } from '../config/schema.js'
import type { DbPool } from '../db/pool.js'
import { AppError } from '../errors/app-error.js'
import { generateDeviceToken, hashDeviceToken, hashPairingCode } from '../lib/crypto.js'
import { loadLimitContext } from './limit-context-loader.js'
import { resolveRateLimitRule } from './limit-resolution-service.js'
import {
  enforceRateLimit,
  RATE_LIMIT_ACTION,
  type RateLimitQuota,
} from './rate-limit-service.js'
import {
  assertCanAddDevice,
  buildLimitsResponse,
  getLimitsForNamespace,
  loadNamespaceLimits,
} from './slot-service.js'
import type { AppAuthContext } from './app-registry-service.js'
import { assertPairingAppAllowed } from './pairing-scope-service.js'
import type { DeviceRow, NamespaceRow } from '../types/db.js'

export async function findDeviceByTokenHash(
  pool: DbPool,
  namespaceId: string,
  tokenHash: string,
): Promise<(DeviceRow & { namespace_id: string }) | null> {
  const result = await pool.query<DeviceRow & { namespace_id: string }>(
    `SELECT d.id, d.namespace_uuid, d.device_id, d.client_device_id, d.label, d.token_hash,
            d.is_host, d.paired_at, d.last_seen_at, d.revoked_at, n.namespace_id
     FROM devices d
     INNER JOIN namespaces n ON n.id = d.namespace_uuid
     WHERE n.namespace_id = $1
       AND d.token_hash = $2
       AND d.revoked_at IS NULL`,
    [namespaceId, tokenHash],
  )

  return result.rows[0] ?? null
}

export async function listDevices(
  pool: DbPool,
  config: ServerConfig,
  namespace: NamespaceRow,
  currentDeviceUuid: string,
) {
  const result = await pool.query<DeviceRow>(
    `SELECT id, namespace_uuid, device_id, client_device_id, label, token_hash,
            is_host, paired_at, last_seen_at, revoked_at
     FROM devices
     WHERE namespace_uuid = $1 AND revoked_at IS NULL
     ORDER BY paired_at ASC`,
    [namespace.id],
  )

  const limits = await loadNamespaceLimits(pool, config, namespace)

  return {
    devices: result.rows.map((device) => ({
      deviceId: device.device_id ?? device.id,
      clientDeviceId: device.client_device_id,
      label: device.label,
      pairedAt: device.paired_at.toISOString(),
      lastSeenAt: device.last_seen_at?.toISOString() ?? null,
      isCurrent: device.id === currentDeviceUuid,
    })),
    limits: buildLimitsResponse(config, limits),
  }
}

export async function revokeDevice(
  pool: DbPool,
  namespace: NamespaceRow,
  devicePublicId: string,
): Promise<void> {
  const activeCount = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM devices
     WHERE namespace_uuid = $1 AND revoked_at IS NULL`,
    [namespace.id],
  )

  if (Number(activeCount.rows[0]?.count ?? 0) <= 1) {
    throw new AppError(403, 'LAST_DEVICE_PROTECTED', 'The last device cannot be removed')
  }

  const result = await pool.query(
    `UPDATE devices
     SET revoked_at = now()
     WHERE namespace_uuid = $1
       AND device_id = $2
       AND revoked_at IS NULL`,
    [namespace.id, devicePublicId],
  )

  if (result.rowCount === 0) {
    throw new AppError(404, 'DEVICE_NOT_FOUND', 'Device not found')
  }
}

export interface PairDeviceInput {
  pairingCode: string
  deviceLabel: string
  clientDeviceId: string
}

export interface PairDeviceResult {
  deviceToken: string
  deviceId: string
  limits: ReturnType<typeof buildLimitsResponse>
  rateLimit?: RateLimitQuota | null
}

export async function pairDeviceWithCode(
  pool: DbPool,
  config: ServerConfig,
  namespace: NamespaceRow,
  input: PairDeviceInput,
  appAuth?: AppAuthContext | null,
): Promise<PairDeviceResult> {
  const ctx = await loadLimitContext(pool, {
    namespace,
    appUuid: appAuth?.appUuid ?? null,
    appId: appAuth?.appId ?? null,
  })
  const pairRule = resolveRateLimitRule(RATE_LIMIT_ACTION.pairDevice, ctx, config)
  const pairRateLimit = await enforceRateLimit(pool, config, pairRule, {
    namespaceUuid: namespace.id,
  })

  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const limits = await getLimitsForNamespace(client, config, ctx)

    const existingDevice = await client.query<DeviceRow>(
      `SELECT id, namespace_uuid, device_id, client_device_id, label, token_hash,
              is_host, paired_at, last_seen_at, revoked_at
       FROM devices
       WHERE namespace_uuid = $1
         AND client_device_id = $2
         AND revoked_at IS NULL
       FOR UPDATE`,
      [namespace.id, input.clientDeviceId],
    )

    const isRePair = existingDevice.rows.length > 0

    if (!isRePair) {
      assertCanAddDevice(config, limits)
    } else {
      await client.query(
        `UPDATE devices SET revoked_at = now()
         WHERE namespace_uuid = $1 AND client_device_id = $2 AND revoked_at IS NULL`,
        [namespace.id, input.clientDeviceId],
      )
    }

    const codeHash = hashPairingCode(input.pairingCode, namespace.namespace_id)
    const tokenResult = await client.query<{ id: string; allowed_app_ids: string[] | null }>(
      `UPDATE pairing_tokens
       SET redeemed_at = now()
       WHERE namespace_uuid = $1
         AND code_hash = $2
         AND redeemed_at IS NULL
         AND expires_at > now()
       RETURNING id, allowed_app_ids`,
      [namespace.id, codeHash],
    )

    if (tokenResult.rowCount === 0) {
      throw new AppError(400, 'PAIRING_CODE_INVALID', 'Pairing code is invalid, expired, or already used')
    }

    if (config.apps.enabled && config.apps.requireRegistration) {
      assertPairingAppAllowed(tokenResult.rows[0]?.allowed_app_ids ?? null, appAuth?.appId)
    }

    const deviceToken = generateDeviceToken()
    const tokenHash = hashDeviceToken(deviceToken)
    const devicePublicId = ulid()

    await client.query(
      `INSERT INTO devices (
         namespace_uuid, device_id, client_device_id, label, token_hash, is_host
       ) VALUES ($1, $2, $3, $4, $5, false)`,
      [namespace.id, devicePublicId, input.clientDeviceId, input.deviceLabel, tokenHash],
    )

    await client.query('COMMIT')

    const updatedLimits = await getLimitsForNamespace(pool, config, ctx)

    return {
      deviceToken,
      deviceId: devicePublicId,
      limits: buildLimitsResponse(config, updatedLimits),
      rateLimit: pairRateLimit,
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
