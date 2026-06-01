import {
  buildRecoveryKeyProof,
  generateNamespaceId,
  generateRecoveryPhrase,
  isValidNamespaceId,
  normalizeRecoveryPhrase,
} from '@senkronla/protocol'
import { EsrError, isEsrError, isOfflineError } from './errors.js'
import { EsrSyncScheduler } from './esr-sync-scheduler.js'
import { resolveDocumentSlots } from './esr-sync-slots.js'
import { NotificationClient } from './notification-client.js'
import { resolveRelayNotificationMode } from './relay-health.js'
import { RelayClient } from './relay-client.js'
import { SyncEngine } from './sync-engine.js'
import { getOrCreateClientDeviceId, SyncStateStore } from './sync-state.js'
import type {
  ConflictContext,
  DeviceLimitContext,
  DocumentAdapter,
  EnsureNamespaceResult,
  EsrSyncConnectOptions,
  EsrSyncStatus,
  NamespaceLimits,
  PairingHostResult,
  SyncRunResult,
} from './types.js'

interface DocumentSyncSlot {
  documentId: string
  adapter: DocumentAdapter
  state: SyncStateStore
  engine: SyncEngine
}

function defaultDeviceLabel(): string {
  if (typeof navigator !== 'undefined' && navigator.userAgent) {
    return navigator.userAgent.slice(0, 120)
  }

  return 'ESR Device'
}

function buildLimitsFromDetails(details: unknown): NamespaceLimits {
  const parsed = (details ?? {}) as Record<string, unknown>
  return {
    freeDeviceLimit: Number(parsed.freeDeviceLimit ?? 0),
    purchasedSlots: Number(parsed.purchasedSlots ?? 0),
    maxDevices: Number(parsed.maxDevices ?? 0),
    activeDevices: Number(parsed.activeDevices ?? 0),
  }
}

function aggregateStatus(slots: DocumentSyncSlot[], fallback: EsrSyncStatus): EsrSyncStatus {
  if (slots.some((slot) => slot.engine.getPendingConflict())) {
    return 'conflict'
  }

  if (slots.some((slot) => slot.state.hasLocalChanges())) {
    return 'pending_push'
  }

  return fallback
}

export class EsrSync {
  readonly namespaceId: string
  readonly relayUrl: string
  readonly relay: RelayClient
  readonly documentIds: readonly string[]
  /** Primary (or sole) document adapter — backward compatible shorthand. */
  readonly adapter: DocumentAdapter

  private readonly options: EsrSyncConnectOptions
  private readonly slots: DocumentSyncSlot[]
  private readonly slotById: Map<string, DocumentSyncSlot>
  private readonly sharedState: SyncStateStore
  private notifications: NotificationClient | null
  private scheduler: EsrSyncScheduler | null = null
  private enabled: boolean
  private status: EsrSyncStatus = 'idle'
  private lastError: EsrError | null = null

  private constructor(
    options: EsrSyncConnectOptions,
    slots: DocumentSyncSlot[],
    relay: RelayClient,
    sharedState: SyncStateStore,
    notifications: NotificationClient | null,
    enabled: boolean,
  ) {
    this.options = options
    this.slots = slots
    this.slotById = new Map(slots.map((slot) => [slot.documentId, slot]))
    this.documentIds = slots.map((slot) => slot.documentId)
    this.adapter = slots.find((slot) => slot.documentId === 'primary')?.adapter ?? slots[0]!.adapter
    this.namespaceId = this.adapter.namespaceId()
    this.relayUrl = options.relayUrl.replace(/\/$/, '')
    this.relay = relay
    this.sharedState = sharedState
    this.notifications = notifications
    this.enabled = enabled
    this.status = enabled ? 'idle' : 'disabled'
  }

  static async connect(options: EsrSyncConnectOptions): Promise<EsrSync> {
    const resolved = resolveDocumentSlots(options)
    const namespaceId = resolved[0]!.adapter.namespaceId()
    const clientDeviceId = await getOrCreateClientDeviceId(options.storage)
    const sharedState = new SyncStateStore(options.storage, namespaceId, 'primary')

    const relay = new RelayClient({
      baseUrl: options.relayUrl,
      clientDeviceId,
      appId: options.appId,
      appPlatform: options.appPlatform,
      bundleId: options.bundleId,
      clientSecret: options.clientSecret,
      clientVersion: options.clientVersion,
      getDeviceToken: () => sharedState.getDeviceToken(),
      onDeviceToken: (token) => sharedState.setDeviceToken(token),
      fetch: options.fetch,
    })

    const slots: DocumentSyncSlot[] = []

    for (const { documentId, adapter } of resolved) {
      const state = new SyncStateStore(options.storage, namespaceId, documentId)
      await state.migrateLegacyRevisionState()

      const engine = new SyncEngine(relay, adapter, state, documentId, {
        onConflict: options.onConflict,
      })

      if (options.pushDebounceMs !== undefined) {
        engine.setPushDebounceMs(options.pushDebounceMs)
      }

      slots.push({ documentId, adapter, state, engine })
    }

    let instanceRef!: EsrSync

    const notificationsEnabled = options.notificationsEnabled !== false
    const documentIds = slots.map((slot) => slot.documentId)
    const notificationMode = notificationsEnabled
      ? await resolveRelayNotificationMode({
          relayUrl: options.relayUrl,
          fetch: options.fetch,
          notificationMode: options.notificationMode,
          websocketEnabled: options.websocketEnabled,
        })
      : null
    const notifications = notificationsEnabled
      ? new NotificationClient({
          relayUrl: options.relayUrl,
          client: relay,
          namespaceId,
          documentIds,
          getDeviceToken: () => sharedState.getDeviceToken(),
          mode: notificationMode ?? 'poll_only',
          pollIntervalMs: options.pullIntervalDisconnectedMs ?? 45_000,
          pollIntervalConnectedMs: options.pullIntervalConnectedMs ?? 300_000,
          pauseWhenHidden: options.pauseSchedulerWhenHidden !== false,
          onConnectionStateChange: () => {
            instanceRef.handleNotificationStateChange()
          },
          onHeadChanged: async ({ documentId, meta }) => {
            if (!instanceRef.enabled) {
              return
            }

            const slot = instanceRef.slotById.get(documentId)
            if (!slot) {
              return
            }

            const result = await slot.engine.handleRemoteHeadMeta(meta)
            if (result.status === 'conflict' && result.ctx) {
              await instanceRef.handleConflict(result.ctx)
            }
          },
        })
      : null

    const enabled = options.enabled !== false
    const instance = new EsrSync(options, slots, relay, sharedState, notifications, enabled)
    instanceRef = instance

    if (enabled) {
      instance.scheduler = new EsrSyncScheduler(instance, {
        pushDebounceMs: options.pushDebounceMs ?? 2000,
        pullIntervalConnectedMs: options.pullIntervalConnectedMs ?? 300_000,
        pullIntervalDisconnectedMs: options.pullIntervalDisconnectedMs ?? 45_000,
        pauseWhenHidden: options.pauseSchedulerWhenHidden !== false,
      })
      instance.enable()
    } else {
      instance.setStatus('disabled')
    }

    return instance
  }

  getSlot(documentId: string): DocumentSyncSlot | undefined {
    return this.slotById.get(documentId)
  }

  private slotsForDocument(documentId?: string): DocumentSyncSlot[] {
    if (!documentId) {
      return this.slots
    }

    const slot = this.slotById.get(documentId)
    if (!slot) {
      throw new EsrError('ESR_CLIENT_UNKNOWN_DOCUMENT_ID', `Unknown documentId: ${documentId}`)
    }

    return [slot]
  }

  enable(): void {
    this.enabled = true
    this.notifications?.connect()
    this.scheduler?.start()
    this.setStatus(this.notifications?.isConnected() ? 'ws_connected' : 'idle')
  }

  disable(): void {
    this.enabled = false
    this.notifications?.disconnect()
    this.scheduler?.stop()
    this.setStatus('disabled')
  }

  destroy(): void {
    this.disable()
  }

  isNotificationConnected(): boolean {
    return this.notifications?.isConnected() ?? false
  }

  /** Bildirim istemcisi (WS / poll) aktif mi — varsa EsrSyncScheduler devre dışı kalır. */
  hasNotifications(): boolean {
    return this.notifications !== null
  }

  handleNotificationStateChange(): void {
    if (!this.enabled) {
      return
    }

    this.scheduler?.stop()
    this.scheduler?.start()
    this.setStatus(this.notifications?.isConnected() ? 'ws_connected' : 'idle')
  }

  async ensureNamespace(opts?: {
    namespaceId?: string
    namespaceLabel?: string
  }): Promise<EnsureNamespaceResult> {
    const namespaceId = this.resolveNamespaceId(opts?.namespaceId)
    const namespaceLabel = opts?.namespaceLabel ?? this.adapter.namespaceLabel()

    const token = await this.sharedState.getDeviceToken()
    if (token) {
      try {
        await this.relay.getNamespace(namespaceId)
        return { namespaceId, created: false }
      } catch (error) {
        if (
          isEsrError(error) &&
          (error.code === 'DEVICE_TOKEN_INVALID' ||
            error.code === 'UNAUTHORIZED' ||
            error.code === 'NAMESPACE_NOT_FOUND')
        ) {
          await this.sharedState.clearDeviceToken()
        } else if (!isOfflineError(error)) {
          await this.handleDeviceLimit(error)
          throw error
        } else {
          throw error
        }
      }
    }

    const phrase = generateRecoveryPhrase()
    const recoveryKeyProof = await buildRecoveryKeyProof(phrase)

    try {
      await this.relay.createNamespace({
        namespaceId,
        namespaceLabel,
        recoveryKeyProof,
        deviceLabel: this.options.deviceLabel ?? defaultDeviceLabel(),
        clientDeviceId: this.relay.clientDeviceId,
      })
    } catch (error) {
      if (isEsrError(error) && error.code === 'NAMESPACE_EXISTS') {
        throw new EsrError(
          'ESR_CLIENT_NAMESPACE_EXISTS',
          'This namespace was created on another device; use pairing or recovery',
          { status: 409 },
        )
      }

      await this.handleDeviceLimit(error)
      throw error
    }

    await this.options.onRecoveryPhrase({ phrase, namespaceId })

    if (this.options.persistRecoveryPhrase) {
      await this.sharedState.setRecoveryPhrase(phrase)
    }

    const primarySlot = this.slotById.get('primary') ?? this.slots[0]!
    primarySlot.state.markLocalMutation()
    await primarySlot.engine.push()

    return { namespaceId, created: true, recoveryPhrase: phrase }
  }

  async startPairing(options?: { ttlSeconds?: number; allowedAppIds?: string[] }): Promise<PairingHostResult> {
    try {
      return await this.relay.createPairingToken(this.namespaceId, options)
    } catch (error) {
      await this.handleDeviceLimit(error)
      throw error
    }
  }

  async joinPairing(pairingCode: string): Promise<void> {
    try {
      await this.relay.redeemPairingCode({
        namespaceId: this.namespaceId,
        pairingCode,
        deviceLabel: this.options.deviceLabel ?? defaultDeviceLabel(),
      })
    } catch (error) {
      await this.handleDeviceLimit(error)
      throw error
    }

    await this.sync()
  }

  async sync(documentId?: string): Promise<SyncRunResult> {
    if (!this.enabled) {
      return { status: 'ok' }
    }

    const targets = this.slotsForDocument(documentId)

    const token = await this.sharedState.getDeviceToken()
    if (!token) {
      const error = new EsrError(
        'ESR_CLIENT_NO_TOKEN',
        'Device token missing; call ensureNamespace, joinPairing, or recover',
      )
      this.recordError(error)
      return { status: 'error', error }
    }

    this.setStatus('syncing')

    try {
      let firstConflict: ConflictContext | undefined

      for (const slot of targets) {
        let result = await slot.engine.syncFull()

        if (result.status === 'offline') {
          this.setStatus('offline')
          return { status: 'offline' }
        }

        if (result.status === 'conflict' && result.ctx) {
          result = await this.handleConflict(result.ctx)
        }

        if (result.status === 'conflict' && result.ctx) {
          firstConflict ??= result.ctx
          continue
        }

        if (result.status === 'error' && result.error) {
          this.recordError(result.error)
          return { status: 'error', error: result.error }
        }
      }

      if (firstConflict) {
        this.setStatus('conflict')
        return { status: 'conflict', ctx: firstConflict }
      }

      this.lastError = null
      const base = this.notifications?.isConnected() ? 'ws_connected' : 'idle'
      this.setStatus(aggregateStatus(this.slots, base))
      return { status: 'ok' }
    } catch (error) {
      if (isOfflineError(error)) {
        this.setStatus('offline')
        return { status: 'offline' }
      }

      const esrError = isEsrError(error) ? error : new EsrError('ESR_CLIENT_SYNC_FAILED', String(error))
      await this.handleDeviceLimit(esrError)
      this.recordError(esrError)
      return { status: 'error', error: esrError }
    }
  }

  notifyLocalChange(documentId?: string): void {
    if (!this.enabled) {
      return
    }

    const targets = this.slotsForDocument(documentId)

    for (const slot of targets) {
      slot.engine.notifyLocalChange()
      this.options.onDocumentStatusChange?.(slot.documentId, 'pending_push')
    }

    this.setStatus('pending_push')
  }

  /** Yerel değişiklik bayrağı — debounce/push tetiklemez (harici scheduler için). */
  markLocalChange(documentId?: string): void {
    if (!this.enabled) {
      return
    }

    const targets = this.slotsForDocument(documentId)

    for (const slot of targets) {
      slot.engine.markLocalMutationOnly()
      this.options.onDocumentStatusChange?.(slot.documentId, 'pending_push')
    }

    this.setStatus('pending_push')
  }

  cancelDebouncedPush(documentId?: string): void {
    const targets = this.slotsForDocument(documentId)

    for (const slot of targets) {
      slot.engine.cancelDebouncedPush()
    }
  }

  async flushPush(documentId?: string): Promise<void> {
    const targets = this.slotsForDocument(documentId)

    for (const slot of targets) {
      const result = await slot.engine.flushPush()
      if (result.status === 'conflict' && result.ctx) {
        await this.handleConflict(result.ctx)
      }
    }
  }

  async listDevices() {
    return this.relay.listDevices(this.namespaceId)
  }

  async revokeDevice(deviceId: string): Promise<void> {
    await this.relay.revokeDevice(this.namespaceId, deviceId)
  }

  async redeemUnlockCode(code: string): Promise<void> {
    await this.relay.redeemUnlockCode(this.namespaceId, code)
  }

  async recover(recoveryPhrase: string): Promise<void> {
    const normalized = normalizeRecoveryPhrase(recoveryPhrase)
    const recoveryKeyProof = await buildRecoveryKeyProof(normalized)

    try {
      await this.relay.recover({
        namespaceId: this.namespaceId,
        recoveryKeyProof,
        deviceLabel: this.options.deviceLabel ?? defaultDeviceLabel(),
        clientDeviceId: this.relay.clientDeviceId,
      })
    } catch (error) {
      await this.handleDeviceLimit(error)
      throw error
    }

    await this.sync()
  }

  async resolveConflict(choice: 'remote' | 'local', documentId?: string): Promise<void> {
    const targets = documentId
      ? this.slotsForDocument(documentId)
      : this.slots.filter((slot) => slot.engine.getPendingConflict())

    for (const slot of targets) {
      const result = await slot.engine.resolveConflict(choice)
      if (result.status === 'conflict' && result.ctx) {
        this.setStatus('conflict')
        this.options.onDocumentStatusChange?.(slot.documentId, 'conflict')
        return
      }
    }

    const base = this.notifications?.isConnected() ? 'ws_connected' : 'idle'
    this.setStatus(aggregateStatus(this.slots, base))
  }

  getStatus(): EsrSyncStatus {
    return this.status
  }

  getLastError(): EsrError | null {
    return this.lastError
  }

  private resolveNamespaceId(explicit?: string): string {
    if (explicit && isValidNamespaceId(explicit)) {
      return explicit
    }

    const fromAdapter = this.adapter.namespaceId()
    if (isValidNamespaceId(fromAdapter)) {
      return fromAdapter
    }

    return generateNamespaceId()
  }

  private async handleConflict(ctx: ConflictContext) {
    this.setStatus('conflict')
    this.options.onDocumentStatusChange?.(ctx.documentId, 'conflict')
    const choice = await this.options.onConflict(ctx)

    if (choice === 'cancel') {
      const error = new EsrError('ESR_CLIENT_CONFLICT_CANCELLED', 'Conflict resolution cancelled by user')
      this.recordError(error)
      return { status: 'error' as const, error }
    }

    const slot = this.slotById.get(ctx.documentId)
    if (!slot) {
      const error = new EsrError('ESR_CLIENT_UNKNOWN_DOCUMENT_ID', `Unknown documentId: ${ctx.documentId}`)
      this.recordError(error)
      return { status: 'error' as const, error }
    }

    return slot.engine.resolveConflict(choice)
  }

  private async handleDeviceLimit(error: unknown): Promise<void> {
    if (!isEsrError(error)) {
      return
    }

    if (error.code !== 'DEVICE_LIMIT_PAYMENT_REQUIRED' && error.code !== 'DEVICE_LIMIT_BLOCKED') {
      return
    }

    const details = error.details as Record<string, unknown> | undefined
    const ctx: DeviceLimitContext = {
      namespaceId: this.namespaceId,
      code: error.code,
      limits: buildLimitsFromDetails(details),
      slotPackages: Array.isArray(details?.slotPackages)
        ? (details.slotPackages as number[])
        : undefined,
    }

    await this.options.onDeviceLimit?.(ctx)
  }

  private recordError(error: EsrError): void {
    this.lastError = error
    this.setStatus('error')
    this.options.onError?.(error)
  }

  private setStatus(status: EsrSyncStatus): void {
    this.status = status
    this.options.onStatusChange?.(status)
  }
}
