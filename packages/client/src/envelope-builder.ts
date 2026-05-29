import {
  buildInnerPayload,
  buildRecoveryKeyProof,
  ENVELOPE_SCHEMA_VERSION,
  ENVELOPE_SCHEMA_VERSION_V2,
  extractDocumentFromInnerPayload,
  isValidDocumentId,
  parseEnvelope,
  type BuildEnvEnc1Options,
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
  encOptions?: BuildEnvEnc1Options
  revision?: string
}

export async function buildEnvelope(input: BuildEnvelopeInput): Promise<EsrDocEnvelope> {
  if (input.encrypt && !input.password) {
    throw new EsrError(
      'ESR_CLIENT_ENCRYPTION_PASSWORD_REQUIRED',
      'Password is required when envelope encryption is enabled',
    )
  }

  const { payload, contentMagic } = await buildInnerPayload(input.documentJson, {
    encrypt: input.encrypt,
    password: input.password,
    encOptions: input.encOptions,
  })

  const revision = input.revision ?? ulid()
  const documentId = input.documentId ?? 'primary'

  if (!isValidDocumentId(documentId)) {
    throw new EsrError('ESR_CLIENT_INVALID_DOCUMENT_ID', 'documentId format is invalid')
  }

  const writtenAt = new Date().toISOString()
  const contentSha256 = await sha256Hex(payload)
  const common = {
    magic: 'ESR-DOC1' as const,
    namespaceId: input.namespaceId,
    namespaceLabel: input.namespaceLabel,
    revision,
    deviceId: input.deviceId,
    writtenAt,
    contentType: input.contentType,
    contentMagic,
    contentSha256,
    payload,
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

export async function extractDocument(
  envelope: EsrDocEnvelope,
  password?: string,
): Promise<string> {
  const parsed = parseEnvelope(envelope)

  try {
    return await extractDocumentFromInnerPayload(parsed.payload, password)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to decode envelope payload'
    if (message.includes('Password is required')) {
      throw new EsrError('ESR_CLIENT_ENCRYPTION_PASSWORD_REQUIRED', message)
    }
    if (message.includes('Unsupported inner payload magic')) {
      throw new EsrError('ESR_CLIENT_UNSUPPORTED_CONTENT', message)
    }
    throw new EsrError('ESR_CLIENT_INVALID_ENVELOPE', message)
  }
}

/** @deprecated Use {@link extractDocument} — decryption may be async for ENV-ENC1. */
export async function extractRawDocument(
  envelope: EsrDocEnvelope,
  password?: string,
): Promise<string> {
  return extractDocument(envelope, password)
}

export { buildRecoveryKeyProof }

export type { BuildEnvEnc1Options }
