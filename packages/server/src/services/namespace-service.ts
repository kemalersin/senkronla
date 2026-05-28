import { isValidNamespaceId } from '@senkronla/protocol'
import { ulid } from 'ulid'
import type { ServerConfig } from '../config/schema.js'
import type { DbPool } from '../db/pool.js'
import { AppError } from '../errors/app-error.js'
import { generateDeviceToken, hashDeviceToken } from '../lib/crypto.js'
import { buildLimitsResponse, getLimitsForNamespace } from './slot-service.js'
import type { DocumentHeadRow, NamespaceRow } from '../types/db.js'

export interface CreateNamespaceInput {
  namespaceId: string
  namespaceLabel: string
  recoverySalt: string
  recoveryHash: string
  deviceLabel: string
  clientDeviceId: string
}

export interface CreateNamespaceResult {
  namespaceId: string
  deviceToken: string
  deviceId: string
  limits: ReturnType<typeof buildLimitsResponse>
}

export async function findNamespaceByPublicId(
  pool: DbPool,
  namespaceId: string,
): Promise<NamespaceRow | null> {
  const result = await pool.query<NamespaceRow>(
    `SELECT id, namespace_id, namespace_label, free_device_limit, purchased_slots,
            recovery_salt, recovery_hash, created_at, updated_at
     FROM namespaces
     WHERE namespace_id = $1`,
    [namespaceId],
  )

  return result.rows[0] ?? null
}

export async function getDocumentHead(
  pool: DbPool,
  namespaceUuid: string,
): Promise<DocumentHeadRow | null> {
  const result = await pool.query<DocumentHeadRow>(
    `SELECT revision, written_at, writer_device_id, content_sha256, content_magic, size_bytes, blob_key
     FROM document_heads
     WHERE namespace_uuid = $1 AND document_id = 'primary'`,
    [namespaceUuid],
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

  const existing = await findNamespaceByPublicId(pool, input.namespaceId)
  if (existing) {
    throw new AppError(409, 'NAMESPACE_EXISTS', 'Namespace already exists')
  }

  const deviceToken = generateDeviceToken()
  const tokenHash = hashDeviceToken(deviceToken)
  const devicePublicId = ulid()

  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const namespaceResult = await client.query<NamespaceRow>(
      `INSERT INTO namespaces (
         namespace_id, namespace_label, free_device_limit, purchased_slots,
         recovery_salt, recovery_hash
       ) VALUES ($1, $2, $3, 0, $4, $5)
       RETURNING id, namespace_id, namespace_label, free_device_limit, purchased_slots,
                 recovery_salt, recovery_hash, created_at, updated_at`,
      [
        input.namespaceId,
        input.namespaceLabel,
        config.limits.defaultFreeDeviceLimit,
        input.recoverySalt,
        input.recoveryHash,
      ],
    )

    const namespace = namespaceResult.rows[0]
    if (!namespace) {
      throw new AppError(500, 'INTERNAL_ERROR', 'Failed to create namespace')
    }

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
      namespaceId: namespace.namespace_id,
      deviceToken,
      deviceId: devicePublicId,
      limits: buildLimitsResponse(config, limits),
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function getNamespaceInfo(
  pool: DbPool,
  config: ServerConfig,
  namespace: NamespaceRow,
) {
  const limits = await getLimitsForNamespace(
    pool,
    namespace.id,
    namespace.free_device_limit,
    namespace.purchased_slots,
  )

  const head = await getDocumentHead(pool, namespace.id)

  return {
    namespaceId: namespace.namespace_id,
    namespaceLabel: namespace.namespace_label,
    limits: buildLimitsResponse(config, limits),
    head: head
      ? {
          revision: head.revision,
          writtenAt: head.written_at.toISOString(),
          deviceId: head.writer_device_id,
          contentSha256: head.content_sha256,
          contentMagic: head.content_magic,
          sizeBytes: Number(head.size_bytes),
        }
      : null,
    lastSyncAt: head?.written_at.toISOString() ?? null,
  }
}
