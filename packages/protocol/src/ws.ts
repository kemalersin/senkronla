import { z } from 'zod'
import { DocumentIdSchema } from './document-id.js'

export const WS_SUBPROTOCOL = 'esr-notifications-v1' as const

export const WsHeadChangedSchema = z.object({
  type: z.literal('head_changed'),
  documentId: DocumentIdSchema,
  revision: z.string(),
  contentSha256: z.string(),
  writtenAt: z.string(),
  writerDeviceId: z.string(),
})

export const WsLimitsChangedSchema = z.object({
  type: z.literal('limits_changed'),
  maxDevices: z.number().int(),
  activeDevices: z.number().int(),
  purchasedSlots: z.number().int(),
})

export const WsServerMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('auth_ok'),
    deviceId: z.string(),
    namespaceId: z.string(),
    serverTime: z.string(),
  }),
  WsHeadChangedSchema,
  WsLimitsChangedSchema,
  z.object({
    type: z.literal('ping'),
    ts: z.string(),
  }),
  z.object({
    type: z.literal('error'),
    code: z.string(),
    message: z.string(),
  }),
  z.object({
    type: z.literal('auth_fail'),
    code: z.string(),
    message: z.string(),
  }),
])

export const WsClientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('auth'),
    token: z.string(),
  }),
  z.object({
    type: z.literal('pong'),
    ts: z.string(),
  }),
  z.object({
    type: z.literal('subscribe'),
    documentId: DocumentIdSchema.optional(),
    documentIds: z.array(DocumentIdSchema).min(1).max(32).optional(),
  }),
])

export type WsServerMessage = z.infer<typeof WsServerMessageSchema>
export type WsClientMessage = z.infer<typeof WsClientMessageSchema>
export type WsHeadChanged = z.infer<typeof WsHeadChangedSchema>
export type WsLimitsChanged = z.infer<typeof WsLimitsChangedSchema>

export function parseWsServerMessage(input: unknown): WsServerMessage {
  return WsServerMessageSchema.parse(input)
}

export function parseWsClientMessage(input: unknown): WsClientMessage {
  return WsClientMessageSchema.parse(input)
}
