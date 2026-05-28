import { describe, expect, it, vi } from 'vitest'
import { RelayClient } from './relay-client.js'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('RelayClient', () => {
  it('creates namespace and stores device token', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://relay.test/v1/namespaces')
      expect(init?.method).toBe('POST')

      return jsonResponse(201, {
        namespaceId: '11111111-1111-4111-8111-111111111111',
        deviceToken: 'token-abc',
        deviceId: 'dev-1',
        limits: {
          freeDeviceLimit: 2,
          purchasedSlots: 0,
          maxDevices: 2,
          activeDevices: 1,
        },
      })
    })

    const client = new RelayClient({
      baseUrl: 'https://relay.test/v1',
      clientDeviceId: 'client-1',
      fetch: fetchMock as typeof fetch,
    })

    const result = await client.createNamespace({
      namespaceId: '11111111-1111-4111-8111-111111111111',
      namespaceLabel: 'Test',
      recoveryKeyProof: { salt: 's', hash: 'h' },
      deviceLabel: 'Device',
      clientDeviceId: 'client-1',
    })

    expect(result.deviceToken).toBe('token-abc')
    expect(await client.getDeviceToken()).toBe('token-abc')
  })

  it('returns null when head meta is missing', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(404, {
        error: { code: 'DOCUMENT_NOT_FOUND', message: 'No document' },
      }),
    )

    const client = new RelayClient({
      baseUrl: 'https://relay.test/v1',
      clientDeviceId: 'client-1',
      fetch: fetchMock as typeof fetch,
      getDeviceToken: async () => 'token',
    })

    const meta = await client.getHeadMeta('11111111-1111-4111-8111-111111111111')
    expect(meta).toBeNull()
  })
})
