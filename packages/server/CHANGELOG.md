# Changelog

All notable changes to `@senkronla/server` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Monorepo release versions follow the root [`CHANGELOG.md`](../../CHANGELOG.md).

## [Unreleased]

### Changed

- Rate limit counters moved to `rate_limit_usage_buckets` (minute buckets, bounded size); `rate_limit_events` stores **429 violations only**
- Rate limit operator log — panel lists violations only (no quota rows)

### Fixed

- Operator rate limits panel — persist `client_ip` on namespace/device rate limit events; include IP-only events (`global_ip`, `namespace_create`) in admin listing

## [0.1.13]

### Fixed

- Database URL from `ESR_DATABASE_HOST` / `ESR_DATABASE_PASSWORD` / … env parts — URL-encodes credentials (Docker bundled Postgres with special characters in `POSTGRES_PASSWORD`)

## [0.1.12]

### Fixed

- Docker API image — preserve monorepo layout in the runtime stage so pnpm dependencies resolve; load `.env` via dynamic `dotenv` import only when the file exists (Compose injects env vars directly)

### Changed

- Docker API build — `pnpm install --filter @senkronla/server...` and `pnpm deploy` only; skips client, cli, and full monorepo `node_modules` in the runtime image

## [0.1.11]

### Added

- `document_revisions` table — every document push appends a revision history row while `document_heads` remains the current head
- `sync.revisionRetentionDays` config (`ESR_REVISION_RETENTION_DAYS`, default `0` = keep all) — after each push, auto-purge non-head revisions older than the retention window for that namespace and document
- `sync.revisionRetentionCount` config (`ESR_REVISION_RETENTION_COUNT`, default `0` = off) — after each push, keep only the last N revisions per document
- Admin API `GET /v1/admin/settings/sync` and `POST /v1/admin/revisions/purge` — operator purge by date or keep-last-N count; scope deployment, namespace, or app

### Fixed

- Count-based revision purge keeps exactly N revisions per document (head included in the limit; previously one extra blob was left)

### Changed

- Document push always writes a new blob file per revision (reverts same-device blob reuse from 0.1.10)

### Removed

- `apps.requireRegistration` config flag and `ESR_APPS__REQUIRE_REGISTRATION` env var — when `apps.enabled` is true, registered app credentials are always required on public API routes

## [0.1.10]

### Fixed

- Skip app registry handshake on WebSocket `/notifications` upgrade (browsers cannot send `X-ESR-App-Id`; device token auth runs after connect)
- Reactivate revoked devices on pairing instead of inserting a duplicate row (fixes `devices_namespace_uuid_client_device_id_key` when re-adding a removed device)
- Auto-verify localhost web app origins when `allowLocalhostOrigins` is enabled (on add, on app detail load, and without DNS/HTTPS instructions in the API)

### Added

- Log WebSocket message traffic on the notifications route and hub (`ws message`); auth tokens are redacted; ping/pong logged at debug level
- Deployment-wide operator limit overrides stored in `operator_settings` (`key=limits`); admin `GET/PATCH /v1/admin/settings/limits`; cascade precedence app → developer → operator → env → config (namespace and row fallbacks unchanged)
- Admin API `POST /v1/admin/danger/purge-all-records` — permanently delete all relay operational data (requires `{ "confirm": "purge-all-records" }`); preserves operator mail settings overrides; removes blob namespace directories
- Rate limits for developer auth mail — `developer_auth_mail` per IP (`limits.rateLimit.developerAuthMailPerHourPerIp`, default 20/h) and per developer account (`apps.developerPortal.authMailPerHourPerDeveloper`, default 5/h); per-developer cap returns success without sending mail; IP cap returns `429`

### Changed

- Reuse and overwrite the current blob file when consecutive document pushes come from the same device instead of creating a new revision file each time
- Developer verification and password-reset mail is dispatched in the background so API responses are not blocked on SMTP delivery
- Developer auth emails use branded HTML templates aligned with the web portal (Senkronla colors, typography, CTA button, plain-text fallback)

## [0.1.9]

### Added

- Operator limit overrides — cascade resolution (namespace → app → developer → config) for rate limits and slot limits; admin `GET/PATCH .../limits` on namespaces, apps, and developers; `namespace_create` rate limit enforcement; operator panel limits UI

## [0.1.7]

### Added

- `ESR_APPS__NATIVE__REQUIRE_MANUAL_REVIEW` environment override for `apps.native.requireManualReview`

### Added

- `/health` includes `apps.nativeRequireClientSecret` for portal UI gating
- Native bundle platform `desktop` (Electron, Tauri, etc.) — migration `009_native_desktop_platform.sql`

### Changed

- App list search (`q`) also matches registered bundle IDs (operator and developer portals)
- OpenAPI 1.3.1 — `/health` schema, `/admin/developers`, bundle ID search on app lists, app registry headers on sync routes
- Swagger UI serves `openapi.yaml` in static mode so route stubs no longer overwrite documented operations
- Developer app create no longer assigns a client secret; secret is set only via rotate-secret

## [0.1.5]

### Changed

- OpenAPI contract tests — dynamic path parameter coverage

## [0.1.4]

### Added

- Application registry — `apps.enabled`, namespace `appId` binding, dynamic CORS from verified origins
- Admin API `/v1/admin/apps` (list/create/suspend, origins, bundles, verification)
- Developer API `/v1/developer/*` (register/login, app CRUD, DNS TXT + HTTPS well-known origin verification)
- `POST .../origins/:originId/verify`, `APP_PAIRING_NOT_ALLOWED`, `APP_CLIENT_SECRET_INVALID`, and related app error codes
- Migration `006_app_registry.sql`
- `/health` response includes `developerPortal.enabled`
- `DELETE` origin routes on admin and developer app APIs

## [0.1.1]

### Added

- Multi-document endpoints — per-document push/pull/head routes and WS subscribe filter

### Changed

- Rate limit action `put_primary` renamed to `put_document`; HTTP headers `RateLimit-PutDocument-*` (breaking for API clients)

## [0.1.0]

### Added

- Full server config schema (doc 07) with YAML file + `ESR_*` env overrides
- `config.example.yaml` and `${VAR}` interpolation support
- PostgreSQL pool, migration runner, and initial schema (doc 10)
- Startup auto-migration and standalone `pnpm migrate` script
- Health checks: database ping + blob storage probe (503 when degraded)
- Pino log redaction for sensitive fields
- Namespace, device pairing, slot limits, device token auth
- Document push/pull, blob storage, revision conflict handling
- Namespace recovery with Argon2id proof, device token revocation, rate limiting
- Unlock code generation/redeem, purchased slot accumulation, admin API
- Extended rate limits: pairing, pairing-tokens, document push per device, global IP (doc 04)
- Blob key path traversal protection, OpenAPI contract test suite, security integration tests
- Operator guide at `docs/OPERATOR.md`
- `NotificationHub` — in-process WebSocket broadcast per namespace
- `GET /v1/namespaces/:id/notifications` — WebSocket upgrade (`esr-notifications-v1`)
- `head_changed` broadcast after successful document push; `limits_changed` after unlock redeem
- Bearer header or first-message `{ type: 'auth' }` authentication; server ping/pong keepalive

### Fixed

- Local dev starts without `ESR_DATABASE_URL` — defaults to `postgresql://esr:esr@localhost:5432/esr`
- Auto-loads root `.env` or `docker/.env` when present
