import { describe, expect, it } from 'vitest'
import { parseWsClientMessage, parseWsServerMessage, WsServerMessageSchema } from './ws.js'

describe('ws messages', () => {
  it('parses head_changed', () => {
    const message = parseWsServerMessage({
      type: 'head_changed',
      documentId: 'primary',
      revision: '01ABC',
      contentSha256: 'a'.repeat(64),
      writtenAt: '2026-01-01T00:00:00.000Z',
      writerDeviceId: 'dev-1',
    })

    expect(message.type).toBe('head_changed')
  })

  it('rejects invalid message', () => {
    expect(() => WsServerMessageSchema.parse({ type: 'unknown' })).toThrow()
  })

  it('parses subscribe with documentIds', () => {
    const message = parseWsClientMessage({
      type: 'subscribe',
      documentIds: ['primary', 'settings'],
    })
    expect(message.type).toBe('subscribe')
    if (message.type === 'subscribe') {
      expect(message.documentIds).toEqual(['primary', 'settings'])
    }
  })
})
