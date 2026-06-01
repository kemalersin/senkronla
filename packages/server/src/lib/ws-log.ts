import type { WsClientMessage, WsServerMessage } from '@senkronla/protocol'

const KEEPALIVE_TYPES = new Set(['ping', 'pong'])

export function isWsKeepaliveMessage(message: { type: string }): boolean {
  return KEEPALIVE_TYPES.has(message.type)
}

export function sanitizeWsClientMessage(message: WsClientMessage): Record<string, unknown> {
  if (message.type === 'auth') {
    return { type: 'auth', token: '[REDACTED]' }
  }

  return { ...message }
}

export function sanitizeWsServerMessage(message: WsServerMessage): Record<string, unknown> {
  return { ...message }
}
