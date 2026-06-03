import { describe, expect, it } from 'vitest'

import { normalizeClientIp } from './client-ip.js'

describe('normalizeClientIp', () => {
  it('strips IPv4-mapped IPv6 prefix', () => {
    expect(normalizeClientIp('::ffff:203.0.113.10')).toBe('203.0.113.10')
    expect(normalizeClientIp('::FFFF:192.168.0.1')).toBe('192.168.0.1')
  })

  it('keeps plain IPv4 and native IPv6', () => {
    expect(normalizeClientIp('203.0.113.10')).toBe('203.0.113.10')
    expect(normalizeClientIp('2001:db8::1')).toBe('2001:db8::1')
  })

  it('handles empty input', () => {
    expect(normalizeClientIp(null)).toBeNull()
    expect(normalizeClientIp(undefined)).toBeNull()
    expect(normalizeClientIp('')).toBeNull()
    expect(normalizeClientIp('   ')).toBeNull()
  })
})
