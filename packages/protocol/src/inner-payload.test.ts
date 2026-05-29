import { describe, expect, it } from 'vitest'
import {
  buildEnvEnc1Payload,
  buildEnvRaw1Payload,
  buildInnerPayload,
  ENV_ENC1_DEFAULT_ITERATIONS,
  extractDocumentFromInnerPayload,
  innerPayloadContentMagic,
  parseInnerPayload,
  verifyInnerPayloadSha256,
} from './inner-payload.js'
import { sha256Hex } from './crypto.js'

describe('@senkronla/protocol inner payload', () => {
  it('builds and parses ENV-RAW1', async () => {
    const payload = buildEnvRaw1Payload('{"note":"Hello"}')
    expect(parseInnerPayload(payload)).toEqual({
      magic: 'ENV-RAW1',
      data: '{"note":"Hello"}',
    })
    await expect(extractDocumentFromInnerPayload(payload)).resolves.toBe('{"note":"Hello"}')
  })

  it('encrypts and decrypts ENV-ENC1 roundtrip', async () => {
    const documentJson = '{"note":"Hello"}'
    const password = 'sync-passphrase'
    const payload = await buildEnvEnc1Payload(documentJson, password)

    expect(innerPayloadContentMagic(payload)).toBe('ENV-ENC1')
    await expect(extractDocumentFromInnerPayload(payload, password)).resolves.toBe(documentJson)
    await expect(extractDocumentFromInnerPayload(payload, 'wrong-password')).rejects.toThrow()
  })

  it('uses deterministic salt and nonce when provided', async () => {
    const salt = Uint8Array.from({ length: 16 }, (_, index) => index + 1)
    const nonce = Uint8Array.from({ length: 12 }, (_, index) => index + 1)
    const payload = await buildEnvEnc1Payload('{"note":"Hello"}', 'demo-sync-passphrase', {
      salt,
      nonce,
      iterations: ENV_ENC1_DEFAULT_ITERATIONS,
    })

    expect(payload).toContain('"magic":"ENV-ENC1"')
    expect(payload).toContain('"salt":"AQIDBAUGBwgJCgsMDQ4PEA"')
    expect(payload).toContain('"nonce":"AQIDBAUGBwgJCgsM"')
    expect(verifyInnerPayloadSha256(payload, sha256Hex(payload))).toBe(true)
    await expect(
      extractDocumentFromInnerPayload(payload, 'demo-sync-passphrase'),
    ).resolves.toBe('{"note":"Hello"}')
  })

  it('buildInnerPayload selects content magic', async () => {
    const raw = await buildInnerPayload('{"a":1}')
    expect(raw.contentMagic).toBe('ENV-RAW1')

    const enc = await buildInnerPayload('{"a":1}', {
      encrypt: true,
      password: 'pw',
      encOptions: {
        salt: Uint8Array.from({ length: 16 }, () => 9),
        nonce: Uint8Array.from({ length: 12 }, () => 8),
      },
    })
    expect(enc.contentMagic).toBe('ENV-ENC1')
  })
})
