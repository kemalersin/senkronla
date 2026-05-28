import websocket from '@fastify/websocket'
import type { FastifyInstance } from 'fastify'
import type { WebSocket } from 'ws'
import {
  WS_SUBPROTOCOL,
  parseWsClientMessage,
  type WsServerMessage,
} from '@senkronla/protocol'
import { hashDeviceToken } from '../lib/crypto.js'
import { findDeviceByTokenHash } from '../services/device-service.js'
import { requireNamespaceExists } from '../middleware/auth-device.js'
import type { AppContext } from '../types/context.js'

const AUTH_MESSAGE_TIMEOUT_MS = 5_000
const WS_OPEN = 1

function extractBearerToken(header: string | undefined): string | null {
  if (!header?.startsWith('Bearer ')) {
    return null
  }

  const token = header.slice('Bearer '.length).trim()
  return token || null
}

function sendMessage(ws: WebSocket, message: WsServerMessage): void {
  if (ws.readyState === WS_OPEN) {
    ws.send(JSON.stringify(message))
  }
}

async function authenticateDevice(
  ctx: AppContext,
  namespaceId: string,
  token: string,
) {
  await requireNamespaceExists(ctx, namespaceId)
  const tokenHash = hashDeviceToken(token)
  const device = await findDeviceByTokenHash(ctx.db, namespaceId, tokenHash)

  if (!device || !device.device_id) {
    return null
  }

  return {
    deviceUuid: device.id,
    deviceId: device.device_id,
    namespaceId: device.namespace_id,
  }
}

export async function registerNotificationRoutes(app: FastifyInstance, ctx: AppContext) {
  const hub = ctx.notificationHub
  if (!hub || !ctx.config.websocket.enabled) {
    return
  }

  await app.register(websocket)

  app.get(
    '/namespaces/:namespaceId/notifications',
    { websocket: true },
    (socket, request) => {
      const { namespaceId } = request.params as { namespaceId: string }
      const wsConfig = ctx.config.websocket
      let authenticated = false
      let authTimer: ReturnType<typeof setTimeout> | undefined
      let pingTimer: ReturnType<typeof setInterval> | undefined
      let pongTimer: ReturnType<typeof setTimeout> | undefined
      let lastPingTs: string | null = null

      const clearTimers = () => {
        if (authTimer) {
          clearTimeout(authTimer)
          authTimer = undefined
        }

        if (pingTimer) {
          clearInterval(pingTimer)
          pingTimer = undefined
        }

        if (pongTimer) {
          clearTimeout(pongTimer)
          pongTimer = undefined
        }
      }

      const failAuth = (code: string, message: string) => {
        sendMessage(socket, { type: 'auth_fail', code, message })
        socket.close(4401, message)
        clearTimers()
      }

      const startPingLoop = () => {
        pingTimer = setInterval(() => {
          if (socket.readyState !== WS_OPEN) {
            return
          }

          lastPingTs = new Date().toISOString()
          sendMessage(socket, { type: 'ping', ts: lastPingTs })

          if (pongTimer) {
            clearTimeout(pongTimer)
          }

          pongTimer = setTimeout(() => {
            socket.close(1000, 'Pong timeout')
          }, wsConfig.pongTimeoutSeconds * 1000)
        }, wsConfig.pingIntervalSeconds * 1000)
      }

      const completeAuth = async (token: string) => {
        if (authenticated) {
          return
        }

        try {
          const device = await authenticateDevice(ctx, namespaceId, token)
          if (!device) {
            failAuth('WS_AUTH_INVALID', 'Device token is invalid or revoked')
            return
          }

          if (device.namespaceId !== namespaceId) {
            failAuth('WS_NAMESPACE_MISMATCH', 'Token namespace does not match path')
            return
          }

          if (hub.countNamespaceConnections(namespaceId) >= wsConfig.maxConnectionsPerNamespace) {
            sendMessage(socket, {
              type: 'error',
              code: 'WS_TOO_MANY_CONNECTIONS',
              message: 'Namespace connection limit reached',
            })
            socket.close(4429, 'Too many connections')
            clearTimers()
            return
          }

          if (hub.countDeviceConnections(namespaceId, device.deviceUuid) >= wsConfig.maxConnectionsPerDevice) {
            sendMessage(socket, {
              type: 'error',
              code: 'WS_TOO_MANY_CONNECTIONS',
              message: 'Device connection limit reached',
            })
            socket.close(4429, 'Too many connections')
            clearTimers()
            return
          }

          authenticated = true
          if (authTimer) {
            clearTimeout(authTimer)
            authTimer = undefined
          }

          hub.subscribe(namespaceId, socket, {
            namespaceId,
            deviceId: device.deviceId,
            deviceUuid: device.deviceUuid,
          })

          sendMessage(socket, {
            type: 'auth_ok',
            deviceId: device.deviceId,
            namespaceId,
            serverTime: new Date().toISOString(),
          })

          startPingLoop()
        } catch {
          failAuth('WS_AUTH_INVALID', 'Authentication failed')
        }
      }

      const headerToken = extractBearerToken(request.headers.authorization)
      if (headerToken) {
        void completeAuth(headerToken)
      } else {
        authTimer = setTimeout(() => {
          if (!authenticated) {
            failAuth('WS_AUTH_REQUIRED', 'Authentication message not received in time')
          }
        }, AUTH_MESSAGE_TIMEOUT_MS)
      }

      socket.on('message', (raw) => {
        let parsed: unknown
        try {
          parsed = JSON.parse(String(raw))
        } catch {
          sendMessage(socket, { type: 'error', code: 'WS_INVALID_MESSAGE', message: 'Invalid JSON' })
          return
        }

        let message
        try {
          message = parseWsClientMessage(parsed)
        } catch {
          sendMessage(socket, { type: 'error', code: 'WS_INVALID_MESSAGE', message: 'Invalid message shape' })
          return
        }

        if (message.type === 'auth') {
          void completeAuth(message.token)
          return
        }

        if (!authenticated) {
          failAuth('WS_AUTH_REQUIRED', 'Authentication required before other messages')
          return
        }

        if (message.type === 'pong') {
          if (pongTimer && lastPingTs === message.ts) {
            clearTimeout(pongTimer)
            pongTimer = undefined
          }
        }
      })

      socket.on('close', () => {
        clearTimers()
        if (authenticated) {
          hub.unsubscribe(namespaceId, socket)
        }
      })
    },
  )
}
