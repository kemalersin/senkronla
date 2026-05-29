import { describe, expect, it, vi } from 'vitest'
import type { WebSocket } from 'ws'
import { NotificationHub } from './notification-hub.js'

function mockSocket(onMessage: (payload: string) => void): WebSocket {
  return {
    readyState: 1,
    send: (payload: string) => onMessage(payload),
    on: vi.fn(),
    close: vi.fn(),
  } as unknown as WebSocket
}

describe('NotificationHub', () => {
  it('broadcasts messages to subscribed sockets', () => {
    const hub = new NotificationHub()
    const received: string[] = []

    const socket = mockSocket((payload) => received.push(payload))
    hub.subscribe('ns-1', socket, {
      namespaceId: 'ns-1',
      deviceId: 'dev-1',
      deviceUuid: 'uuid-1',
    })

    hub.broadcast('ns-1', {
      type: 'head_changed',
      documentId: 'primary',
      revision: '01REV',
      contentSha256: 'a'.repeat(64),
      writtenAt: new Date().toISOString(),
      writerDeviceId: 'dev-1',
    })

    expect(received).toHaveLength(1)
    expect(JSON.parse(received[0]!).type).toBe('head_changed')
    hub.destroy()
  })

  it('filters head_changed by document subscription', () => {
    const hub = new NotificationHub()
    const received: string[] = []
    const socket = mockSocket((payload) => received.push(payload))

    hub.subscribe('ns-1', socket, {
      namespaceId: 'ns-1',
      deviceId: 'dev-1',
      deviceUuid: 'uuid-1',
    })
    hub.setDocumentSubscription('ns-1', socket, ['settings'])

    hub.broadcast('ns-1', {
      type: 'head_changed',
      documentId: 'primary',
      revision: '01A',
      contentSha256: 'a'.repeat(64),
      writtenAt: new Date().toISOString(),
      writerDeviceId: 'dev-2',
    })
    hub.broadcast('ns-1', {
      type: 'head_changed',
      documentId: 'settings',
      revision: '01B',
      contentSha256: 'b'.repeat(64),
      writtenAt: new Date().toISOString(),
      writerDeviceId: 'dev-2',
    })

    expect(received).toHaveLength(1)
    expect(JSON.parse(received[0]!).documentId).toBe('settings')
    hub.destroy()
  })

  it('tracks namespace and device connection counts', () => {
    const hub = new NotificationHub()
    const socket = mockSocket(() => {})

    hub.subscribe('ns-1', socket, {
      namespaceId: 'ns-1',
      deviceId: 'dev-1',
      deviceUuid: 'uuid-1',
    })

    expect(hub.countNamespaceConnections('ns-1')).toBe(1)
    expect(hub.countDeviceConnections('ns-1', 'uuid-1')).toBe(1)
    hub.destroy()
  })
})
