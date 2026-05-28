import { WS_SUBPROTOCOL, parseWsServerMessage, type WsHeadChanged } from '@senkronla/protocol'
import { isOfflineError } from './errors.js'
import type { RelayClient } from './relay-client.js'
import type { HeadMeta, LimitsChangedPayload, NotificationConnectionState, NotificationMode } from './types.js'
import { buildNotificationWsUrl } from './ws-url.js'

export interface NotificationClientOptions {
  relayUrl: string
  client: RelayClient
  namespaceId: string
  getDeviceToken: () => Promise<string | null>
  onHeadChanged: (meta: HeadMeta) => void | Promise<void>
  onLimitsChanged?: (limits: LimitsChangedPayload) => void | Promise<void>
  onConnectionStateChange?: (state: NotificationConnectionState) => void
  mode?: NotificationMode
  pollIntervalMs?: number
  pollIntervalConnectedMs?: number
  pauseWhenHidden?: boolean
  /** For tests — inject WebSocket constructor */
  WebSocketImpl?: typeof WebSocket
}

const WS_RECONNECT_BASE_MS = 1_000
const WS_RECONNECT_MAX_MS = 60_000

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
  private lastRevision: string | null = null
  private lastPingAt: number | null = null
  private reconnectAttempt = 0
  private running = false
  private wsConnected = false
  private paused = false
  private visibilityHandler: (() => void) | undefined
  private onlineHandler: (() => void) | undefined
  private offlineHandler: (() => void) | undefined

  constructor(private readonly options: NotificationClientOptions) {}

  connect(): void {
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
          void this.catchUpHeadMeta()
          this.restartPollLoop()
          this.options.onConnectionStateChange?.(this.getState())
        }
      }
      document.addEventListener('visibilitychange', this.visibilityHandler)
    }

    if (typeof window !== 'undefined') {
      this.onlineHandler = () => {
        this.connectWebSocket()
        void this.catchUpHeadMeta()
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
    const interval = this.currentPollInterval()
    void this.pollOnce()
    this.pollTimer = setInterval(() => {
      if (this.options.pauseWhenHidden && typeof document !== 'undefined' && document.hidden) {
        return
      }

      void this.pollOnce()
    }, interval)
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
      this.restartPollLoop()
      await this.catchUpHeadMeta()
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
      const meta = headChangedToMeta(message)
      if (this.lastRevision !== meta.revision) {
        this.lastRevision = meta.revision
        await this.options.onHeadChanged(meta)
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

  private async catchUpHeadMeta(): Promise<void> {
    try {
      const meta = await this.options.client.getHeadMeta(this.options.namespaceId)
      if (!meta) {
        return
      }

      if (this.lastRevision !== meta.revision) {
        this.lastRevision = meta.revision
        await this.options.onHeadChanged(meta)
      }
    } catch (error) {
      if (!isOfflineError(error)) {
        throw error
      }
    }
  }

  private async pollOnce(): Promise<void> {
    try {
      const meta = await this.options.client.getHeadMeta(this.options.namespaceId)
      if (!meta) {
        return
      }

      if (this.lastRevision !== meta.revision) {
        this.lastRevision = meta.revision
        await this.options.onHeadChanged(meta)
      }
    } catch (error) {
      if (!isOfflineError(error)) {
        throw error
      }
    }
  }
}
