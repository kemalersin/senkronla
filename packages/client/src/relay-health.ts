/** REST base (`…/v1`) → `/health` (WS özelliği operatör config'inden). */
export function buildRelayHealthUrl(relayUrl: string): string {
  const parsed = new URL(relayUrl.replace(/\/$/, ''))
  parsed.pathname = parsed.pathname.replace(/\/v1\/?$/, '') || '/'
  parsed.pathname = `${parsed.pathname.replace(/\/$/, '')}/health`
  parsed.search = ''
  parsed.hash = ''
  return parsed.toString()
}

export interface RelayHealthSnapshot {
  websocket: boolean
}

const HEALTH_CACHE_TTL_MS = 60_000
const healthCache = new Map<string, { websocket: boolean; expiresAt: number }>()

/** Relay `/health` → `websocket` bayrağı; hata veya bilinmeyen → false (poll-only güvenli). */
export async function fetchRelayWebsocketEnabled(
  relayUrl: string,
  fetchImpl?: typeof fetch,
): Promise<boolean> {
  const cacheKey = relayUrl.replace(/\/$/, '')
  const cached = healthCache.get(cacheKey)
  if (cached && Date.now() < cached.expiresAt) {
    return cached.websocket
  }

  const fetchFn = fetchImpl ?? globalThis.fetch
  if (!fetchFn) {
    return false
  }

  let websocket = false
  try {
    const response = await fetchFn(buildRelayHealthUrl(relayUrl), { method: 'GET' })
    if (response.ok) {
      const body = (await response.json()) as Partial<RelayHealthSnapshot>
      websocket = body.websocket === true
    }
  } catch {
    websocket = false
  }

  healthCache.set(cacheKey, {
    websocket,
    expiresAt: Date.now() + HEALTH_CACHE_TTL_MS,
  })

  return websocket
}

/** Test veya relay URL değişince cache temizliği. */
export function clearRelayHealthCache(): void {
  healthCache.clear()
}

/** REST tabanı + seçenekler → bildirim modu. */
export async function resolveRelayNotificationMode(options: {
  relayUrl: string
  fetch?: typeof fetch
  notificationMode?: 'ws_with_poll_fallback' | 'poll_only'
  websocketEnabled?: boolean
}): Promise<'ws_with_poll_fallback' | 'poll_only'> {
  if (options.notificationMode) {
    return options.notificationMode
  }
  if (options.websocketEnabled === false) {
    return 'poll_only'
  }
  const wsEnabled = await fetchRelayWebsocketEnabled(options.relayUrl, options.fetch)
  return wsEnabled ? 'ws_with_poll_fallback' : 'poll_only'
}
