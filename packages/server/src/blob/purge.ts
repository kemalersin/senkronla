import { readdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'

const NAMESPACE_DIR_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function purgeBlobStorage(blobRoot: string): Promise<number> {
  const absoluteRoot = resolve(blobRoot)

  let entries: string[]
  try {
    entries = await readdir(absoluteRoot)
  } catch {
    return 0
  }

  let removed = 0

  for (const entry of entries) {
    if (!NAMESPACE_DIR_PATTERN.test(entry)) {
      continue
    }

    await rm(resolve(absoluteRoot, entry), { recursive: true, force: true })
    removed += 1
  }

  return removed
}
