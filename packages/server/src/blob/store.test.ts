import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AppError } from '../errors/app-error.js'
import { buildBlobKey, readBlob, writeBlob } from './store.js'

describe('blob store', () => {
  it('writes and reads envelope blobs by key', async () => {
    const root = await mkdtemp(join(tmpdir(), 'senkronla-blob-'))
    const key = buildBlobKey('550e8400-e29b-41d4-a716-446655440000', 'primary', '01JFNEWREV')

    await writeBlob(root, key, '{"revision":"01JFNEWREV"}')
    await expect(readBlob(root, key)).resolves.toBe('{"revision":"01JFNEWREV"}')
  })

  it('rejects unsafe blob keys', async () => {
    const root = await mkdtemp(join(tmpdir(), 'senkronla-blob-'))

    await expect(
      writeBlob(root, '../escape/primary/evil.json', '{}'),
    ).rejects.toBeInstanceOf(AppError)
  })
})
