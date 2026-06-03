# Changelog

All notable changes to the Senkronla monorepo are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Package-level changelogs: `packages/*/CHANGELOG.md`, `apps/web/CHANGELOG.md`, `apps/demo/CHANGELOG.md`.

The published version number lives only in the [`package.json`](package.json) `version` field (`0.1.x`). **The latest release section must always match `package.json` `version`** (e.g. `0.1.4` → `## [0.1.4]`). Write new entries under `## [Unreleased]` first (root and affected packages); when you run `pnpm version patch --no-git-tag-version`, the `version` script promotes root and package `CHANGELOG.md` files and syncs all workspace `package.json` versions (`scripts/promote-changelog-unreleased.mjs`). See [README — Version and CHANGELOG](README.md#version-and-changelog).

## [Unreleased]

### Fixed

- **demo:** Connect step Reconnect no longer fires three consecutive `head/meta` requests — removed duplicate focus/visibility pull handlers that overlapped with `EsrSyncScheduler`; reconnect preserves cached health response
- **demo:** Page reload no longer double-fetches `GET /namespaces/{id}` and `/devices` — session bootstrap reuses the namespace refresh already performed in `connect()`
- **demo:** Connect no longer shows “Connected” when `GET /health` fails (network or CORS) — SDK session is not opened until the relay responds
- **demo:** Intro and completion screen docs link label — EN “Guides”, TR “Rehberler”
- **docs:** README and `apps/demo/README.md` — live SDK tutorial at [demo.senkron.la](https://demo.senkron.la/)
- **docs:** README — centered **Interactive Tutorial** badge linking to [demo.senkron.la](https://demo.senkron.la/)

## [0.1.16]

### Security

- **server:** `GET /health` no longer exposes blob filesystem path to anonymous callers; operators receive `blob.path` with a valid admin bearer token

### Added

- **ci:** GitHub Actions workflow publishes `@senkronla/demo` to the `demo` branch for GitHub Pages (`deploy-demo.yml`)
- **demo:** New `@senkronla/demo` app — an interactive two-column SDK tutorial (Vite + React) that builds to a single static `index.html`; covers document adapters, connection (`appId` when `apps.enabled`, default `esr_app_demo`), namespace, recovery, sync, pairing with QR, conflicts, envelope encryption, and live notifications, with light/dark themes and EN/TR localization

### Changed

- **client:** `ensureNamespace()` includes relay `namespace` in the result when `created: false`
- **demo:** Recovery step — copyable phrase word cards (plus copy-all), no synthetic JSON “response” block; left panel documents optional `persistRecoveryPhrase` for StorageAdapter persistence; connect step introduces the same option on `EsrSync.connect` with a right-panel toggle (left SDK snippet follows toggle state); toggle reconnects preserve health output and avoid layout shift; right panel explains when the phrase was acknowledged, the namespace already existed, or the phrase is no longer in session memory; demo preferences (relay URL, app ID, toggles, wizard step, connection) persist in `localStorage` across page reloads with silent session restore when previously connected; dedupe bootstrap/connect so Strict Mode and health restore do not double-fetch relay endpoints; namespace step reuses `ensureNamespace()` namespace payload instead of a duplicate `GET /namespaces/{id}`; connect/namespace/sync action buttons gated on config changes, namespace state, and one-shot sync per page load
- **demo:** Wizard order — envelope encryption precedes sync-data (ENV-ENC1 vs ENV-RAW1); device pairing follows sync-data; sync-data step clarifies `notifyLocalChange()` is required while `sync()` is optional (debounced auto-push); conflict modal — side-by-side choice cards with in-card actions; conflict JSON response stays on the step panel after the modal closes; Join modal accepts QR payload (`esr://pair/v1/…`) or namespace ID + pairing code for guest devices, sync password when head uses ENV-ENC1; pairing step QR click copies `qrPayload` to clipboard; connect Reconnect always enabled and re-fetches `GET /namespaces/{id}`; namespace step JSON stays in sync on reconnect and when visiting the step; encryption step Run applies pending encrypt/password changes and syncs to relay (disabled until settings change); envelope previews on sync-data and encryption steps refresh when a remote pull updates the document via `importDocument`; footer step dots between Back and Next with hover tooltips for step titles; mobile footer Back/Next/Finish show icon-only controls; step dots show a sliding window of five steps at a time up to and including the lg tier (max-width 1279px, xl and above show all steps); mobile layout clips horizontal overflow so only code blocks scroll sideways inside their container

### Fixed

- **demo:** Encryption step Run button — apply/sync no longer no-ops because `canApplyEncryption()` was checked after `busy` was set
- **demo:** Join modal closes automatically after a successful pairing sync instead of staying on a perpetual “syncing” message; stays open with a local error message when join fails
- **client:** `head_changed` pull no longer leaves status stuck on `pending_push` on passive devices
- **demo:** Notifications step shows WebSocket as off when `notificationsEnabled` is false instead of “connecting / poll”
- **demo:** Intro left pane — senkron.la, docs, GitHub, and donate links replace the cloud-sync comparison cards; right pane keeps feature cards and start button only
- **demo:** Finish button opens a completion screen with summary, restart, and next-step links (EN/TR)
- **demo:** Cross-tab document updates — mirror `localStorage` edits via the `storage` event; relay catch-up on focus is handled by the SDK scheduler only
- **client:** `EsrSyncScheduler` still syncs on tab focus/visibility when WebSocket notifications are enabled (periodic poll remains notification-only)
- **demo:** Register Prism `bash`/`http` grammars and split HTTP examples into header + JSON body blocks so terminal commands and request/response payloads are syntax-highlighted; use `http`/`typescript`/`bash` per snippet instead of mixed `bash` blocks

## [0.1.15]

### Added

- **docs:** README — [Kurtarma Planı](https://github.com/kemalersin/kurtarma-plani) as a client-only, local-first example app; screenshots under `docs/screenshots/`
- **web:** Brand-themed social share images (`og-image.png`, `twitter-card.png`) with `openGraph.images`, `summary_large_image` Twitter card, and `metadataBase` from `NEXT_PUBLIC_SITE_URL`

### Fixed

- **web:** Code block copy button pinned top-right while code scrolls horizontally on mobile
- **web:** Code block copy button on touch devices reveals on tap and auto-hides after 3.5 s

## [0.1.14]

### Changed

- **web:** SDK reference — expanded WebSocket notifications section (push-to-pull, options, wire protocol)
- **server:** Operator rate limits tab — grouped usage only (no `global_ip`, no violation log)
- **server:** Rate limit counters in `rate_limit_usage_buckets`; `rate_limit_events` no longer written on 429

## [0.1.13]

### Changed

- **server:** Rate limit operator panel — log and list **429 violations only** (via `exceeded` flag; superseded by usage buckets in unreleased)
- **docs:** `.env.example` — document `ESR_TRUST_PROXY` for production reverse-proxy deployments
- **docs:** OPERATOR guide — single repo-root `.env`, live service updates, nginx reverse proxy (Cloudflare, TLS); server config docs (EN/TR) aligned with Compose env model
- **web:** ESR setup guide — configuration table (POSTGRES_*, ESR_COMPOSE_DATABASE_URL, publish ports), **Updating live services** and **Reverse proxy** sections; compose alias and update snippets

## [0.1.12]

### Added

- **client:** npm package README and `publishConfig` for registry publish
- **cli:** npm package README and `publishConfig` for registry publish
- **docs:** README npm badges; SDK install docs link to npm registry

### Changed

- **docs:** Move specification from `docs/envelope-sync-relay/` to `docs/` (`en/`, `tr/`, `openapi.yaml`); update repo, web, agent, and package references; fix in-spec paths to relative links
- **docs:** Remove stale “planned” wording for shipped features (app registry v1.3, limit overrides v1.3.2, WebSocket, multi-document, revision history, operator portal)
- **docs:** Point AGENT-HANDOFF at `.cursor/rules/feature-shipped-docs.mdc` when a phase or feature ships
- **web:** ESR setup guide — system requirements under Prerequisites (`/guides/esr#prerequisites`)
- **docs:** Architecture spec — ~1000 namespace resource sizing (moderate / heavy sync) in §6.2; ESR guide sizing table updated to match
- **docker:** Optional `docker-compose.resources.example.yml` — per-container CPU/RAM limits (~100 / ~1000 tiers); OPERATOR.md and ESR guide document merge usage
- **docker:** Bundled Postgres — pass `ESR_DATABASE_*` parts instead of interpolating password into URL (fixes `Invalid URL` with special chars)
- **server:** Build database URL from `ESR_DATABASE_*` env parts with credential encoding
- **docs:** Enrich root README with architecture diagrams (system, push/pull, WebSocket), deployment sketch, and [senkron.la](https://senkron.la) links

## [0.1.11]

### Added

- **server:** Document revision history table, configurable auto-retention, and admin revision purge API
- **web:** Operator revision purge — date or keep-last-N count; deployment-wide tab in settings; improved modal layout

### Removed

- **server:** `apps.requireRegistration` config flag and `ESR_APPS__REQUIRE_REGISTRATION` env var — app credentials are always enforced when the app registry is enabled
- **docs:** references to `requireRegistration` in OpenAPI, operator docs, and app registry spec

### Fixed

- **server:** Count-based revision purge keeps exactly N revisions per document (head included in the limit)

### Changed

- **docs:** Document `ESR_REVISION_RETENTION_DAYS` and `ESR_REVISION_RETENTION_COUNT` across operator guide, server config spec, multi-document RFC, API reference, OpenAPI, ESR setup guide, Postman, and env examples
- **server:** Each document push writes a new blob file again (reverts same-device blob reuse from 0.1.10)
- **web:** Postman collection and API doc snippets — health response no longer includes `apps.requireRegistration`

## [0.1.10]

### Fixed

- **web:** operator dangerous purge reloads the active list tab instead of leaving stale rows or an endless spinner
- **server:** skip app registry handshake on WebSocket `/notifications` upgrade (fixes localhost relay client WS connection failures with `APP_ID_REQUIRED`)
- **server:** reactivate revoked devices on pairing instead of inserting a duplicate row (fixes re-adding a removed device with the same client id)
- **server:** auto-verify localhost app origins when `ESR_APPS__ALLOW_LOCALHOST_ORIGINS` is enabled (no DNS/well-known step in operator or developer UI)
- **dev:** run workspace dependency builds before dev watchers so `@senkronla/protocol` resolves on first `pnpm dev`

### Added

- **server:** log WebSocket message traffic on notifications route and hub (auth tokens redacted; ping/pong at debug level)
- **server:** Deployment-wide operator limit overrides with admin `GET/PATCH /v1/admin/settings/limits`
- **web:** Operator settings global limits tab
- **server:** Admin purge endpoint to delete all relay operational records (namespaces, devices, documents, apps, developers, blobs)
- **web:** Operator settings dangerous operations panel to purge all relay records from the UI
- **server:** Rate limits for developer verification and password-reset mail (per IP and per developer account)

### Changed

- **server:** reuse and overwrite the current blob when consecutive document pushes come from the same device
- **web:** Operator admin token sign-in screen layout aligned with the developer portal auth card
- **web:** Operator settings drawer uses tabs for limits, mail, and dangerous operations
- **web:** Operator Developers tab self-service prerequisites callout can be dismissed
- **web:** Drawer loading spinners are vertically centered in the drawer body
- **web:** Operator panel list tables center numeric columns; zero-value counts are not navigation links
- **server:** Developer verification and password-reset mail is dispatched in the background so API responses are not blocked on SMTP delivery
- **server:** Developer auth emails use branded HTML templates aligned with the web portal

### Fixed

- **web:** Operator console no longer flashes the full panel before the admin token sign-in screen when session is still loading

## [0.1.9]

### Added

- **web:** Locale-aware page titles and meta descriptions on all public routes

### Changed

- **web:** Reference doc pages use full content width aligned with site layout

### Fixed

- **web:** Doc tags and badges stay on one line instead of breaking mid-label on mobile and in lists
- **web:** Reference docs fit mobile viewport without horizontal page overflow
- **web:** Code block syntax highlighting after locale switch (docs layout split, baked Shiki colors)
- **web:** Developer portal tab title after sign-in no longer stays on “Sign in”

- **server:** Operator limit overrides (DB cascade, admin API, enforcement)
- **web:** Operator limits UI for namespaces, apps, and developers
- **docs:** Operator limit overrides spec (doc 17)

## [0.1.8]

### Changed

- **web:** SDK install docs — clarify `@senkronla/client` vs `@senkronla/protocol`; fix `{documentId}` path placeholder rendering

## [0.1.7]

### Added

- **server:** `ESR_APPS__NATIVE__REQUIRE_MANUAL_REVIEW` env override for native bundle operator approval

### Changed

- **docs:** OpenAPI 1.3.1 — app registry (`/admin/developers`, bundle ID list search, `/health` fields, sync route headers)
- **web:** Postman collection expanded with developer portal and operator app registry request folders

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

- **docs:** root `openapi.yaml` SSOT synced to `docs/openapi.yaml`

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

- **multi-document:** namespace başına çoklu döküman (protocol, server, client, WS subscribe filter, docs, örnek script); spec [15-MULTI-DOCUMENT.md](docs/tr/15-MULTI-DOCUMENT.md)

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
- Specification moved to `docs/`
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
