# 09 — Client Integration Guide (Advanced)

> **Default path:** [14-ESR-SYNC-FACADE.md](./14-ESR-SYNC-FACADE.md) — `EsrSync.connect()`. This document covers low-level `RelayClient` + manual wiring (CLI, tests, custom scheduler).

This document explains step by step how **any application** integrates with Envelope Sync Relay. Application-specific business logic stays only inside `DocumentAdapter`.

## 0. Quick routing

| Need | Document / API |
|------|----------------|
| Normal application integration | [14-ESR-SYNC-FACADE.md](./14-ESR-SYNC-FACADE.md) |
| Multiple documents per namespace | [14-ESR-SYNC-FACADE.md](./14-ESR-SYNC-FACADE.md) §5.2 · [15-MULTI-DOCUMENT.md](./15-MULTI-DOCUMENT.md) |
| Multi-namespace session, custom flow | This document — `RelayClient` |
| Identity (namespaceId, recovery) | `@senkronla/protocol` — doc 14 §3 |

## 1. Integration architecture

```
┌─────────────────────────────────────────┐
│ Your Application                        │
│  ├─ Local database (IndexedDB, SQLite)│
│  ├─ DocumentAdapter (YOU implement)     │
│  │    buildDocument() / importDocument()│
│  └─ UI (sync settings, devices, conflict)│
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│ @esr/client                             │
│  RelayClient — HTTP transport           │
│  SyncEngine — pull/push/conflict/sched  │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│ @esr/protocol — ESR-DOC1, identity tools │
└─────────────────────────────────────────┘
```

## 2. DocumentAdapter (application implements)

```typescript
export interface DocumentAdapter {
  /** Produce application snapshot as JSON string */
  buildDocument(): Promise<string>

  /** Apply remote snapshot to local store (merge/replace is application decision) */
  importDocument(documentJson: string): Promise<void>

  /** Content MIME — envelope contentType */
  contentType(): string

  /** Encryption preferences */
  encryption(): {
    enabled: boolean
    /** Password resolver — profile password, sync password, etc. */
    resolvePassword(): Promise<string | undefined>
  }

  /** Namespace identity — application workspace/profile UUID or `generateNamespaceId()` */
  namespaceId(): string

  /** UI label */
  namespaceLabel(): string
}
```

The ESR SDK does **not** know the application's entity schema.

If the application already has a fixed workspace/profile UUID, `namespaceId()` returns it; otherwise persist the value produced with `generateNamespaceId()` before create.

## 3. Identity tools (`@esr/protocol`)

`namespaceId` and recovery phrase are **not** generated on the server; generation and hashing must be a single source of truth in `@esr/protocol`. The application does not copy or re-implement these functions.

### 3.1 Required exports

| Function | Package | Description |
|----------|---------|-------------|
| `generateNamespaceId()` | `@esr/protocol` | RFC 4122 UUID v4 (`crypto.randomUUID` or testable polyfill) |
| `isValidNamespaceId(id)` | `@esr/protocol` | UUID v4 format validation (envelope + API path) |
| `generateRecoveryPhrase()` | `@esr/protocol` | BIP39 English **24 words** (doc 05) |
| `normalizeRecoveryPhrase(phrase)` | `@esr/protocol` | Whitespace/NFC normalization; before verify/create |
| `buildRecoveryKeyProof(phrase)` | `@esr/protocol` | Argon2id salt+hash → API `recoveryKeyProof` (doc 05 parameters) |
| `verifyRecoveryKeyProof(phrase, proof)` | `@esr/protocol` | Client-side pre-validation in recover flow (optional UX) |

`@esr/client` **re-exports** these; `RelayClient.createNamespace` / `recover` use `buildRecoveryKeyProof`.

### 3.2 Reference API

```typescript
import {
  generateNamespaceId,
  isValidNamespaceId,
  generateRecoveryPhrase,
  normalizeRecoveryPhrase,
  buildRecoveryKeyProof,
  verifyRecoveryKeyProof,
} from '@esr/protocol'

// New workspace — when application has no id yet
const namespaceId = generateNamespaceId()
assert(isValidNamespaceId(namespaceId))

// Namespace create — phrase only on client; salt+hash to server
const recoveryPhrase = generateRecoveryPhrase()
const proof = await buildRecoveryKeyProof(recoveryPhrase)

await client.createNamespace({
  namespaceId,
  namespaceLabel: 'My Vault',
  recoveryKeyProof: proof,
  deviceLabel: getDeviceName(),
  clientDeviceId: getOrCreateClientDeviceId(),
})

await ui.showRecoveryPhrase(recoveryPhrase) // once; server never sees phrase
```

### 3.3 Application-provided id (e.g. existing profile UUID)

When there is a fixed `namespaceId` source, do **not** call `generateNamespaceId()`; still validate `isValidNamespaceId(adapter.namespaceId())` before create.

Recovery phrase is always produced with `generateRecoveryPhrase()` (independent of profile password — doc 05).

## 4. RelayClient configuration

```typescript
import { RelayClient } from '@senkronla/client'

const client = new RelayClient({
  baseUrl: 'https://sync.example.com/v1',
  getDeviceToken: () => localStorage.getItem('esr.deviceToken'),
  onDeviceToken: (token) => localStorage.setItem('esr.deviceToken', token),
  clientDeviceId: getOrCreateClientDeviceId(),
})
```

### 4.1 Document-scoped HTTP

All head/push methods accept optional `documentId` (default `'primary'`):

```typescript
const docs = await client.listDocuments(namespaceId)
const meta = await client.getHeadMeta(namespaceId, 'settings')
const envelope = await client.getHead(namespaceId, 'settings')
await client.pushDocument({
  namespaceId,
  documentId: 'settings',
  envelope,
  expectedRevision: meta?.revision ?? null,
})
```

Paths: `GET /documents`, `GET|PUT /documents/{documentId}/...` — see [04-API-REFERENCE.md](./04-API-REFERENCE.md).

## 5. Initial setup flow

```typescript
import { generateRecoveryPhrase, buildRecoveryKeyProof } from '@esr/protocol'

async function setupSync(adapter: DocumentAdapter): Promise<SetupResult> {
  const namespaceId = adapter.namespaceId()

  // 1. Recovery phrase — @esr/protocol (application does not generate its own)
  const recoveryPhrase = generateRecoveryPhrase()
  const recoveryKeyProof = await buildRecoveryKeyProof(recoveryPhrase)

  // 2. Create namespace
  const result = await client.createNamespace({
    namespaceId,
    namespaceLabel: adapter.namespaceLabel(),
    recoveryKeyProof,
    deviceLabel: getDeviceName(),
    clientDeviceId: client.clientDeviceId,
  })

  // 3. Store token
  client.setDeviceToken(result.deviceToken)

  // 4. Show recovery phrase to user (once)
  await ui.showRecoveryPhrase(recoveryPhrase)

  // 5. First push
  await syncEngine.push()

  return { recoveryPhrase }
}
```

## 6. Second device pairing

**Device A (host):**

```typescript
const { code, qrPayload, expiresAt } = await client.createPairingToken(
  adapter.namespaceId()
)
ui.showPairingCode(code, qrPayload, expiresAt)
```

**Device B:**

```typescript
await ui.promptPairingCode(async (code) => {
  const result = await client.redeemPairingCode({
    namespaceId: adapter.namespaceId(),
    pairingCode: code,
    deviceLabel: getDeviceName(),
  })
  client.setDeviceToken(result.deviceToken)
  await syncEngine.pull() // fetch remote data
})
```

**Limit error:**

```typescript
catch (e) {
  if (e.code === 'DEVICE_LIMIT_PAYMENT_REQUIRED') {
    ui.showUnlockModal(e.details.slotPackages)
  }
  if (e.code === 'DEVICE_LIMIT_BLOCKED') {
    ui.showBlockedMessage()
  }
}
```

## 7. SyncEngine behavior

Provided by SDK or copied by application:

```typescript
class SyncEngine {
  constructor(
    private client: RelayClient,
    private adapter: DocumentAdapter,
    private state: SyncStateStore,
    private documentId: string = 'primary',
  ) {}

  /** Full cycle: pull → conflict check → push */
  async syncFull(): Promise<SyncResult> {
    const meta = await this.client.getHeadMeta(this.adapter.namespaceId(), this.documentId)
    const known = this.state.knownRemoteRevision

    if (meta && meta.revision !== known) {
      const decision = this.decidePull(meta.revision)
      if (decision === 'conflict') {
        return { status: 'conflict', remoteMeta: meta }
      }
      if (decision === 'pull') {
        const envelope = await this.client.getHead(this.adapter.namespaceId(), this.documentId)
        await this.applyRemote(envelope)
      }
    }

    if (this.state.hasLocalChanges()) {
      await this.push()
    }

    return { status: 'ok' }
  }

  private decidePull(remoteRevision: string): 'none' | 'pull' | 'conflict' {
    if (remoteRevision === this.state.knownRemoteRevision) return 'none'
    if (this.state.hasLocalChangesSinceLastPush()) return 'conflict'
    return 'pull'
  }

  async push(): Promise<void> {
    const doc = await this.adapter.buildDocument()
    const password = this.adapter.encryption().enabled
      ? await this.adapter.encryption().resolvePassword()
      : undefined

    const envelope = await buildEnvelope({
      namespaceId: this.adapter.namespaceId(),
      namespaceLabel: this.adapter.namespaceLabel(),
      documentJson: doc,
      documentId: this.documentId,
      encrypt: this.adapter.encryption().enabled,
      password,
      deviceId: client.clientDeviceId,
      contentType: this.adapter.contentType(),
      expectedRevision: this.state.knownRemoteRevision,
    })

    try {
      const result = await this.client.pushDocument({
        namespaceId: this.adapter.namespaceId(),
        documentId: this.documentId,
        expectedRevision: this.state.knownRemoteRevision,
        envelope,
      })
      this.state.setKnownRemoteRevision(result.revision)
      this.state.clearLocalMutation()
    } catch (e) {
      if (e.code === 'REVISION_CONFLICT') {
        return { status: 'conflict', remoteMeta: e.details.remoteMeta }
      }
      throw e
    }
  }

  /** After entity save — 2s debounce */
  notifyLocalChange(): void { /* debounce push */ }
}
```

## 7.1 Multi-document with `EsrSync` (recommended)

Prefer [14-ESR-SYNC-FACADE.md](./14-ESR-SYNC-FACADE.md) §5.2 over manual multi-`SyncEngine` wiring. One `EsrSync.connect({ documents: [...] })` runs independent engines, scoped `SyncStateStore`, and WS subscribe for all ids.

## 8. Conflict resolution (client UI)

```typescript
async function resolveConflict(
  choice: 'remote' | 'local',
  documentId: string = 'primary',
): Promise<void> {
  if (choice === 'remote') {
    const envelope = await client.getHead(namespaceId, documentId)
    await applyRemote(envelope)
    state.clearLocalMutation()
  } else {
    // force push — update expectedRevision to remote head or overwrite policy
    const meta = await client.getHeadMeta(namespaceId, documentId)
    state.setKnownRemoteRevision(meta.revision)
    await syncEngine.push() // may still 409 — then show error
  }
}
```

Server does not merge; **local wins** = remote overwritten by push.

## 9. Device management UI

```typescript
const { devices, limits } = await client.listDevices(namespaceId)

// Revoke
await client.revokeDevice(namespaceId, deviceId)

// Limit display
ui.render(`${devices.length} / ${limits.maxDevices} devices`)
```

## 10. Unlock code

```typescript
await client.redeemUnlockCode(namespaceId, unlockCode)
// retry pairing
```

## 11. Recovery

```typescript
import { buildRecoveryKeyProof } from '@esr/protocol'

async function recoverNamespace(
  namespaceId: string,
  recoveryPhrase: string,
): Promise<void> {
  const recoveryKeyProof = await buildRecoveryKeyProof(recoveryPhrase)
  const result = await client.recover({
    namespaceId,
    recoveryKeyProof,
    deviceLabel: getDeviceName(),
    clientDeviceId: newClientDeviceId(), // or reuse
  })
  client.setDeviceToken(result.deviceToken)
  await syncEngine.pull()
}
```

## 12. Offline behavior

| State | Behavior |
|-------|----------|
| Offline | Application normal; `notifyLocalChange` marks queue |
| Online | WS `head_changed` or visibility/focus/interval → HTTP pull |
| WS disconnected | Poll fallback (45 s or config) |
| Push fail network | Retry exponential backoff |
| Pull fail | Error badge; local data preserved |

## 13. WebSocket notifications (v1.1)

```typescript
import { NotificationClient } from '@esr/client'

const notifications = new NotificationClient({
  relayUrl: 'https://sync.example.com/v1',
  client,
  namespaceId: adapter.namespaceId(),
  documentIds: ['primary', 'settings'],
  onHeadChanged: ({ documentId, meta }) => syncEngineFor(documentId).handleRemoteHeadMeta(meta),
  pollIntervalMs: 45_000,       // can be throttled when WS connected (e.g. 300_000)
  pauseWhenHidden: true,
})

notifications.connect()
```

Full specification: [13-WEBSOCKET-NOTIFICATIONS.md](./13-WEBSOCKET-NOTIFICATIONS.md)

**Rules:**

- WS only triggers; data **always** via HTTP pull
- After reconnect, `GET head/meta` is mandatory
- Conflict: `onHeadChanged` → conflict UI, no blind pull

## 14. Scheduler hooks

On application mount:

```typescript
initSyncScheduler({
  onVisibility: () => syncEngine.syncFull(),
  onFocus: () => syncEngine.syncFull(),
  pullIntervalMs: 300_000,  // WS connected; 45_000 when disconnected
  pushDebounceMs: 2_000,
  notificationClient,      // optional — doc 13
})

// After every local DB write:
entitiesStore.afterSave(() => syncEngine.notifyLocalChange())

// Before app lock / logout:
await syncEngine.flushPush()
```

## 15. Status badge

| Status | Condition |
|--------|-----------|
| disabled | sync off |
| idle | up to date |
| pending_push | debounce queue |
| remote_pending | meta.revision != known, no local changes |
| conflict | conflict flag |
| error | lastError set |
| limit_blocked | DEVICE_LIMIT_BLOCKED |
| ws_connected | NotificationClient connected (optional UI) |

## 16. Package dependencies (reference)

```json
{
  "dependencies": {
    "@senkronla/protocol": "workspace:*",
    "@senkronla/client": "workspace:*"
  }
}
```

Browser: native `fetch`, `crypto.subtle` (PBKDF2, AES-GCM, SHA-256).

Node: `undici` fetch, `crypto` module.

## 17. Testing (application side)

- Adapter round-trip with mock RelayClient
- Conflict simulation: two revisions
- Limit modal trigger codes
- Recovery flow integration test against testcontainers ESR

## 18. Checklist — is integration complete?

**Facade (recommended):** [14-ESR-SYNC-FACADE.md §10](./14-ESR-SYNC-FACADE.md#10-application-checklist-facade)

**Advanced (this document):**

- [ ] DocumentAdapter implemented
- [ ] `RelayClient` + `SyncEngine` + `NotificationClient` wiring
- [ ] `SyncStateStore` + token storage (per `documentId` when multi-document)
- [ ] `listDocuments` / parametric head paths or `EsrSync` `documents[]`
- [ ] Scheduler hooks (visibility, focus, debounce, poll)
- [ ] Conflict / limit / recovery UX
