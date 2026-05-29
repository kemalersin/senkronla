import { describe, expect, it, vi } from 'vitest'
import { createMemoryStorageAdapter } from './esr-storage.js'
import { SyncEngine } from './sync-engine.js'
import { SyncStateStore } from './sync-state.js'
import type { DocumentAdapter, HeadMeta } from './types.js'
import type { RelayClient } from './relay-client.js'

const namespaceId = '11111111-1111-4111-8111-111111111111'

function makeAdapter(overrides?: Partial<DocumentAdapter>): DocumentAdapter {
  let data = { value: 1 }

  return {
    buildDocument: async () => JSON.stringify(data),
    importDocument: async (documentJson) => {
      data = JSON.parse(documentJson) as { value: number }
    },
    contentType: () => 'application/json',
    encryption: () => ({ enabled: false, resolvePassword: async () => undefined }),
    namespaceId: () => namespaceId,
    namespaceLabel: () => 'Test',
    ...overrides,
  }
}

function makeHeadMeta(revision: string): HeadMeta {
  return {
    revision,
    writtenAt: new Date().toISOString(),
    deviceId: 'dev-remote',
    contentSha256: 'abc',
    contentMagic: 'ENV-RAW1',
    sizeBytes: 10,
  }
}

describe('SyncEngine', () => {
  it('pulls remote document when revision differs', async () => {
    const storage = createMemoryStorageAdapter()
    const state = new SyncStateStore(storage, namespaceId)
    const adapter = makeAdapter()

    const innerPayload = JSON.stringify({ magic: 'ENV-RAW1', data: JSON.stringify({ value: 42 }) })
    const envelope = {
      magic: 'ESR-DOC1' as const,
      schemaVersion: 1 as const,
      namespaceId,
      namespaceLabel: 'Test',
      documentId: 'primary' as const,
      revision: '01REMOTE',
      deviceId: 'dev-remote',
      writtenAt: new Date().toISOString(),
      contentType: 'application/json',
      contentMagic: 'ENV-RAW1' as const,
      contentSha256: 'a'.repeat(64),
      payload: innerPayload,
    }

    const client = {
      clientDeviceId: 'client-1',
      getHeadMeta: vi.fn(async () => makeHeadMeta('01REMOTE')),
      getHead: vi.fn(async () => envelope),
      pushDocument: vi.fn(),
    } as unknown as RelayClient

    const engine = new SyncEngine(client, adapter, state, 'primary')
    const result = await engine.syncFull()

    expect(result.status).toBe('ok')
    expect(JSON.parse(await adapter.buildDocument())).toEqual({ value: 42 })
    expect(await state.getKnownRemoteRevision()).toBe('01REMOTE')
  })

  it('reports conflict when local and remote both changed', async () => {
    const storage = createMemoryStorageAdapter()
    const state = new SyncStateStore(storage, namespaceId)
    const adapter = makeAdapter()
    state.markLocalMutation()

    const client = {
      clientDeviceId: 'client-1',
      getHeadMeta: vi.fn(async () => makeHeadMeta('01REMOTE')),
      getHead: vi.fn(),
      pushDocument: vi.fn(),
    } as unknown as RelayClient

    const engine = new SyncEngine(client, adapter, state, 'primary')
    const result = await engine.syncFull()

    expect(result.status).toBe('conflict')
    expect(result.ctx?.remoteRevision).toBe('01REMOTE')
  })
})
