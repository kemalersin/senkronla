import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AppError } from '../errors/app-error.js'
import { buildBlobKey, readBlob, resolvePushBlobKey, writeBlob } from './store.js'

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

  it('resolvePushBlobKey reuses blob when the same device pushes again', () => {
    const namespaceId = '550e8400-e29b-41d4-a716-446655440000'
    const currentHead = {
      blob_key: buildBlobKey(namespaceId, 'primary', '01JFOLDREV'),
      writer_device_id: 'device-a',
    }

    expect(
      resolvePushBlobKey(namespaceId, 'primary', '01JFNEWREV', 'device-a', currentHead),
    ).toBe(currentHead.blob_key)
  })

  it('resolvePushBlobKey creates a new revision path for a different device', () => {
    const namespaceId = '550e8400-e29b-41d4-a716-446655440000'
    const currentHead = {
      blob_key: buildBlobKey(namespaceId, 'primary', '01JFOLDREV'),
      writer_device_id: 'device-a',
    }

    expect(
      resolvePushBlobKey(namespaceId, 'primary', '01JFNEWREV', 'device-b', currentHead),
    ).toBe(buildBlobKey(namespaceId, 'primary', '01JFNEWREV'))
  })

  it('resolvePushBlobKey creates a revision path for the first push', () => {
    const namespaceId = '550e8400-e29b-41d4-a716-446655440000'

    expect(
      resolvePushBlobKey(namespaceId, 'settings', '01JFNEWREV', 'device-a', null),
    ).toBe(buildBlobKey(namespaceId, 'settings', '01JFNEWREV'))
  })
})
