# @senkronla/client

[![npm version](https://img.shields.io/npm/v/@senkronla/client)](https://www.npmjs.com/package/@senkronla/client)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://github.com/kemalersin/senkronla/blob/main/LICENSE)

Client SDK for [Senkronla](https://senkron.la) — connect to a self-hosted **Envelope Sync Relay (ESR)**, sync JSON document snapshots per namespace, handle pairing, recovery, conflicts, and optional WebSocket notifications.

Your app owns the data model and encryption choices. The relay stores opaque `ESR-DOC1` envelopes; this SDK handles transport, revision tracking, and user-facing sync lifecycle.

## Install

```bash
npm install @senkronla/client
# or
pnpm add @senkronla/client
```

`@senkronla/protocol` is installed automatically as a dependency. You also re-export protocol helpers from `@senkronla/client` when convenient.

**Node.js 22+** or modern browsers. Works with `fetch`, `localStorage`, and WebSocket where available.

## Quick start

```typescript
import {
  EsrSync,
  createDocumentAdapter,
  createLocalStorageAdapter,
  generateNamespaceId,
} from '@senkronla/client'

const namespaceId = gsync.senkron.laId() // persist before ensureNamespace

const sync = await EsrSync.connect({
  relayUrl: 'https://sync.example.com/v1',
  appId: 'esr_app_myapp', // when relay GET /health → apps.enabled is true
  storage: createLocalStorageAdapter('myapp'),
  document: createDocumentAdapter({
    namespaceId,
    namespaceLabel: 'My workspace',
    contentType: 'application/vnd.myapp+json',
    exportDocument: () => appStore.exportState(),
    importDocument: (data) => appStore.importState(data),
  }),
  onRecoveryPhrase: async ({ phrase }) => {
    await showRecoveryModal(phrase) // user must save offline
  },
  onConflict: async (ctx) => {
    return askKeepLocalOrRemote(ctx.remoteMeta.writtenAt) // 'local' | 'remote' | 'cancel'
  },
})

await sync.ensureNamespace()
await sync.sync()

appStore.onChange(() => sync.notifyLocalChange('primary'))
```

## Core concepts

| Concept | Role |
|---------|------|
| **Namespace** | Isolated sync space (UUID v4) — usually one per customer account |
| **Document** | Named JSON snapshot (`primary` by default; multi-document supported) |
| **DocumentAdapter** | Your bridge: export/import app state, `contentType`, optional encryption |
| **EsrSync** | Facade: `connect`, `ensureNamespace`, `sync`, pairing, recovery |

Implement sync by:

1. Persist a stable `namespaceId` before the first `ensureNamespace()`
2. Call `notifyLocalChange(documentId)` after every local edit
3. Handle `onRecoveryPhrase` and `onConflict` (required)

## Multi-document
sync.senkron.la
```typescript
const sync = await EsrSync.connect({
  relayUrl: 'https://sync.example.com/v1',
  storage: createLocalStorageAdapter('myapp'),
  documents: [
    { adapter: mainAdapter },
    { documentId: 'settings', adapter: settingsAdapter },
  ],
  onRecoveryPhrase: async ({ phrase }) => showRecoveryModal(phrase),
  onConflict: async (ctx) => askKeepLocalOrRemote(ctx.remoteMeta.writtenAt),
})

sync.notifyLocalChange('settings')
await sync.sync('settings')
```

All adapters must return the same `namespaceId()`.

## Application registry

When the relay operator enables `apps.enabled`, pass `appId` to `EsrSync.connect()`. The SDK sends `X-ESR-App-Id` on every request.

Native apps may also need:

- `appPlatform` — `ios`, `android`, or `desktop`
- `bundleId`
- `clientSecret` when `GET /health` → `apps.nativeRequireClientSecret` is true

Web clients rely on browser `Origin`; do not embed client secrets in front-end builds.

## Encryption (optional)

```typescript
createDocumentAdapter({
  namespaceId,
  namespaceLabel: 'My workspace',
  contentType: 'application/vnd.myapp+json',
  encrypt: true,
  resolvePassword: async () => userSyncPassword,
  exportDocument: () => state,
  importDocument: (data) => { state = data },
})
```

The SDK builds and decrypts `ENV-ENC1` envelopes on push/pull.

## Advanced modules

Lower-level building blocks (same package):

| Export | Use case |
|--------|----------|
| `RelayClient` | Direct REST `/v1` without the facade |
| `SyncEngine` | Custom push/pull loop |
| `NotificationClient` | WebSocket + poll fallback |
| `buildEnvelope` / `extractDocument` | Manual envelope assembly |

Protocol types and helpers are re-exported from `@senkronla/protocol`.

## Documentation

- [SDK reference](https://senkron.la/sdk) — full `EsrSync` API, pairing, recovery
- [Integration guides](https://senkron.la/guides) — step-by-step integration
- [API reference](https://senkron.la/api) — relay HTTP contract
- [ESR setup guide](https://senkron.la/guides/esr) — deploy your own relay

## License

[MIT](https://github.com/kemalersin/senkronla/blob/main/LICENSE)
