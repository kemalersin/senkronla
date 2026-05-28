import {
  buildRecoveryKeyProof,
  generateNamespaceId,
  generateRecoveryPhrase,
  isValidNamespaceId,
  normalizeRecoveryPhrase,
} from '@senkronla/protocol'
import { EsrError, isEsrError, isOfflineError } from './errors.js'
import { EsrSyncScheduler } from './esr-sync-scheduler.js'
import { NotificationClient } from './notification-client.js'
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

export class EsrSync {
  readonly namespaceId: string
  readonly relayUrl: string
  readonly relay: RelayClient

  private readonly options: EsrSyncConnectOptions
  private readonly adapter: DocumentAdapter
  private readonly state: SyncStateStore
  private readonly engine: SyncEngine
  private notifications: NotificationClient | null
  private scheduler: EsrSyncScheduler | null = null
  private enabled: boolean
  private status: EsrSyncStatus = 'idle'
  private lastError: EsrError | null = null

  private constructor(
    options: EsrSyncConnectOptions,
    adapter: DocumentAdapter,
    relay: RelayClient,
    state: SyncStateStore,
    engine: SyncEngine,
    notifications: NotificationClient | null,
    enabled: boolean,
  ) {
    this.options = options
    this.adapter = adapter
    this.namespaceId = adapter.namespaceId()
    this.relayUrl = options.relayUrl.replace(/\/$/, '')
    this.relay = relay
    this.state = state
    this.engine = engine
    this.notifications = notifications
    this.enabled = enabled
    this.status = enabled ? 'idle' : 'disabled'
  }

  static async connect(options: EsrSyncConnectOptions): Promise<EsrSync> {
    const adapter = options.document
    const clientDeviceId = await getOrCreateClientDeviceId(options.storage)
    const state = new SyncStateStore(options.storage, adapter.namespaceId())

    const relay = new RelayClient({
      baseUrl: options.relayUrl,
      clientDeviceId,
      getDeviceToken: () => state.getDeviceToken(),
      onDeviceToken: (token) => state.setDeviceToken(token),
      fetch: options.fetch,
    })

    const engine = new SyncEngine(relay, adapter, state, {
      onConflict: options.onConflict,
    })

    if (options.pushDebounceMs !== undefined) {
      engine.setPushDebounceMs(options.pushDebounceMs)
    }

    const enabled = options.enabled !== false
    let instanceRef!: EsrSync

    const notificationsEnabled = options.notificationsEnabled !== false
    const notifications = notificationsEnabled
      ? new NotificationClient({
          relayUrl: options.relayUrl,
          client: relay,
          namespaceId: adapter.namespaceId(),
          getDeviceToken: () => state.getDeviceToken(),
          mode:
            options.notificationMode ??
            (options.websocketEnabled === false ? 'poll_only' : 'ws_with_poll_fallback'),
          pollIntervalMs: options.pullIntervalDisconnectedMs ?? 45_000,
          pollIntervalConnectedMs: options.pullIntervalConnectedMs ?? 300_000,
          pauseWhenHidden: options.pauseSchedulerWhenHidden !== false,
          onConnectionStateChange: () => {
            instanceRef.handleNotificationStateChange()
          },
          onHeadChanged: async (meta) => {
            if (!instanceRef.enabled) {
              return
            }

            const result = await engine.handleRemoteHeadMeta(meta)
            if (result.status === 'conflict' && result.ctx) {
              await instanceRef.handleConflict(result.ctx)
            }
          },
        })
      : null

    const instance = new EsrSync(options, adapter, relay, state, engine, notifications, enabled)
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

    const token = await this.state.getDeviceToken()
    if (token) {
      try {
        await this.relay.getNamespace(namespaceId)
        return { namespaceId, created: false }
      } catch (error) {
        if (isEsrError(error) && (error.code === 'DEVICE_TOKEN_INVALID' || error.code === 'UNAUTHORIZED')) {
          await this.state.clearDeviceToken()
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
      await this.state.setRecoveryPhrase(phrase)
    }

    this.state.markLocalMutation()
    await this.engine.push()

    return { namespaceId, created: true, recoveryPhrase: phrase }
  }

  async startPairing(): Promise<PairingHostResult> {
    try {
      return await this.relay.createPairingToken(this.namespaceId)
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

  async sync(): Promise<SyncRunResult> {
    if (!this.enabled) {
      return { status: 'ok' }
    }

    const token = await this.state.getDeviceToken()
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
      let result = await this.engine.syncFull()

      if (result.status === 'offline') {
        this.setStatus('offline')
        return { status: 'offline' }
      }

      if (result.status === 'conflict' && result.ctx) {
        result = await this.handleConflict(result.ctx)
      }

      if (result.status === 'conflict' && result.ctx) {
        this.setStatus('conflict')
        return { status: 'conflict', ctx: result.ctx }
      }

      if (result.status === 'error' && result.error) {
        this.recordError(result.error)
        return { status: 'error', error: result.error }
      }

      this.lastError = null
      this.setStatus(this.notifications?.isConnected() ? 'ws_connected' : 'idle')
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

  notifyLocalChange(): void {
    if (!this.enabled) {
      return
    }

    this.setStatus('pending_push')
    this.engine.notifyLocalChange()
  }

  async flushPush(): Promise<void> {
    const result = await this.engine.flushPush()
    if (result.status === 'conflict' && result.ctx) {
      await this.handleConflict(result.ctx)
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

  async resolveConflict(choice: 'remote' | 'local'): Promise<void> {
    const result = await this.engine.resolveConflict(choice)
    if (result.status === 'conflict' && result.ctx) {
      this.setStatus('conflict')
      return
    }

    this.setStatus(this.notifications?.isConnected() ? 'ws_connected' : 'idle')
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
    const choice = await this.options.onConflict(ctx)

    if (choice === 'cancel') {
      const error = new EsrError('ESR_CLIENT_CONFLICT_CANCELLED', 'Conflict resolution cancelled by user')
      this.recordError(error)
      return { status: 'error' as const, error }
    }

    return this.engine.resolveConflict(choice)
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
