# Changelog

All notable changes to `@senkronla/web` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Monorepo release versions follow the root [`CHANGELOG.md`](../../CHANGELOG.md).

## [Unreleased]

### Changed

- Operator rate limits tab — grouped usage via `/api/operator/rate-limit-usage`; overview stat shows 24h hits (excl. `global_ip`)
- ESR setup guide and operator labels — rate limits monitoring text updated for usage buckets

## [0.1.13]

### Fixed

- ESR setup guide — use `t.rich` for config table rows and Docker tip text that contain `<tag>` markup

### Changed

- ESR setup guide — **Updating live services** and **Reverse proxy (nginx)** sections; expanded env table (POSTGRES_*, ESR_COMPOSE_DATABASE_URL, publish ports, trust proxy); compose alias and production update snippets

## [0.1.12]

### Fixed

- ESR setup guide — render Docker resources paragraph with rich text (`<tag>` markup)

### Changed

- ESR setup guide — single repo-root `.env` for Docker and local dev; `ESR_COMPOSE_DATABASE_URL` for external Postgres from containers
- ESR setup guide — system requirements, resource sizing (~1000 namespace moderate/heavy rows), and ports under Prerequisites
- ESR setup guide — optional Docker Compose CPU/RAM limits (`docker-compose.resources.example.yml`)
- SDK install section — npm install commands, Node 22+, links to `@senkronla/*` on npm registry
- Agent docs and spec page GitHub links — point to `docs/en/` and `docs/tr/` after docs folder restructure

## [0.1.11]

### Added

- Operator revision purge — date or keep-last-N count; deployment-wide tab in general settings; improved modal layout without size jump after loading

### Changed

- ESR setup guide — document `ESR_REVISION_RETENTION_DAYS` and `ESR_REVISION_RETENTION_COUNT` in configuration table
- Operator apps and developers tables — namespace and app count navigation uses secondary buttons instead of text links
- REST API docs — revision retention subsection under relay quotas
- Operator revision purge success — single-line message in a highlighted feedback card
- Postman collection and API doc snippets — health response no longer includes `apps.requireRegistration`

## [0.1.10]

### Added

- Operator header **Limits** button opens a modal to set deployment-wide limit overrides (app and developer overrides still take precedence)
- Operator settings — dangerous operations panel to permanently delete all relay records (namespaces, devices, documents, unlock data, apps, developers); requires typing `purge-all-records` and a confirmation dialog; SMTP overrides are preserved
- Brand favicon and Apple touch icon: lowercase **s** in DM Sans Bold on accent teal gradient (SVG, PNG, ICO)

### Fixed

- Operator dangerous purge reloads the active list tab (namespaces, unlock codes, apps, developers, and other tables) instead of leaving stale rows or an endless spinner
- Developer drawer truncates long email addresses with an ellipsis instead of overlapping the status badge
- Drawer backdrop shows default cursor instead of pointer; page content no longer receives hover under open overlays
- Operator limit override clear control is an × inside the input (no separate row button or undo)
- Operator console no longer flashes the full panel before the admin token sign-in screen when session is still loading

### Changed

- Agents guide — file links section uses grouped cards, language badges, origin note, and numbered recommended fetch order
- Mobile site header shows doc search in the navbar; mobile menu places GitHub, theme, and locale controls on the same row as Sign in
- Mobile operator panel header aligns API origin and action buttons to the right
- Operator global limits open from a header **Limits** button (modal) instead of the settings drawer tab; settings drawer tabs are Mail and Dangerous operations only
- Operator admin token sign-in screen layout aligned with the developer portal auth card
- Operator limit overrides: per-row Clear button removes scope override without typing inherit
- Operator settings drawer uses tabs (Mail, Dangerous operations) instead of a single scrollable page
- Operator Developers tab self-service prerequisites callout can be dismissed (preference saved in browser)
- Drawer loading spinners are vertically centered in the drawer body
- Operator panel list tables center numeric columns (CSS specificity fix); zero-value app and namespace counts are plain text instead of navigation links
- Limit overrides modal table vertically centers all columns
- Limit overrides modal max width reduced (44rem); Override column and inputs use a fixed narrow width

## [0.1.9]

### Added

- Locale-aware page titles and meta descriptions for every public route (guides, SDK, API, operator, developer portal)

### Changed

- Reference docs (guides, SDK, API) use full content column width aligned with site layout

### Fixed

- Stop apps and developers lists from reloading when operator settings drawer opens
- Deduplicate operator apps, developers, and mail settings list fetches (coalesce concurrent GETs under React Strict Mode)
- Deduplicate operator portal bootstrap and developer session checks on initial page load (shared session promise per endpoint)
- Improve selected-state contrast for segmented controls with a neutral track background
- Keep doc tags, badges, and status labels on a single line instead of breaking mid-label on mobile and in lists
- Syntax highlighting after locale switch (server docs layout, baked Shiki colors, full locale navigation)
- Restore code block colors by removing legacy Shiki CSS overrides that cleared inline token colors
- Fix locale switcher by using next-intl `Link` again instead of broken plain anchors
- Reference docs on mobile stay within the viewport; wide tables and code scroll inside their containers
- Developer portal tab title shows panel name after sign-in instead of staying on “Sign in”

- Operator panel — limit override modal for namespaces, apps, and developers

- Operator unlock-code form — wider Namespace ID and note fields, narrower device-slot input

- Operator limit overrides open in a dedicated modal from list action buttons (not inside detail drawers)

- Developer sign-in/register card — more spacing above the email fields

## [0.1.8]

### Changed

- SDK install section — `@senkronla/client` vs `@senkronla/protocol`; REST path placeholder renders `{documentId}` correctly

## [0.1.7]

### Changed

- Operator and developer app search placeholders mention bundle ID
- Postman collection — app registry folders (developer auth/apps, operator apps/developers, sync with `X-ESR-App-Id`); new environment variables
- Postman sync requests show app registry headers (`X-ESR-App-Id`, `Origin`, native platform/bundle/secret) on namespace and pairing examples
- Postman collection — **Web client** and **Native client** folders replace mixed pairing requests
- ESR setup guide — document `ESR_APPS__NATIVE__REQUIRE_MANUAL_REVIEW`

## [0.1.6]

### Added

- Developer portal — generate or rotate native client secret in app drawer (BFF `/api/developer/apps/:appId/rotate-secret`)
- Hide native client secret UI when relay `apps.nativeRequireClientSecret` is false (`/health`)
- Show native client secret UI only after at least one bundle is registered
- Native bundle status labels use approval wording (not origin verification)
- Hide client secret until app is active and all bundles are approved
- Native app list/detail status shows approval wording for pending_verification
- Native bundle platform selector includes desktop
- SDK and API app registry sections — approval steps, auth layers, client secret lifecycle, pairing scope
- Integration checklist step for app registration when relay requires it
- ESR setup guide — `ESR_APPS__*` environment variables and production migration note
- Developer portal prerequisites callout; operator secret panel visibility hint
- Operator Developers tab — self-service prerequisites callout (relay config, JWT secret, `/developer` link)
- SDK reference — "App code vs SDK" section with responsibility table and sample legend (`appStore`, `appUi`, `// app:`)
- SDK quick start and connect examples include `appId` when application registry is enabled

### Changed

- SDK docs and agent markdown — `appStore` / `appUi` / `appSession` placeholders and `// app:` comments clarify app-owned UI, store, and password wiring
- Turkish SDK/docs copy — fix literal translations (store, repo, poll, hooks, dirty)
- Agent SDK/API markdown aligned with human docs (TR/EN)
- SDK quick start and EsrSync.connect examples — include `appId` and app-registry callouts
- Self-service setup hints moved from developer portal to operator Developers tab

## [0.1.5]

### Changed

- Doc sidebar — ESR/Agents links only on guides index
- Postman environment files updated

## [0.1.4]

### Added

- Operator Apps panel (`/operator`) and developer portal (`/developer`) with BFF routes
- Origin removal in operator/developer app panels; copy app ID in lists and drawer
- Hide developer login/register and `/developer` routes when developer portal is disabled
- SDK and API reference — Application registry sections

## [0.1.3]

### Added

- Documentation search — build-time index (`pnpm generate:search`), ⌘K / Ctrl+K modal in site header; covers guides, SDK, and API pages (EN/TR)
- MiniSearch client-side fuzzy search over `public/search/{locale}.json`

## [0.1.2]

### Added

- Postman collection + local/production environment JSON (`pnpm generate:postman`); download card on API reference page
- API and SDK reference **Envelope encryption** sections (`#encryption`) with sync password, `ENV-ENC1` inner payload, and code examples (TR/EN)
- Shared `api-sample-data.ts` and `postman-artifacts.ts` for consistent HTTP examples

### Changed

- API/Postman examples use verifiable `ENV-ENC1` payloads (doc-only password `demo-sync-passphrase`)
- Agent markdown (`public/agents/`) and `llms.txt` updated for encryption and sync password

## [0.1.0]

### Added

- Next.js operator portal with EN/TR i18n (next-intl)
- Landing, Quick Start, How To, API, SDK, and Operator pages
- Live API health check on Operator panel
- Docker external/bundled Postgres documentation in Quick Start
