import { isValidNamespaceId } from '@senkronla/protocol'
import { ulid } from 'ulid'
import type { ServerConfig } from '../config/schema.js'
import type { DbPool } from '../db/pool.js'
import { AppError } from '../errors/app-error.js'
import { generateDeviceToken, hashDeviceToken } from '../lib/crypto.js'
import { loadLimitContext } from './limit-context-loader.js'
import { resolveRateLimitRule } from './limit-resolution-service.js'
import {
  assertRateLimit,
  getRateLimitStatus,
  recordRateLimitUsage,
  RATE_LIMIT_ACTION,
  type RateLimitQuota,
  type RateLimitRule,
} from './rate-limit-service.js'
import { buildLimitsResponse, loadNamespaceLimits } from './slot-service.js'
import type { NamespaceRow } from '../types/db.js'
import { getDocumentHeadMeta, listDocumentHeads } from './document-service.js'

export interface CreateNamespaceInput {
  namespaceId: string
  namespaceLabel: string
  recoverySalt: string
  recoveryHash: string
  deviceLabel: string
  clientDeviceId: string
  appUuid?: string | null
  appId?: string | null
  clientIp?: string | null
}

export interface CreateNamespaceResult {
  namespaceId: string
  appId?: string
  deviceToken: string
  deviceId: string
  limits: ReturnType<typeof buildLimitsResponse>
  rateLimit?: RateLimitQuota | null
}

export async function findNamespaceByPublicId(
  pool: DbPool,
  namespaceId: string,
): Promise<NamespaceRow | null> {
  const result = await pool.query<NamespaceRow>(
    `SELECT id, namespace_id, namespace_label, free_device_limit, purchased_slots,
            recovery_salt, recovery_hash, app_uuid, limit_overrides, created_at, updated_at
     FROM namespaces
     WHERE namespace_id = $1`,
    [namespaceId],
  )

  return result.rows[0] ?? null
}

export async function createNamespace(
  pool: DbPool,
  config: ServerConfig,
  input: CreateNamespaceInput,
): Promise<CreateNamespaceResult> {
  if (!isValidNamespaceId(input.namespaceId)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'namespaceId must be a UUID v4', {
      fields: [{ path: 'namespaceId', message: 'Invalid UUID v4' }],
    })
  }

  if (config.apps.enabled && !input.appUuid) {
    throw new AppError(400, 'APP_ID_REQUIRED', 'Application context is required to create a namespace')
  }

  const existing = await findNamespaceByPublicId(pool, input.namespaceId)
  if (existing) {
    throw new AppError(409, 'NAMESPACE_EXISTS', 'Namespace already exists')
  }

  let namespaceCreateRule: RateLimitRule | null = null
  const usageScope =
    input.appUuid && input.clientIp
      ? { appUuid: input.appUuid, clientIp: input.clientIp }
      : null

  if (usageScope) {
    const ctx = await loadLimitContext(pool, { appUuid: input.appUuid!, appId: input.appId ?? null })
    namespaceCreateRule = resolveRateLimitRule(RATE_LIMIT_ACTION.namespaceCreate, ctx, config)
    await assertRateLimit(pool, config, { ...namespaceCreateRule, scope: usageScope })
  }

  const deviceToken = generateDeviceToken()
  const tokenHash = hashDeviceToken(deviceToken)
  const devicePublicId = ulid()

  const client = await pool.connect()
  let hostDeviceUuid: string | null = null
  let namespace: NamespaceRow | null = null

  try {
    await client.query('BEGIN')

    const namespaceResult = await client.query<NamespaceRow>(
      `INSERT INTO namespaces (
         namespace_id, namespace_label, free_device_limit, purchased_slots,
         recovery_salt, recovery_hash, app_uuid
       ) VALUES ($1, $2, $3, 0, $4, $5, $6)
       RETURNING id, namespace_id, namespace_label, free_device_limit, purchased_slots,
                 recovery_salt, recovery_hash, app_uuid, limit_overrides, created_at, updated_at`,
      [
        input.namespaceId,
        input.namespaceLabel,
        config.limits.defaultFreeDeviceLimit,
        input.recoverySalt,
        input.recoveryHash,
        input.appUuid ?? null,
      ],
    )

    const createdNamespace = namespaceResult.rows[0]
    if (!createdNamespace) {
      throw new AppError(500, 'INTERNAL_ERROR', 'Failed to create namespace')
    }

    namespace = createdNamespace

    const deviceResult = await client.query<{ id: string }>(
      `INSERT INTO devices (
         namespace_uuid, device_id, client_device_id, label, token_hash, is_host
       ) VALUES ($1, $2, $3, $4, $5, true)
       RETURNING id`,
      [createdNamespace.id, devicePublicId, input.clientDeviceId, input.deviceLabel, tokenHash],
    )

    hostDeviceUuid = deviceResult.rows[0]?.id ?? null
    if (!hostDeviceUuid) {
      throw new AppError(500, 'INTERNAL_ERROR', 'Failed to create host device')
    }

    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    if (usageScope) {
      await recordRateLimitUsage(pool, RATE_LIMIT_ACTION.namespaceCreate, usageScope)
    }
    throw error
  } finally {
    client.release()
  }

  let namespaceCreateRateLimit: RateLimitQuota | null = null
  if (usageScope && namespaceCreateRule && namespace) {
    await recordRateLimitUsage(pool, RATE_LIMIT_ACTION.namespaceCreate, {
      ...usageScope,
      namespaceUuid: namespace.id,
      deviceUuid: hostDeviceUuid,
    })
    namespaceCreateRateLimit = await getRateLimitStatus(pool, config, namespaceCreateRule, usageScope)
  }

  const limits = await loadNamespaceLimits(pool, config, namespace!, {
    appUuid: input.appUuid ?? null,
    appId: input.appId ?? null,
  })

  return {
    namespaceId: namespace!.namespace_id,
    ...(input.appId ? { appId: input.appId } : {}),
    deviceToken,
    deviceId: devicePublicId,
    limits: buildLimitsResponse(config, limits),
    rateLimit: namespaceCreateRateLimit,
  }
}

export async function getNamespaceInfo(
  pool: DbPool,
  config: ServerConfig,
  namespace: NamespaceRow,
) {
  const limits = await loadNamespaceLimits(pool, config, namespace)

  const documents = await listDocumentHeads(pool, namespace.id)
  const primaryHead = await getDocumentHeadMeta(pool, namespace.id, 'primary')

  return {
    namespaceId: namespace.namespace_id,
    namespaceLabel: namespace.namespace_label,
    limits: buildLimitsResponse(config, limits),
    head: primaryHead
      ? {
          revision: primaryHead.revision,
          writtenAt: primaryHead.written_at.toISOString(),
          deviceId: primaryHead.writer_device_id,
          contentSha256: primaryHead.content_sha256,
          contentMagic: primaryHead.content_magic,
          sizeBytes: Number(primaryHead.size_bytes),
        }
      : null,
    documents,
    lastSyncAt: primaryHead?.written_at.toISOString() ?? documents[0]?.writtenAt ?? null,
  }
}
