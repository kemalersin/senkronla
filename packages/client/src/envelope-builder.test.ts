import { describe, expect, it } from 'vitest'
import { buildEnvelope, extractDocument } from './envelope-builder.js'

describe('@senkronla/client envelope-builder', () => {
  it('builds encrypted envelopes when encrypt is enabled', async () => {
    const envelope = await buildEnvelope({
      namespaceId: '550e8400-e29b-41d4-a716-446655440000',
      namespaceLabel: 'Demo',
      documentJson: '{"note":"Hello"}',
      deviceId: 'device-1',
      contentType: 'application/json',
      documentId: 'notes',
      encrypt: true,
      password: 'demo-sync-passphrase',
      encOptions: {
        salt: Uint8Array.from({ length: 16 }, (_, index) => index + 1),
        nonce: Uint8Array.from({ length: 12 }, (_, index) => index + 1),
      },
    })

    expect(envelope.contentMagic).toBe('ENV-ENC1')
    await expect(extractDocument(envelope, 'demo-sync-passphrase')).resolves.toBe('{"note":"Hello"}')
  })

  it('requires password when encryption is enabled', async () => {
    await expect(
      buildEnvelope({
        namespaceId: '550e8400-e29b-41d4-a716-446655440000',
        namespaceLabel: 'Demo',
        documentJson: '{}',
        deviceId: 'device-1',
        contentType: 'application/json',
        encrypt: true,
      }),
    ).rejects.toMatchObject({ code: 'ESR_CLIENT_ENCRYPTION_PASSWORD_REQUIRED' })
  })
})
