# Changelog

All notable changes to the Senkronla monorepo are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Package-level changelogs: `packages/*/CHANGELOG.md`, `apps/web/CHANGELOG.md`.

The published version number lives only in the [`package.json`](package.json) `version` field (`0.1.x`). **The latest release section must always match `package.json` `version`** (e.g. `0.1.4` → `## [0.1.4]`). Write new entries under `## [Unreleased]` first (root and affected packages); when you run `pnpm version patch --no-git-tag-version`, the `version` script promotes root and package `CHANGELOG.md` files and syncs all workspace `package.json` versions (`scripts/promote-changelog-unreleased.mjs`). See [README — Version and CHANGELOG](README.md#version-and-changelog).

## [Unreleased]

## [0.1.6]

### Added

- **web:** developer portal — generate or rotate native client secret in app drawer
- **protocol:** shared `NativePlatform` type including `desktop`
- **server:** native bundle platform `desktop` for Electron/Tauri clients
- **client:** `appPlatform: 'desktop'` connect option
- **web:** operator and developer portals — register desktop bundle IDs
- **docs:** app registry spec — approval flows, client secret lifecycle, auth layer split (§7.2–12.3)

### Changed

- **server:** developer app create no longer assigns client secret until explicit rotate-secret
- **server:** `/health` exposes `apps.nativeRequireClientSecret`
- **web:** developer portal hides client secret UI when relay does not require native secrets
- **web:** developer portal shows client secret UI only when the app has a registered bundle
- **web:** developer portal hides client secret until app is active and bundles are approved
- **docs:** SDK/API/guides/agents — clearer app registration, approval, and clientSecret documentation
- **web:** integration checklist and ESR guide document `ESR_APPS__*` and v1.3 migration

## [0.1.5]

### Changed

- **server:** OpenAPI contract tests — dynamic path parameter coverage
- **web:** Postman environment files updated

## [0.1.4]

### Added

- **protocol/server (v1.3):** application registry — `apps.enabled`, namespace `appId` binding, dynamic CORS from verified origins, native bundle + client secret, pairing `allowedAppIds`
- **server:** admin API `/v1/admin/apps` (list/create/suspend, origins, bundles, verification)
- **server:** developer API `/v1/developer/*` (register/login, app CRUD, DNS TXT + HTTPS well-known origin verification)
- **server:** `POST .../origins/:originId/verify`, `APP_PAIRING_NOT_ALLOWED`, `APP_CLIENT_SECRET_INVALID`, and related app error codes
- **client:** `EsrSync.connect({ appId })`, `startPairing({ allowedAppIds })`
- **web:** operator Apps panel (`/operator`) and developer portal (`/developer`) with BFF routes
- **web:** origin removal in operator/developer app panels; copy app ID in lists and drawer
- **web:** hide developer login/register and `/developer` routes when developer portal is disabled (`developerPortal.enabled` from relay health)
- **web:** SDK and API reference — Application registry sections; doc sidebar cleanup (ESR/Agents links only on guides index)
- **server:** `/health` includes `developerPortal.enabled`
- **docs:** OpenAPI v1.3.0 (admin/developer/app schemas), agent MD + `llms.txt`, OPERATOR.md app registry sections
- **docs:** config/env examples aligned across 07, 16, OPERATOR.md, `config.example.yaml`, `.env.example`

### Changed

- **docs:** root `openapi.yaml` SSOT synced to `docs/envelope-sync-relay/openapi.yaml`

## [0.1.3]

### Added

- **web:** dokümantasyon araması — build-time indeks (`pnpm generate:search`), header'da ⌘K / Ctrl+K modal; rehberler, SDK, API (TR/EN); agent MD hariç

## [0.1.2]

### Added

- **protocol:** `ENV-ENC1` iç payload — `buildEnvEnc1Payload`, `extractDocumentFromInnerPayload`, `buildInnerPayload`; PBKDF2-SHA256 + AES-256-GCM; birim testleri
- **client:** `buildEnvelope({ encrypt, password })`, async `extractDocument`; pull sırasında `resolvePassword()` ile `ENV-ENC1` çözme
- **web:** Postman koleksiyonu + local/production ortam dosyaları (`pnpm generate:postman`); API referans sayfasından indirilebilir
- **web:** API ve SDK referans sayfalarında **Zarf şifrelemesi** bölümü (`#encryption`) — senkron parolası, salt/nonce, `ENV-ENC1` yapısı, REST/SDK örnekleri (TR/EN)
- **docs:** agent MD dosyaları (`api-tr/en`, `sdk-tr/en`, `tr/en`, `llms.txt`) şifreleme ve senkron parolası ile hizalandı

### Changed

- **web:** HTTP/Postman API örnekleri doğrulanabilir `ENV-ENC1` payload kullanır (dokümantasyon parolası: `demo-sync-passphrase`)
- **web:** paylaşılan `api-sample-data.ts` — HTTP snippet'leri ve Postman üretici tek kaynak
- **client:** şifreli zarf için `envelope-builder` birim testleri

## [0.1.1]

### Added

- **multi-document:** namespace başına çoklu döküman (protocol, server, client, WS subscribe filter, docs, örnek script); spec [15-MULTI-DOCUMENT.md](docs/envelope-sync-relay/tr/15-MULTI-DOCUMENT.md)

### Changed

- **server:** rate limit action `put_primary` renamed to `put_document`; HTTP headers `RateLimit-PutDocument-*` (breaking for API clients)
- **docs:** referans belgeleri çoklu belge ve `@senkronla/client` API ile hizalandı (09, 12, 14, agents, README)

## [0.1.0]

### Added

- Monorepo scaffold with pnpm workspaces and Turborepo
- `@senkronla/protocol`, `@senkronla/server`, `@senkronla/client`, `@senkronla/cli` packages
- `@senkronla/web` operator portal with EN/TR i18n
- Fastify server with `/health`, `/metrics`, Swagger UI at `/docs`
- Docker Compose with `bundled-db` profile and external Postgres support via `ESR_DATABASE_URL`
- Specification moved to `docs/envelope-sync-relay/`
- Root `openapi.yaml` as API SSOT

### Changed

- **Faz 1:** PostgreSQL migrations, full YAML/env config (doc 07), health checks (DB + blob), Pino log redaction
- **Faz 2:** Namespace, device pairing, slot limits, device token auth
- **Faz 3:** Document push/pull (`PUT primary`, `GET head`, `GET head/meta`), blob storage, revision conflict handling
- **Faz 4:** Namespace recovery with Argon2id proof, device token revocation, rate limiting
- **Faz 5:** Unlock code generation/redeem, purchased slot accumulation, admin API
- **Faz 7:** Rate limits, security tests, OpenAPI contract tests, operator guide

### Removed

- Application-specific `ESR-INTEGRATION.md` (consumer apps maintain their own integration guides)
