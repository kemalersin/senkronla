# Senkronla — SDK reference (`@senkronla/client`)

> **Audience:** AI coding agents integrating Senkronla in JavaScript/TypeScript.
> **Companion:** [Agent overview](en.md) · [REST API reference](api-en.md) · [Human SDK page](/sdk)

Default path for JS/TS stacks: **`EsrSync`** facade. Use [REST](api-en.md) only when the runtime cannot run the SDK.

---

## Table of contents

1. [Install](#install)
2. [Minimal setup](#minimal-setup)
3. [Multi-document](#multi-document)
4. [EsrSync.connect options](#esrsyncconnect-options)
5. [Document adapter](#document-adapter)
6. [Envelope encryption (ENV-ENC1)](#envelope-encryption-env-enc1)
7. [Local storage (EsrStorage)](#local-storage-esrstorage)
8. [EsrSync methods](#esrsync-methods)
9. [Sync lifecycle](#sync-lifecycle)
10. [Status values](#status-values-esrsyncstatus)
11. [SDK error codes](#sdk-client-error-codes)
12. [Low-level RelayClient](#low-level-relayclient)

---

## Install

```bash
pnpm add @senkronla/client
# Manual envelopes or recovery proof outside EsrSync:
pnpm add @senkronla/protocol
```

Requires Node 18+ or a modern browser with `fetch` and Web Crypto.

Runnable example: `examples/multi-document-sync.ts` (`pnpm example:multi-document` with relay at `ESR_RELAY_URL`).

---

## Minimal setup

```typescript
import {
  EsrSync,
  createDocumentAdapter,
  createLocalStorageAdapter,
  generateNamespaceId,
} from '@senkronla/client'

const namespaceId = generateNamespaceId()
// Persist before ensureNamespace — same id across reinstalls (or use your workspace UUID)

const document = createDocumentAdapter({
  namespaceId,
  namespaceLabel: 'Acme Corp workspace',
  contentType: 'application/vnd.myapp+json',
  encrypt: true,
  resolvePassword: async () => session.getSyncPassword(), // your app provides — SDK never generates
  exportDocument: () => appStore.exportJson(),
  importDocument: (data) => appStore.importJson(data),
})

const sync = await EsrSync.connect({
  relayUrl: 'https://sync.example.com/v1',
  document,
  storage: createLocalStorageAdapter(),
  onRecoveryPhrase: async ({ phrase, namespaceId }) => {
    await ui.showRecoveryModal(phrase) // REQUIRED — once
  },
  onConflict: async (ctx) => {
    // ctx.documentId identifies which slot conflicted
    return ui.askKeepLocalOrRemote(ctx.remoteMeta.writtenAt) // 'local' | 'remote' | 'cancel'
  },
})

await sync.ensureNamespace()
await sync.sync() // all documents
appStore.onChange(() => sync.notifyLocalChange('primary'))
```

---

## Multi-document

When one namespace holds separate snapshots (app data + settings), pass `documents[]` instead of a single `document`:

```typescript
import {
  EsrSync,
  createDocumentAdapter,
  createMemoryStorageAdapter,
} from '@senkronla/client'

let appState = { notes: ['Welcome'] }
let settings = { theme: 'light' as const }

const sync = await EsrSync.connect({
  relayUrl: 'https://sync.example.com/v1',
  storage: createMemoryStorageAdapter(),
  documents: [
    {
      adapter: createDocumentAdapter({
        namespaceId,
        namespaceLabel: 'Acme Corp workspace',
        contentType: 'application/vnd.myapp+json',
        encrypt: true,
        resolvePassword: async () => session.getSyncPassword(),
        exportDocument: async () => appState,
        importDocument: async (json) => {
          appState = json as typeof appState
        },
      }),
    },
    {
      documentId: 'settings',
      adapter: createDocumentAdapter({
        namespaceId,
        namespaceLabel: 'Acme Corp workspace',
        contentType: 'application/vnd.example.settings+json',
        encrypt: true,
        resolvePassword: async () => session.getSyncPassword(),
        exportDocument: async () => settings,
        importDocument: async (json) => {
          settings = json as typeof settings
        },
      }),
    },
  ],
  onRecoveryPhrase: async ({ phrase }) => ui.showRecoveryModal(phrase),
  onConflict: async (ctx) => {
    console.log('Conflict on', ctx.documentId)
    return 'remote'
  },
  onDocumentStatusChange: (documentId, status) => ui.setDocBadge(documentId, status),
})

console.log(sync.documentIds) // ['primary', 'settings']

settingsStore.onChange(() => sync.notifyLocalChange('settings'))
await sync.sync('settings') // optional: full cycle for one document

const listed = await sync.relay.listDocuments(namespaceId)
// listed.documents: { documentId, revision, writtenAt, ... }[]
```

Non-`primary` ids use envelope `schemaVersion: 2` (SDK handles this automatically).

---

## EsrSync.connect options

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `relayUrl` | yes | — | Base URL ending in `/v1` |
| `document` | one of* | — | Single-document shorthand (`primary`) |
| `documents` | one of* | — | Multi-document slots (`documentId?` + `adapter`) |
| `storage` | yes | — | `EsrStorage` — `createLocalStorageAdapter()` on web |
| `onRecoveryPhrase` | yes | — | Called once with `{ phrase, namespaceId }` when namespace is created |
| `onConflict` | yes | — | Return `'remote'`, `'local'`, or `'cancel'`; `ctx.documentId` identifies the slot |
| `deviceLabel` | no | auto | Shown in device list |
| `onDeviceLimit` | no | — | Called on `DEVICE_LIMIT_*` — open billing UI |
| `onStatusChange` | no | — | Aggregate sync indicator |
| `onDocumentStatusChange` | no | — | Per-`documentId` status (multi-document) |
| `onError` | no | — | Log `EsrError` instances |
| `pushDebounceMs` | no | `2000` | Delay after `notifyLocalChange()` before push |
| `notificationsEnabled` | no | `true` | WebSocket + poll fallback |
| `notificationMode` | no | `ws_with_poll_fallback` | Or `poll_only` |
| `websocketEnabled` | no | `true` | Probe `/health` for `websocket.enabled` before WS connect |
| `persistRecoveryPhrase` | no | `true` | Store phrase in `EsrStorage` (security tradeoff) |
| `pauseSchedulerWhenHidden` | no | `true` | Pause background sync when tab hidden |
| `pullIntervalConnectedMs` | no | — | Poll interval when WS connected |
| `pullIntervalDisconnectedMs` | no | — | Poll interval when offline/disconnected |
| `enabled` | no | `true` | Set `false` to defer sync until ready |
| `fetch` | no | `globalThis.fetch` | Override for tests or custom runtimes |

\* Provide exactly one of `document` or `documents`.

---

## Document adapter

Bridge between app state and Senkronla. Use `createDocumentAdapter` or implement `DocumentAdapter`:

```typescript
interface DocumentAdapter {
  buildDocument(): Promise<string>
  importDocument(documentJson: string): Promise<void>
  contentType(): string
  encryption(): { enabled: boolean; resolvePassword(): Promise<string | undefined> }
  namespaceId(): string
  namespaceLabel(): string
}
```

`createDocumentAdapter` accepts `exportDocument: () => Promise<unknown>` — values are JSON-stringified automatically.

**Rules:**

- `namespaceId` must be a **valid UUID v4**, stable across devices and reinstalls.
- `contentType` should be a vendor MIME type.
- Set `encryption.enabled` to **`true`** in production — provide `resolvePassword()`; the SDK builds `ENV-ENC1` envelopes. Details: [Envelope encryption](#envelope-encryption-env-enc1).
- Keep `exportDocument()` fast — runs before every push.

---

## Envelope encryption (ENV-ENC1)

In production use `createDocumentAdapter({ encrypt: true, resolvePassword })` or `buildEnvelope({ encrypt: true, password })`. REST details: [API — Envelope encryption](api-en.md#envelope-encryption-env-enc1).

### Sync password — how the SDK obtains it

The password belongs to **your app**; the SDK never generates it. Set `enabled: true` and `resolvePassword()` on `DocumentAdapter.encryption()`. `SyncEngine` calls `resolvePassword()` before every push/pull and passes the result to `buildEnvelope` / `extractDocument`.

Typical sources: master password at login, OS keychain / secure enclave, workspace password set during onboarding. Paired devices must share the same password — the SDK does not sync it across devices.

### Push / pull flow

1. **Push:** `buildDocument()` → `resolvePassword()` → `buildEnvelope({ encrypt: true, password })` → `PUT .../documents/{documentId}`
2. **Pull:** `GET .../head` → `resolvePassword()` → `extractDocument(envelope, password)` → `importDocument(json)`
3. `salt` and `nonce` are random per push and stored inside `payload` — the relay does not use them; the pull device needs them to decrypt

### Encrypted adapter example

```typescript
const document = createDocumentAdapter({
  namespaceId: workspace.id,
  namespaceLabel: workspace.name,
  contentType: 'application/vnd.myapp+json',
  encrypt: true,
  resolvePassword: async () => {
    // Your app supplies this — the SDK never generates a sync password.
    return session.getSyncPassword()
  },
  exportDocument: () => store.exportSnapshot(),
  importDocument: (data) => store.importSnapshot(data),
})
```

### Direct buildEnvelope

```typescript
import { buildEnvelope, extractDocument } from '@senkronla/client'

const password = await session.getSyncPassword()

const envelope = await buildEnvelope({
  namespaceId: workspace.id,
  namespaceLabel: workspace.name,
  documentJson: JSON.stringify(await store.exportSnapshot()),
  deviceId: clientDeviceId,
  contentType: 'application/vnd.myapp+json',
  encrypt: true,
  password,
})

// Pull path — same password required to decrypt ENV-ENC1
const json = await extractDocument(remoteEnvelope, password)
```

**Warning — Recovery phrase ≠ sync password:** `onRecoveryPhrase` runs once when the namespace is created and proves relay access. Envelope encryption password is separate; if lost, encrypted remote data cannot be recovered.

---

## Local storage (EsrStorage)

Implement `EsrStorage` or use built-in adapters:

| Adapter | Use case |
|---------|----------|
| `createLocalStorageAdapter()` | Browser — keys prefixed `esr.` in `localStorage` |
| `createMemoryStorageAdapter(initial?)` | Node scripts, tests, examples |

Per-namespace keys (scoped by SDK):

| Key | Purpose |
|-----|---------|
| `deviceToken` | Bearer token for authenticated calls |
| `knownRemoteRevision` | Last seen server revision per document (conflict detection) |
| `recoveryPhrase` | Optional if `persistRecoveryPhrase: true` |
| `global:clientDeviceId` | Generated once per app install |

On mobile, implement `EsrStorage` backed by Keychain / Keystore — do not use plain localStorage for tokens.

---

## EsrSync methods

| Method | Purpose |
|--------|---------|
| `ensureNamespace(opts?)` | Create workspace on first launch or verify token |
| `sync(documentId?)` | Full pull/push cycle; one document by id, or all slots when omitted |
| `notifyLocalChange(documentId?)` | Mark dirty; debounced push (omit id for all slots) |
| `flushPush(documentId?)` | Push immediately (logout, critical save) |
| `startPairing()` | Host: returns `{ code, qrPayload, expiresAt }` |
| `joinPairing(code)` | Guest: redeems code, stores token, runs `sync()` (all documents) |
| `recover(phrase)` | Recovery flow; revokes all other devices |
| `listDevices()` | Settings UI: devices + limits |
| `revokeDevice(deviceId)` | Remove another device (not last one) |
| `redeemUnlockCode(code)` | Apply operator unlock code for extra slots |
| `resolveConflict(choice, documentId?)` | Manual conflict resolution for one slot |
| `getStatus()` | Current `EsrSyncStatus` |
| `getLastError()` | Last `EsrError` if any |
| `disable()` | Stop scheduler and notifications |

Read-only helpers: `relayUrl`, `relay` (`RelayClient`), `documentIds`.

#### ensureNamespace()

```typescript
const { namespaceId, created, recoveryPhrase } = await sync.ensureNamespace({
  namespaceLabel: 'Acme Corp workspace',
})

if (created) {
  console.log('User must save offline:', recoveryPhrase)
}
```

#### sync(documentId?)

```typescript
const result = await sync.sync()
const settingsResult = await sync.sync('settings')

switch (result.status) {
  case 'ok': break
  case 'offline': break
  case 'conflict': break // onConflict or resolveConflict
  case 'error': console.error(result.error.code, result.error.message)
}
```

Call on app launch (after `ensureNamespace`), network reconnect, window focus. WebSocket `head_changed` pulls the matching `documentId` automatically (not a full `sync()`).

#### notifyLocalChange / flushPush

```typescript
appStore.onChange(() => sync.notifyLocalChange('primary'))
await sync.flushPush('settings') // skip debounce — before logout
```

#### Pairing

```typescript
const { code, qrPayload, expiresAt } = await sync.startPairing()
await sync.joinPairing('482913') // guest — same namespaceId in adapters
```

#### Recovery

```typescript
await sync.recover('word1 word2 ... word24')
// new device token; ALL other devices revoked; sync() pulls latest (all documents)
```

#### Conflicts

```typescript
onConflict: async (ctx) => {
  // ctx: { namespaceId, documentId, knownRevision, remoteRevision, remoteMeta }
  return ui.askUser() // 'remote' | 'local' | 'cancel'
}

await sync.resolveConflict('remote', 'settings')
```

#### Device management

```typescript
const { devices, limits } = await sync.listDevices()
await sync.revokeDevice('01HZPXDEVICEGUEST01')
await sync.redeemUnlockCode('UNLK-7X9K-2M4P')
```

---

## Sync lifecycle

1. **App launch** → `ensureNamespace()` → `sync()` (all documents)
2. **Local edit** → `notifyLocalChange(documentId?)` (debounced push, default 2s)
3. **Network online / focus** → `sync()` or `sync('settings')`
4. **Logout** → `flushPush(documentId?)` → optional `disable()`

---

## Status values (`EsrSyncStatus`)

| Status | Meaning |
|--------|---------|
| `idle` | Ready, no operation in progress |
| `syncing` | Pull or push running |
| `pending_push` | Local changes queued |
| `remote_pending` | Remote change detected, pull pending |
| `conflict` | Waiting for `onConflict` decision |
| `offline` | Network unavailable |
| `ws_connected` | Notification WebSocket connected |
| `error` | Last operation failed — check `getLastError()` |
| `disabled` | Sync disabled via `disable()` |

---

## SDK client error codes

All errors are `EsrError` with stable `code`:

| Code | Action |
|------|--------|
| `ESR_CLIENT_NO_TOKEN` | Call `ensureNamespace`, `joinPairing`, or `recover` |
| `ESR_CLIENT_OFFLINE` | Retry `sync()` when online |
| `ESR_CLIENT_NAMESPACE_EXISTS` | Use pairing or recovery, not create |
| `ESR_CLIENT_CONFLICT_CANCELLED` | User cancelled — local edits still pending |
| `REVISION_CONFLICT` | Conflict flow required |
| `DEVICE_LIMIT_PAYMENT_REQUIRED` | Show upgrade / unlock UI |
| `DEVICE_LIMIT_BLOCKED` | User must revoke a device |
| `ESR_CLIENT_HTTP_ERROR` | Generic HTTP failure — check status |

Use `isEsrError(err)` and `isOfflineError(err)` helpers.

Envelope helpers: `buildEnvelope`, `buildEnvEnc1Payload`, `extractDocument`, `buildRecoveryKeyProof` from `@senkronla/client` (protocol re-exports). See [Envelope encryption](#envelope-encryption-env-enc1) and [API reference](api-en.md#envelope-encryption-env-enc1).

---

## Low-level RelayClient

`sync.relay` exposes typed HTTP methods when you need direct API access from a JS client:

- `createNamespace`, `getNamespace`, `listDocuments`
- `getHeadMeta`, `getHead`, `pushDocument`
- `createPairingToken`, `redeemPairingCode`, `listDevices`, `revokeDevice`
- `recover`, `redeemUnlockCode`

Prefer `EsrSync` for sync loops; use `RelayClient` for admin tools or custom schedulers. Full HTTP shapes: [api-en.md](api-en.md).

---

*Senkronla SDK agent reference · `@senkronla/client` · ESR deployment out of scope*
