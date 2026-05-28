import type { EsrStorage } from './types.js'

const GLOBAL_CLIENT_DEVICE_ID_KEY = 'global:clientDeviceId'

export class SyncStateStore {
  private localMutation = false

  constructor(
    private readonly storage: EsrStorage,
    private readonly namespaceId: string,
  ) {}

  private scopedKey(key: string): string {
    return `${this.namespaceId}:${key}`
  }

  async getDeviceToken(): Promise<string | null> {
    return this.storage.get(this.scopedKey('deviceToken'))
  }

  async setDeviceToken(token: string): Promise<void> {
    await this.storage.set(this.scopedKey('deviceToken'), token)
  }

  async clearDeviceToken(): Promise<void> {
    await this.storage.remove(this.scopedKey('deviceToken'))
  }

  async getKnownRemoteRevision(): Promise<string | null> {
    return this.storage.get(this.scopedKey('knownRemoteRevision'))
  }

  async setKnownRemoteRevision(revision: string | null): Promise<void> {
    if (revision === null) {
      await this.storage.remove(this.scopedKey('knownRemoteRevision'))
      return
    }

    await this.storage.set(this.scopedKey('knownRemoteRevision'), revision)
  }

  async getRecoveryPhrase(): Promise<string | null> {
    return this.storage.get(this.scopedKey('recoveryPhrase'))
  }

  async setRecoveryPhrase(phrase: string): Promise<void> {
    await this.storage.set(this.scopedKey('recoveryPhrase'), phrase)
  }

  markLocalMutation(): void {
    this.localMutation = true
  }

  clearLocalMutation(): void {
    this.localMutation = false
  }

  hasLocalChanges(): boolean {
    return this.localMutation
  }

  hasLocalChangesSinceLastPush(): boolean {
    return this.localMutation
  }
}

export async function getOrCreateClientDeviceId(storage: EsrStorage): Promise<string> {
  const existing = await storage.get(GLOBAL_CLIENT_DEVICE_ID_KEY)
  if (existing) {
    return existing
  }

  const created = crypto.randomUUID()
  await storage.set(GLOBAL_CLIENT_DEVICE_ID_KEY, created)
  return created
}

export function createNamespaceScopedStorage(namespaceId: string, prefix: string): string {
  return `${prefix}:${namespaceId}`
}
