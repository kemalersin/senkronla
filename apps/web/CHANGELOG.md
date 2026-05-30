# Changelog

All notable changes to `@senkronla/web` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Monorepo release versions follow the root [`CHANGELOG.md`](../../CHANGELOG.md).

## [Unreleased]


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
