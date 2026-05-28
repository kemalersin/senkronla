import { buildRecoveryKeyProof, parseEnvelope, type EsrDocEnvelope } from '@senkronla/protocol'
import { ulid } from 'ulid'
import { EsrError } from './errors.js'

async function sha256Hex(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export interface BuildEnvelopeInput {
  namespaceId: string
  namespaceLabel: string
  documentJson: string
  deviceId: string
  contentType: string
  encrypt?: boolean
  password?: string
  revision?: string
}

export async function buildEnvelope(input: BuildEnvelopeInput): Promise<EsrDocEnvelope> {
  if (input.encrypt) {
    throw new EsrError(
      'ESR_CLIENT_ENC_NOT_IMPLEMENTED',
      'ENV-ENC1 encryption is not implemented yet; set encryption.enabled to false',
    )
  }

  const innerPayload = JSON.stringify({
    magic: 'ENV-RAW1',
    data: input.documentJson,
  })

  const revision = input.revision ?? ulid()

  return {
    magic: 'ESR-DOC1',
    schemaVersion: 1,
    namespaceId: input.namespaceId,
    namespaceLabel: input.namespaceLabel,
    documentId: 'primary',
    revision,
    deviceId: input.deviceId,
    writtenAt: new Date().toISOString(),
    contentType: input.contentType,
    contentMagic: 'ENV-RAW1',
    contentSha256: await sha256Hex(innerPayload),
    payload: innerPayload,
  }
}

export function extractRawDocument(envelope: EsrDocEnvelope): string {
  const parsed = parseEnvelope(envelope)

  let inner: { magic?: string; data?: string }
  try {
    inner = JSON.parse(parsed.payload) as { magic?: string; data?: string }
  } catch {
    throw new EsrError('ESR_CLIENT_INVALID_ENVELOPE', 'Envelope inner payload is invalid')
  }

  if (inner.magic !== 'ENV-RAW1' || typeof inner.data !== 'string') {
    throw new EsrError('ESR_CLIENT_UNSUPPORTED_CONTENT', 'Unsupported envelope content magic')
  }

  return inner.data
}

export { buildRecoveryKeyProof }
