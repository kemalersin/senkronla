const DEFAULT_API_ORIGIN = 'http://localhost:8080'

/** Origin from NEXT_PUBLIC_API_URL (no trailing slash, no /v1 suffix). */
export function getPublicApiOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL?.trim() || DEFAULT_API_ORIGIN
  return raw.replace(/\/$/, '').replace(/\/v1\/?$/, '')
}

/** REST base URL shown in SDK/API docs, e.g. https://sync.example.com/v1 */
export function getRelayApiBaseUrl(): string {
  return `${getPublicApiOrigin()}/v1`
}

function toWebSocketOrigin(origin: string): string {
  if (origin.startsWith('https://')) {
    return `wss://${origin.slice('https://'.length)}`
  }
  if (origin.startsWith('http://')) {
    return `ws://${origin.slice('http://'.length)}`
  }
  return origin
}

/** WebSocket notifications endpoint pattern for API docs. */
export function getRelayNotificationsWebSocketUrl(): string {
  return `${toWebSocketOrigin(getPublicApiOrigin())}/v1/namespaces/{namespaceId}/notifications`
}
