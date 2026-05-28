import { isAbsolute, join, normalize, relative, resolve, sep } from 'node:path'
import { AppError } from '../errors/app-error.js'

const BLOB_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/primary\/[A-Za-z0-9_-]+\.json$/i

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

export function buildBlobKey(namespaceId: string, revision: string): string {
  return `${namespaceId}/primary/${revision}.json`
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
