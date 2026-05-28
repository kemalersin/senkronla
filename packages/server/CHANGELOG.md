# Changelog

All notable changes to `@senkronla/server` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `NotificationHub` — in-process WebSocket broadcast per namespace
- `GET /v1/namespaces/:id/notifications` — WebSocket upgrade (`esr-notifications-v1`)
- `head_changed` broadcast after successful `PUT .../primary`
- `limits_changed` broadcast after unlock redeem
- Bearer header or first-message `{ type: 'auth' }` authentication
- Server ping/pong keepalive

### Fixed

- Local dev starts without `ESR_DATABASE_URL` — defaults to `postgresql://esr:esr@localhost:5432/esr`
- Auto-loads root `.env` or `docker/.env` when present

## [0.7.0] — Faz 7

### Added

- Extended rate limits: pairing, pairing-tokens, document push per device, global IP (doc 04)
- Migration `004_rate_limit_scope.sql` for device/IP scoped throttles
- Global IP rate limit hook with `Retry-After` header
- Blob key path traversal protection
- OpenAPI contract test suite
- Security integration tests (doc 08 checklist subset)
- Production startup warnings (CORS, trustProxy, admin token, blob path)
- Operator guide at `docs/OPERATOR.md`

### Changed

- CORS registers explicit methods and headers per spec
- Config rate limit schema: `pairingTokensPerHour`, `pushPerHourPerDevice`, `generalPerMinutePerIp`

## [0.6.0] — Faz 5

### Added

- `POST /v1/namespaces/:namespaceId/unlock` — redeem unlock codes for additional device slots
- `POST /v1/admin/unlock-codes` — operator unlock code generation (admin bearer token)
- Unlock service with DB-backed codes, expiry, single-use enforcement
- `unlock_events` audit inserts on redeem
- Error codes: `UNLOCK_CODE_INVALID`, `UNLOCK_CODE_ALREADY_REDEEMED`, `ADMIN_API_DISABLED`
- Faz 5 integration test suite and local smoke script

## [0.5.0] — Faz 4

### Added

- `POST /v1/namespaces/:namespaceId/recover` — revoke all devices, preserve head and slots
- Recovery proof verification via `@senkronla/protocol`
- Per-namespace recovery rate limit with `Retry-After` header
- Migration `003_rate_limit_events.sql`
- Error codes: `RECOVERY_INVALID`, `RATE_LIMIT_EXCEEDED`
- Faz 4 integration test suite and local smoke script

### Changed

- Config env overrides for `ESR_RATE_LIMIT_ENABLED`, `ESR_RECOVER_PER_HOUR`, `ESR_PAIRING_PER_HOUR`

## [0.4.0] — Faz 3

### Added

- Blob filesystem storage (`buildBlobKey`, `writeBlob`, `readBlob`)
- `GET /v1/namespaces/:namespaceId/documents/primary/head/meta`
- `GET /v1/namespaces/:namespaceId/documents/primary/head`
- `PUT /v1/namespaces/:namespaceId/documents/primary` with optimistic revision locking
- Document service with envelope validation via `@senkronla/protocol`
- Error codes: `DOCUMENT_NOT_FOUND`, `REVISION_CONFLICT`, `ENVELOPE_INVALID`, `ENVELOPE_TOO_LARGE`, `CONTENT_TYPE_NOT_ALLOWED`
- Faz 3 integration test suite and local smoke script

## [0.3.0] — Faz 2

### Added

- `POST /v1/namespaces` — create namespace + host device
- `GET /v1/namespaces/:namespaceId` — namespace info with limits and head meta
- `GET/POST/DELETE` device routes and pairing token creation
- `GET /v1/namespaces/:namespaceId/limits`
- Device bearer token auth middleware (SHA-256 token hash)
- Slot limit engine with `DEVICE_LIMIT_PAYMENT_REQUIRED` and `DEVICE_LIMIT_BLOCKED`
- Re-pair policy for existing `clientDeviceId`
- Migration `002_device_public_id.sql` (ULID `device_id` for API paths)
- Typed `AppError` handler and English error responses
- Faz 2 integration test suite (testcontainers)

## [0.2.0] — Faz 1

### Added

- Full server config schema (doc 07) with YAML file + `ESR_*` env overrides
- `config.example.yaml` and `${VAR}` interpolation support
- PostgreSQL pool, migration runner, and `001_initial` schema (doc 10)
- Startup auto-migration and standalone `pnpm migrate` script
- Health checks: database ping + blob storage probe (503 when degraded)
- Pino log redaction for sensitive fields
- Testcontainers integration test for migrations
