# Changelog

All notable changes to `@senkronla/web` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Monorepo release versions follow the root [`CHANGELOG.md`](../../CHANGELOG.md).

## [Unreleased]

### Added

- Locale-aware page titles and meta descriptions for every public route (guides, SDK, API, operator, developer portal)

### Changed

- Reference docs (guides, SDK, API) use full content column width aligned with site layout

### Fixed

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
