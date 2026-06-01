import type { EsrSync } from './esr-sync.js'

export interface SchedulerOptions {
  pushDebounceMs: number
  pullIntervalConnectedMs: number
  pullIntervalDisconnectedMs: number
  pauseWhenHidden: boolean
}

export class EsrSyncScheduler {
  private pullTimer: ReturnType<typeof setInterval> | undefined
  private visibilityHandler: (() => void) | undefined
  private focusHandler: (() => void) | undefined

  constructor(
    private readonly sync: EsrSync,
    private readonly options: SchedulerOptions,
  ) {}

  start(): void {
    this.stop()

    // Bildirim istemcisi (WS + kopukken poll) uzak güncellemeyi yönetir.
    if (this.sync.hasNotifications()) {
      return
    }

    if (typeof document !== 'undefined' && this.options.pauseWhenHidden) {
      this.visibilityHandler = () => {
        if (!document.hidden) {
          void this.sync.sync()
        }
      }
      document.addEventListener('visibilitychange', this.visibilityHandler)
    }

    if (typeof window !== 'undefined') {
      this.focusHandler = () => {
        void this.sync.sync()
      }
      window.addEventListener('focus', this.focusHandler)
    }

    const interval = this.sync.isNotificationConnected()
      ? this.options.pullIntervalConnectedMs
      : this.options.pullIntervalDisconnectedMs

    this.pullTimer = setInterval(() => {
      void this.sync.sync()
    }, interval)
  }

  stop(): void {
    if (this.pullTimer) {
      clearInterval(this.pullTimer)
      this.pullTimer = undefined
    }

    if (this.visibilityHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityHandler)
      this.visibilityHandler = undefined
    }

    if (this.focusHandler && typeof window !== 'undefined') {
      window.removeEventListener('focus', this.focusHandler)
      this.focusHandler = undefined
    }
  }
}
