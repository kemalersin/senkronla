import {
  buildEnvelope,
  buildRelayHealthUrl,
  CLIENT_SDK_VERSION,
  createDocumentAdapter,
  createLocalStorageAdapter,
  EsrSync,
  generateNamespaceId,
  isEsrError,
  isValidNamespaceId,
} from '@senkronla/client'
import type {
  ConflictContext,
  DeviceInfo,
  EsrSyncStatus,
  HeadMeta,
  PairingHostResult,
} from '@senkronla/client'
import { DEMO_SHA256_REMOTE, demoJsonForDisplay, formatWsNotification, randomDemoDeviceLabel } from './format-examples.ts'

export interface DemoNote {
  id: string
  text: string
}

export interface DemoDoc {
  workspace: string
  notes: DemoNote[]
}

export interface NotificationEntry {
  id: number
  at: string
  message: string
}

export type ConnectionStatus = EsrSyncStatus | 'not_connected'

export interface DemoState {
  sdkVersion: string
  relayUrl: string
  appId: string
  deviceLabel: string
  persistRecoveryPhrase: boolean
  appsEnabled: boolean | null
  healthResponse: unknown | null
  connecting: boolean
  connected: boolean
  connectedConfig: {
    relayUrl: string
    appId: string
    persistRecoveryPhrase: boolean
  } | null
  connectionEpoch: number
  namespaceCommittedAtEpoch: number | null
  syncUsedThisSession: boolean
  status: ConnectionStatus
  namespaceId: string
  namespaceCreated: boolean | null
  namespaceResponse: unknown | null
  recoveryPhrase: string | null
  recoveryPhraseAcknowledged: boolean
  doc: DemoDoc
  pairing: PairingHostResult | null
  devices: DeviceInfo[]
  lastMeta: HeadMeta | null
  envelopePreview: string | null
  encryptedPreview: string | null
  plaintextPreview: string | null
  encryptionEnabled: boolean
  syncPassword: string
  appliedEncryptionEnabled: boolean
  appliedSyncPassword: string
  notificationsEnabled: boolean
  notificationConnected: boolean
  notificationLog: NotificationEntry[]
  lastNotification: string | null
  pendingConflict: ConflictContext | null
  lastConflictContext: ConflictContext | null
  busy: boolean
  error: string | null
}

const NS_KEY = 'senkronla-demo.namespaceId'
const DOC_KEY = 'senkronla-demo.doc'
const RECOVERY_ACK_KEY = 'senkronla-demo.recoveryAck'
const PREFS_KEY = 'senkronla-demo.prefs'
export const STEP_KEY = 'senkronla-demo.step'
export const JOIN_PASSWORD_REQUIRED = 'JOIN_PASSWORD_REQUIRED'
export const RELAY_HEALTH_FAILED = 'RELAY_HEALTH_FAILED'
const DEFAULT_RELAY = 'https://sync.senkron.la/v1'
const DEFAULT_APP_ID = 'esr_app_demo'
const CONTENT_TYPE = 'application/vnd.senkronla-demo+json'

interface DemoPreferences {
  relayUrl?: string
  appId?: string
  deviceLabel?: string
  persistRecoveryPhrase?: boolean
  encryptionEnabled?: boolean
  syncPassword?: string
  notificationsEnabled?: boolean
  namespaceCreated?: boolean | null
  wasConnected?: boolean
}

type Listener = () => void

function loadPreferences(): DemoPreferences {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (raw) {
      return JSON.parse(raw) as DemoPreferences
    }
  } catch {
    /* ignore */
  }
  return {}
}

function writePreferences(update: DemoPreferences): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...loadPreferences(), ...update }))
  } catch {
    /* ignore */
  }
}

function clearPreferences(): void {
  try {
    localStorage.removeItem(PREFS_KEY)
    localStorage.removeItem(STEP_KEY)
  } catch {
    /* ignore */
  }
}

export function loadStepIndex(stepCount: number): number {
  try {
    const raw = localStorage.getItem(STEP_KEY)
    if (raw) {
      const index = Number.parseInt(raw, 10)
      if (Number.isFinite(index) && index >= 0 && index < stepCount) {
        return index
      }
    }
  } catch {
    /* ignore */
  }
  return 0
}

export function persistStepIndex(index: number): void {
  try {
    localStorage.setItem(STEP_KEY, String(index))
  } catch {
    /* ignore */
  }
}

function loadNamespaceId(): string {
  try {
    const existing = localStorage.getItem(NS_KEY)
    if (existing) {
      return existing
    }
  } catch {
    /* ignore */
  }
  const created = generateNamespaceId()
  try {
    localStorage.setItem(NS_KEY, created)
  } catch {
    /* ignore */
  }
  return created
}

function loadDoc(): DemoDoc {
  try {
    const raw = localStorage.getItem(DOC_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as DemoDoc
      if (parsed && Array.isArray(parsed.notes)) {
        return parsed
      }
    }
  } catch {
    /* ignore */
  }
  return { workspace: 'My workspace', notes: [] }
}

function loadRecoveryAcknowledged(namespaceId: string): boolean {
  try {
    const raw = localStorage.getItem(RECOVERY_ACK_KEY)
    if (!raw) {
      return false
    }
    const parsed = JSON.parse(raw) as Record<string, boolean>
    return parsed[namespaceId] === true
  } catch {
    return false
  }
}

function persistRecoveryAcknowledged(namespaceId: string, acknowledged: boolean): void {
  try {
    const raw = localStorage.getItem(RECOVERY_ACK_KEY)
    const parsed = raw ? (JSON.parse(raw) as Record<string, boolean>) : {}
    if (acknowledged) {
      parsed[namespaceId] = true
    } else {
      delete parsed[namespaceId]
    }
    localStorage.setItem(RECOVERY_ACK_KEY, JSON.stringify(parsed))
  } catch {
    /* ignore */
  }
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 10)
}

export class DemoStore {
  private listeners = new Set<Listener>()
  private snapshot: DemoState
  private sync: EsrSync | null = null
  private conflictResolver: ((choice: 'local' | 'remote' | 'cancel') => void) | null = null
  private logCounter = 0
  private sessionBootstrap: Promise<void> | null = null
  private connectTask: Promise<void> | null = null
  private crossTabBound = false

  constructor() {
    const prefs = loadPreferences()
    const namespaceId = loadNamespaceId()
    const encryptionEnabled = prefs.encryptionEnabled ?? false
    const syncPassword = prefs.syncPassword ?? ''
    this.snapshot = {
      sdkVersion: CLIENT_SDK_VERSION,
      relayUrl: prefs.relayUrl ?? DEFAULT_RELAY,
      appId: prefs.appId ?? DEFAULT_APP_ID,
      deviceLabel: prefs.deviceLabel ?? randomDemoDeviceLabel(),
      persistRecoveryPhrase: prefs.persistRecoveryPhrase ?? false,
      appsEnabled: null,
      healthResponse: null,
      connecting: false,
      connected: false,
      connectedConfig: null,
      connectionEpoch: 0,
      namespaceCommittedAtEpoch: null,
      syncUsedThisSession: false,
      status: 'not_connected',
      namespaceId,
      namespaceCreated: prefs.namespaceCreated ?? null,
      namespaceResponse: null,
      recoveryPhrase: null,
      recoveryPhraseAcknowledged: loadRecoveryAcknowledged(namespaceId),
      doc: loadDoc(),
      pairing: null,
      devices: [],
      lastMeta: null,
      envelopePreview: null,
      encryptedPreview: null,
      plaintextPreview: null,
      encryptionEnabled,
      syncPassword,
      appliedEncryptionEnabled: encryptionEnabled,
      appliedSyncPassword: syncPassword,
      notificationsEnabled: prefs.notificationsEnabled ?? false,
      notificationConnected: false,
      notificationLog: [],
      lastNotification: null,
      pendingConflict: null,
      lastConflictContext: null,
      busy: false,
      error: null,
    }
    this.bindCrossTabSync()
    if (!prefs.deviceLabel) {
      this.persistPreferences()
    }
  }

  private bindCrossTabSync(): void {
    if (this.crossTabBound || typeof window === 'undefined') {
      return
    }
    this.crossTabBound = true

    window.addEventListener('storage', (event) => {
      if (event.key === DOC_KEY && event.newValue) {
        try {
          const parsed = JSON.parse(event.newValue) as DemoDoc
          if (parsed && Array.isArray(parsed.notes)) {
            this.set({ doc: parsed })
            void this.buildEnvelopePreview()
          }
        } catch {
          /* ignore malformed cross-tab payload */
        }
      }
    })
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): DemoState => this.snapshot

  canConnectOrReconnect(): boolean {
    return !this.snapshot.connecting
  }

  canEnsureNamespace(): boolean {
    if (!this.snapshot.connected || this.snapshot.busy) {
      return false
    }
    if (this.snapshot.namespaceResponse === null) {
      return true
    }
    return this.snapshot.connectionEpoch > (this.snapshot.namespaceCommittedAtEpoch ?? 0)
  }

  canSyncNow(): boolean {
    if (!this.snapshot.connected || this.snapshot.busy || this.snapshot.namespaceResponse === null) {
      return false
    }
    if (this.snapshot.status === 'pending_push') {
      return true
    }
    return !this.snapshot.syncUsedThisSession
  }

  canApplyEncryption(): boolean {
    if (!this.snapshot.connected || this.snapshot.busy || this.snapshot.namespaceResponse === null) {
      return false
    }
    const changed =
      this.snapshot.encryptionEnabled !== this.snapshot.appliedEncryptionEnabled ||
      this.snapshot.syncPassword !== this.snapshot.appliedSyncPassword
    if (!changed) {
      return false
    }
    if (this.snapshot.encryptionEnabled && !this.snapshot.syncPassword.trim()) {
      return false
    }
    return true
  }

  private markEncryptionApplied(): void {
    this.set({
      appliedEncryptionEnabled: this.snapshot.encryptionEnabled,
      appliedSyncPassword: this.snapshot.syncPassword,
    })
  }

  private set(partial: Partial<DemoState>): void {
    this.snapshot = { ...this.snapshot, ...partial }
    this.listeners.forEach((listener) => listener())
  }

  private persistPreferences(extra?: DemoPreferences): void {
    writePreferences({
      relayUrl: this.snapshot.relayUrl,
      appId: this.snapshot.appId,
      deviceLabel: this.snapshot.deviceLabel,
      persistRecoveryPhrase: this.snapshot.persistRecoveryPhrase,
      encryptionEnabled: this.snapshot.encryptionEnabled,
      syncPassword: this.snapshot.syncPassword,
      notificationsEnabled: this.snapshot.notificationsEnabled,
      namespaceCreated: this.snapshot.namespaceCreated,
      wasConnected: this.snapshot.connected,
      ...extra,
    })
  }

  async bootstrapSession(): Promise<void> {
    if (this.sessionBootstrap) {
      return this.sessionBootstrap
    }
    const prefs = loadPreferences()
    if (!prefs.wasConnected) {
      this.sessionBootstrap = Promise.resolve()
      return this.sessionBootstrap
    }
    this.sessionBootstrap = this.runSessionBootstrap()
    return this.sessionBootstrap
  }

  private async runSessionBootstrap(): Promise<void> {
    await this.connect({ silent: true })
    if (!this.snapshot.connected) {
      return
    }
    if (!this.snapshot.notificationsEnabled) {
      await this.refreshHead()
    }
    await this.buildEnvelopePreview()
  }

  private async refreshNamespaceFromRelay(): Promise<void> {
    if (!this.sync) {
      return
    }
    try {
      const token = await this.sync.relay.getDeviceToken()
      if (!token) {
        return
      }
      const namespace = await this.sync.relay.getNamespace(this.snapshot.namespaceId)
      this.set({
        namespaceResponse: namespace,
        namespaceCreated: false,
        namespaceCommittedAtEpoch: this.snapshot.connectionEpoch,
      })
      await this.refreshDevices()
      this.persistPreferences({ namespaceCreated: false })
    } catch {
      /* namespace may not exist yet */
    }
  }

  async refreshNamespace(): Promise<void> {
    await this.refreshNamespaceFromRelay()
  }

  private persistDoc(): void {
    try {
      localStorage.setItem(DOC_KEY, JSON.stringify(this.snapshot.doc))
    } catch {
      /* ignore */
    }
  }

  private describeError(error: unknown): string {
    if (isEsrError(error)) {
      return `${error.code}: ${error.message}`
    }
    if (error instanceof Error) {
      return error.message
    }
    return String(error)
  }

  private log(message: string): void {
    const entry: NotificationEntry = {
      id: ++this.logCounter,
      at: new Date().toLocaleTimeString(),
      message,
    }
    this.set({ notificationLog: [entry, ...this.snapshot.notificationLog].slice(0, 30) })
  }

  // ---- Configuration -----------------------------------------------------
  setRelayUrl(relayUrl: string): void {
    if (relayUrl === this.snapshot.relayUrl) {
      return
    }
    this.set({ relayUrl, healthResponse: null, appsEnabled: null })
    this.persistPreferences({ relayUrl })
  }

  setAppId(appId: string): void {
    if (appId === this.snapshot.appId) {
      return
    }
    this.set({ appId, healthResponse: null, appsEnabled: null })
    this.persistPreferences({ appId })
  }

  setSyncPassword(syncPassword: string): void {
    this.set({ syncPassword })
    this.persistPreferences({ syncPassword })
    if (this.snapshot.encryptionEnabled) {
      void this.buildEnvelopePreview()
    }
  }

  async applyPersistRecoveryPhrase(enabled: boolean): Promise<void> {
    this.set({ persistRecoveryPhrase: enabled })
    this.persistPreferences({ persistRecoveryPhrase: enabled })
    if (!this.snapshot.connected || this.snapshot.namespaceResponse !== null) {
      return
    }
    await this.connect({ preserveHealth: true, silent: true })
  }

  // ---- Document ----------------------------------------------------------
  setWorkspaceName(workspace: string): void {
    this.set({ doc: { ...this.snapshot.doc, workspace } })
    this.persistDoc()
  }

  addNote(text: string): void {
    const trimmed = text.trim()
    if (!trimmed) {
      return
    }
    const notes = [...this.snapshot.doc.notes, { id: randomId(), text: trimmed }]
    this.set({ doc: { ...this.snapshot.doc, notes } })
    this.persistDoc()
  }

  removeNote(id: string): void {
    const notes = this.snapshot.doc.notes.filter((note) => note.id !== id)
    this.set({ doc: { ...this.snapshot.doc, notes } })
    this.persistDoc()
  }

  // ---- Connection --------------------------------------------------------
  private buildAdapter() {
    return createDocumentAdapter({
      namespaceId: this.snapshot.namespaceId,
      namespaceLabel: this.snapshot.doc.workspace || 'Demo workspace',
      contentType: CONTENT_TYPE,
      encrypt: this.snapshot.encryptionEnabled,
      resolvePassword: async () => this.snapshot.syncPassword || undefined,
      exportDocument: async () => this.snapshot.doc,
      importDocument: async (data) => {
        this.set({ doc: data as DemoDoc })
        this.persistDoc()
        this.log('head_changed → document imported')
        void this.buildEnvelopePreview()
        if (this.snapshot.notificationsEnabled && this.sync) {
          try {
            const meta = await this.sync.relay.getHeadMeta(this.snapshot.namespaceId, 'primary')
            if (meta) {
              this.set({
                lastMeta: meta,
                lastNotification: formatWsNotification(meta),
              })
            }
          } catch {
            /* head may not exist yet */
          }
        }
      },
    })
  }

  async checkHealth(options?: { preserveOnFailure?: boolean }): Promise<void> {
    try {
      const response = await fetch(buildRelayHealthUrl(this.snapshot.relayUrl), { method: 'GET' })
      if (response.ok) {
        const body = await response.json()
        const typed = body as { apps?: { enabled?: boolean } }
        this.set({ appsEnabled: typed.apps?.enabled === true, healthResponse: body })
        return
      }
    } catch {
      /* network / CORS */
    }
    if (!options?.preserveOnFailure) {
      this.set({ appsEnabled: null, healthResponse: null })
    }
    throw new Error(RELAY_HEALTH_FAILED)
  }

  private notificationModeFromHealth(): 'ws_with_poll_fallback' | 'poll_only' {
    const body = this.snapshot.healthResponse
    if (typeof body === 'object' && body !== null && 'websocket' in body) {
      return (body as { websocket?: boolean }).websocket === true
        ? 'ws_with_poll_fallback'
        : 'poll_only'
    }
    return 'poll_only'
  }

  async connect(options?: {
    preserveHealth?: boolean
    silent?: boolean
    skipNamespaceRefresh?: boolean
    deferNotificationConnect?: boolean
  }): Promise<void> {
    if (this.connectTask) {
      return this.connectTask
    }
    this.connectTask = this.runConnect(options).finally(() => {
      this.connectTask = null
    })
    return this.connectTask
  }

  private async runConnect(options?: {
    preserveHealth?: boolean
    silent?: boolean
    skipNamespaceRefresh?: boolean
    deferNotificationConnect?: boolean
  }): Promise<void> {
    const preserveHealth = options?.preserveHealth === true
    const silent = options?.silent === true
    const skipNamespaceRefresh = options?.skipNamespaceRefresh === true
    const deferNotificationConnect = options?.deferNotificationConnect === true
    this.set({
      ...(silent ? {} : { connecting: true }),
      error: null,
      ...(preserveHealth ? {} : { healthResponse: null, appsEnabled: null }),
    })
    try {
      this.sync?.destroy()
      this.sync = null
      await this.checkHealth({ preserveOnFailure: preserveHealth })

      const instance = await EsrSync.connect({
        relayUrl: this.snapshot.relayUrl,
        appId: this.snapshot.appId.trim() || undefined,
        deviceLabel: this.snapshot.deviceLabel,
        storage: createLocalStorageAdapter(),
        document: this.buildAdapter(),
        notificationsEnabled: this.snapshot.notificationsEnabled,
        notificationMode: this.snapshot.notificationsEnabled
          ? this.notificationModeFromHealth()
          : undefined,
        persistRecoveryPhrase: this.snapshot.persistRecoveryPhrase,
        deferNotificationConnect,
        onStatusChange: (status) => {
          const effective =
            status === 'error' && this.snapshot.namespaceResponse === null ? 'idle' : status
          this.set({
            status: effective,
            notificationConnected: this.sync?.isNotificationConnected() ?? false,
          })
        },
        onRecoveryPhrase: ({ phrase }) => {
          persistRecoveryAcknowledged(this.snapshot.namespaceId, false)
          this.set({ recoveryPhrase: phrase, recoveryPhraseAcknowledged: false })
        },
        onConflict: (ctx) => this.requestConflictResolution(ctx),
        onHeadMeta: ({ meta }) => {
          this.set({ lastMeta: meta })
        },
        onError: (err) => {
          // Background scheduler may fire before ensureNamespace; that
          // "no token yet" case is expected in the tutorial, so ignore it.
          if (err.code === 'ESR_CLIENT_NO_TOKEN') {
            if (this.snapshot.namespaceResponse === null) {
              this.set({ status: 'idle' })
            }
            return
          }
          this.set({ error: this.describeError(err) })
        },
      })

      this.sync = instance
      const nextEpoch = this.snapshot.connectionEpoch + 1
      this.set({
        connected: true,
        connectedConfig: {
          relayUrl: this.snapshot.relayUrl,
          appId: this.snapshot.appId,
          persistRecoveryPhrase: this.snapshot.persistRecoveryPhrase,
        },
        connectionEpoch: nextEpoch,
        status: instance.getStatus(),
        notificationConnected: instance.isNotificationConnected(),
      })
      if (this.snapshot.namespaceResponse === null && this.snapshot.status === 'error') {
        this.set({ status: 'idle' })
      }
      this.persistPreferences({ wasConnected: true })
      if (!skipNamespaceRefresh) {
        await this.refreshNamespaceFromRelay()
      }
    } catch (error) {
      this.set({ error: this.describeError(error), connected: false, status: 'not_connected' })
      this.persistPreferences({ wasConnected: false })
    } finally {
      this.set({ connecting: false })
    }
  }

  private requireSync(): EsrSync {
    if (!this.sync) {
      throw new Error('Not connected yet — run connect() first.')
    }
    return this.sync
  }

  private async run(action: () => Promise<void>): Promise<boolean> {
    this.set({ busy: true, error: null })
    try {
      await action()
      return true
    } catch (error) {
      this.set({ error: this.describeError(error) })
      return false
    } finally {
      this.set({ busy: false })
    }
  }

  acknowledgeRecoveryPhrase(): void {
    persistRecoveryAcknowledged(this.snapshot.namespaceId, true)
    this.set({ recoveryPhrase: null, recoveryPhraseAcknowledged: true })
  }

  // ---- Steps -------------------------------------------------------------
  async ensureNamespace(): Promise<void> {
    await this.run(async () => {
      const sync = this.requireSync()
      const result = await sync.ensureNamespace()
      this.set({ namespaceCreated: result.created })
      if (result.recoveryPhrase) {
        persistRecoveryAcknowledged(this.snapshot.namespaceId, false)
        this.set({ recoveryPhrase: result.recoveryPhrase, recoveryPhraseAcknowledged: false })
      }

      await this.refreshNamespaceFromRelay()
      if (this.snapshot.namespaceResponse === null && result.namespace) {
        this.set({
          namespaceResponse: result.namespace,
        })
      }

      this.set({ namespaceCommittedAtEpoch: this.snapshot.connectionEpoch })
      this.persistPreferences({ namespaceCreated: this.snapshot.namespaceCreated })
    })
  }

  async syncNow(): Promise<void> {
    await this.run(async () => {
      await this.pushLocalChangesAndRefreshHead()
      this.set({ syncUsedThisSession: true })
    })
  }

  async pushData(text: string): Promise<void> {
    await this.run(async () => {
      this.addNote(text)
      await this.buildEnvelopePreview()
      await this.pushLocalChangesAndRefreshHead()
    })
  }

  async startPairing(): Promise<void> {
    await this.run(async () => {
      const pairing = await this.requireSync().startPairing()
      this.set({ pairing })
    })
  }

  async joinPairing(namespaceId: string, pairingCode: string, syncPassword?: string): Promise<boolean> {
    const ok = await this.run(async () => {
      const ns = namespaceId.trim()
      const code = pairingCode.trim()
      const password = syncPassword?.trim() ?? ''
      if (!isValidNamespaceId(ns)) {
        throw new Error('Invalid namespace ID — use the UUID from the QR payload.')
      }
      if (!/^\d{6}$/.test(code)) {
        throw new Error('Pairing code must be 6 digits.')
      }
      await this.useNamespaceForPairing(ns)
      const sync = this.requireSync()
      const token = await sync.relay.getDeviceToken()
      if (!token) {
        await sync.relay.redeemPairingCode({
          namespaceId: ns,
          pairingCode: code,
          deviceLabel: this.snapshot.deviceLabel,
        })
      }

      const namespace = await sync.relay.getNamespace(ns)
      const encryptedHead = namespace.head?.contentMagic === 'ENV-ENC1'
      if (encryptedHead) {
        if (!password) {
          throw new Error(JOIN_PASSWORD_REQUIRED)
        }
        if (!this.snapshot.encryptionEnabled || this.snapshot.syncPassword !== password) {
          this.set({ syncPassword: password, encryptionEnabled: true })
          this.persistPreferences({ syncPassword: password, encryptionEnabled: true })
          await this.applyEncryption(true)
          if (this.snapshot.error) {
            throw new Error(this.snapshot.error)
          }
        }
      }

      const syncResult = await this.requireSync().sync()
      if (syncResult.status === 'error' && syncResult.error) {
        throw syncResult.error
      }
      if (syncResult.status === 'offline') {
        throw new Error('Relay unreachable — check your connection.')
      }
      if (syncResult.status === 'conflict') {
        throw new Error('Sync conflict — resolve on the host device and try again.')
      }

      await this.refreshNamespaceFromRelay()
      await this.refreshHead()
      await this.buildEnvelopePreview()
      if (this.snapshot.error) {
        throw new Error(this.snapshot.error)
      }
      this.persistPreferences({ namespaceCreated: false, wasConnected: true })
    })
    return ok && this.snapshot.error === null
  }

  private async useNamespaceForPairing(namespaceId: string): Promise<void> {
    if (namespaceId === this.snapshot.namespaceId && this.snapshot.connected) {
      return
    }
    try {
      localStorage.setItem(NS_KEY, namespaceId)
    } catch {
      /* ignore */
    }
    this.sync?.destroy()
    this.sync = null
    this.set({
      namespaceId,
      namespaceCreated: null,
      namespaceResponse: null,
      recoveryPhrase: null,
      recoveryPhraseAcknowledged: loadRecoveryAcknowledged(namespaceId),
      pairing: null,
      devices: [],
      lastMeta: null,
      syncUsedThisSession: false,
      encryptionEnabled: false,
      syncPassword: '',
      appliedEncryptionEnabled: false,
      appliedSyncPassword: '',
      connected: false,
      status: 'not_connected',
    })
    await this.connect({ silent: true })
  }

  private async refreshHead(): Promise<void> {
    try {
      const meta = await this.requireSync().relay.getHeadMeta(this.snapshot.namespaceId, 'primary')
      this.set({ lastMeta: meta })
    } catch {
      /* head may not exist yet */
    }
  }

  /** One PUT + one head/meta via flushPush → onHeadMeta. */
  private async pushLocalChangesAndRefreshHead(): Promise<void> {
    const sync = this.requireSync()
    sync.cancelDebouncedPush()
    sync.markLocalChange()
    await sync.flushPush()
  }

  private async refreshDevices(): Promise<void> {
    try {
      const { devices } = await this.requireSync().listDevices()
      this.set({ devices })
    } catch {
      /* ignore */
    }
  }

  // ---- Conflict ----------------------------------------------------------
  private requestConflictResolution(ctx: ConflictContext): Promise<'local' | 'remote' | 'cancel'> {
    this.set({ pendingConflict: ctx, lastConflictContext: ctx })
    return new Promise((resolve) => {
      this.conflictResolver = (choice) => {
        this.set({ pendingConflict: null })
        this.conflictResolver = null
        resolve(choice)
      }
    })
  }

  async simulateConflict(): Promise<void> {
    const meta = this.snapshot.lastMeta
    const ctx: ConflictContext = {
      namespaceId: this.snapshot.namespaceId,
      documentId: 'primary',
      knownRevision: meta?.revision ?? '01J0LOCALREVISIONEXAMPLE',
      remoteRevision: meta?.revision ? `${meta.revision.slice(0, -4)}RMT1` : '01J0REMOTEREVISIONXMPL',
      remoteMeta: meta ?? {
        revision: '01J0REMOTEREVISIONXMPL',
        writtenAt: new Date().toISOString(),
        deviceId: 'device_other',
        contentSha256: DEMO_SHA256_REMOTE,
        contentMagic: 'ENV-RAW1',
        sizeBytes: 128,
      },
    }
    const choice = await this.requestConflictResolution(ctx)
    if (choice === 'remote') {
      await this.syncNow()
      this.log('conflict resolved → kept remote (pulled)')
    } else if (choice === 'local') {
      this.sync?.notifyLocalChange()
      await this.syncNow()
      this.log('conflict resolved → kept local (pushed)')
    }
  }

  resolveConflict(choice: 'local' | 'remote' | 'cancel'): void {
    this.conflictResolver?.(choice)
  }

  // ---- Encryption --------------------------------------------------------
  setEncryptionEnabled(enabled: boolean): void {
    this.set({ encryptionEnabled: enabled })
    this.persistPreferences({ encryptionEnabled: enabled })
    void this.buildEnvelopePreview()
  }

  async commitEncryption(): Promise<void> {
    if (!this.canApplyEncryption()) {
      return
    }
    await this.run(async () => {
      await this.connect({
        preserveHealth: true,
        silent: true,
        skipNamespaceRefresh: true,
        deferNotificationConnect: this.snapshot.notificationsEnabled,
      })
      await this.buildEnvelopePreview()
      await this.pushLocalChangesAndRefreshHead()
      if (this.snapshot.notificationsEnabled) {
        this.requireSync().startNotifications({ skipInitialHeadCheck: true })
        this.set({ notificationConnected: this.sync?.isNotificationConnected() ?? false })
      }
      this.markEncryptionApplied()
      this.persistPreferences({
        encryptionEnabled: this.snapshot.encryptionEnabled,
        syncPassword: this.snapshot.syncPassword,
      })
    })
  }

  async applyEncryption(enabled: boolean): Promise<void> {
    this.set({ encryptionEnabled: enabled })
    this.persistPreferences({ encryptionEnabled: enabled })
    await this.buildEnvelopePreview()
    if (this.snapshot.connected) {
      await this.connect({ preserveHealth: true, silent: true })
    }
    this.markEncryptionApplied()
  }

  // ---- Notifications -----------------------------------------------------
  async applyNotifications(enabled: boolean): Promise<void> {
    this.set({
      notificationsEnabled: enabled,
      ...(enabled ? {} : { notificationConnected: false }),
    })
    this.persistPreferences({ notificationsEnabled: enabled })
    if (this.snapshot.connected) {
      await this.connect({ preserveHealth: true, silent: true })
      this.log(enabled ? 'notifications enabled' : 'notifications disabled')
    }
  }

  // ---- Envelope preview --------------------------------------------------
  async buildEnvelopePreview(): Promise<void> {
    const documentJson = JSON.stringify(this.snapshot.doc)
    const base = {
      namespaceId: this.snapshot.namespaceId,
      namespaceLabel: this.snapshot.doc.workspace || 'Demo workspace',
      documentJson,
      deviceId: 'device_this',
      contentType: CONTENT_TYPE,
      revision: '01J0DEMOREVISIONEXAMPLE',
    }
    try {
      const plain = await buildEnvelope({ ...base, encrypt: false })
      this.set({
        plaintextPreview: demoJsonForDisplay(plain),
        envelopePreview: demoJsonForDisplay(this.snapshot.encryptionEnabled ? undefined : plain),
      })

      if (this.snapshot.syncPassword) {
        const encrypted = await buildEnvelope({
          ...base,
          encrypt: true,
          password: this.snapshot.syncPassword,
        })
        this.set({ encryptedPreview: demoJsonForDisplay(encrypted) })
        if (this.snapshot.encryptionEnabled) {
          this.set({ envelopePreview: demoJsonForDisplay(encrypted) })
        }
      } else {
        this.set({ encryptedPreview: null })
      }
    } catch (error) {
      this.set({ error: this.describeError(error) })
    }
  }

  // ---- Reset -------------------------------------------------------------
  resetDemo(): void {
    try {
      localStorage.removeItem(NS_KEY)
      localStorage.removeItem(DOC_KEY)
      clearPreferences()
    } catch {
      /* ignore */
    }
    this.sync?.destroy()
    this.sync = null
    this.snapshot = {
      ...this.snapshot,
      namespaceId: loadNamespaceId(),
      doc: { workspace: 'My workspace', notes: [] },
      connected: false,
      connectedConfig: null,
      connectionEpoch: 0,
      namespaceCommittedAtEpoch: null,
      syncUsedThisSession: false,
      status: 'not_connected',
      namespaceCreated: null,
      namespaceResponse: null,
      recoveryPhrase: null,
      recoveryPhraseAcknowledged: false,
      pairing: null,
      devices: [],
      lastMeta: null,
      envelopePreview: null,
      encryptedPreview: null,
      plaintextPreview: null,
      notificationLog: [],
      lastNotification: null,
      healthResponse: null,
      appsEnabled: null,
      error: null,
      relayUrl: DEFAULT_RELAY,
      appId: DEFAULT_APP_ID,
      deviceLabel: randomDemoDeviceLabel(),
      persistRecoveryPhrase: false,
      encryptionEnabled: false,
      syncPassword: '',
      appliedEncryptionEnabled: false,
      appliedSyncPassword: '',
      notificationsEnabled: false,
      pendingConflict: null,
      lastConflictContext: null,
    }
    this.persistPreferences({
      relayUrl: DEFAULT_RELAY,
      appId: DEFAULT_APP_ID,
      deviceLabel: this.snapshot.deviceLabel,
      persistRecoveryPhrase: false,
      encryptionEnabled: false,
      syncPassword: '',
      notificationsEnabled: false,
      namespaceCreated: null,
      wasConnected: false,
    })
    this.set({})
  }
}

export const demoStore = new DemoStore()
