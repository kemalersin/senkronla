import type { EsrDocEnvelope, RecoveryKeyProof } from '@senkronla/protocol'

export interface NamespaceLimits {
  freeDeviceLimit: number
  purchasedSlots: number
  maxDevices: number
  activeDevices: number
  canAddDevice?: boolean
  onLimitReached?: {
    mode: 'payment' | 'block'
    slotPackages: number[]
  }
}

export interface HeadMeta {
  revision: string
  writtenAt: string
  deviceId: string
  contentSha256: string
  contentMagic: string
  sizeBytes: number
}

export interface LimitsChangedPayload {
  maxDevices: number
  activeDevices: number
  purchasedSlots: number
}

export type NotificationConnectionState = 'disconnected' | 'connecting' | 'connected' | 'paused'

export type NotificationMode = 'ws_with_poll_fallback' | 'poll_only'

export interface DeviceInfo {
  deviceId: string
  clientDeviceId: string
  label: string
  pairedAt: string
  lastSeenAt: string | null
  isCurrent: boolean
}

export interface CreateNamespaceInput {
  namespaceId: string
  namespaceLabel: string
  recoveryKeyProof: RecoveryKeyProof
  deviceLabel: string
  clientDeviceId: string
}

export interface CreateNamespaceResult {
  namespaceId: string
  deviceToken: string
  deviceId: string
  limits: NamespaceLimits
}

export interface PairingTokenResult {
  code: string
  expiresAt: string
  qrPayload: string
}

export interface RedeemPairingInput {
  namespaceId: string
  pairingCode: string
  deviceLabel: string
}

export interface RedeemPairingResult {
  deviceToken: string
  deviceId: string
  limits: NamespaceLimits
}

export interface RecoverInput {
  namespaceId: string
  recoveryKeyProof: RecoveryKeyProof
  deviceLabel: string
  clientDeviceId: string
}

export interface RecoverResult {
  deviceToken: string
  deviceId: string
  revokedDeviceCount: number
  limits: NamespaceLimits
}

export interface PushDocumentInput {
  namespaceId: string
  envelope: EsrDocEnvelope
  expectedRevision?: string | null
}

export interface PushDocumentResult {
  revision: string
  writtenAt: string
  contentSha256: string
}

export interface RedeemUnlockResult {
  slotsAdded: number
  purchasedSlots: number
  maxDevices: number
  canAddDevice: boolean
}

export interface DocumentAdapter {
  buildDocument(): Promise<string>
  importDocument(documentJson: string): Promise<void>
  contentType(): string
  encryption(): {
    enabled: boolean
    resolvePassword(): Promise<string | undefined>
  }
  namespaceId(): string
  namespaceLabel(): string
}

export interface EsrStorage {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  remove(key: string): Promise<void>
}

export interface ConflictContext {
  namespaceId: string
  knownRevision: string | null
  remoteRevision: string
  remoteMeta: HeadMeta
}

export interface DeviceLimitContext {
  namespaceId: string
  code: 'DEVICE_LIMIT_PAYMENT_REQUIRED' | 'DEVICE_LIMIT_BLOCKED'
  limits: NamespaceLimits
  slotPackages?: number[]
}

export type EsrSyncStatus =
  | 'disabled'
  | 'idle'
  | 'syncing'
  | 'pending_push'
  | 'remote_pending'
  | 'conflict'
  | 'error'
  | 'offline'
  | 'ws_connected'

export interface EsrSyncConnectOptions {
  relayUrl: string
  document: DocumentAdapter
  storage: EsrStorage
  /** Optional fetch override (tests, custom runtime) */
  fetch?: typeof fetch
  enabled?: boolean
  deviceLabel?: string
  pushDebounceMs?: number
  pullIntervalConnectedMs?: number
  pullIntervalDisconnectedMs?: number
  pauseSchedulerWhenHidden?: boolean
  notificationsEnabled?: boolean
  notificationMode?: NotificationMode
  /** Check server health for websocket.enabled before WS connect */
  websocketEnabled?: boolean
  persistRecoveryPhrase?: boolean
  onRecoveryPhrase: (ctx: { phrase: string; namespaceId: string }) => void | Promise<void>
  onConflict: (ctx: ConflictContext) => Promise<'remote' | 'local' | 'cancel'>
  onDeviceLimit?: (ctx: DeviceLimitContext) => void | Promise<void>
  onError?: (err: import('./errors.js').EsrError) => void
  onStatusChange?: (status: EsrSyncStatus) => void
}

export interface EnsureNamespaceResult {
  namespaceId: string
  created: boolean
  recoveryPhrase?: string
}

export interface PairingHostResult {
  code: string
  qrPayload: string
  expiresAt: string
}

export type SyncRunResult =
  | { status: 'ok' }
  | { status: 'conflict'; ctx: ConflictContext }
  | { status: 'offline' }
  | { status: 'error'; error: import('./errors.js').EsrError }

export interface SyncResult {
  status: 'ok' | 'conflict' | 'offline' | 'error'
  remoteMeta?: HeadMeta
  ctx?: ConflictContext
  error?: import('./errors.js').EsrError
}
