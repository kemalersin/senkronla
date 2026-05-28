# Senkronla — Agent integration guide (SDK & REST)

> **Purpose:** Single-file reference for AI coding agents integrating Senkronla into an application.
> **Out of scope:** relay deployment, Docker, Postgres, `ESR_*` env vars, operator portal — use the human [ESR setup guide](/guides/esr) for operators.

---

## Table of contents

1. [Architecture](#architecture)
2. [Integration checklist](#integration-checklist)
3. [Core concepts](#core-concepts)
4. [SDK integration](#sdk-integration-recommended)
5. [REST integration](#rest-integration-no-sdk)
6. [Envelope format (ESR-DOC1)](#envelope-format-esr-doc1)
7. [Recovery key proof](#recovery-key-proof)
8. [WebSocket notifications](#websocket-notifications)
9. [Device limits & unlock codes](#device-limits--unlock-codes)
10. [Error codes](#error-codes)
11. [Relay quotas & size limits](#relay-quotas--size-limits)
12. [Security](#security)
13. [Packages](#packages)
14. [Agent implementation rules](#agent-implementation-rules)

---

## Architecture

Senkronla is an open-source, self-hosted **Envelope Sync Relay (ESR)**. Your app syncs **one JSON snapshot per customer workspace** across devices. The relay stores opaque `ESR-DOC1` envelopes — it **never parses** your application payload.

```
┌─────────────┐     ESR-DOC1 envelope      ┌──────────────┐
│  Device A   │ ───── PUT /primary ──────► │ Envelope     │
│  (your app) │ ◄──── GET /head ────────── │ Sync Relay   │
└─────────────┘     WebSocket notify       └──────────────┘
       ▲                                          │
       │              same namespace              │
┌─────────────┐                                  │
│  Device B   │ ◄────────────────────────────────┘
└─────────────┘
```

**Division of responsibility:**

| Layer | Owns |
|-------|------|
| **Your app** | UX, data model, export/import JSON, recovery phrase UI, conflict UX, billing UI |
| **Senkronla relay** | Opaque storage, revision coordination, device tokens, slot limits, push notifications |
| **SDK (`@senkronla/client`)** | HTTP + optional WebSocket, token storage, debounced push, conflict orchestration |

**Choose SDK vs REST:**

| Path | When |
|------|------|
| **SDK** (`@senkronla/client`) | JavaScript/TypeScript — browser, Electron, React Native (with fetch), Node 18+ |
| **REST** (`/v1`) | Swift, Kotlin, server jobs, custom sync engines, or non-JS stacks |

Default: **`EsrSync`** facade unless the stack forbids JS.

---

## Integration checklist

Before shipping production integration:

- [ ] Running relay with base URL ending in `/v1` (e.g. `https://sync.example.com/v1`)
- [ ] Stable **`namespaceId`** (UUID v4) per customer workspace — same across reinstalls for same sync space
- [ ] **`DocumentAdapter`** (or REST envelope builder) that round-trips app state as JSON
- [ ] **`onRecoveryPhrase`** UI — phrase shown **once** at workspace creation; cannot be retrieved later
- [ ] **`onConflict`** UI — user picks local vs remote; **no server-side merge**
- [ ] Sync loop wired: `ensureNamespace()` → `sync()` on startup; `notifyLocalChange()` on edits; `flushPush()` before logout
- [ ] Device limit UX for `DEVICE_LIMIT_*` errors
- [ ] Secure storage for `deviceToken` (Keychain / Keystore on mobile)

---

## Core concepts

| Term | Meaning |
|------|---------|
| **namespace** | Isolated sync workspace; one JSON snapshot per namespace. UUID v4 you choose. |
| **deviceToken** | Bearer secret after create/pair/recover. Revoked on device delete or recovery. SDK stores in `EsrStorage`. |
| **clientDeviceId** | Client-generated UUID, stable per app install. Identifies this install inside envelopes. |
| **deviceId** | Server-assigned ULID for this paired device (settings UI, revoke). |
| **revision** | ULID on each snapshot. Required for optimistic locking on push. |
| **envelope** | `ESR-DOC1` wrapper around your JSON + metadata. Relay stores opaque bytes. |
| **primary document** | v1: exactly one document per namespace (`documentId: "primary"`). |
| **pairing code** | 6-digit code; host generates, guest redeems within TTL (default ~10 min). |
| **recovery phrase** | 24-word BIP39 phrase. Shown once. **Never sent to server** — only Argon2id hash proof. |

**Who does what:** Your app owns UX and data model. Senkronla owns transport: storing packages, versioning, device slots, notifying peers.

---

## SDK integration (recommended)

### Install

```bash
pnpm add @senkronla/client
# For manual envelopes or recovery proof outside EsrSync:
pnpm add @senkronla/protocol
```

Requires Node 18+ or modern browser with `fetch` and Web Crypto.

### Minimal setup

```typescript
import {
  EsrSync,
  createDocumentAdapter,
  createLocalStorageAdapter,
} from '@senkronla/client'

const document = createDocumentAdapter({
  namespaceId: '550e8400-e29b-41d4-a716-446655440000',
  namespaceLabel: 'Acme Corp workspace',
  contentType: 'application/vnd.myapp+json',
  exportDocument: () => appStore.exportJson(),
  importDocument: (data) => appStore.importJson(data),
})

const sync = await EsrSync.connect({
  relayUrl: 'https://sync.example.com/v1',
  document,
  storage: createLocalStorageAdapter('myapp'),
  onRecoveryPhrase: async ({ phrase }) => {
    await ui.showRecoveryModal(phrase) // REQUIRED — once
  },
  onConflict: async (ctx) => {
    return ui.askKeepLocalOrRemote(ctx.remoteMeta.writtenAt) // 'local' | 'remote' | 'cancel'
  },
})

await sync.ensureNamespace()
await sync.sync()
appStore.onChange(() => sync.notifyLocalChange())
```

### EsrSync.connect options

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `relayUrl` | yes | — | Base URL ending in `/v1` |
| `document` | yes | — | `DocumentAdapter` instance |
| `storage` | yes | — | `EsrStorage` (use `createLocalStorageAdapter(prefix)` on web) |
| `onRecoveryPhrase` | yes | — | Called once with 24-word phrase when namespace created |
| `onConflict` | yes | — | Return `'remote'`, `'local'`, or `'cancel'` when revisions diverge |
| `deviceLabel` | no | auto | Shown in device list |
| `onDeviceLimit` | no | — | Called on `DEVICE_LIMIT_*` — open billing UI |
| `onStatusChange` | no | — | Drive sync indicator in UI |
| `onError` | no | — | Log `EsrError` instances |
| `pushDebounceMs` | no | `2000` | Delay after `notifyLocalChange()` before push |
| `notificationsEnabled` | no | `true` | WebSocket + poll fallback |
| `notificationMode` | no | `ws_with_poll_fallback` | Or `poll_only` |
| `persistRecoveryPhrase` | no | `true` | Store phrase in `EsrStorage` (security tradeoff) |
| `pauseSchedulerWhenHidden` | no | `true` | Pause background sync when tab hidden |
| `pullIntervalConnectedMs` | no | — | Poll interval when WS connected |
| `pullIntervalDisconnectedMs` | no | — | Poll interval when offline/disconnected |
| `enabled` | no | `true` | Set `false` to defer sync until ready |

### Document adapter

Bridge between app state and Senkronla. Use `createDocumentAdapter` or implement `DocumentAdapter`:

```typescript
interface DocumentAdapter {
  buildDocument(): Promise<string>      // export JSON snapshot
  importDocument(documentJson: string): Promise<void>  // apply remote snapshot
  contentType(): string                 // vendor MIME, e.g. application/vnd.myapp+json
  encryption(): { enabled: boolean; resolvePassword(): Promise<string | undefined> }
  namespaceId(): string                 // stable UUID v4
  namespaceLabel(): string
}
```

**Rules:**

- `namespaceId` must be **stable** across devices and reinstalls (same customer workspace).
- `contentType` should be a vendor MIME type.
- `encryption.enabled` must stay **`false`** until `ENV-ENC1` ships (v1 uses `ENV-RAW1` only).
- Keep `buildDocument()` fast — runs before every push.

### Local storage (EsrStorage)

Implement `EsrStorage` or use `createLocalStorageAdapter('prefix')`. Keys scoped per namespace:

| Key | Purpose |
|-----|---------|
| `deviceToken` | Bearer token for authenticated calls |
| `knownRemoteRevision` | Last seen server revision (conflict detection) |
| `recoveryPhrase` | Optional if `persistRecoveryPhrase: true` |
| `global:clientDeviceId` | Generated once per app install |

On mobile, implement `EsrStorage` backed by Keychain / Keystore — do not use plain localStorage for tokens.

### EsrSync methods

| Method | Purpose |
|--------|---------|
| `ensureNamespace(opts?)` | Create workspace on first launch or verify token |
| `sync()` | Full pull/push cycle |
| `notifyLocalChange()` | Mark dirty; debounced push follows |
| `flushPush()` | Push immediately (logout, critical save) |
| `startPairing()` | Host: returns `{ code, qrPayload, expiresAt }` |
| `joinPairing(code)` | Guest: redeems code, stores token, runs `sync()` |
| `recover(phrase)` | Recovery flow; revokes all other devices |
| `listDevices()` | Settings UI: devices + limits |
| `revokeDevice(deviceId)` | Remove another device (not last one) |
| `redeemUnlockCode(code)` | Apply operator unlock code for extra slots |
| `resolveConflict('local' \| 'remote')` | Manual conflict resolution |
| `getStatus()` | Current `EsrSyncStatus` |
| `getLastError()` | Last `EsrError` if any |
| `disable()` | Stop scheduler and notifications |

#### ensureNamespace()

```typescript
const { namespaceId, created, recoveryPhrase } = await sync.ensureNamespace({
  namespaceLabel: 'Acme Corp workspace',
})

if (created) {
  // recoveryPhrase also passed to onRecoveryPhrase callback
  console.log('User must save offline:', recoveryPhrase)
}

// Later launches
const check = await sync.ensureNamespace()
// { namespaceId: '...', created: false }
```

#### sync()

```typescript
const result = await sync.sync()

switch (result.status) {
  case 'ok':
    break
  case 'offline':
    // retry when network returns
    break
  case 'conflict':
    // onConflict handles UX; or resolveConflict manually
    break
  case 'error':
    console.error(result.error.code, result.error.message)
    break
}
```

Call on: app launch (after `ensureNamespace`), network reconnect, window focus, WebSocket `head_changed`.

#### notifyLocalChange() / flushPush()

```typescript
appStore.onChange(() => sync.notifyLocalChange())
// status → 'pending_push' until debounce completes

await sync.flushPush() // skip debounce — before logout
```

#### Pairing

**Host:**

```typescript
const { code, qrPayload, expiresAt } = await sync.startPairing()
// code: "482913" (6 digits)
// qrPayload: esr://pair/v1/{namespaceId}?code=482913&exp=...&host=...
```

**Guest** (same `namespaceId` in adapter):

```typescript
await sync.joinPairing('482913')
// stores token, runs sync(), importDocument() applies remote snapshot
```

#### Recovery

```typescript
await sync.recover('word1 word2 ... word24')
// new device token; ALL other devices revoked; then sync() pulls latest
```

#### Conflicts

When server revision advanced while local edits were unpushed, SDK pauses and calls `onConflict`:

```typescript
onConflict: async (ctx) => {
  // ctx: { namespaceId, knownRevision, remoteRevision, remoteMeta }
  // remoteMeta: { revision, writtenAt, deviceId, contentSha256, contentMagic, sizeBytes }
  return ui.askUser() // 'remote' | 'local' | 'cancel'
}

// Manual:
await sync.resolveConflict('remote')
```

Returning `'cancel'` leaves local edits pending; status stays `'conflict'`.

#### Device management

```typescript
const { devices, limits } = await sync.listDevices()
// limits: { freeDeviceLimit, purchasedSlots, maxDevices, activeDevices, canAddDevice, onLimitReached }

await sync.revokeDevice('01HZPXDEVICEGUEST01')
await sync.redeemUnlockCode('UNLK-7X9K-2M4P')
```

### Sync lifecycle

1. **App launch** → `ensureNamespace()` → `sync()`
2. **Local edit** → `notifyLocalChange()` (debounced push, default 2s)
3. **Network online / focus** → `sync()`
4. **Logout** → `flushPush()` → optional `disable()`

### Status values (`EsrSyncStatus`)

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

### SDK client error codes

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

---

## REST integration (no SDK)

Base URL: `https://your-relay.example.com/v1`  
Format: JSON  
Health (no auth): `GET https://your-relay.example.com/health`

### Authentication

After create, pair, or recover you receive `deviceToken`. Send on all authenticated routes:

```http
Authorization: Bearer dvt_a1b2c3d4e5f6...
```

WebSocket: same token in `Authorization` header. Subprotocol: `esr-notifications-v1`.

**Unauthenticated routes:** `POST /v1/namespaces`, `POST .../devices` (pairing), `POST .../recover`.

### Typical flow (no SDK)

1. `POST /v1/namespaces` → save `deviceToken`
2. `GET .../documents/primary/head/meta` → read current revision
3. `PUT .../documents/primary` → push envelope (`expectedRevision: null` on first push)
4. Subscribe WebSocket or poll `head/meta` on other devices
5. `GET .../head` when revision differs from local known revision

### Endpoints reference

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/health` | no | Relay health (outside `/v1`) |
| `POST` | `/v1/namespaces` | no | Create workspace + first device |
| `GET` | `/v1/namespaces/{id}` | yes | Metadata, limits, head summary |
| `GET` | `/v1/namespaces/{id}/documents/primary/head/meta` | yes | Lightweight head (revision, hash, size) |
| `GET` | `/v1/namespaces/{id}/documents/primary/head` | yes | Full envelope for import |
| `PUT` | `/v1/namespaces/{id}/documents/primary` | yes | Push snapshot |
| `POST` | `/v1/namespaces/{id}/pairing-tokens` | yes | Host: generate 6-digit code |
| `POST` | `/v1/namespaces/{id}/devices` | no* | Guest: redeem pairing code |
| `GET` | `/v1/namespaces/{id}/devices` | yes | List devices + limits |
| `DELETE` | `/v1/namespaces/{id}/devices/{deviceId}` | yes | Revoke device |
| `POST` | `/v1/namespaces/{id}/recover` | no | Recovery with phrase proof |
| `GET` | `/v1/namespaces/{id}/limits` | yes | Current slot limits |
| `POST` | `/v1/namespaces/{id}/unlock` | yes | Redeem unlock code |
| `GET` | `/v1/namespaces/{id}/notifications` | yes | WebSocket upgrade |

\* Pairing redeem uses pairing code, not device token.

### Create namespace (first device)

```http
POST /v1/namespaces
Content-Type: application/json

{
  "namespaceId": "550e8400-e29b-41d4-a716-446655440000",
  "namespaceLabel": "Acme Corp workspace",
  "deviceLabel": "Alice laptop",
  "clientDeviceId": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  "recoveryKeyProof": {
    "salt": "c2FsdC1leGFtcGxlLWJ5dGVz",
    "hash": "a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3"
  }
}
```

```http
HTTP/1.1 201 Created

{
  "namespaceId": "550e8400-e29b-41d4-a716-446655440000",
  "deviceToken": "dvt_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
  "deviceId": "01HZPXDEVICEHOST01",
  "limits": {
    "freeDeviceLimit": 2,
    "purchasedSlots": 0,
    "maxDevices": 2,
    "activeDevices": 1,
    "canAddDevice": true,
    "onLimitReached": { "mode": "payment", "slotPackages": [3, 5, 10] }
  }
}
```

### Get namespace

```http
GET /v1/namespaces/550e8400-e29b-41d4-a716-446655440000
Authorization: Bearer dvt_...
```

Returns `namespaceLabel`, `limits`, `head` summary, `lastSyncAt`.

### Push document

**First push** — omit `expectedRevision` or set `null`:

```http
PUT /v1/namespaces/{id}/documents/primary
Authorization: Bearer dvt_...
Content-Type: application/json

{
  "expectedRevision": null,
  "envelope": { /* ESR-DOC1 — see below */ }
}
```

**Update** — `expectedRevision` must match current head:

```http
PUT /v1/namespaces/{id}/documents/primary
Authorization: Bearer dvt_...
Content-Type: application/json

{
  "expectedRevision": "01HZQXK8Y3V5G2N4M6P7R9S1T",
  "envelope": { /* new revision ULID inside envelope */ }
}
```

Success `201`:

```json
{
  "revision": "01HZQXNEWREVISION01",
  "writtenAt": "2026-05-28T10:30:00.000Z",
  "contentSha256": "...",
  "writerDeviceId": "01HZPXDEVICEHOST01"
}
```

### Pull document

```http
GET /v1/namespaces/{id}/documents/primary/head/meta
Authorization: Bearer dvt_...
```

Compare `revision` to local known revision. If different:

```http
GET /v1/namespaces/{id}/documents/primary/head
Authorization: Bearer dvt_...
```

Returns full `ESR-DOC1` envelope. Decode `payload` (base64) to get your JSON.

### Pairing

**Host:**

```http
POST /v1/namespaces/{id}/pairing-tokens
Authorization: Bearer dvt_...
Content-Type: application/json

{ "ttlSeconds": 600 }
```

```json
{
  "code": "482913",
  "expiresAt": "2026-05-28T10:25:00.000Z",
  "qrPayload": "esr://pair/v1/{namespaceId}?code=482913&exp=1748427900&host=Alice%20laptop"
}
```

**Guest:**

```http
POST /v1/namespaces/{id}/devices
Content-Type: application/json

{
  "pairingCode": "482913",
  "deviceLabel": "Bob phone",
  "clientDeviceId": "7c9e6679-7425-40de-944b-e07fc1f90ae7"
}
```

→ `201` with new `deviceToken`.

### Recovery

**Warning:** Revokes **all** existing device tokens in the workspace.

```http
POST /v1/namespaces/{id}/recover
Content-Type: application/json

{
  "recoveryKeyProof": { "salt": "...", "hash": "..." },
  "deviceLabel": "Recovery laptop",
  "clientDeviceId": "9b2c3d4e-5f6a-7b8c-9d0e-1f2a3b4c5d6e"
}
```

```json
{
  "deviceToken": "dvt_recovery_token...",
  "deviceId": "01HZPXDEVICERECOV01",
  "revokedDeviceCount": 2,
  "limits": { ... }
}
```

### Device list & revoke

```http
GET /v1/namespaces/{id}/devices
Authorization: Bearer dvt_...
```

```http
DELETE /v1/namespaces/{id}/devices/{deviceId}
Authorization: Bearer dvt_...
```

→ `204`. Cannot revoke the last remaining device.

### Limits & unlock

```http
GET /v1/namespaces/{id}/limits
Authorization: Bearer dvt_...
```

```http
POST /v1/namespaces/{id}/unlock
Authorization: Bearer dvt_...
Content-Type: application/json

{ "unlockCode": "UNLK-7X9K-2M4P" }
```

```json
{
  "slotsAdded": 3,
  "purchasedSlots": 3,
  "maxDevices": 5,
  "canAddDevice": true
}
```

### Error response shape

```json
{
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Expected revision does not match server head",
    "details": {
      "remoteMeta": {
        "revision": "01HZQXK8Y3V5G2N4M6P7R9S1T",
        "writtenAt": "2026-05-28T10:15:00.000Z",
        "deviceId": "01HZPXDEVICEHOST01",
        "contentSha256": "...",
        "contentMagic": "ENV-RAW1",
        "sizeBytes": 128
      }
    }
  }
}
```

Always branch on **`error.code`**, not HTTP status alone.

---

## Envelope format (ESR-DOC1)

v1 syncs a single **primary** document. Your app JSON goes in `payload` (base64). Inner content uses `ENV-RAW1` (client-side encryption via `ENV-ENC1` is not yet available — keep `encryption.enabled: false`).

```json
{
  "magic": "ESR-DOC1",
  "schemaVersion": 1,
  "namespaceId": "550e8400-e29b-41d4-a716-446655440000",
  "namespaceLabel": "Acme Corp workspace",
  "documentId": "primary",
  "revision": "01HZQXK8Y3V5G2N4M6P7R9S1T",
  "deviceId": "01HZPXDEVICEHOST01",
  "writtenAt": "2026-05-28T10:15:00.000Z",
  "contentType": "application/vnd.myapp+json",
  "contentMagic": "ENV-RAW1",
  "contentSha256": "a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3",
  "payload": "eyJub3RlIjoiSGVsbG8ifQ=="
}
```

**Validation rules:**

- `contentSha256` = SHA-256 hex of raw `payload` bytes (before base64 decode for hashing — payload field is base64-encoded document JSON)
- `revision` must be a new ULID on each push
- `namespaceId` must match route and adapter
- `documentId` must be `"primary"`
- Full serialized JSON must fit within `maxEnvelopeBytes` (default 50 MB)

**Building envelopes in JS:**

```typescript
import { buildEnvelope, buildRecoveryKeyProof } from '@senkronla/client'
// or from '@senkronla/protocol'
```

Do not hand-roll envelope hashing — use SDK/protocol helpers.

---

## Recovery key proof

The 24-word BIP39 phrase **never leaves the device**. Only `{ salt, hash }` is sent:

- Salt: 16 random bytes, base64url
- Hash: Argon2id of normalized phrase with that salt, base64url
- Defaults: `memoryCost: 65536`, `timeCost: 3`, `parallelism: 4`

```typescript
import { buildRecoveryKeyProof, generateRecoveryPhrase } from '@senkronla/protocol'

const phrase = generateRecoveryPhrase() // show to user once
const recoveryKeyProof = await buildRecoveryKeyProof(phrase)
// send recoveryKeyProof in POST /namespaces or POST /recover
```

**Never implement Argon2 parameters yourself** — import from `@senkronla/protocol`.

---

## WebSocket notifications

Connect:

```http
GET /v1/namespaces/{id}/notifications
Upgrade: websocket
Sec-WebSocket-Protocol: esr-notifications-v1
Authorization: Bearer dvt_...
```

**Messages (notification only — always fetch via HTTP GET):**

```json
{
  "type": "head_changed",
  "documentId": "primary",
  "revision": "01HZQXUPDATEDREV02",
  "contentSha256": "...",
  "writtenAt": "2026-05-28T11:00:00.000Z",
  "writerDeviceId": "01HZPXDEVICEHOST01"
}
```

```json
{
  "type": "limits_changed",
  "maxDevices": 5,
  "activeDevices": 2,
  "purchasedSlots": 3
}
```

On `head_changed` → compare revision → `GET .../head` if changed.  
SDK handles this automatically when `notificationsEnabled: true`.

---

## Device limits & unlock codes

Each namespace has slot limits:

```json
{
  "freeDeviceLimit": 2,
  "purchasedSlots": 0,
  "maxDevices": 2,
  "activeDevices": 2,
  "canAddDevice": false,
  "onLimitReached": {
    "mode": "payment",
    "slotPackages": [3, 5, 10]
  }
}
```

| `onLimitReached.mode` | Behavior |
|-------------------------|----------|
| `payment` | `DEVICE_LIMIT_PAYMENT_REQUIRED` — show upgrade; operator unlock codes add slots |
| `block` | `DEVICE_LIMIT_BLOCKED` — user must revoke a device |

Unlock codes are generated by operators (not app integrators). App calls `redeemUnlockCode` / `POST .../unlock`.

---

## Error codes

| Code | HTTP | Action |
|------|------|--------|
| `VALIDATION_ERROR` | 400 | Fix request body |
| `PAIRING_CODE_INVALID` | 400 | Code expired/wrong — generate new |
| `UNLOCK_CODE_INVALID` | 400 | Invalid unlock code |
| `DEVICE_TOKEN_INVALID` | 401 | Re-pair or recover |
| `RECOVERY_INVALID` | 401 | Wrong recovery proof |
| `DEVICE_LIMIT_PAYMENT_REQUIRED` | 403 | Upgrade / unlock UI |
| `DEVICE_LIMIT_BLOCKED` | 403 | Revoke a device |
| `NAMESPACE_NOT_FOUND` | 404 | Check namespaceId |
| `DOCUMENT_NOT_FOUND` | 404 | No push yet — expected on first pull |
| `NAMESPACE_EXISTS` | 409 | Use pair or recover |
| `REVISION_CONFLICT` | 409 | Read `details.remoteMeta`, run conflict UX |
| `ENVELOPE_TOO_LARGE` | 413 | Shrink snapshot (default max ~50 MB) |
| `ENVELOPE_INVALID` | 422 | Fix envelope schema/hash |
| `RATE_LIMIT_EXCEEDED` | 429 | Backoff using `Retry-After` |

---

## Relay quotas & size limits

Defaults (operator-configurable via `config.yaml` / `ESR_*`):

| Quota | Default | Scope | Window |
|-------|---------|-------|--------|
| General API | 300 / minute | Client IP | 1 min |
| Document push | 120 / hour | Device | 1 hour |
| Pairing redeem | 20 / hour | Namespace | 1 hour |
| Pairing token | 30 / hour | Namespace | 1 hour |
| Recovery | 5 / hour | Namespace | 1 hour |

**Max envelope size:** 52,428,800 bytes (50 MB) — `sync.maxEnvelopeBytes` / `ESR_MAX_ENVELOPE_BYTES`.

Rate limit headers: `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`. Push also sends `RateLimit-Push-*`.

Exempt from general IP quota: `/health`, `/metrics`, WebSocket notifications.

---

## Security

- Treat **`deviceToken`** like a session secret — secure storage on client
- **Recovery phrase** shown once — build copy/save UX; cannot retrieve from server
- Recovery **revokes all devices** — warn users before recover flow
- Do not log envelopes or tokens in production
- CORS is operator-configured — your web app origin must be allowed on the relay
- v1 payload is **not encrypted at rest in envelope** (`ENV-RAW1`) — encrypt sensitive fields in your app JSON if needed until `ENV-ENC1` ships

---

## Packages

| Package | Role |
|---------|------|
| `@senkronla/client` | `EsrSync`, `RelayClient`, adapters, envelope helpers |
| `@senkronla/protocol` | Envelope schema, recovery proof, identity helpers |
| `@senkronla/server` | Relay API (self-hosted — operators only) |

---

## Agent implementation rules

1. **Prefer SDK** for JS/TS unless stack forbids it.
2. **Never skip** `onRecoveryPhrase` or `onConflict` — both required for production.
3. **Never hand-roll** recovery hashing or envelope SHA-256 — use `@senkronla/protocol`.
4. **Relay URL** must end with `/v1`.
5. **Same `namespaceId`** on host and guest adapters for pairing.
6. **Conflict UX is mandatory** — no automatic merge exists.
7. **Start with this file** — open human docs only for edge cases:
   - [Integration guides](/guides) — concepts, flows, offline behavior
   - [SDK reference](/sdk) — exhaustive method docs
   - [REST API](/api) — interactive examples
   - [ESR setup](/guides/esr) — operators only (deployment)

---

*Senkronla agent guide · SDK + REST · ESR deployment out of scope*
