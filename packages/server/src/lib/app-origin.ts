const LOCALHOST_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

export function isLocalhostOrigin(origin: string): boolean {
  try {
    const url = new URL(origin)
    return LOCALHOST_HOSTS.has(url.hostname)
  } catch {
    return false
  }
}

export function normalizeOrigin(origin: string): string {
  const url = new URL(origin)
  return url.origin
}

export function parseRefererOrigin(referer: string | undefined): string | null {
  if (!referer) {
    return null
  }

  try {
    return normalizeOrigin(referer)
  } catch {
    return null
  }
}
