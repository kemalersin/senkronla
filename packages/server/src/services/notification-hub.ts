import type { WebSocket } from 'ws'
import type { WsHeadChanged, WsServerMessage } from '@senkronla/protocol'

const WS_OPEN = 1

export interface NotificationSocketMeta {
  namespaceId: string
  deviceId: string
  deviceUuid: string
}

interface TrackedSocket {
  ws: WebSocket
  meta: NotificationSocketMeta
  /** `null` = receive all document head_changed events (default). */
  subscribedDocumentIds: Set<string> | null
}

export class NotificationHub {
  private readonly rooms = new Map<string, Set<TrackedSocket>>()

  subscribe(namespaceId: string, ws: WebSocket, meta: NotificationSocketMeta): void {
    const tracked: TrackedSocket = { ws, meta, subscribedDocumentIds: null }
    const room = this.rooms.get(namespaceId) ?? new Set<TrackedSocket>()
    room.add(tracked)
    this.rooms.set(namespaceId, room)

    ws.on('close', () => {
      this.unsubscribe(namespaceId, ws)
    })
  }

  setDocumentSubscription(
    namespaceId: string,
    ws: WebSocket,
    documentIds: readonly string[] | null,
  ): void {
    const tracked = this.findTracked(namespaceId, ws)
    if (!tracked) {
      return
    }

    if (documentIds === null) {
      tracked.subscribedDocumentIds = null
      return
    }

    tracked.subscribedDocumentIds = new Set(documentIds)
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
      if (tracked.ws.readyState !== WS_OPEN) {
        continue
      }

      if (!this.shouldDeliver(tracked, message)) {
        continue
      }

      tracked.ws.send(payload)
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

  private findTracked(namespaceId: string, ws: WebSocket): TrackedSocket | undefined {
    const room = this.rooms.get(namespaceId)
    if (!room) {
      return undefined
    }

    for (const tracked of room) {
      if (tracked.ws === ws) {
        return tracked
      }
    }

    return undefined
  }

  private shouldDeliver(tracked: TrackedSocket, message: WsServerMessage): boolean {
    if (message.type !== 'head_changed') {
      return true
    }

    const filter = tracked.subscribedDocumentIds
    if (filter === null) {
      return true
    }

    return filter.has((message as WsHeadChanged).documentId)
  }
}
