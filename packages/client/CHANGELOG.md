# Changelog

All notable changes to `@senkronla/client` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **multi-document:** `EsrSync.connect({ documents: [...] })`, document-scoped `SyncStateStore`, `RelayClient` `documentId` param, `listDocuments()`, `onDocumentStatusChange`, `notifyLocalChange(documentId)`, `sync(documentId)`, `flushPush(documentId)`
- `RelayClient` — full REST API wrapper with device token persistence hooks
- `SyncEngine` — pull/push, revision conflict detection, debounced push
- `EsrSync` facade — `connect()`, `ensureNamespace`, pairing, recovery, scheduler
- `createDocumentAdapter`, `createLocalStorageAdapter`, `createMemoryStorageAdapter`
- `NotificationClient` — WebSocket (`ws_with_poll_fallback`) + poll fallback + reconnect
- `buildNotificationWsUrl` helper
- Re-export of `@senkronla/protocol` identity and envelope tools
- Vitest unit tests with mock relay

### Not yet

- `ENV-ENC1` client-side encryption in `buildEnvelope`

## [0.1.0] — 2025-05-28

### Added

- Initial package scaffold
