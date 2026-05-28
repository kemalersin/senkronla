import type { WebSocket } from 'ws'
import type { WsServerMessage } from '@senkronla/protocol'

const WS_OPEN = 1

export interface NotificationSocketMeta {
  namespaceId: string
  deviceId: string
  deviceUuid: string
}

interface TrackedSocket {
  ws: WebSocket
  meta: NotificationSocketMeta
}

export class NotificationHub {
  private readonly rooms = new Map<string, Set<TrackedSocket>>()

  subscribe(namespaceId: string, ws: WebSocket, meta: NotificationSocketMeta): void {
    const tracked: TrackedSocket = { ws, meta }
    const room = this.rooms.get(namespaceId) ?? new Set<TrackedSocket>()
    room.add(tracked)
    this.rooms.set(namespaceId, room)

    ws.on('close', () => {
      this.unsubscribe(namespaceId, ws)
    })
  }

  unsubscribe(namespaceId: string, ws: WebSocket): void {
    const room = this.rooms.get(namespaceId)
    if (!room) {
      return
    }

    for (const tracked of room) {
      if (tracked.ws === ws) {
        room.delete(tracked)
        break
      }
    }

    if (room.size === 0) {
      this.rooms.delete(namespaceId)
    }
  }

  broadcast(namespaceId: string, message: WsServerMessage): void {
    const room = this.rooms.get(namespaceId)
    if (!room) {
      return
    }

    const payload = JSON.stringify(message)

    for (const tracked of room) {
      if (tracked.ws.readyState === WS_OPEN) {
        tracked.ws.send(payload)
      }
    }
  }

  closeDevice(namespaceId: string, deviceUuid: string, code = 4403, reason = 'Device revoked'): void {
    const room = this.rooms.get(namespaceId)
    if (!room) {
      return
    }

    for (const tracked of room) {
      if (tracked.meta.deviceUuid === deviceUuid && tracked.ws.readyState === WS_OPEN) {
        tracked.ws.close(code, reason)
      }
    }
  }

  countNamespaceConnections(namespaceId: string): number {
    return this.rooms.get(namespaceId)?.size ?? 0
  }

  countDeviceConnections(namespaceId: string, deviceUuid: string): number {
    const room = this.rooms.get(namespaceId)
    if (!room) {
      return 0
    }

    let count = 0
    for (const tracked of room) {
      if (tracked.meta.deviceUuid === deviceUuid) {
        count += 1
      }
    }

    return count
  }

  destroy(): void {
    for (const room of this.rooms.values()) {
      for (const tracked of room) {
        if (tracked.ws.readyState === WS_OPEN) {
          tracked.ws.close(1001, 'Server shutting down')
        }
      }
    }

    this.rooms.clear()
  }
}
