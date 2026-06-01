import { describe, expect, it } from 'vitest'
import {
  isWsKeepaliveMessage,
  sanitizeWsClientMessage,
  sanitizeWsServerMessage,
} from './ws-log.js'

describe('ws-log', () => {
  it('redacts auth tokens in client messages', () => {
    expect(sanitizeWsClientMessage({ type: 'auth', token: 'dvt_secret' })).toEqual({
      type: 'auth',
      token: '[REDACTED]',
    })
  })

  it('passes through non-auth client messages', () => {
    expect(sanitizeWsClientMessage({ type: 'pong', ts: '2026-01-01T00:00:00.000Z' })).toEqual({
      type: 'pong',
      ts: '2026-01-01T00:00:00.000Z',
    })
  })

  it('passes through server messages', () => {
    expect(
      sanitizeWsServerMessage({
        type: 'head_changed',
        documentId: 'primary',
        revision: '01REV',
        contentSha256: 'a'.repeat(64),
        writtenAt: '2026-01-01T00:00:00.000Z',
        writerDeviceId: 'dev-1',
      }),
    ).toMatchObject({ type: 'head_changed', documentId: 'primary' })
  })

  it('detects keepalive message types', () => {
    expect(isWsKeepaliveMessage({ type: 'ping' })).toBe(true)
    expect(isWsKeepaliveMessage({ type: 'head_changed' })).toBe(false)
  })
})
