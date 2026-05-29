import { describe, expect, it, vi } from 'vitest'
import { createDocumentAdapter } from './document-adapter.js'
import { createMemoryStorageAdapter } from './esr-storage.js'
import { EsrSync } from './esr-sync.js'

const namespaceId = '22222222-2222-4222-8222-222222222222'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('EsrSync multi-document', () => {
  it('syncs primary and settings documents independently', async () => {
    const heads: Record<string, string | null> = {
      primary: null,
      settings: null,
    }

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/namespaces') && init?.method === 'POST') {
        return jsonResponse(201, {
          namespaceId,
          deviceToken: 'device-token',
          deviceId: 'dev-1',
          limits: { freeDeviceLimit: 2, purchasedSlots: 0, maxDevices: 2, activeDevices: 1 },
        })
      }

      const metaMatch = url.match(/\/documents\/([a-z0-9_-]+)\/head\/meta$/)
      if (init?.method === 'GET' && metaMatch) {
        const documentId = metaMatch[1]!
        const revision = heads[documentId]
        if (!revision) {
          return jsonResponse(404, { error: { code: 'DOCUMENT_NOT_FOUND', message: 'missing' } })
        }
        return jsonResponse(200, {
          revision,
          writtenAt: new Date().toISOString(),
          deviceId: 'remote',
          contentSha256: 'a'.repeat(64),
          contentMagic: 'ENV-RAW1',
          sizeBytes: 1,
        })
      }

      const putMatch = url.match(/\/documents\/([a-z0-9_-]+)$/)
      if (init?.method === 'PUT' && putMatch) {
        const documentId = putMatch[1]!
        const revision = `01${documentId.toUpperCase()}`
        heads[documentId] = revision
        return jsonResponse(201, {
          revision,
          writtenAt: new Date().toISOString(),
          contentSha256: 'b'.repeat(64),
        })
      }

      return jsonResponse(404, { error: { code: 'NOT_FOUND', message: 'missing' } })
    })

    let primaryData = { n: 1 }
    let settingsData = { theme: 'light' }

    const sync = await EsrSync.connect({
      relayUrl: 'https://relay.test/v1',
      storage: createMemoryStorageAdapter(),
      notificationsEnabled: false,
      fetch: fetchMock as typeof fetch,
      documents: [
        {
          adapter: createDocumentAdapter({
            namespaceId,
            namespaceLabel: 'Multi',
            contentType: 'application/json',
            exportDocument: async () => primaryData,
            importDocument: async (data) => {
              primaryData = data as { n: number }
            },
          }),
        },
        {
          documentId: 'settings',
          adapter: createDocumentAdapter({
            namespaceId,
            namespaceLabel: 'Multi',
            contentType: 'application/vnd.settings+json',
            exportDocument: async () => settingsData,
            importDocument: async (data) => {
              settingsData = data as { theme: string }
            },
          }),
        },
      ],
      onRecoveryPhrase: async () => {},
      onConflict: async () => 'remote',
    })

    expect(sync.documentIds).toEqual(['primary', 'settings'])

    await sync.ensureNamespace()
    settingsData = { theme: 'dark' }
    sync.notifyLocalChange('settings')
    await sync.flushPush('settings')

    expect(heads.settings).toBe('01SETTINGS')
    expect(heads.primary).toBe('01PRIMARY')
  })

  it('sync(documentId) runs full cycle for one document only', async () => {
    const heads: Record<string, string | null> = {
      primary: null,
      settings: null,
    }

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/namespaces') && init?.method === 'POST') {
        return jsonResponse(201, {
          namespaceId,
          deviceToken: 'device-token',
          deviceId: 'dev-1',
          limits: { freeDeviceLimit: 2, purchasedSlots: 0, maxDevices: 2, activeDevices: 1 },
        })
      }

      const metaMatch = url.match(/\/documents\/([a-z0-9_-]+)\/head\/meta$/)
      if (init?.method === 'GET' && metaMatch) {
        const documentId = metaMatch[1]!
        const revision = heads[documentId]
        if (!revision) {
          return jsonResponse(404, { error: { code: 'DOCUMENT_NOT_FOUND', message: 'missing' } })
        }
        return jsonResponse(200, {
          revision,
          writtenAt: new Date().toISOString(),
          deviceId: 'remote',
          contentSha256: 'a'.repeat(64),
          contentMagic: 'ENV-RAW1',
          sizeBytes: 1,
        })
      }

      const putMatch = url.match(/\/documents\/([a-z0-9_-]+)$/)
      if (init?.method === 'PUT' && putMatch) {
        const documentId = putMatch[1]!
        const revision = `01${documentId.toUpperCase()}`
        heads[documentId] = revision
        return jsonResponse(201, {
          revision,
          writtenAt: new Date().toISOString(),
          contentSha256: 'b'.repeat(64),
        })
      }

      return jsonResponse(404, { error: { code: 'NOT_FOUND', message: 'missing' } })
    })

    let primaryData = { n: 1 }
    let settingsData = { theme: 'light' }

    const sync = await EsrSync.connect({
      relayUrl: 'https://relay.test/v1',
      storage: createMemoryStorageAdapter(),
      notificationsEnabled: false,
      fetch: fetchMock as typeof fetch,
      documents: [
        {
          adapter: createDocumentAdapter({
            namespaceId,
            namespaceLabel: 'Multi',
            contentType: 'application/json',
            exportDocument: async () => primaryData,
            importDocument: async (data) => {
              primaryData = data as { n: number }
            },
          }),
        },
        {
          documentId: 'settings',
          adapter: createDocumentAdapter({
            namespaceId,
            namespaceLabel: 'Multi',
            contentType: 'application/vnd.settings+json',
            exportDocument: async () => settingsData,
            importDocument: async (data) => {
              settingsData = data as { theme: string }
            },
          }),
        },
      ],
      onRecoveryPhrase: async () => {},
      onConflict: async () => 'remote',
    })

    await sync.ensureNamespace()

    primaryData = { n: 99 }
    settingsData = { theme: 'dark' }
    sync.notifyLocalChange('primary')
    sync.notifyLocalChange('settings')

    fetchMock.mockClear()

    const result = await sync.sync('settings')
    expect(result.status).toBe('ok')
    expect(heads.settings).toBe('01SETTINGS')

    const documentCalls = fetchMock.mock.calls.map(([url]) => url as string)
    expect(documentCalls.some((url) => url.includes('/documents/primary/'))).toBe(false)
    expect(documentCalls.some((url) => url.includes('/documents/settings/'))).toBe(true)
  })

  it('sync(documentId) rejects unknown documentId', async () => {
    const sync = await EsrSync.connect({
      relayUrl: 'https://relay.test/v1',
      storage: createMemoryStorageAdapter(),
      notificationsEnabled: false,
      fetch: vi.fn(async () => jsonResponse(404, { error: { code: 'NOT_FOUND', message: 'x' } })) as typeof fetch,
      document: createDocumentAdapter({
        namespaceId,
        namespaceLabel: 'Single',
        contentType: 'application/json',
        exportDocument: async () => ({}),
        importDocument: async () => {},
      }),
      onRecoveryPhrase: async () => {},
      onConflict: async () => 'remote',
    })

    await expect(sync.sync('vault')).rejects.toMatchObject({ code: 'ESR_CLIENT_UNKNOWN_DOCUMENT_ID' })
  })
})
