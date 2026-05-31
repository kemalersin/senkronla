# Changelog

All notable changes to `@senkronla/server` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Monorepo release versions follow the root [`CHANGELOG.md`](../../CHANGELOG.md).

## [Unreleased]

### Added

- Rate limits for developer auth mail — `developer_auth_mail` per IP (`limits.rateLimit.developerAuthMailPerHourPerIp`, default 20/h) and per developer account (`apps.developerPortal.authMailPerHourPerDeveloper`, default 5/h); per-developer cap returns success without sending mail; IP cap returns `429`

### Changed

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
