import type { RelayClient } from './relay-client.js'
import { buildEnvelope, extractDocument, extractRawDocument, buildRecoveryKeyProof } from './envelope-builder.js'
import { EsrError, isEsrError, isOfflineError } from './errors.js'
import type { SyncStateStore } from './sync-state.js'
import type { ConflictContext, DocumentAdapter, HeadMeta, SyncResult } from './types.js'

export interface SyncEngineOptions {
  onConflict?: (ctx: ConflictContext) => Promise<'remote' | 'local' | 'cancel'>
}

export class SyncEngine {
  private debounceTimer: ReturnType<typeof setTimeout> | undefined
  private debounceMs = 2000
  private pendingConflict: ConflictContext | null = null
  private pushInFlight = false

  constructor(
    private readonly client: RelayClient,
    private readonly adapter: DocumentAdapter,
    private readonly state: SyncStateStore,
    readonly documentId: string,
    private readonly options: SyncEngineOptions = {},
  ) {}

  setPushDebounceMs(value: number): void {
    this.debounceMs = value
  }

  getPendingConflict(): ConflictContext | null {
    return this.pendingConflict
  }

  clearPendingConflict(): void {
    this.pendingConflict = null
  }

  async syncFull(): Promise<SyncResult> {
    const namespaceId = this.adapter.namespaceId()

    try {
      const meta = await this.client.getHeadMeta(namespaceId, this.documentId)
      const known = await this.state.getKnownRemoteRevision()

      if (meta && meta.revision !== known) {
        const decision = this.decidePull(meta.revision, known)
        if (decision === 'conflict') {
          const ctx: ConflictContext = {
            namespaceId,
            documentId: this.documentId,
            knownRevision: known,
            remoteRevision: meta.revision,
            remoteMeta: meta,
          }
          this.pendingConflict = ctx
          return { status: 'conflict', remoteMeta: meta, ctx }
        }

        if (decision === 'pull') {
          await this.pull(meta)
        }
      }

      if (this.state.hasLocalChanges()) {
        const pushResult = await this.push()
        if (pushResult.status !== 'ok') {
          return pushResult
        }
      }

      this.pendingConflict = null
      return { status: 'ok' }
    } catch (error) {
      if (isOfflineError(error)) {
        return { status: 'offline', error: isEsrError(error) ? error : new EsrError('ESR_CLIENT_OFFLINE', 'Offline') }
      }

      throw error
    }
  }

  async pull(meta?: HeadMeta): Promise<void> {
    const namespaceId = this.adapter.namespaceId()
    const headMeta = meta ?? (await this.client.getHeadMeta(namespaceId, this.documentId))

    if (!headMeta) {
      await this.state.setKnownRemoteRevision(null)
      return
    }

    const envelope = await this.client.getHead(namespaceId, this.documentId)
    const encryption = this.adapter.encryption()
    const password = encryption.enabled ? await encryption.resolvePassword() : undefined
    const documentJson = await extractDocument(envelope, password)
    await this.adapter.importDocument(documentJson)
    await this.state.setKnownRemoteRevision(headMeta.revision)
    this.state.clearLocalMutation()
  }

  async push(forceExpectedRevision?: string | null): Promise<SyncResult> {
    const namespaceId = this.adapter.namespaceId()
    const encryption = this.adapter.encryption()
    const password = encryption.enabled ? await encryption.resolvePassword() : undefined
    const documentJson = await this.adapter.buildDocument()
    const expectedRevision = forceExpectedRevision ?? (await this.state.getKnownRemoteRevision())

    const envelope = await buildEnvelope({
      namespaceId,
      namespaceLabel: this.adapter.namespaceLabel(),
      documentJson,
      deviceId: this.client.clientDeviceId,
      contentType: this.adapter.contentType(),
      documentId: this.documentId,
      encrypt: encryption.enabled,
      password,
    })

    this.pushInFlight = true
    try {
      const result = await this.client.pushDocument({
        namespaceId,
        documentId: this.documentId,
        envelope,
        expectedRevision,
      })

      await this.state.setKnownRemoteRevision(result.revision)
      this.state.clearLocalMutation()
      this.pendingConflict = null
      return { status: 'ok' }
    } catch (error) {
      if (isEsrError(error) && error.code === 'REVISION_CONFLICT') {
        const details = error.details as { remoteMeta?: HeadMeta; actualRevision?: string | null }
        const remoteMeta = details.remoteMeta
        const ctx: ConflictContext = {
          namespaceId,
          documentId: this.documentId,
          knownRevision: expectedRevision ?? null,
          remoteRevision: details.actualRevision ?? remoteMeta?.revision ?? 'unknown',
          remoteMeta: remoteMeta ?? {
            revision: details.actualRevision ?? 'unknown',
            writtenAt: new Date().toISOString(),
            deviceId: 'unknown',
            contentSha256: '',
            contentMagic: 'ENV-ENC1',
            sizeBytes: 0,
          },
        }
        this.pendingConflict = ctx
        return { status: 'conflict', ctx, remoteMeta: ctx.remoteMeta }
      }

      throw error
    } finally {
      this.pushInFlight = false
    }
  }

  notifyLocalChange(): void {
    this.state.markLocalMutation()
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }

    this.debounceTimer = setTimeout(() => {
      void this.push()
    }, this.debounceMs)
  }

  /** Debounce zamanlayıcısını iptal eder; push yapmaz. */
  cancelDebouncedPush(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = undefined
    }
  }

  /** Yalnızca yerel değişiklik bayrağı — debounce/push tetiklemez. */
  markLocalMutationOnly(): void {
    this.state.markLocalMutation()
  }

  async flushPush(): Promise<SyncResult> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = undefined
    }

    if (!this.state.hasLocalChanges()) {
      return { status: 'ok' }
    }

    return this.push()
  }

  async handleRemoteHeadMeta(meta: HeadMeta): Promise<SyncResult> {
    const known = await this.state.getKnownRemoteRevision()
    if (meta.revision === known) {
      return { status: 'ok' }
    }

    // Push sürerken WS yankısı: bilinen revizyon henüz güncellenmeden gelir.
    if (
      this.pushInFlight &&
      this.state.hasLocalChangesSinceLastPush() &&
      meta.deviceId === this.client.clientDeviceId
    ) {
      await this.state.setKnownRemoteRevision(meta.revision)
      return { status: 'ok' }
    }

    const decision = this.decidePull(meta.revision, known)
    if (decision === 'conflict') {
      const ctx: ConflictContext = {
        namespaceId: this.adapter.namespaceId(),
        documentId: this.documentId,
        knownRevision: known,
        remoteRevision: meta.revision,
        remoteMeta: meta,
      }
      this.pendingConflict = ctx
      return { status: 'conflict', ctx, remoteMeta: meta }
    }

    if (decision === 'pull') {
      await this.pull(meta)
    }

    return { status: 'ok' }
  }

  async resolveConflict(choice: 'remote' | 'local'): Promise<SyncResult> {
    const ctx = this.pendingConflict
    if (!ctx) {
      return { status: 'ok' }
    }

    if (choice === 'remote') {
      await this.pull(ctx.remoteMeta)
      this.pendingConflict = null
      return { status: 'ok' }
    }

    await this.state.setKnownRemoteRevision(ctx.remoteRevision)
    const result = await this.push(ctx.remoteRevision)
    return result
  }

  private decidePull(remoteRevision: string, knownRevision: string | null): 'none' | 'pull' | 'conflict' {
    if (remoteRevision === knownRevision) {
      return 'none'
    }

    if (this.state.hasLocalChangesSinceLastPush()) {
      return 'conflict'
    }

    return 'pull'
  }
}
