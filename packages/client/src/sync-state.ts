import { isValidDocumentId } from '@senkronla/protocol'
import type { EsrStorage } from './types.js'

const GLOBAL_CLIENT_DEVICE_ID_KEY = 'global:clientDeviceId'
const DEFAULT_DOCUMENT_ID = 'primary'

export class SyncStateStore {
  private localMutation = false

  constructor(
    private readonly storage: EsrStorage,
    private readonly namespaceId: string,
    private readonly documentId: string = DEFAULT_DOCUMENT_ID,
  ) {
    if (!isValidDocumentId(documentId)) {
      throw new Error(`Invalid documentId for SyncStateStore: ${documentId}`)
    }
  }

  private scopedKey(key: string): string {
    return `${this.namespaceId}:${this.documentId}:${key}`
  }

  /** Namespace-scoped keys (shared across documents in the same namespace). */
  private namespaceScopedKey(key: string): string {
    return `${this.namespaceId}:${key}`
  }

  /** Migrate v1 revision key (`{namespaceId}:knownRemoteRevision`) once per document. */
  async migrateLegacyRevisionState(): Promise<void> {
    const legacyKey = `${this.namespaceId}:knownRemoteRevision`
    const scopedRevisionKey = this.scopedKey('knownRemoteRevision')

    const [legacy, scoped] = await Promise.all([
      this.storage.get(legacyKey),
      this.storage.get(scopedRevisionKey),
    ])

    if (legacy && !scoped) {
      await this.storage.set(scopedRevisionKey, legacy)
      if (this.documentId === DEFAULT_DOCUMENT_ID) {
        await this.storage.remove(legacyKey)
      }
    }
  }

  async getDeviceToken(): Promise<string | null> {
    return this.storage.get(this.namespaceScopedKey('deviceToken'))
  }

  async setDeviceToken(token: string): Promise<void> {
    await this.storage.set(this.namespaceScopedKey('deviceToken'), token)
  }

  async clearDeviceToken(): Promise<void> {
    await this.storage.remove(this.namespaceScopedKey('deviceToken'))
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
    return this.storage.get(this.namespaceScopedKey('recoveryPhrase'))
  }

  async setRecoveryPhrase(phrase: string): Promise<void> {
    await this.storage.set(this.namespaceScopedKey('recoveryPhrase'), phrase)
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
