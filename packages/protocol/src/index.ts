/** ESR-DOC1 envelope magic string */
export const ESR_DOC1_MAGIC = 'ESR-DOC1' as const

/** Supported envelope schema version */
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
  EsrDocEnvelopeSchema,
  InnerContentMagic,
  parseEnvelope,
  verifyEnvelope,
  type EsrDocEnvelope,
  type InnerContentMagic as InnerContentMagicType,
  type VerifyEnvelopeFailure,
  type VerifyEnvelopeOptions,
  type VerifyEnvelopeResult,
} from './envelope.js'
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
