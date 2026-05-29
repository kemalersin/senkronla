# Changelog

All notable changes to the Senkronla monorepo are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Package-level changelogs: `packages/*/CHANGELOG.md`, `apps/web/CHANGELOG.md`.

The published version number lives only in the [`package.json`](package.json) `version` field (`0.1.x`). **The latest release section must always match `package.json` `version`** (e.g. `0.1.25` → `## [0.1.25]`). Write new entries under `## [Unreleased]` first; when you run `pnpm version patch --no-git-tag-version`, the `version` script moves `[Unreleased]` content to `## [X.Y.Z]` automatically (`scripts/promote-changelog-unreleased.mjs`). See [README — Version and CHANGELOG](README.md#version-and-changelog).

## [Unreleased]


## [0.1.1]
### Added

- **multi-document:** namespace başına çoklu döküman (protocol, server, client, WS subscribe filter, docs, örnek script); spec [15-MULTI-DOCUMENT.md](docs/envelope-sync-relay/tr/15-MULTI-DOCUMENT.md)

### Changed

- **server:** rate limit action `put_primary` renamed to `put_document`; HTTP headers `RateLimit-PutDocument-*` (breaking for API clients)
- **docs:** referans belgeleri çoklu belge ve `@senkronla/client` API ile hizalandı (09, 12, 14, agents, README)
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
