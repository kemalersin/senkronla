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

  it('sends app registry headers and allowedAppIds on pairing token create', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>
      expect(headers['x-esr-app-id']).toBe('esr_app_demo')
      expect(headers['x-esr-platform']).toBe('ios')
      expect(headers['x-esr-bundle-id']).toBe('com.example.demo')
      expect(headers['x-esr-client-secret']).toBe('secret-value')

      const body = JSON.parse(String(init?.body)) as { allowedAppIds?: string[] }
      expect(body.allowedAppIds).toEqual(['esr_app_guest'])

      return jsonResponse(201, {
        code: '123456',
        expiresAt: new Date().toISOString(),
        qrPayload: 'esr://pair',
        allowedAppIds: ['esr_app_guest'],
      })
    })

    const client = new RelayClient({
      baseUrl: 'https://relay.test/v1',
      clientDeviceId: 'client-1',
      appId: 'esr_app_demo',
      appPlatform: 'ios',
      bundleId: 'com.example.demo',
      clientSecret: 'secret-value',
      fetch: fetchMock as typeof fetch,
      getDeviceToken: async () => 'token',
    })

    const result = await client.createPairingToken('11111111-1111-4111-8111-111111111111', {
      allowedAppIds: ['esr_app_guest'],
    })

    expect(result.allowedAppIds).toEqual(['esr_app_guest'])
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
