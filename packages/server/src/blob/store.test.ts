import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AppError } from '../errors/app-error.js'
import { buildBlobKey, readBlob, writeBlob } from './store.js'

describe('blob store', () => {
  it('writes and reads envelope blobs by key', async () => {
    const root = await mkdtemp(join(tmpdir(), 'senkronla-blob-'))
    const key = buildBlobKey('550e8400-e29b-41d4-a716-446655440000', 'primary', '01JFTESTREV')
    const content = '{"magic":"ESR-DOC1"}'

    await writeBlob(root, key, content)
    const read = await readBlob(root, key)

    expect(read).toBe(content)

    const absolute = join(root, key)
    const fromDisk = await readFile(absolute, 'utf8')
    expect(fromDisk).toBe(content)
  })

  it('writes blobs under non-primary document paths', async () => {
    const root = await mkdtemp(join(tmpdir(), 'senkronla-blob-'))
    const key = buildBlobKey('550e8400-e29b-41d4-a716-446655440000', 'settings', '01JFTESTREV2')
    await writeBlob(root, key, '{}')
    expect(await readBlob(root, key)).toBe('{}')
  })

  it('rejects path traversal blob keys', async () => {
    const root = await mkdtemp(join(tmpdir(), 'senkronla-blob-'))

    await expect(
      writeBlob(root, '../escape/primary/evil.json', '{}'),
    ).rejects.toBeInstanceOf(AppError)
  })
})
