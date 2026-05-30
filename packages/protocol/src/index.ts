/** ESR-DOC1 envelope magic string */
export const ESR_DOC1_MAGIC = 'ESR-DOC1' as const

/** Supported envelope schema version (v1) */
export const ENVELOPE_SCHEMA_VERSION = 1 as const

export { isValidNamespaceId, generateNamespaceId } from './identity.js'
export { sha256Hex } from './crypto.js'
export {
  buildRecoveryKeyProof,
  generateRecoveryPhrase,
  isValidRecoveryPhrase,
  normalizeRecoveryPhrase,
  verifyRecoveryKeyProof,
  verifyStoredRecoveryProof,
  RECOVERY_ARGON2_DEFAULTS,
  RECOVERY_HASH_BYTES,
  RECOVERY_SALT_BYTES,
  type BuildRecoveryKeyProofOptions,
  type RecoveryArgon2Options,
  type RecoveryKeyProof,
} from './recovery.js'
export {
  DocumentIdSchema,
  DOCUMENT_ID_PATTERN,
  isValidDocumentId,
} from './document-id.js'
export {
  ENVELOPE_SCHEMA_VERSION_V2,
  EsrDocEnvelopeSchema,
  EsrDocEnvelopeV1Schema,
  EsrDocEnvelopeV2Schema,
  InnerContentMagic,
  parseEnvelope,
  verifyEnvelope,
  type EsrDocEnvelope,
  type EsrDocEnvelopeV1,
  type EsrDocEnvelopeV2,
  type InnerContentMagic as InnerContentMagicType,
  type VerifyEnvelopeFailure,
  type VerifyEnvelopeOptions,
  type VerifyEnvelopeResult,
} from './envelope.js'
export {
  ENV_ENC1_DEFAULT_ITERATIONS,
  ENV_ENC1_NONCE_BYTES,
  ENV_ENC1_SALT_BYTES,
  buildEnvEnc1Payload,
  buildEnvRaw1Payload,
  buildInnerPayload,
  extractDocumentFromInnerPayload,
  innerPayloadContentMagic,
  parseInnerPayload,
  verifyInnerPayloadSha256,
  type BuildEnvEnc1Options,
  type EnvEnc1Inner,
  type EnvInnerPayload,
  type EnvRaw1Inner,
} from './inner-payload.js'
export {
  NATIVE_PLATFORMS,
  isNativePlatform,
  type AppPlatform,
  type NativePlatform,
} from './native-platform.js'
export {
  WS_SUBPROTOCOL,
  WsClientMessageSchema,
  WsHeadChangedSchema,
  WsLimitsChangedSchema,
  WsServerMessageSchema,
  parseWsClientMessage,
  parseWsServerMessage,
  type WsClientMessage,
  type WsHeadChanged,
  type WsLimitsChanged,
  type WsServerMessage,
} from './ws.js'
