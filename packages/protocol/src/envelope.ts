import { z } from 'zod'
import { sha256Hex } from './crypto.js'
import { DocumentIdSchema } from './document-id.js'

export const ESR_DOC1_MAGIC = 'ESR-DOC1' as const
export const ENVELOPE_SCHEMA_VERSION = 1 as const
export const ENVELOPE_SCHEMA_VERSION_V2 = 2 as const

export const InnerContentMagic = z.enum(['ENV-RAW1', 'ENV-ENC1'])
export type InnerContentMagic = z.infer<typeof InnerContentMagic>

const envelopeCommonFields = {
  magic: z.literal(ESR_DOC1_MAGIC),
  namespaceId: z.string().uuid(),
  namespaceLabel: z.string().min(1).max(256),
  revision: z.string().min(1).max(64),
  deviceId: z.string().min(1).max(64),
  writtenAt: z.string().datetime(),
  contentType: z.string().min(1).max(128),
  contentMagic: InnerContentMagic,
  contentSha256: z.string().regex(/^[a-f0-9]{64}$/),
  payload: z.string().min(1),
}

export const EsrDocEnvelopeV1Schema = z.object({
  ...envelopeCommonFields,
  schemaVersion: z.literal(ENVELOPE_SCHEMA_VERSION),
  documentId: z.literal('primary'),
})

export const EsrDocEnvelopeV2Schema = z.object({
  ...envelopeCommonFields,
  schemaVersion: z.literal(ENVELOPE_SCHEMA_VERSION_V2),
  documentId: DocumentIdSchema,
})

export const EsrDocEnvelopeSchema = z.discriminatedUnion('schemaVersion', [
  EsrDocEnvelopeV1Schema,
  EsrDocEnvelopeV2Schema,
])

export type EsrDocEnvelope = z.infer<typeof EsrDocEnvelopeSchema>
export type EsrDocEnvelopeV1 = z.infer<typeof EsrDocEnvelopeV1Schema>
export type EsrDocEnvelopeV2 = z.infer<typeof EsrDocEnvelopeV2Schema>

export interface VerifyEnvelopeOptions {
  namespaceId?: string
  documentId?: string
}

export interface VerifyEnvelopeResult {
  ok: true
}

export interface VerifyEnvelopeFailure {
  ok: false
  reason: string
}

export function parseEnvelope(input: unknown): EsrDocEnvelope {
  return EsrDocEnvelopeSchema.parse(input)
}

export function verifyEnvelope(
  envelope: EsrDocEnvelope,
  options: VerifyEnvelopeOptions = {},
): VerifyEnvelopeResult | VerifyEnvelopeFailure {
  if (options.namespaceId && envelope.namespaceId !== options.namespaceId) {
    return { ok: false, reason: 'namespaceId mismatch' }
  }

  if (options.documentId && envelope.documentId !== options.documentId) {
    return { ok: false, reason: 'documentId mismatch' }
  }

  const hash = sha256Hex(envelope.payload)
  if (hash !== envelope.contentSha256.toLowerCase()) {
    return { ok: false, reason: 'contentSha256 mismatch' }
  }

  return { ok: true }
}
