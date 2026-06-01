# Senkronla

[![npm client](https://img.shields.io/npm/v/@senkronla/client?label=%40senkronla%2Fclient)](https://www.npmjs.com/package/@senkronla/client)
[![npm protocol](https://img.shields.io/npm/v/@senkronla/protocol?label=%40senkronla%2Fprotocol)](https://www.npmjs.com/package/@senkronla/protocol)
[![Node.js](https://img.shields.io/badge/Node.js-22+-339933)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)
[![Buy me a coffee](https://img.shields.io/badge/☕-Buy_me_a_coffee-FFDD00)](https://buy.polar.sh/polar_cl_bgVnJBChysBLb4AeFnjxdmiBepqUoTyWkZraz39sSUf)

Open-source, self-hosted, zero-knowledge **Envelope Sync Relay (ESR)** for offline-first applications.

**Website:** [senkron.la](https://senkron.la) · **Source:** [github.com/kemalersin/senkronla](https://github.com/kemalersin/senkronla)

Your app encrypts and owns the data model. Senkronla stores opaque `ESR-DOC1` envelopes, coordinates revisions, manages device pairing and slot limits, and notifies other clients — **without reading payload content**.

## At a glance

| Topic | Summary |
| --- | --- |
| **Deploy** | Self-hosted relay — [ESR setup](https://senkron.la/guides/esr#prerequisites): Docker Compose or Node.js 22+, PostgreSQL 16+, persistent blob storage, TLS in production |
| **Client** | [`@senkronla/client`](https://www.npmjs.com/package/@senkronla/client) on npm — [`EsrSync`](https://senkron.la/sdk) facade, offline queue, conflict callbacks |
| **Protocol** | REST `/v1` + optional WebSocket notifications (push-to-pull) |
| **Docs** | [Integration guides](https://senkron.la/guides) · [API](https://senkron.la/api) · [ESR setup](https://senkron.la/guides/esr) |
| **Operator** | Web portal at [`/operator`](https://senkron.la/operator) + admin API |

## Architecture

Senkronla splits responsibility between your application, the client SDK, and a self-hosted relay. Full spec: [02 — Architecture](./docs/en/02-ARCHITECTURE.md).

### System overview

```mermaid
flowchart TB
  subgraph clients [Clients — any application]
    C1[Device A — Host]
    C2[Device B]
    C3[Device C]
  end

  subgraph relay [Envelope Sync Relay — self-hosted]
    API[HTTP API]
    AUTH[Device Token Auth]
    SLOT[Slot / License Engine]
    REV[Revision Index]
    BLOB[Blob Store]
    CFG[Config Loader]
    WS[WebSocket Hub]
    API --> AUTH
    API --> SLOT
    API --> REV
    API --> BLOB
    CFG --> SLOT
    API --> WS
  end

  subgraph data [Persistence]
    PG[(PostgreSQL)]
    FS[(Blob Volume)]
  end

  C1 & C2 & C3 -->|HTTPS JSON| API
  WS -.->|head_changed| C2
  WS -.->|head_changed| C3
  REV --> PG
  AUTH --> PG
  SLOT --> PG
  BLOB --> FS
```

| Layer | Role |
|-------|------|
| **Application** | Snapshots, encryption, merge/conflict UX |
| **Client SDK** | Push/pull, pairing, recovery, local revision state |
| **Relay server** | Opaque blob store, revision index, devices, slots, rate limits |

### Push / pull flow

```mermaid
sequenceDiagram
  participant Client
  participant API
  participant Rev as Revision Index
  participant Blob

  Note over Client,Blob: PULL
  Client->>API: GET .../head/meta
  API->>Rev: read head revision
  Rev-->>API: revision, sha256, size
  API-->>Client: meta (no payload)
  alt revision changed
    Client->>API: GET .../head
    API->>Blob: read envelope
    Blob-->>API: ESR-DOC1 JSON
    API-->>Client: full envelope
    Client->>Client: decrypt payload, import document
  end

  Note over Client,Blob: PUSH
  Client->>Client: build envelope, new revision
  Client->>API: PUT .../documents/{id} (expectedRevision, envelope)
  API->>Rev: compare expectedRevision vs head
  alt mismatch
    API-->>Client: 409 Conflict + remote head meta
  else match
    API->>API: verify contentSha256
    API->>Blob: write
    API->>Rev: update head
    API-->>Client: 201 + new revision
  end
```

Client sync loop:

```
1. GET head/meta
2. IF remote revision != known: GET head → import (conflict check client-side)
3. IF local changes: PUT document (expectedRevision = last known remote)
4. IF 409: conflict UI — remote wins | local wins | cancel
```

### Real-time notifications

WebSocket carries **metadata only**; document bytes always travel over HTTP.

```mermaid
sequenceDiagram
  participant A as Client A
  participant R as ESR Relay
  participant B as Client B

  A->>R: PUT document (HTTP)
  R->>R: update head
  R-->>B: WS head_changed (meta only)
  B->>R: GET head/meta + GET head (HTTP)
  B->>B: import document
```

### Deployment (typical)

```
docker compose:
  - api        (@senkronla/server — port 8080)
  - web        (@senkronla/web — senkron.la UI)
  - postgres:16
  - volume: /data/blobs
```

TLS termination via Caddy or nginx in front of the API and web portal. Operator guide: [docs/OPERATOR.md](./docs/OPERATOR.md) · live docs: [senkron.la/guides/esr](https://senkron.la/guides/esr).

## Features

- **Zero-knowledge** — server stores encrypted envelopes; no payload decryption
- **Multi-document** — multiple named snapshots per namespace (`primary`, `settings`, …)
- **Device pairing & recovery** — host/guest pairing codes + recovery phrase
- **Slot licensing** — configurable free device limit; payment or block mode
- **Revision history** — optional retention by age or count; operator purge tools
- **App registry** (optional) — register web/native apps, verified origins, developer portal
- **Operator tools** — limits overrides, revision cleanup, unlock codes, audit views

## Monorepo

| Package | Description |
|---------|-------------|
| [`@senkronla/protocol`](https://www.npmjs.com/package/@senkronla/protocol) | Envelope protocol, crypto, identity utilities |
| [`@senkronla/client`](https://www.npmjs.com/package/@senkronla/client) | Client SDK — `EsrSync` facade, RelayClient, SyncEngine |
| [`@senkronla/cli`](https://www.npmjs.com/package/@senkronla/cli) | Operator CLI — unlock code generation |
| `@senkronla/server` | Fastify REST API + WebSocket notification hub |
| `@senkronla/web` | [senkron.la](https://senkron.la) — docs, operator portal, developer portal |

### npm packages

Published on [npm](https://www.npmjs.org/package/@senkronla/client) under the `@senkronla` scope:

```bash
npm install @senkronla/client      # application SDK (includes protocol)
npm install @senkronla/protocol    # envelope/crypto helpers only
npm install -g @senkronla/cli        # operator CLI (unlock codes)
```

## Quick start

### Prerequisites

- Node.js 22+
- pnpm 9+
- Docker (optional, for compose deployment)

### Local development

```bash
pnpm install
pnpm dev
```

- API: http://localhost:8080
- Swagger UI: http://localhost:8080/docs
- Web portal: http://localhost:3000 (same UI as [senkron.la](https://senkron.la) when deployed)

**Requires Postgres** for the API (migrations run on startup). Start bundled Postgres:

```bash
cp .env.example .env   # if you have not already
docker compose --project-directory . -f docker/docker-compose.yml --env-file .env --profile bundled-db up postgres -d
```

Or point `ESR_DATABASE_URL` in `.env` to an existing instance.

**Config:** copy `.env.example` to `.env` (used for both `pnpm dev` and Docker Compose), or use `packages/server/config.example.yaml` as `config.yaml` with `ESR_CONFIG_PATH`.

```bash
pnpm --filter @senkronla/server migrate   # run migrations manually
```

### Docker — bundled Postgres

```bash
cp .env.example .env
docker compose --project-directory . -f docker/docker-compose.yml --env-file .env --profile bundled-db up --build
```

### Docker — existing Postgres

Set `ESR_COMPOSE_DATABASE_URL` in `.env` to your instance, then start without the bundled profile:

```bash
# macOS/Windows — Postgres on host
ESR_COMPOSE_DATABASE_URL=postgresql://user:pass@host.docker.internal:5432/esr

docker compose --project-directory . -f docker/docker-compose.yml --env-file .env up api web
```

### Production updates

After `git pull` or `.env` changes on the server (from repo root):

```bash
dc='docker compose --project-directory . -f docker/docker-compose.yml --env-file .env'
$dc --profile bundled-db up -d --build --force-recreate api web   # code
$dc --profile bundled-db up -d --force-recreate api web             # .env only
```

TLS reverse proxy: [`docker/nginx/README.md`](./docker/nginx/README.md) · full operator guide: [`docs/OPERATOR.md`](./docs/OPERATOR.md) (§ Updating live services, § Reverse proxy).

## Documentation

| Resource | Link |
|----------|------|
| Website (guides, API, SDK) | [senkron.la](https://senkron.la) |
| Quick start checklist | [senkron.la/quick-start](https://senkron.la/quick-start) |
| Relay deployment guide | [senkron.la/guides/esr](https://senkron.la/guides/esr) |
| Specification (repo) | [docs/README.md](./docs/README.md) |
| Operator guide | [docs/OPERATOR.md](./docs/OPERATOR.md) |
| OpenAPI | [openapi.yaml](./openapi.yaml) (also at `/docs` on running API) |

## Scripts

```bash
pnpm build       # Build all packages
pnpm test        # Run all tests
pnpm lint        # Typecheck all packages
pnpm typecheck   # Alias for lint in packages
```

## Version and CHANGELOG

The sole semver source is the root [`package.json`](package.json) `version` field. Release notes follow [Keep a Changelog](https://keepachangelog.com/) in the root [`CHANGELOG.md`](CHANGELOG.md) and per-package changelogs under `packages/*/CHANGELOG.md` and `apps/web/CHANGELOG.md`.

When you run `pnpm version patch` (or `minor` / `major`), npm bumps the root version and runs `scripts/promote-changelog-unreleased.mjs`, which:

1. Promotes `[Unreleased]` → `[X.Y.Z]` in the root and any package changelog that has unreleased notes
2. Sets the same `version` in all workspace `package.json` files (`packages/*`, `apps/*`)

Write release notes under `[Unreleased]` before bumping. Package changelogs with an empty `[Unreleased]` section are left unchanged (version field is still synced).

## Release target

Full v1 delivery includes REST API, WebSocket notifications, and `EsrSync` client facade per the specification.

## License

[MIT](LICENSE) — Copyright (c) 2026 Kemal Ersin
