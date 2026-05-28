import { describe, expect, it, vi } from 'vitest'
import { createDocumentAdapter } from './document-adapter.js'
import { createMemoryStorageAdapter } from './esr-storage.js'
import { EsrSync } from './esr-sync.js'

const namespaceId = '11111111-1111-4111-8111-111111111111'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('EsrSync', () => {
  it('ensureNamespace creates namespace and invokes recovery callback', async () => {
    let recoveryPhraseSeen = ''
    const requests: string[] = []

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      requests.push(`${init?.method ?? 'GET'} ${url}`)

      if (url.endsWith('/namespaces') && init?.method === 'POST') {
        return jsonResponse(201, {
          namespaceId,
          deviceToken: 'device-token',
          deviceId: 'dev-1',
          limits: {
            freeDeviceLimit: 2,
            purchasedSlots: 0,
            maxDevices: 2,
            activeDevices: 1,
          },
        })
      }

      if (url.includes('/documents/primary') && init?.method === 'PUT') {
        return jsonResponse(200, {
          revision: '01PUSH',
          writtenAt: new Date().toISOString(),
          contentSha256: 'abc',
        })
      }

      return jsonResponse(404, { error: { code: 'NOT_FOUND', message: 'missing' } })
    })

    let local = { count: 0 }
    const document = createDocumentAdapter({
      namespaceId,
      namespaceLabel: 'Workspace',
      contentType: 'application/json',
      exportDocument: async () => local,
      importDocument: async (data) => {
        local = data as { count: number }
      },
    })

    const sync = await EsrSync.connect({
      relayUrl: 'https://relay.test/v1',
      document,
      storage: createMemoryStorageAdapter(),
      notificationsEnabled: false,
      fetch: fetchMock as typeof fetch,
      onRecoveryPhrase: async ({ phrase }) => {
        recoveryPhraseSeen = phrase
      },
      onConflict: async () => 'remote',
    })

    const result = await sync.ensureNamespace()

    expect(result.created).toBe(true)
    expect(result.recoveryPhrase).toBeTruthy()
    expect(recoveryPhraseSeen).toBe(result.recoveryPhrase)
    expect(requests.some((entry) => entry.startsWith('POST') && entry.includes('/namespaces'))).toBe(true)
    expect(requests.some((entry) => entry.startsWith('PUT') && entry.includes('/documents/primary'))).toBe(true)
  })
})
