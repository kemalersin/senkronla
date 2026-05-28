/** Build WebSocket URL from REST base URL (https→wss, http→ws). */
export function buildNotificationWsUrl(relayUrl: string, namespaceId: string): string {
  const base = relayUrl.replace(/\/$/, '')
  const parsed = new URL(base)
  parsed.protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:'
  parsed.pathname = `${parsed.pathname}/namespaces/${namespaceId}/notifications`
  parsed.search = ''
  parsed.hash = ''
  return parsed.toString()
}
