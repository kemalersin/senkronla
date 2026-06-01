import { isAbsolute, relative, resolve, sep } from 'node:path'
import { isValidDocumentId } from '@senkronla/protocol'
import { AppError } from '../errors/app-error.js'

const UUID_SEGMENT =
  '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const DOCUMENT_ID_SEGMENT = '[a-z][a-z0-9_-]{0,62}'
const REVISION_SEGMENT = '[A-Za-z0-9_-]+'

const BLOB_KEY_PATTERN = new RegExp(
  `^${UUID_SEGMENT}/${DOCUMENT_ID_SEGMENT}/${REVISION_SEGMENT}\\.json$`,
  'i',
)

export function assertSafeBlobKey(blobKey: string): void {
  if (!BLOB_KEY_PATTERN.test(blobKey)) {
    throw new AppError(500, 'INTERNAL_ERROR', 'Invalid blob key format')
  }

  if (blobKey.includes('..') || blobKey.includes('\0')) {
    throw new AppError(500, 'INTERNAL_ERROR', 'Invalid blob key path')
  }
}

export function resolveBlobPath(blobRoot: string, blobKey: string): string {
  assertSafeBlobKey(blobKey)

  const absoluteRoot = resolve(blobRoot)
  const absolutePath = resolve(blobRoot, blobKey)
  const pathInsideRoot = relative(absoluteRoot, absolutePath)

  if (pathInsideRoot.startsWith(`..${sep}`) || pathInsideRoot === '..' || isAbsolute(pathInsideRoot)) {
    throw new AppError(500, 'INTERNAL_ERROR', 'Invalid blob key path')
  }

  return absolutePath
}

export function buildBlobKey(namespaceId: string, documentId: string, revision: string): string {
  if (!isValidDocumentId(documentId)) {
    throw new AppError(500, 'INTERNAL_ERROR', 'Invalid documentId for blob key')
  }

  return `${namespaceId}/${documentId}/${revision}.json`
}

export interface BlobHeadForReuse {
  blob_key: string
  writer_device_id: string
}

/** Reuse the current blob file when the same device pushes again; otherwise use a revision path. */
export function resolvePushBlobKey(
  namespaceId: string,
  documentId: string,
  revision: string,
  writerDeviceId: string,
  currentHead: BlobHeadForReuse | null,
): string {
  if (currentHead && currentHead.writer_device_id === writerDeviceId) {
    return currentHead.blob_key
  }

  return buildBlobKey(namespaceId, documentId, revision)
}

export async function writeBlob(blobRoot: string, blobKey: string, content: string): Promise<void> {
  const { mkdir, writeFile } = await import('node:fs/promises')
  const { dirname } = await import('node:path')
  const absolutePath = resolveBlobPath(blobRoot, blobKey)
  await mkdir(dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, content, 'utf8')
}

export async function readBlob(blobRoot: string, blobKey: string): Promise<string> {
  const { readFile } = await import('node:fs/promises')
  const absolutePath = resolveBlobPath(blobRoot, blobKey)
  return readFile(absolutePath, 'utf8')
}
