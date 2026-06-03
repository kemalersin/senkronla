# Changelog

All notable changes to `@senkronla/client` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Monorepo release versions follow the root [`CHANGELOG.md`](../../CHANGELOG.md).

## [Unreleased]

## [0.1.16]

### Fixed

- **`EsrSyncScheduler`:** register focus/visibility sync even when the notification client is active; only the periodic poll interval is skipped in that mode
- **`head_changed` notifications:** after pulling a remote update, aggregate status is refreshed so listeners no longer stay on `pending_push` when there are no local edits waiting to push
- **`handleNotificationStateChange`:** preserves `pending_push` when local mutations are still pending instead of always resetting to `ws_connected` / `idle`

### Changed

- `ensureNamespace()` returns the relay `namespace` payload when the namespace already exists (`created: false`), avoiding a second `GET /namespaces/{id}` in callers

## [0.1.11]

### Added

- npm package README and registry metadata for public publish on `@senkronla/client`

### Changed

- `CLIENT_SDK_VERSION` tracks `package.json` version

### Fixed

- Exclude `*.test.ts` from build output so test files are not shipped in the npm tarball

## [0.1.6]

### Added

- `appPlatform: 'desktop'` for native desktop clients (Electron, Tauri, etc.)

## [0.1.4]

### Added

- `EsrSync.connect({ appId })`, `startPairing({ allowedAppIds })`

## [0.1.2]

### Added

- `ENV-ENC1` — `buildEnvelope({ encrypt, password })`, async `extractDocument`
- `SyncEngine` decrypts on pull via adapter `resolvePassword()`
- `createDocumentAdapter({ encrypt: true, resolvePassword })` shorthand
- Envelope builder unit tests for encrypted payloads

## [0.1.1]

### Added

- Multi-document — `EsrSync.connect({ documents: [...] })`, document-scoped `SyncStateStore`
- `RelayClient` `documentId` param, `listDocuments()`, `onDocumentStatusChange`
- `notifyLocalChange(documentId)`, `sync(documentId)`, `flushPush(documentId)`

## [0.1.0]

### Added

- Initial package scaffold
- `RelayClient` — full REST API wrapper with device token persistence hooks
- `SyncEngine` — pull/push, revision conflict detection, debounced push
- `EsrSync` facade — `connect()`, `ensureNamespace`, pairing, recovery, scheduler
- `createDocumentAdapter`, `createLocalStorageAdapter`, `createMemoryStorageAdapter`
- `NotificationClient` — WebSocket (`ws_with_poll_fallback`) + poll fallback + reconnect
- `buildNotificationWsUrl` helper
- Re-export of `@senkronla/protocol` identity and envelope tools
- Vitest unit tests with mock relay
