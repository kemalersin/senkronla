# Senkronla — SDK reference (`@senkronla/client`)

> **Audience:** AI coding agents integrating Senkronla in JavaScript/TypeScript.
> **Companion:** [Agent overview](en.md) · [REST API reference](api-en.md) · [Human SDK page](/sdk)

Default path for JS/TS stacks: **`EsrSync`** facade. Use [REST](api-en.md) only when the runtime cannot run the SDK.

---

## Table of contents

1. [Install](#install)
2. [App code vs the SDK](#app-code-vs-the-sdk)
3. [Minimal setup](#minimal-setup)
4. [Multi-document](#multi-document)
5. [EsrSync.connect options](#esrsyncconnect-options)
6. [Document adapter](#document-adapter)
7. [Envelope encryption (ENV-ENC1)](#envelope-encryption-env-enc1)
8. [Local storage (EsrStorage)](#local-storage-esrstorage)
9. [EsrSync methods](#esrsync-methods)
10. [Sync lifecycle](#sync-lifecycle)
11. [Status values](#status-values-esrsyncstatus)
12. [SDK error codes](#sdk-client-error-codes)
13. [Low-level RelayClient](#low-level-relayclient)

---

## Install

```bash
npm install @senkronla/client
# or
pnpm add @senkronla/client
```

Requires Node.js 22+ or a modern browser with `fetch` and Web Crypto.

**`@senkronla/client`** includes TypeScript types and everything needed for a typical `EsrSync` integration. The SDK builds and decrypts `ESR-DOC1` / `ENV-ENC1` envelopes on push and pull — you do not need a second package for that path.

Published on npm: [@senkronla/client](https://www.npmjs.com/package/@senkronla/client) · [@senkronla/protocol](https://www.npmjs.com/package/@senkronla/protocol) · [@senkronla/cli](https://www.npmjs.com/package/@senkronla/cli)

### REST-only integrations

Add **`@senkronla/protocol`** when you call the relay over HTTP yourself, without `EsrSync` — for example a native app in Swift or Kotlin, a server-side job, or a custom fetch client:

```bash
npm install @senkronla/protocol
# or
pnpm add @senkronla/protocol
```

The protocol package provides low-level helpers such as `buildEnvEnc1Payload`, `sha256Hex`, and schema validation; you assemble the outer envelope and send `PUT .../documents/{documentId}` yourself. Most web and Node apps should start with the SDK only. Full REST walkthrough: [API — Envelope encryption](/api#encryption).

Runnable example: `examples/multi-document-sync.ts` (`pnpm example:multi-document` with relay at `ESR_RELAY_URL`).

---

## App code vs the SDK

Senkronla stores opaque JSON snapshots. It does **not** ship the app's data model, UI, billing screens, or store layer. Samples use placeholder names — **not** part of `@senkronla/client`:

```typescript
// Code sample legend
//   // app:     APP code — not part of @senkronla/client
//   appStore, appUi, appSession — placeholder names; wire to the app's state/UI/auth
//   EsrSync, createDocumentAdapter, … — SDK (@senkronla/client)
```

| Area | App provides | SDK provides |
|------|--------------|--------------|
| Document adapter | `exportDocument` / `importDocument` — serialize and apply app state as JSON | Wraps app-provided functions; calls them on push/pull |
| Workspace id | Stable UUID per customer workspace; persist before `ensureNamespace()` | Sends id to relay; binds namespace to app when registry enabled |
| Recovery phrase UX | `onRecoveryPhrase` — modal to copy/save the 24-word phrase (required, once) | Generates phrase at workspace creation; invokes the app callback |
| Conflict UX | `onConflict` — ask user; return `remote`, `local`, or `cancel` (required) | Detects revision mismatch; pauses until the app chooses |
| Device limit UX | `onDeviceLimit` — open upgrade / revoke UI when slots are full (optional) | Surfaces `DEVICE_LIMIT_*` errors with slot package hints |
| Sync indicators | `onStatusChange`, `onDocumentStatusChange` — badges or spinners (optional) | Reports `idle`, `syncing`, `conflict`, `offline`, … |
| Local edit wiring | After local edits, call `notifyLocalChange(documentId?)` from `appStore` (or equivalent listener) | Debounced push queue (default 2s) |
| Pairing screens | Show `code` / `qrPayload` from `startPairing()`; guest enters code for `joinPairing()` | Creates pairing token; returns code, QR payload, expiry |
| Sync password | `resolvePassword()` or manual `buildEnvelope` password — `appSession`, keychain, or prompt | Builds `ENV-ENC1` envelopes on push; decrypts on pull |
| Local persistence | `EsrStorage` implementation or `createLocalStorageAdapter`; secure storage on mobile | Persists `deviceToken`, per-document revisions, optional recovery phrase |
| Relay connection | `relayUrl`, `appId`, native fields from the relay operator | HTTP + WebSocket client to the relay |

Human docs: [/sdk#integration](/sdk#integration)

---

## Minimal setup

```typescript
// Code sample legend — see "App code vs the SDK" above
import {
  EsrSync,
  createDocumentAdapter,
  createLocalStorageAdapter,
  generateNamespaceId,
} from '@senkronla/client'

const namespaceId = generateNamespaceId()
// app: persist before ensureNamespace — same id across reinstalls

const document = createDocumentAdapter({
  namespaceId,
  namespaceLabel: 'Acme Corp workspace',
  contentType: 'application/vnd.myapp+json',
  encrypt: true,
  // app: sync password — SDK never generates it
  resolvePassword: async () => appSession.getSyncPassword(),
  // app: serialize /sync.senkron.late as JSON
  exportDocument: () => appStore.exportJson(),
  importDocument: (json) => appStore.importJson(json),
})

const sync = await EsrSync.connect({
  relayUrl: 'https://sync.senkron.la/v1',
  appId: 'esr_app_mynotes', // required when GET /health → apps.enabled is true
  document,
  storage: createLocalStorageAdapter('myapp'),
  // app: required — show once; user must save offline
  onRecoveryPhrase: async ({ phrase }) => {
    await appUi.showRecoveryModal(phrase)
  },
  // app: required — return 'remote' | 'local' | 'cancel'
  onConflict: async (ctx) => {
    return appUi.askKeepLocalOrRemote(ctx.remoteMeta.writtenAt)
  },
})
// Native: add appPlatform, bundleId; clientSecret when GET /health → apps.nativeRequireClientSecret

await sync.ensureNamespace()
await sync.sync()
// app: call after every local edit
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
} from '@senkronla/clsync.senkron.la

let appState = { notes: ['Welcome'] }
let settings = { theme: 'light' as const }

const sync = await EsrSync.connect({
  relayUrl: 'https://sync.senkron.la/v1',
  appId: 'esr_app_mynotes', // required when GET /health → apps.enabled is true
  storage: createMemoryStorageAdapter(),
  documents: [
    {
      adapter: createDocumentAdapter({
        namespaceId,
        namespaceLabel: 'Acme Corp workspace',
        contentType: 'application/vnd.myapp+json',
        encrypt: true,
        resolvePassword: async () => appSession.getSyncPassword(),
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
        resolvePassword: async () => appSession.getSyncPassword(),
        exportDocument: async () => settings,
        importDocument: async (json) => {
          settings = json as typeof settings
        },
      }),
    },
  ],
  // app: required callbacks — replace with app UI
  onRecoveryPhrase: async ({ phrase }) => appUi.showRecoveryModal(phrase),
  onConflict: async (ctx) => {
    return appUi.askKeepLocalOrRemote(ctx.remoteMeta.writtenAt)
  },
  onDocumentStatusChange: (documentId, status) => appUi.setDocBadge(documentId, status),
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
| `appId` | when relay requires | — | Public app id (`esr_app_…`) when `apps.enabled` |
| `appPlatform` | native | — | `ios`, `android`, or `desktop` |
| `bundleId` | native | — | Bundle ID, package name, or desktop app ID |
| `clientSecret` | native confidential | — | When `native.requireClientSecret: true`; set via rotate-secret, not on app create |
| `clientVersion` | no | — | Telemetry header `X-ESR-Client-Version` |
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

\* Provide exactly onsync.senkron.laor `documents`.

### Full connect example (web SPA)

```typescript
const sync = await EsrSync.connect({
  relayUrl: 'https://sync.senkron.la/v1',
  appId: 'esr_app_mynotes', // required when GET /health → apps.enabled is true
  document,
  storage: createLocalStorageAdapter('myapp'),
  deviceLabel: 'Alice laptop',
  onRecoveryPhrase: async ({ phrase }) => appUi.showRecoveryModal(phrase),
  onConflict: async (ctx) => appUi.askKeepLocalOrRemote(ctx.remoteMeta.writtenAt),
  onDocumentStatusChange: (documentId, status) => appUi.setDocBadge(documentId, status),
  onDeviceLimit: async (ctx) => {
    if (ctx.code === 'DEVICE_LIMIT_PAYMENT_REQUIRED') appUi.showUpgrade(ctx.slotPackages)
  },
  onStatusChange: (status) => appUi.setSyncIndicator(status),
  onError: (error) => appLogger.warn(error.code),
  pushDebounceMs: 2000,
  notificationsEnabled: true,
  persistRecoveryPhrase: true,
})
// Native: add appPlatform, bundleId; clientSecret when GET /health → apps.nativeRequireClientSecret
```

Omit `appId` only when the relay keeps `apps.enabled: false` (v1.2 legacy). See [Application registry](#application-registry-v13) for registration, native fields, and client secret.

---

## Application registry (v1.3)

When the relay has `apps.enabled: true`, every integration must identify itself with a registered `appId`. Namespaces belong to the app that created them.

### Two auth layers

| Layer | Mechanism | Question |
|-------|-----------|----------|
| App | `appId` + `Origin` (web) or platform/bundle headers (native) | Which integration may call this relay? |
| Device | `Authorization: Bearer {deviceToken}` | Which paired device in which namespace? |

App headers are required on all `/v1` routes (including unauthenticated create/pair/recover). Device token is omitted on first `POST /v1/namespaces` — returned in the response.

### Registration modes

| Config | Who registers |
|--------|---------------|
| `apps.enabled: false` | No app headers — v1.2 behaviour |
| `operator_managed` | Operator via YAML seed or `/operator` |
| `self_service` | Developers at `/developer` |

### Approval before API access

- **Web:** register HTTPS origin → DNS TXT or `/.well-known/esr-app-verification` → status `active`
- **Native:** register bundle per platform → operator approves when `requireManualReview: true` → all bundles approved → `active`

### Native client secret

- Not assigned on app create
- Required when `native.requireClientSecret: true` on unauthenticated routes
- Create/rotate via `POST .../rotate-secret` or operator/developer portal
- Pass to `EsrSync.connect({ clientSecret })` or `X-ESR-Client-Secret`
- Never embed in web builds
sync.senkron.la
### SDK examples

```typescript
// Web SPA
await EsrSync.connect({
  relayUrl: 'https://sync.senkron.la/v1',
  appId: 'esr_app_mynotes',
  document,
  storage,
  onRecoveryPhrase,sync.senkron.la
  onConflict,
})

// Native / desktop
await EsrSync.connect({
  relayUrl: 'https://sync.senkron.la/v1',
  appId: 'esr_app_mynotes_mobile',
  appPlatform: 'desktop',
  bundleId: 'com.example.mynotes',
  clientSecret: process.env.ESR_CLIENT_SECRET, // when required
  document,
  storage,
  onRecoveryPhrase,
  onConflict,
})

// Restrict guest apps at pairing time
await sync.startPairing({ allowedAppIds: ['esr_app_mynotes_mobile'] })
```

Full spec: [16-APP-REGISTRY.md](https://github.com/kemalersin/senkronla/blob/main/docs/en/16-APP-REGISTRY.md). Human docs: `/sdk#app-registry`, `/api#app-registry`.

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
  namespaceId: appWorkspace.id,
  namespaceLabel: appWorkspace.name,
  contentType: 'application/vnd.myapp+json',
  encrypt: true,
  // app: sync password — SDK never generates it
  resolvePassword: async () => appSession.getSyncPassword(),
  exportDocument: () => appStore.exportSnapshot(),
  importDocument: (json) => appStore.importSnapshot(json),
})
```

### Direct buildEnvelope

```typescript
import { buildEnvelope, extractDocument } from '@senkronla/client'

// app: same password source as resolvePassword()
const password = await appSession.getSyncPassword()

const envelope = await buildEnvelope({
  namespaceId: appWorkspace.id,
  namespaceLabel: appWorkspace.name,
  documentJson: JSON.stringify(await appStore.exportSnapshot()),
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
| `startPairing(opts?)` | Host: returns `{ code, qrPayload, expiresAt }`; optional `{ allowedAppIds }` when `apps.enabled` |
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
// app: subscribe to appStore — call after every local edit
appStore.onChange(() => sync.notifyLocalChange('primary'))
await sync.flushPush('settings') // skip debounce — before logout
```

#### Pairing

```typescript
// Any active app allowed (default when apps.enabled)
const { code, qrPayload, expiresAt } = await sync.startPairing()

// Restrict guest redeem to specific app ids (web + native variants)
await sync.startPairing({
  allowedAppIds: ['esr_app_mynotes', 'esr_app_mynotes_mobile'],
})

await sync.joinPairing('482913') // guest — same namespaceId in adapters
```

#### Recovery

```typescript
await sync.recover('word1 word2 ... word24')
// new device token; ALL other devices revoked; sync() pulls latest (all documents)
```

#### Conflicts

```typescript
// app: implement — not provided by @senkronla/client
onConflict: async (ctx) => {
  // ctx: { namespaceId, documentId, knownRevision, remoteRevision, remoteMeta }
  return appUi.askKeepLocalOrRemote(ctx.remoteMeta.writtenAt) // 'remote' | 'local' | 'cancel'
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

All errors are `EsrError` with stable `code`. Relay errors pass through unchanged.

### SDK-only (thrown locally)

| Code | Action |
|------|--------|
| `ESR_CLIENT_NO_TOKEN` | Call `ensureNamespace`, `joinPairing`, or `recover` |
| `ESR_CLIENT_OFFLINE` | Retry `sync()` when online |
| `ESR_CLIENT_NO_FETCH` | Fetch API unavailable — use Node 18+ or polyfill |
| `ESR_CLIENT_HTTP_ERROR` | Generic HTTP failure — check status |
| `ESR_CLIENT_SYNC_FAILED` | Unexpected sync failure — inspect message |
| `ESR_CLIENT_NAMESPACE_EXISTS` | Use pairing or recovery, not create |
| `ESR_CLIENT_CONFLICT_CANCELLED` | User cancelled — local edits still pending |
| `ESR_CLIENT_NO_DOCUMENT` | Pass `document` or `documents` to `connect` |
| `ESR_CLIENT_UNKNOWN_DOCUMENT_ID` | `sync(id)` not in configured documents |
| `ESR_CLIENT_INVALID_DOCUMENT_ID` | Fix `documentId` format |
| `ESR_CLIENT_INVALID_DOCUMENT_SLOT` | Fix `documents[]` entry |
| `ESR_CLIENT_DUPLICATE_DOCUMENT_ID` | Remove duplicate in `documents[]` |
| `ESR_CLIENT_NAMESPACE_MISMATCH` | Fix multi-document namespace config |
| `ESR_CLIENT_ENCRYPTION_PASSWORD_REQUIRED` | Provide ENV-ENC1 password |
| `ESR_CLIENT_UNSUPPORTED_CONTENT` | Unsupported inner content magic |
| `ESR_CLIENT_INVALID_ENVELOPE` | Fix envelope build/parse |

### Common relay codes (via SDK)

| Code | Action |
|------|--------|
| `REVISION_CONFLICT` | Conflict flow required |
| `DEVICE_LIMIT_PAYMENT_REQUIRED` | Show upgrade / unlock UI |
| `DEVICE_LIMIT_BLOCKED` | User must revoke a device |
| `DEVICE_TOKEN_INVALID` | Re-pair or recover |
| `DOCUMENT_NOT_FOUND` | Expected on first pull for a document |

Full relay list: [api-en.md § Error codes](api-en.md#error-codes) and `docs/en/12-ERROR-CODES.md`.

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
