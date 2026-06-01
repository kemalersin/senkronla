import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildRelayHealthUrl,
  clearRelayHealthCache,
  fetchRelayWebsocketEnabled,
  resolveRelayNotificationMode,
} from './relay-health.js'

describe('relay-health', () => {
  afterEach(() => {
    clearRelayHealthCache()
  })

  it('buildRelayHealthUrl /v1 tabanını /health yapar', () => {
    expect(buildRelayHealthUrl('http://localhost:8080/v1')).toBe('http://localhost:8080/health')
  })

  it('fetchRelayWebsocketEnabled yalnızca websocket: true iken true döner', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ websocket: false }),
    })) as unknown as typeof fetch

    await expect(fetchRelayWebsocketEnabled('http://localhost:8080/v1', fetchMock)).resolves.toBe(false)

    clearRelayHealthCache()
    ;(fetchMock as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ websocket: true }),
    })

    await expect(fetchRelayWebsocketEnabled('http://localhost:8080/v1', fetchMock)).resolves.toBe(true)
  })

  it('resolveRelayNotificationMode health false iken poll_only seçer', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ websocket: false }),
    })) as unknown as typeof fetch

    await expect(
      resolveRelayNotificationMode({
        relayUrl: 'http://localhost:8080/v1',
        fetch: fetchMock,
      }),
    ).resolves.toBe('poll_only')
  })

  it('websocketEnabled false health sorgusunu atlar', async () => {
    const fetchMock = vi.fn() as unknown as typeof fetch

    await expect(
      resolveRelayNotificationMode({
        relayUrl: 'http://localhost:8080/v1',
        fetch: fetchMock,
        websocketEnabled: false,
      }),
    ).resolves.toBe('poll_only')

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
