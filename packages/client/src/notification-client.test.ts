import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { NotificationClient } from './notification-client.js'
import type { RelayClient } from './relay-client.js'

function mockRelayClient(getHeadMeta = vi.fn(async () => null)) {
  return { getHeadMeta } as unknown as RelayClient
}

describe('NotificationClient head check coalescing', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('connect sonrası ardışık scheduleHeadCheck tek getHeadMeta turu yapar', async () => {
    const getHeadMeta = vi.fn(async () => ({
      revision: '01ABC',
      writtenAt: new Date().toISOString(),
      deviceId: 'dev-1',
      contentSha256: 'abc',
      contentMagic: 'ENV-RAW1' as const,
      sizeBytes: 0,
    }))
    const onHeadChanged = vi.fn(async () => {})

    const client = new NotificationClient({
      relayUrl: 'http://localhost:8080/v1',
      client: mockRelayClient(getHeadMeta),
      namespaceId: '11111111-1111-4111-8111-111111111111',
      getDeviceToken: async () => 'token',
      onHeadChanged,
      mode: 'poll_only',
    })

    client.connect()
    await vi.advanceTimersByTimeAsync(500)

    expect(getHeadMeta).toHaveBeenCalledTimes(1)

    client.disconnect()
  })
})
