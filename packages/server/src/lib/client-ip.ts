import { isIP } from 'node:net'

/** Normalize IPv4-mapped IPv6 addresses (e.g. `::ffff:203.0.113.10`) to dotted IPv4. */
export function normalizeClientIp(ip: string | null | undefined): string | null {
  if (ip == null) {
    return null
  }

  const trimmed = ip.trim()
  if (!trimmed) {
    return null
  }

  if (trimmed.toLowerCase().startsWith('::ffff:')) {
    const ipv4 = trimmed.slice(7)
    if (isIP(ipv4) === 4) {
      return ipv4
    }
  }

  return trimmed
}
