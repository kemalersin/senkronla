# Senkronla — TODO

Master roadmap for the monorepo. Per-package checklists live in each package `TODO.md`.

## Faz 0 — Scaffold (in progress)

- [x] pnpm workspaces + Turborepo
- [x] `@senkronla/protocol` scaffold + first test
- [x] `@senkronla/server` Fastify shell + Swagger + health
- [x] `@senkronla/client` / `@senkronla/cli` scaffolds
- [x] `@senkronla/web` portal (EN/TR i18n, operator panel shell)
- [x] Docker compose — bundled-db profile + external Postgres via `ESR_DATABASE_URL`
- [x] Root + package CHANGELOG/TODO files
- [x] CI workflow (lint + test)
- [x] `pnpm install` lockfile committed

## Faz 1–5 — Server MVP

See [packages/server/TODO.md](./packages/server/TODO.md)

## Faz 6 + 6c + 7b — Client SDK (full package)

See [packages/client/TODO.md](./packages/client/TODO.md)

- [x] RelayClient + SyncEngine
- [x] EsrSync facade
- [x] NotificationClient WebSocket + poll fallback

## Faz 7 — Hardening

- [x] Rate limits, security checklist
- [x] OpenAPI contract tests
- [x] Operator README (`docs/OPERATOR.md`)

## Release milestones

| Tag | Scope |
|-----|--------|
| v0.1.0 | Scaffold (current) |
| v1.0.0 | REST MVP |
| v1.1.0 | + WebSocket notifications |
| v1.2.0 | + EsrSync client facade |

## Decisions (locked)

- Package scope: `@senkronla/*`
- Server: Fastify, English error messages
- Frontend: Next.js + next-intl (EN/TR)
- Database: bundled Postgres profile OR external via env
- Target: full package (WS + EsrSync included)
