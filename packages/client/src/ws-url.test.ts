import { describe, expect, it } from 'vitest'
import { buildNotificationWsUrl } from './ws-url.js'

describe('buildNotificationWsUrl', () => {
  it('converts https relay URL to wss notifications path', () => {
    expect(buildNotificationWsUrl('https://relay.test/v1', '11111111-1111-4111-8111-111111111111')).toBe(
      'wss://relay.test/v1/namespaces/11111111-1111-4111-8111-111111111111/notifications',
    )
  })

  it('converts http relay URL to ws notifications path', () => {
    expect(buildNotificationWsUrl('http://localhost:8080/v1', '11111111-1111-4111-8111-111111111111')).toBe(
      'ws://localhost:8080/v1/namespaces/11111111-1111-4111-8111-111111111111/notifications',
    )
  })
})
