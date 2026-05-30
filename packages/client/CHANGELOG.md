# Changelog

All notable changes to `@senkronla/client` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Monorepo release versions follow the root [`CHANGELOG.md`](../../CHANGELOG.md).

## [Unreleased]

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
