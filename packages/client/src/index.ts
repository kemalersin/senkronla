export { EsrSync } from './esr-sync.js'
export { RelayClient } from './relay-client.js'
export { SyncEngine } from './sync-engine.js'
export { NotificationClient } from './notification-client.js'
export { createDocumentAdapter } from './document-adapter.js'
export { createLocalStorageAdapter, createMemoryStorageAdapter } from './esr-storage.js'
export { EsrError, isEsrError, isOfflineError, parseApiError } from './errors.js'
export {
  buildEnvEnc1Payload,
  buildEnvRaw1Payload,
  buildInnerPayload,
  extractDocumentFromInnerPayload,
} from '@senkronla/protocol'
export { buildEnvelope, extractDocument, extractRawDocument, buildRecoveryKeyProof } from './envelope-builder.js'
export { getOrCreateClientDeviceId, SyncStateStore } from './sync-state.js'
export { buildNotificationWsUrl } from './ws-url.js'
export {
  buildRelayHealthUrl,
  clearRelayHealthCache,
  fetchRelayWebsocketEnabled,
  resolveRelayNotificationMode,
} from './relay-health.js'
export type { RelayHealthSnapshot } from './relay-health.js'

export type {
  ConflictContext,
  CreateNamespaceInput,
  CreateNamespaceResult,
  DeviceInfo,
  DeviceLimitContext,
  DocumentAdapter,
  EnsureNamespaceResult,
  EsrSyncDocumentSlot,
  EsrStorage,
  EsrSyncConnectOptions,
  EsrSyncStatus,
  HeadChangedNotification,
  HeadMeta,
  LimitsChangedPayload,
  NamespaceInfo,
  NamespaceLimits,
  NotificationConnectionState,
  NotificationMode,
  PairingHostResult,
  PushDocumentInput,
  PushDocumentResult,
  RecoverInput,
  RecoverResult,
  RedeemPairingInput,
  RedeemPairingResult,
  RedeemUnlockResult,
  SyncResult,
  SyncRunResult,
} from './types.js'

export type { RelayClientOptions } from './relay-client.js'
export type { SyncEngineOptions } from './sync-engine.js'
export type { NotificationClientOptions } from './notification-client.js'
export type { BuildEnvelopeInput } from './envelope-builder.js'

export * from '@senkronla/protocol'

import pkg from '../package.json' with { type: 'json' }

/** Client SDK semver (matches package.json version). */
export const CLIENT_SDK_VERSION = pkg.version
