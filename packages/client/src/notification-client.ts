import { WS_SUBPROTOCOL, parseWsServerMessage, type WsHeadChanged } from '@senkronla/protocol'
import { isEsrError, isOfflineError } from './errors.js'
import type { RelayClient } from './relay-client.js'
import type {
  HeadChangedNotification,
  HeadMeta,
  LimitsChangedPayload,
  NotificationConnectionState,
  NotificationMode,
} from './types.js'
import { buildNotificationWsUrl } from './ws-url.js'

export interface NotificationClientOptions {
  relayUrl: string
  client: RelayClient
  namespaceId: string
  getDeviceToken: () => Promise<string | null>
  /** Called when any tracked document head changes. */
  onHeadChanged: (notification: HeadChangedNotification) => void | Promise<void>
  /** Called after each head/meta fetch (even when revision is unchanged). */
  onHeadMeta?: (notification: HeadChangedNotification) => void | Promise<void>
  /** Documents to poll; defaults to `['primary']`. */
  documentIds?: string[]
  /** Send WS `subscribe` after auth (filters server push). Default true. */
  sendSubscribe?: boolean
  onLimitsChanged?: (limits: LimitsChangedPayload) => void | Promise<void>
  onConnectionStateChange?: (state: NotificationConnectionState) => void
  mode?: NotificationMode
  pollIntervalMs?: number
  pollIntervalConnectedMs?: number
  pauseWhenHidden?: boolean
  /** For tests — inject WebSocket constructor */
  WebSocketImpl?: typeof WebSocket
}

export interface NotificationConnectOptions {
  /** Skip the post-auth head/meta catch-up when meta was just fetched by a push. */
  skipInitialHeadCheck?: boolean
}

const WS_RECONNECT_BASE_MS = 1_000
const WS_RECONNECT_MAX_MS = 60_000
/** Ardışık head/meta kontrollerini birleştirir (bootstrap, poll, WS catch-up). */
const HEAD_CHECK_DEBOUNCE_MS = 400

function headChangedToMeta(message: WsHeadChanged): HeadMeta {
  return {
    revision: message.revision,
    writtenAt: message.writtenAt,
    deviceId: message.writerDeviceId,
    contentSha256: message.contentSha256,
    contentMagic: 'ENV-RAW1',
    sizeBytes: 0,
  }
}

function jitterDelay(baseMs: number): number {
  const jitter = baseMs * 0.2 * (Math.random() * 2 - 1)
  return Math.max(0, Math.round(baseMs + jitter))
}

export class NotificationClient {
  private pollTimer: ReturnType<typeof setInterval> | undefined
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined
  private ws: WebSocket | null = null
  private readonly documentIds: string[]
  private readonly lastRevisionByDocument = new Map<string, string>()
  private lastPingAt: number | null = null
  private reconnectAttempt = 0
  private running = false
  private wsConnected = false
  private paused = false
  private visibilityHandler: (() => void) | undefined
  private onlineHandler: (() => void) | undefined
  private offlineHandler: (() => void) | undefined
  private headCheckTimer: ReturnType<typeof setTimeout> | undefined
  private headCheckInFlight: Promise<void> | null = null
  private headCheckQueued = false
  private skipAuthHeadCheckOnce = false

  constructor(private readonly options: NotificationClientOptions) {
    this.documentIds =
      options.documentIds?.length ? [...options.documentIds] : ['primary']
  }

  connect(options?: NotificationConnectOptions): void {
    if (options?.skipInitialHeadCheck) {
      this.skipAuthHeadCheckOnce = true
    }
    if (this.running) {
      return
    }

    this.running = true
    this.bindLifecycleHandlers()
    this.startPollLoop()
    this.connectWebSocket()
  }

  disconnect(): void {
    this.running = false
    this.clearHeadCheckTimer()
    this.headCheckInFlight = null
    this.headCheckQueued = false
    this.stopPollLoop()
    this.closeWebSocket()
    this.clearReconnectTimer()
    this.unbindLifecycleHandlers()
    this.setWsConnected(false)
    this.setPaused(false)
  }

  isConnected(): boolean {
    return this.wsConnected
  }

  isPollActive(): boolean {
    return this.running
  }

  getState(): NotificationConnectionState {
    if (!this.running) {
      return 'disconnected'
    }

    if (this.paused) {
      return 'paused'
    }

    if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
      return 'connecting'
    }

    if (this.wsConnected) {
      return 'connected'
    }

    return 'disconnected'
  }

  private bindLifecycleHandlers(): void {
    if (typeof document !== 'undefined' && this.options.pauseWhenHidden !== false) {
      this.visibilityHandler = () => {
        if (document.hidden) {
          this.paused = true
          this.closeWebSocket()
          this.options.onConnectionStateChange?.(this.getState())
        } else {
          this.paused = false
          this.connectWebSocket()
          this.scheduleHeadCheck()
          this.restartPollLoop()
          this.options.onConnectionStateChange?.(this.getState())
        }
      }
      document.addEventListener('visibilitychange', this.visibilityHandler)
    }

    if (typeof window !== 'undefined') {
      this.onlineHandler = () => {
        this.connectWebSocket()
        this.scheduleHeadCheck()
      }
      this.offlineHandler = () => {
        this.closeWebSocket()
      }
      window.addEventListener('online', this.onlineHandler)
      window.addEventListener('offline', this.offlineHandler)
    }
  }

  private unbindLifecycleHandlers(): void {
    if (this.visibilityHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityHandler)
      this.visibilityHandler = undefined
    }

    if (typeof window !== 'undefined') {
      if (this.onlineHandler) {
        window.removeEventListener('online', this.onlineHandler)
        this.onlineHandler = undefined
      }

      if (this.offlineHandler) {
        window.removeEventListener('offline', this.offlineHandler)
        this.offlineHandler = undefined
      }
    }
  }

  private startPollLoop(): void {
    this.stopPollLoop()
    if (this.shouldSkipPeriodicPoll()) {
      return
    }

    const interval = this.currentPollInterval()
    if (this.options.mode === 'poll_only') {
      if (this.skipAuthHeadCheckOnce) {
        this.skipAuthHeadCheckOnce = false
      } else {
        this.scheduleHeadCheck()
      }
    }
    this.pollTimer = setInterval(() => {
      if (this.options.pauseWhenHidden && typeof document !== 'undefined' && document.hidden) {
        return
      }

      this.scheduleHeadCheck()
    }, interval)
  }

  /** WS bağlıyken periyodik poll yok; kopunca fallback devreye girer. */
  private shouldSkipPeriodicPoll(): boolean {
    if (this.options.mode === 'poll_only') {
      return false
    }

    return this.wsConnected
  }

  private restartPollLoop(): void {
    if (!this.running) {
      return
    }

    this.startPollLoop()
  }

  private stopPollLoop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = undefined
    }
  }

  private currentPollInterval(): number {
    if (this.wsConnected) {
      return this.options.pollIntervalConnectedMs ?? 300_000
    }

    return this.options.pollIntervalMs ?? 45_000
  }

  private async connectWebSocket(): Promise<void> {
    if (!this.running || this.paused) {
      return
    }

    if (this.options.mode === 'poll_only') {
      return
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return
    }

    const token = await this.options.getDeviceToken()
    if (!token) {
      this.scheduleReconnect()
      return
    }

    const WebSocketImpl = this.options.WebSocketImpl ?? globalThis.WebSocket
    if (!WebSocketImpl) {
      return
    }

    this.closeWebSocket(false)

    const url = buildNotificationWsUrl(this.options.relayUrl, this.options.namespaceId)
    const ws = new WebSocketImpl(url, [WS_SUBPROTOCOL])
    this.ws = ws
    this.options.onConnectionStateChange?.(this.getState())

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'auth', token }))
    }

    ws.onmessage = (event) => {
      void this.handleWsMessage(String(event.data))
    }

    ws.onclose = () => {
      if (this.ws === ws) {
        this.ws = null
      }

      this.setWsConnected(false)
      this.restartPollLoop()
      this.scheduleHeadCheck()
      this.scheduleReconnect()
    }

    ws.onerror = () => {
      ws.close()
    }
  }

  private async handleWsMessage(raw: string): Promise<void> {
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return
    }

    let message
    try {
      message = parseWsServerMessage(parsed)
    } catch {
      return
    }

    if (message.type === 'auth_ok') {
      this.reconnectAttempt = 0
      this.setWsConnected(true)
      this.sendSubscribeMessage()
      this.restartPollLoop()
      if (this.skipAuthHeadCheckOnce) {
        this.skipAuthHeadCheckOnce = false
      } else {
        this.scheduleHeadCheck()
      }
      return
    }

    if (message.type === 'auth_fail') {
      this.closeWebSocket()
      return
    }

    if (message.type === 'ping') {
      this.lastPingAt = Date.now()
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'pong', ts: message.ts }))
      }
      return
    }

    if (message.type === 'head_changed') {
      if (!this.documentIds.includes(message.documentId)) {
        return
      }

      const meta = headChangedToMeta(message)
      const last = this.lastRevisionByDocument.get(message.documentId)
      if (last !== meta.revision) {
        this.lastRevisionByDocument.set(message.documentId, meta.revision)
        await this.options.onHeadChanged({ documentId: message.documentId, meta })
      }
      return
    }

    if (message.type === 'limits_changed') {
      await this.options.onLimitsChanged?.({
        maxDevices: message.maxDevices,
        activeDevices: message.activeDevices,
        purchasedSlots: message.purchasedSlots,
      })
    }
  }

  private setWsConnected(value: boolean): void {
    if (this.wsConnected === value) {
      return
    }

    this.wsConnected = value
    this.options.onConnectionStateChange?.(this.getState())
  }

  private setPaused(value: boolean): void {
    this.paused = value
    this.options.onConnectionStateChange?.(this.getState())
  }

  private closeWebSocket(clearRef = true): void {
    if (this.ws) {
      this.ws.onopen = null
      this.ws.onmessage = null
      this.ws.onclose = null
      this.ws.onerror = null

      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close()
      }

      if (clearRef) {
        this.ws = null
      }
    }

    this.setWsConnected(false)
  }

  private scheduleReconnect(): void {
    if (!this.running || this.paused || this.options.mode === 'poll_only') {
      return
    }

    this.clearReconnectTimer()
    const delay = jitterDelay(
      Math.min(WS_RECONNECT_BASE_MS * 2 ** this.reconnectAttempt, WS_RECONNECT_MAX_MS),
    )
    this.reconnectAttempt += 1

    this.reconnectTimer = setTimeout(() => {
      void this.connectWebSocket()
    }, delay)
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = undefined
    }
  }

  private clearHeadCheckTimer(): void {
    if (this.headCheckTimer) {
      clearTimeout(this.headCheckTimer)
      this.headCheckTimer = undefined
    }
  }

  /** Debounce + in-flight birleştirme — aynı anda tek head/meta turu. */
  private scheduleHeadCheck(): void {
    if (!this.running) {
      return
    }

    this.clearHeadCheckTimer()
    this.headCheckTimer = setTimeout(() => {
      this.headCheckTimer = undefined
      void this.runHeadCheck()
    }, HEAD_CHECK_DEBOUNCE_MS)
  }

  private async runHeadCheck(): Promise<void> {
    if (this.headCheckInFlight) {
      this.headCheckQueued = true
      return this.headCheckInFlight
    }

    this.headCheckInFlight = this.checkAllDocumentHeads().finally(() => {
      this.headCheckInFlight = null
      if (this.headCheckQueued) {
        this.headCheckQueued = false
        void this.runHeadCheck()
      }
    })

    return this.headCheckInFlight
  }

  private sendSubscribeMessage(): void {
    if (this.options.sendSubscribe === false) {
      return
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return
    }

    this.ws.send(
      JSON.stringify({
        type: 'subscribe',
        documentIds: this.documentIds,
      }),
    )
  }

  private async checkAllDocumentHeads(): Promise<void> {
    try {
      for (const documentId of this.documentIds) {
        const meta = await this.options.client.getHeadMeta(this.options.namespaceId, documentId)
        if (!meta) {
          continue
        }

        await this.options.onHeadMeta?.({ documentId, meta })

        const last = this.lastRevisionByDocument.get(documentId)
        if (last !== meta.revision) {
          this.lastRevisionByDocument.set(documentId, meta.revision)
          await this.options.onHeadChanged({ documentId, meta })
        }
      }
    } catch (error) {
      if (isOfflineError(error)) {
        return
      }
      if (isEsrError(error) && error.code === 'NAMESPACE_NOT_FOUND') {
        return
      }
      throw error
    }
  }
}
