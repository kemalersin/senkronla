import {
  buildRecoveryKeyProof,
  ENVELOPE_SCHEMA_VERSION,
  ENVELOPE_SCHEMA_VERSION_V2,
  isValidDocumentId,
  parseEnvelope,
  type EsrDocEnvelope,
} from '@senkronla/protocol'
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
  documentId?: string
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
  const documentId = input.documentId ?? 'primary'

  if (!isValidDocumentId(documentId)) {
    throw new EsrError('ESR_CLIENT_INVALID_DOCUMENT_ID', 'documentId format is invalid')
  }

  const writtenAt = new Date().toISOString()
  const contentSha256 = await sha256Hex(innerPayload)
  const common = {
    magic: 'ESR-DOC1' as const,
    namespaceId: input.namespaceId,
    namespaceLabel: input.namespaceLabel,
    revision,
    deviceId: input.deviceId,
    writtenAt,
    contentType: input.contentType,
    contentMagic: 'ENV-RAW1' as const,
    contentSha256,
    payload: innerPayload,
  }

  if (documentId === 'primary') {
    return {
      ...common,
      schemaVersion: ENVELOPE_SCHEMA_VERSION,
      documentId: 'primary',
    }
  }

  return {
    ...common,
    schemaVersion: ENVELOPE_SCHEMA_VERSION_V2,
    documentId,
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
