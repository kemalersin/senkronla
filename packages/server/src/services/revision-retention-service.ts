import { unlink } from 'node:fs/promises'
import { resolveBlobPath } from '../blob/store.js'
import type { ServerConfig } from '../config/schema.js'
import type { DbPool, DbQueryable } from '../db/pool.js'
import { AppError } from '../errors/app-error.js'
import { findAppByPublicId } from './app-registry-service.js'
import { findNamespaceByPublicId } from './namespace-service.js'

export interface DocumentRevisionRow {
  id: string
  namespace_uuid: string
  document_id: string
  revision: string
  blob_key: string
  content_sha256: string
  content_magic: string
  size_bytes: string
  writer_device_id: string
  written_at: Date
}

export type PurgeRevisionsScope = 'deployment' | 'namespace' | 'app'

export interface PurgeRevisionsFilter {
  scope: PurgeRevisionsScope
  namespaceId?: string
  appId?: string
  documentId?: string
}

export type PurgeRevisionsInput =
  | (PurgeRevisionsFilter & { mode: 'date'; before: Date })
  | (PurgeRevisionsFilter & { mode: 'count'; keepLastRevisions: number })

export interface PurgeRevisionsResult {
  deletedRevisions: number
  deletedBlobFiles: number
}

interface PurgeCandidate {
  id: string
  blob_key: string
}

function assertPurgeScope(input: PurgeRevisionsFilter): void {
  if (input.namespaceId && input.appId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Specify either namespaceId or appId, not both')
  }

  if (input.scope === 'namespace' && !input.namespaceId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'namespaceId is required when scope is namespace')
  }

  if (input.scope === 'app' && !input.appId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'appId is required when scope is app')
  }

  if (input.scope === 'deployment' && (input.namespaceId || input.appId)) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'namespaceId and appId must be omitted when scope is deployment',
    )
  }
}

async function assertPurgeScopeExists(pool: DbPool, input: PurgeRevisionsFilter): Promise<void> {
  if (input.namespaceId) {
    const namespace = await findNamespaceByPublicId(pool, input.namespaceId)
    if (!namespace) {
      throw new AppError(404, 'NAMESPACE_NOT_FOUND', 'Namespace not found')
    }
  }

  if (input.appId) {
    const app = await findAppByPublicId(pool, input.appId)
    if (!app) {
      throw new AppError(404, 'APP_NOT_FOUND', 'Application not found')
    }
  }
}

function appendScopeFilters(input: PurgeRevisionsFilter, params: unknown[], filters: string[]): void {
  if (input.namespaceId) {
    params.push(input.namespaceId)
    filters.push(`n.namespace_id = $${params.length}`)
  }

  if (input.appId) {
    params.push(input.appId)
    filters.push(`a.app_id = $${params.length}`)
  }

  if (input.documentId) {
    params.push(input.documentId)
    filters.push(`dr.document_id = $${params.length}`)
  }
}

const HEAD_EXCLUSION = `
  AND NOT EXISTS (
    SELECT 1
    FROM document_heads dh
    WHERE dh.namespace_uuid = dr.namespace_uuid
      AND dh.document_id = dr.document_id
      AND dh.revision = dr.revision
  )
`

async function listDatePurgeCandidates(
  client: DbQueryable,
  input: Extract<PurgeRevisionsInput, { mode: 'date' }>,
): Promise<PurgeCandidate[]> {
  const params: unknown[] = [input.before]
  const filters = ['dr.written_at < $1']
  appendScopeFilters(input, params, filters)

  const result = await client.query<PurgeCandidate>(
    `SELECT dr.id, dr.blob_key
     FROM document_revisions dr
     INNER JOIN namespaces n ON n.id = dr.namespace_uuid
     LEFT JOIN apps a ON a.id = n.app_uuid
     WHERE ${filters.join(' AND ')}
       ${HEAD_EXCLUSION}`,
    params,
  )

  return result.rows
}

async function listCountPurgeCandidates(
  client: DbQueryable,
  input: Extract<PurgeRevisionsInput, { mode: 'count' }>,
): Promise<PurgeCandidate[]> {
  const params: unknown[] = [input.keepLastRevisions]
  const filters: string[] = ['TRUE']
  appendScopeFilters(input, params, filters)

  const result = await client.query<PurgeCandidate>(
    `WITH ranked AS (
       SELECT dr.id,
              dr.blob_key,
              ROW_NUMBER() OVER (
                PARTITION BY dr.namespace_uuid, dr.document_id
                ORDER BY dr.written_at DESC, dr.revision DESC
              ) AS rev_rank
       FROM document_revisions dr
       INNER JOIN namespaces n ON n.id = dr.namespace_uuid
       LEFT JOIN apps a ON a.id = n.app_uuid
       WHERE ${filters.join(' AND ')}
     )
     SELECT id, blob_key
     FROM ranked
     WHERE rev_rank > $1`,
    params,
  )

  return result.rows
}

async function deleteBlobIfExists(blobRoot: string, blobKey: string): Promise<boolean> {
  try {
    await unlink(resolveBlobPath(blobRoot, blobKey))
    return true
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return false
    }

    throw error
  }
}

async function deleteRevisionCandidates(
  client: DbQueryable,
  blobRoot: string,
  candidates: PurgeCandidate[],
): Promise<PurgeRevisionsResult> {
  let deletedBlobFiles = 0

  for (const candidate of candidates) {
    if (await deleteBlobIfExists(blobRoot, candidate.blob_key)) {
      deletedBlobFiles += 1
    }
  }

  const ids = candidates.map((row) => row.id)
  let deletedRevisions = 0

  if (ids.length > 0) {
    const deleted = await client.query(`DELETE FROM document_revisions WHERE id = ANY($1::uuid[])`, [
      ids,
    ])
    deletedRevisions = deleted.rowCount ?? 0
  }

  return { deletedRevisions, deletedBlobFiles }
}

export async function purgeRevisions(
  pool: DbPool,
  blobRoot: string,
  input: PurgeRevisionsInput,
): Promise<PurgeRevisionsResult> {
  assertPurgeScope(input)
  await assertPurgeScopeExists(pool, input)

  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const candidates =
      input.mode === 'date'
        ? await listDatePurgeCandidates(client, input)
        : await listCountPurgeCandidates(client, input)

    const result = await deleteRevisionCandidates(client, blobRoot, candidates)

    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

/** @deprecated Use purgeRevisions with mode date */
export async function purgeRevisionsBefore(
  pool: DbPool,
  blobRoot: string,
  input: { before: Date; namespaceId?: string; appId?: string },
): Promise<PurgeRevisionsResult> {
  const scope = input.namespaceId ? 'namespace' : input.appId ? 'app' : 'deployment'

  return purgeRevisions(pool, blobRoot, {
    mode: 'date',
    before: input.before,
    scope,
    namespaceId: input.namespaceId,
    appId: input.appId,
  })
}

export async function applyRevisionRetention(
  pool: DbPool,
  blobRoot: string,
  config: ServerConfig,
  input: { namespacePublicId: string; documentId: string },
): Promise<PurgeRevisionsResult | null> {
  const filter: Omit<PurgeRevisionsFilter, 'scope'> = {
    namespaceId: input.namespacePublicId,
    documentId: input.documentId,
  }

  let combined: PurgeRevisionsResult | null = null

  if (config.sync.revisionRetentionDays > 0) {
    const before = new Date(Date.now() - config.sync.revisionRetentionDays * 24 * 60 * 60 * 1000)
    const result = await purgeRevisions(pool, blobRoot, {
      mode: 'date',
      before,
      scope: 'namespace',
      ...filter,
    })
    combined = result
  }

  if (config.sync.revisionRetentionCount > 0) {
    const result = await purgeRevisions(pool, blobRoot, {
      mode: 'count',
      keepLastRevisions: config.sync.revisionRetentionCount,
      scope: 'namespace',
      ...filter,
    })

    if (combined) {
      combined = {
        deletedRevisions: combined.deletedRevisions + result.deletedRevisions,
        deletedBlobFiles: combined.deletedBlobFiles + result.deletedBlobFiles,
      }
    } else {
      combined = result
    }
  }

  return combined
}

export async function insertDocumentRevision(
  client: DbQueryable,
  input: {
    namespaceUuid: string
    documentId: string
    revision: string
    blobKey: string
    contentSha256: string
    contentMagic: string
    sizeBytes: number
    writerDeviceId: string
    writtenAt: string
  },
): Promise<void> {
  await client.query(
    `INSERT INTO document_revisions (
       namespace_uuid, document_id, revision, blob_key, content_sha256,
       content_magic, size_bytes, writer_device_id, written_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (namespace_uuid, document_id, revision) DO NOTHING`,
    [
      input.namespaceUuid,
      input.documentId,
      input.revision,
      input.blobKey,
      input.contentSha256,
      input.contentMagic,
      input.sizeBytes,
      input.writerDeviceId,
      input.writtenAt,
    ],
  )
}
