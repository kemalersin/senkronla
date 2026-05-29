import { describe, expect, it } from 'vitest'
import { createMemoryStorageAdapter } from './esr-storage.js'
import { SyncStateStore } from './sync-state.js'

const namespaceId = '11111111-1111-4111-8111-111111111111'

describe('SyncStateStore', () => {
  it('migrates legacy knownRemoteRevision to document-scoped key', async () => {
    const storage = createMemoryStorageAdapter()
    await storage.set(`${namespaceId}:knownRemoteRevision`, '01LEGACY')

    const state = new SyncStateStore(storage, namespaceId, 'primary')
    await state.migrateLegacyRevisionState()

    expect(await state.getKnownRemoteRevision()).toBe('01LEGACY')
    expect(await storage.get(`${namespaceId}:knownRemoteRevision`)).toBeNull()
  })

  it('keeps revisions isolated per documentId', async () => {
    const storage = createMemoryStorageAdapter()
    const primary = new SyncStateStore(storage, namespaceId, 'primary')
    const settings = new SyncStateStore(storage, namespaceId, 'settings')

    await primary.setKnownRemoteRevision('01PRIMARY')
    await settings.setKnownRemoteRevision('01SETTINGS')

    expect(await primary.getKnownRemoteRevision()).toBe('01PRIMARY')
    expect(await settings.getKnownRemoteRevision()).toBe('01SETTINGS')
  })

  it('shares device token at namespace scope', async () => {
    const storage = createMemoryStorageAdapter()
    const primary = new SyncStateStore(storage, namespaceId, 'primary')
    const settings = new SyncStateStore(storage, namespaceId, 'settings')

    await primary.setDeviceToken('dvt_test')

    expect(await settings.getDeviceToken()).toBe('dvt_test')
  })
})
