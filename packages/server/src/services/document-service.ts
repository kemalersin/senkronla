import {
  isValidDocumentId,
  parseEnvelope,
  verifyEnvelope,
  type EsrDocEnvelope,
} from '@senkronla/protocol'
import type { ServerConfig } from '../config/schema.js'
import type { DbPool, DbQueryable } from '../db/pool.js'
import { AppError } from '../errors/app-error.js'
import { buildBlobKey, readBlob, writeBlob } from '../blob/store.js'
import {
  applyRevisionRetention,
  insertDocumentRevision,
} from './revision-retention-service.js'
import { loadLimitContext } from './limit-context-loader.js'
import { resolveRateLimitRule } from './limit-resolution-service.js'
import {
  enforceRateLimit,
  RATE_LIMIT_ACTION,
} from './rate-limit-service.js'
import type { DeviceAuthContext } from '../types/context.js'
import type { NamespaceRow } from '../types/db.js'
import type { DocumentHeadListItem, DocumentHeadRow } from '../types/document.js'
import { toDocumentHeadListItem, toDocumentHeadMeta } from '../types/document.js'

export interface PushDocumentInput {
  expectedRevision?: string | null
  envelope: unknown
}

import type { RateLimitQuota } from './rate-limit-service.js'

export interface PushDocumentResult {
  revision: string
  writtenAt: string
  contentSha256: string
  writerDeviceId: string
  rateLimit?: RateLimitQuota | null
}

function envelopeByteSize(envelope: EsrDocEnvelope): number {
  return Buffer.byteLength(JSON.stringify(envelope), 'utf8')
}

export function assertValidDocumentIdParam(documentId: string): void {
  if (!isValidDocumentId(documentId)) {
    throw new AppError(400, 'INVALID_DOCUMENT_ID', 'documentId format is invalid', {
      documentId,
    })
  }
}

function assertDocumentIdAllowed(config: ServerConfig, documentId: string): void {
  const allowed = config.sync.allowedDocumentIds
  if (allowed.length === 0) {
    return
  }

  if (!allowed.includes(documentId)) {
    throw new AppError(403, 'DOCUMENT_ID_NOT_ALLOWED', 'documentId is not allowed by server policy', {
      documentId,
      allowedDocumentIds: allowed,
    })
  }
}

function assertContentTypeAllowed(config: ServerConfig, contentType: string): void {
  const allowed = config.sync.allowedContentTypes
  if (allowed.length === 0) return

  if (!allowed.includes(contentType)) {
    throw new AppError(403, 'CONTENT_TYPE_NOT_ALLOWED', 'Content type is not allowed by server policy', {
      contentType,
      allowedContentTypes: allowed,
    })
  }
}

function assertEnvelopeDocumentPolicy(envelope: EsrDocEnvelope, documentId: string): void {
  if (envelope.schemaVersion === 1 && envelope.documentId !== 'primary') {
    throw new AppError(422, 'ENVELOPE_INVALID', 'schemaVersion 1 requires documentId primary', {
      reason: 'schemaVersion 1 documentId mismatch',
    })
  }

  if (envelope.documentId !== documentId) {
    throw new AppError(422, 'ENVELOPE_DOCUMENT_MISMATCH', 'Envelope documentId does not match path', {
      pathDocumentId: documentId,
      envelopeDocumentId: envelope.documentId,
    })
  }
}

function validateEnvelopeForPush(
  config: ServerConfig,
  namespaceId: string,
  documentId: string,
  envelopeInput: unknown,
): EsrDocEnvelope {
  assertValidDocumentIdParam(documentId)
  assertDocumentIdAllowed(config, documentId)

  let envelope: EsrDocEnvelope

  try {
    envelope = parseEnvelope(envelopeInput)
  } catch {
    throw new AppError(422, 'ENVELOPE_INVALID', 'Envelope failed schema validation', {
      reason: 'schema validation failed',
    })
  }

  assertEnvelopeDocumentPolicy(envelope, documentId)

  const verification = verifyEnvelope(envelope, {
    namespaceId,
    documentId,
  })

  if (!verification.ok) {
    throw new AppError(422, 'ENVELOPE_INVALID', 'Envelope integrity validation failed', {
      reason: verification.reason,
    })
  }

  assertContentTypeAllowed(config, envelope.contentType)

  const sizeBytes = envelopeByteSize(envelope)
  if (sizeBytes > config.sync.maxEnvelopeBytes) {
    throw new AppError(413, 'ENVELOPE_TOO_LARGE', 'Envelope exceeds maximum allowed size', {
      maxBytes: config.sync.maxEnvelopeBytes,
      actualBytes: sizeBytes,
    })
  }

  return envelope
}

async function getHeadForUpdate(
  client: DbQueryable,
  namespaceUuid: string,
  documentId: string,
): Promise<DocumentHeadRow | null> {
  const result = await client.query<DocumentHeadRow>(
    `SELECT namespace_uuid, document_id, revision, blob_key, content_sha256, content_magic,
            size_bytes, writer_device_id, written_at
     FROM document_heads
     WHERE namespace_uuid = $1 AND document_id = $2
     FOR UPDATE`,
    [namespaceUuid, documentId],
  )

  return result.rows[0] ?? null
}

async function countDocuments(client: DbQueryable, namespaceUuid: string): Promise<number> {
  const result = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM document_heads WHERE namespace_uuid = $1`,
    [namespaceUuid],
  )

  return Number(result.rows[0]?.count ?? 0)
}

async function assertDocumentLimit(
  client: DbQueryable,
  config: ServerConfig,
  namespaceUuid: string,
  documentId: string,
  isNewDocument: boolean,
): Promise<void> {
  const max = config.sync.maxDocumentsPerNamespace
  if (max === 0 || !isNewDocument) {
    return
  }

  const count = await countDocuments(client, namespaceUuid)
  if (count >= max) {
    throw new AppError(403, 'DOCUMENT_LIMIT_REACHED', 'Maximum documents per namespace reached', {
      maxDocumentsPerNamespace: max,
      documentId,
    })
  }
}

export async function listDocumentHeads(
  pool: DbQueryable,
  namespaceUuid: string,
): Promise<DocumentHeadListItem[]> {
  const result = await pool.query<DocumentHeadRow>(
    `SELECT namespace_uuid, document_id, revision, blob_key, content_sha256, content_magic,
            size_bytes, writer_device_id, written_at
     FROM document_heads
     WHERE namespace_uuid = $1
     ORDER BY document_id ASC`,
    [namespaceUuid],
  )

  return result.rows.map(toDocumentHeadListItem)
}

export async function getDocumentHeadMeta(
  pool: DbQueryable,
  namespaceUuid: string,
  documentId: string,
): Promise<DocumentHeadRow | null> {
  assertValidDocumentIdParam(documentId)

  const result = await pool.query<DocumentHeadRow>(
    `SELECT namespace_uuid, document_id, revision, blob_key, content_sha256, content_magic,
            size_bytes, writer_device_id, written_at
     FROM document_heads
     WHERE namespace_uuid = $1 AND document_id = $2`,
    [namespaceUuid, documentId],
  )

  return result.rows[0] ?? null
}

export async function getDocumentHeadEnvelope(
  blobRoot: string,
  head: DocumentHeadRow,
): Promise<EsrDocEnvelope> {
  const raw = await readBlob(blobRoot, head.blob_key)

  try {
    return parseEnvelope(JSON.parse(raw))
  } catch {
    throw new AppError(500, 'INTERNAL_ERROR', 'Stored envelope is corrupted')
  }
}

export async function pushDocument(
  pool: DbPool,
  config: ServerConfig,
  namespace: NamespaceRow,
  deviceAuth: DeviceAuthContext,
  documentId: string,
  input: PushDocumentInput,
): Promise<PushDocumentResult> {
  const ctx = await loadLimitContext(pool, { namespace })
  const pushRule = resolveRateLimitRule(RATE_LIMIT_ACTION.putDocument, ctx, config)
  const pushRateLimit = await enforceRateLimit(pool, config, pushRule, {
    deviceUuid: deviceAuth.deviceUuid,
  })

  const envelope = validateEnvelopeForPush(config, namespace.namespace_id, documentId, input.envelope)
  const serialized = JSON.stringify(envelope)
  const sizeBytes = Buffer.byteLength(serialized, 'utf8')

  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const currentHead = await getHeadForUpdate(client, namespace.id, documentId)
    const expectedRevision = input.expectedRevision ?? null

    if (!currentHead) {
      await assertDocumentLimit(client, config, namespace.id, documentId, true)

      if (expectedRevision) {
        throw new AppError(409, 'REVISION_CONFLICT', 'Remote revision differs from expected', {
          expectedRevision,
          actualRevision: null,
          remoteMeta: null,
        })
      }
    } else if (!expectedRevision || expectedRevision !== currentHead.revision) {
      throw new AppError(409, 'REVISION_CONFLICT', 'Remote revision differs from expected', {
        expectedRevision,
        actualRevision: currentHead.revision,
        remoteMeta: toDocumentHeadMeta(currentHead),
      })
    }

    if (currentHead && currentHead.revision === envelope.revision) {
      throw new AppError(409, 'REVISION_CONFLICT', 'Revision already exists', {
        expectedRevision,
        actualRevision: currentHead.revision,
        remoteMeta: toDocumentHeadMeta(currentHead),
      })
    }

    const blobKey = buildBlobKey(namespace.namespace_id, documentId, envelope.revision)

    await writeBlob(config.blob.filesystem.path, blobKey, serialized)

    await insertDocumentRevision(client, {
      namespaceUuid: namespace.id,
      documentId,
      revision: envelope.revision,
      blobKey,
      contentSha256: envelope.contentSha256,
      contentMagic: envelope.contentMagic,
      sizeBytes,
      writerDeviceId: envelope.deviceId,
      writtenAt: envelope.writtenAt,
    })

    if (currentHead) {
      await client.query(
        `UPDATE document_heads
         SET revision = $3,
             blob_key = $4,
             content_sha256 = $5,
             content_magic = $6,
             size_bytes = $7,
             writer_device_id = $8,
             written_at = $9
         WHERE namespace_uuid = $1 AND document_id = $2`,
        [
          namespace.id,
          documentId,
          envelope.revision,
          blobKey,
          envelope.contentSha256,
          envelope.contentMagic,
          sizeBytes,
          envelope.deviceId,
          envelope.writtenAt,
        ],
      )
    } else {
      await client.query(
        `INSERT INTO document_heads (
           namespace_uuid, document_id, revision, blob_key, content_sha256,
           content_magic, size_bytes, writer_device_id, written_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          namespace.id,
          documentId,
          envelope.revision,
          blobKey,
          envelope.contentSha256,
          envelope.contentMagic,
          sizeBytes,
          envelope.deviceId,
          envelope.writtenAt,
        ],
      )
    }

    await client.query(
      `UPDATE devices SET last_seen_at = now()
       WHERE id = $1 AND revoked_at IS NULL`,
      [deviceAuth.deviceUuid],
    )

    await client.query('COMMIT')

    await applyRevisionRetention(
      pool,
      config.blob.filesystem.path,
      config,
      {
        namespacePublicId: namespace.namespace_id,
        documentId,
      },
    ).catch(() => {
      // Retention cleanup is best-effort; push already succeeded.
    })

    return {
      revision: envelope.revision,
      writtenAt: envelope.writtenAt,
      contentSha256: envelope.contentSha256,
      writerDeviceId: envelope.deviceId,
      rateLimit: pushRateLimit,
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
