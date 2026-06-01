# 14 — `EsrSync` Facade (`@senkronla/client`)

> **Default integration path.** Applications read this document first; low-level `RelayClient` only for special tooling (doc 09 § Advanced).

`EsrSync` combines `RelayClient` + `SyncEngine` + `NotificationClient` + local state + scheduler in a single session. The application provides **only** the document adapter, storage adapter, and a few UI callbacks.

---

## 1. Design goals

| Goal | Description |
|------|-------------|
| Single entry | `EsrSync.connect()` — token, revision, WS, debounce internal |
| Thin application surface | ~30–50 lines integration (adapter + hooks) |
| Zero-knowledge preserved | Recovery phrase / password never sent to server; SDK uses `@esr/protocol` |
| Advanced access | `sync.relay` or `RelayClient` export — debug, CLI, test |

---

## 2. Package and exports

```typescript
// @esr/client — recommended public API
export { EsrSync } from './esr-sync'
export type {
  DocumentAdapter,
  EsrStorage,
  EsrSyncConnectOptions,
  EsrSyncStatus,
  ConflictContext,
  DeviceLimitContext,
  PairingHostResult,
} from './types'

// Advanced / test
export { RelayClient, SyncEngine, NotificationClient } from './advanced'
export * from '@esr/protocol' // re-export identity + envelope tools
```

---

## 3. `EsrStorage`

SDK does not mandate `localStorage`. Key naming is internal to SDK (`esr.*` prefix).

```typescript
/** Async key-value — IndexedDB, SQLite, memory, Electron safeStorage wrapper */
export interface EsrStorage {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  remove(key: string): Promise<void>
}

/** Browser MVP */
export function createLocalStorageAdapter(): EsrStorage

/** Test / Node */
export function createMemoryStorageAdapter(): EsrStorage
```

SDK stores keys as `{namespaceId}:{documentId}:{logicalKey}` (legacy `knownRemoteRevision` without document prefix is migrated to `primary` on first read).

| Key (logical) | Scope | Content |
|---------------|-------|---------|
| `deviceToken` | namespace | Bearer token (shared across documents in one session) |
| `knownRemoteRevision` | per `documentId` | Last remote head revision for that document |
| `recoveryPhrase` | namespace | Optional — only when `persistRecoveryPhrase: true` |
| `clientDeviceId` | global | Persistent install UUID |

---

## 4. `DocumentAdapter`

Same contract as doc 09; unchanged.

```typescript
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
```

**Callback shortcut** (optional factory):

```typescript
export function createDocumentAdapter(opts: {
  namespaceId: string
  namespaceLabel: string
  contentType: string
  exportDocument: () => Promise<unknown>
  importDocument: (data: unknown) => Promise<void>
  encrypt?: boolean
  resolvePassword?: () => Promise<string | undefined>
}): DocumentAdapter
```

---

## 5. `EsrSync.connect()`

```typescript
export interface EsrSyncDocumentSlot {
  /** Defaults to `primary` for the first slot only; required for additional slots */
  documentId?: string
  adapter: DocumentAdapter
}

export interface EsrSyncConnectOptions {
  /** E.g. https://sync.senkron.la/v1 — no trailing slash */
  relayUrl: string

  /** Single-document shorthand (first slot = `primary`) */
  document?: DocumentAdapter

  /** Multiple documents in one namespace  — see §5.2 */
  documents?: EsrSyncDocumentSlot[]

  storage: EsrStorage

  /** Start with sync off; open with enable() */
  enabled?: boolean // default true

  /** Device list / pairing label */
  deviceLabel?: string // default: navigator.userAgent or 'ESR Device'

  /** Scheduler */
  pushDebounceMs?: number      // default 2000
  pullIntervalConnectedMs?: number   // default 300_000 (WS open)
  pullIntervalDisconnectedMs?: number // default 45_000
  pauseSchedulerWhenHidden?: boolean // default true

  /** WS notifications (v1.1) */
  notificationsEnabled?: boolean // default true

  /** Write recovery phrase to storage (secure storage is application responsibility) */
  persistRecoveryPhrase?: boolean // default false

  // --- UI / application callbacks (required ones *) ---

  /** After namespace create — phrase shown once * */
  onRecoveryPhrase: (ctx: {
    phrase: string
    namespaceId: string
  }) => void | Promise<void>

  /** Local + remote change on both sides — user choice * */
  onConflict: (ctx: ConflictContext) => Promise<'remote' | 'local' | 'cancel'>

  /** 403 DEVICE_LIMIT_* */
  onDeviceLimit?: (ctx: DeviceLimitContext) => void | Promise<void>

  /** General error badge / log */
  onError?: (err: EsrError) => void

  /** Aggregate status badge (optional) */
  onStatusChange?: (status: EsrSyncStatus) => void

  /** Per-document status (optional; recommended for multi-document) */
  onDocumentStatusChange?: (documentId: string, status: EsrSyncStatus) => void
}

export interface ConflictContext {
  namespaceId: string
  documentId: string
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

export class EsrSync {
  static async connect(options: EsrSyncConnectOptions): Promise<EsrSync>

  /** Connect with existing namespace + token; ensureNamespace required if missing */
  readonly namespaceId: string
  readonly relayUrl: string
  /** Document ids in connect order (always includes `primary` when using default slot) */
  readonly documentIds: readonly string[]

  /** Advanced: direct HTTP client */
  readonly relay: RelayClient

  getSlot(documentId: string): DocumentSyncSlot | undefined

  // --- Lifecycle ---

  enable(): void
  disable(): void
  destroy(): void // close WS, clear timers

  // --- Namespace (initial setup) ---

  /**
   * Creates namespace if missing (generates recovery phrase, calls onRecoveryPhrase).
   * If exists, validates token; on invalid, error or redirect to recover flow.
   */
  ensureNamespace(opts?: {
    /** If missing generateNamespaceId(); else adapter.namespaceId() */
    namespaceId?: string
    namespaceLabel?: string
  }): Promise<EnsureNamespaceResult>

  // --- Pairing ---

  /** Host: pairing code + QR */
  startPairing(): Promise<PairingHostResult>

  /** Guest: join with code, then pull */
  joinPairing(pairingCode: string): Promise<void>

  // --- Sync ---

  /** pull → conflict? → push — full cycle; omit documentId to sync all slots */
  sync(documentId?: string): Promise<SyncRunResult>

  /** Local data changed (debounce push); omit documentId to target all slots */
  notifyLocalChange(documentId?: string): void

  /** Send pending push immediately (before logout) */
  flushPush(documentId?: string): Promise<void>

  // --- Device / limit ---

  listDevices(): Promise<{ devices: DeviceInfo[]; limits: NamespaceLimits }>
  revokeDevice(deviceId: string): Promise<void>
  redeemUnlockCode(code: string): Promise<void>

  // --- Recovery ---

  recover(recoveryPhrase: string): Promise<void>

  // --- Conflict (manual; onConflict enough most of the time) ---

  resolveConflict(choice: 'remote' | 'local', documentId?: string): Promise<void>

  getStatus(): EsrSyncStatus
  getLastError(): EsrError | null
}

export interface EnsureNamespaceResult {
  namespaceId: string
  created: boolean
  recoveryPhrase?: string // only when created === true
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
  | { status: 'error'; error: EsrError }
```

### 5.1 `ensureNamespace` behavior

```
IF deviceToken in storage AND GET namespace ok:
  → { created: false }
ELSE IF POST createNamespace successful:
  → generateRecoveryPhrase + buildRecoveryKeyProof (protocol)
  → onRecoveryPhrase(phrase)
  → optional phrase to storage (persistRecoveryPhrase)
  → first push
  → { created: true, recoveryPhrase }
ELSE IF 409 NAMESPACE_EXISTS AND no token:
  → error: "This namespace was created on another device; pairing or recovery required"
```

`namespaceId` source:

1. `opts.namespaceId`
2. else first slot `adapter.namespaceId()`
3. if both invalid/empty `generateNamespaceId()` — application must persist returned id

### 5.2 Multi-document

Use when one namespace holds **independent snapshots** (e.g. app data + settings). Each slot needs its own `DocumentAdapter` (export/import). All adapters must return the **same** `namespaceId()`.

```typescript
const sync = await EsrSync.connect({
  relayUrl: settings.relayUrl,
  storage: createLocalStorageAdapter(),
  documents: [
    { adapter: appDocumentAdapter }, // documentId omitted → primary
    { documentId: 'settings', adapter: settingsDocumentAdapter },
  ],
  onRecoveryPhrase: async ({ phrase }) => ui.showRecovery(phrase),
  onConflict: async (ctx) => {
    console.log('Conflict on', ctx.documentId)
    return ui.askConflict(ctx.remoteMeta.writtenAt)
  },
  onDocumentStatusChange: (documentId, status) => ui.setDocBadge(documentId, status),
})

await sync.ensureNamespace()

db.onAppChange(() => sync.notifyLocalChange('primary'))
settings.onChange(() => sync.notifyLocalChange('settings'))
await sync.sync('settings') // optional: full cycle for one document only
```

- Non-`primary` envelopes use `schemaVersion: 2` (SDK `buildEnvelope` handles this).
- `NotificationClient` subscribes with all `documentIds`; WS `head_changed` includes `documentId`.
- Example: `examples/multi-document-sync.ts` (`pnpm example:multi-document`).
- Spec: [15-MULTI-DOCUMENT.md](./15-MULTI-DOCUMENT.md) · REST: [04-API-REFERENCE.md](./04-API-REFERENCE.md) § Documents.

---

## 6. Scheduler (internal)

After `connect()` SDK auto-wires (when `enabled !== false`):

| Trigger | Action |
|---------|--------|
| `notifyLocalChange(id?)` | debounce → `push()` for one or all slots |
| WS `head_changed` | per `documentId` → `sync()` or meta-only conflict check |
| `document.visibilitychange` → visible | `sync()` |
| `window.focus` | `sync()` |
| interval (WS down / absent) | `sync()` — `pullIntervalDisconnectedMs` |
| interval (WS connected) | sparse `sync()` — `pullIntervalConnectedMs` |

Application does not call `initSyncScheduler`.

---

## 7. Minimal integration example

```typescript
import { EsrSync, createLocalStorageAdapter, createDocumentAdapter } from '@esr/client'

const document = createDocumentAdapter({
  namespaceId: workspace.id, // or filled with generateNamespaceId before create
  namespaceLabel: workspace.name,
  contentType: 'application/vnd.example.snapshot+json',
  exportDocument: () => db.exportAll(),
  importDocument: (data) => db.importAll(data as ExportShape),
  encrypt: true,
  resolvePassword: () => promptSyncPassword(),
})

const sync = await EsrSync.connect({
  relayUrl: settings.relayUrl,
  document,
  storage: createLocalStorageAdapter(),

  onRecoveryPhrase: async ({ phrase }) => {
    await ui.showRecoveryModal(phrase)
  },

  onConflict: async (ctx) => {
    return ui.askConflict(ctx.remoteMeta.writtenAt)
  },

  onDeviceLimit: async (ctx) => {
    if (ctx.code === 'DEVICE_LIMIT_PAYMENT_REQUIRED') {
      await ui.showUnlockModal(ctx.slotPackages)
    } else {
      ui.toast('Device limit reached')
    }
  },

  onStatusChange: (s) => ui.setSyncBadge(s),
})

// Initial setup (settings page)
await sync.ensureNamespace()

// Second device — host
const pairing = await sync.startPairing()
ui.showCode(pairing.code, pairing.qrPayload)

// Second device — guest
await sync.joinPairing(userEnteredCode)

// Daily use
db.onAfterCommit(() => sync.notifyLocalChange())
window.addEventListener('focus', () => void sync.sync())

// Shutdown
onLogout(() => sync.destroy())
```

---

## 8. Error model

```typescript
export class EsrError extends Error {
  readonly code: string // API error code or ESR_CLIENT_*
  readonly status?: number
  readonly details?: unknown
}

// Client codes (examples)
// ESR_CLIENT_OFFLINE
// ESR_CLIENT_NO_TOKEN
// ESR_CLIENT_NAMESPACE_REQUIRED
// ESR_CLIENT_CONFLICT_CANCELLED
```

If `onDeviceLimit` is not provided, limit errors become `onError` + `status: 'error'`.

---

## 9. Testing

```typescript
import { EsrSync, createMemoryStorageAdapter } from '@esr/client'

const sync = await EsrSync.connect({
  relayUrl: mockServer.url,
  storage: createMemoryStorageAdapter(),
  document: mockAdapter,
  onRecoveryPhrase: () => {},
  onConflict: async () => 'remote',
})
```

Vitest: mock relay or testcontainers; application only mocks adapter + callbacks.

---

## 10. Application checklist (facade)

- [ ] `DocumentAdapter` or `createDocumentAdapter`
- [ ] `EsrStorage` (or `createLocalStorageAdapter`)
- [ ] `EsrSync.connect` + `onRecoveryPhrase` + `onConflict`
- [ ] `ensureNamespace` / `startPairing` / `joinPairing` UX
- [ ] `notifyLocalChange` + `sync` hooks (per `documentId` when multi-document)
- [ ] (Optional) `onDeviceLimit`, `redeemUnlockCode` UI
- [ ] (Multi-document) `documents[]`, `onDocumentStatusChange`, separate adapters per id

---

## 11. Advanced — direct `RelayClient`

Doc [09-CLIENT-INTEGRATION-GUIDE.md](./09-CLIENT-INTEGRATION-GUIDE.md) §4–§14: custom scheduler, multi-namespace session, CLI, low-level integration tests.

**Rule:** New application integrations start with `EsrSync`; `RelayClient` only when the facade is insufficient.

---

## 12. Implementation note (`packages/client`)

```
packages/client/src/
  esr-sync.ts           # facade
  esr-sync-scheduler.ts
  esr-storage.ts        # adapters
  document-adapter.ts   # createDocumentAdapter
  relay-client.ts       # advanced
  sync-engine.ts        # EsrSync internal use
  notification-client.ts
  index.ts              # public exports
```

Shipped in spec v1.2 (`EsrSync` multi-document). See [11-IMPLEMENTATION-PLAN.md](./11-IMPLEMENTATION-PLAN.md) §10.
