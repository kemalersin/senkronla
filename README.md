# Senkronla

[![Version](https://img.shields.io/github/package-json/v/kemalersin/senkronla?filename=packages%2Fserver%2Fpackage.json&label=version)](packages/server/package.json)
[![Node.js](https://img.shields.io/badge/Node.js-22+-339933)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)
[![Buy me a coffee](https://img.shields.io/badge/☕-Buy_me_a_coffee-FFDD00)](https://buy.polar.sh/polar_cl_bgVnJBChysBLb4AeFnjxdmiBepqUoTyWkZraz39sSUf)

Open-source, self-hosted, zero-knowledge **Envelope Sync Relay** for offline-first applications.

**Source:** [github.com/kemalersin/senkronla](https://github.com/kemalersin/senkronla)

Senkronla stores opaque encrypted document envelopes (`ESR-DOC1`) and coordinates revision, device pairing, and slot licensing. The server never reads payload content.

## Monorepo

| Package | Description |
|---------|-------------|
| `@senkronla/protocol` | Envelope protocol, crypto, identity utilities |
| `@senkronla/server` | Fastify REST API + WebSocket notification hub |
| `@senkronla/client` | Client SDK — `EsrSync` facade, RelayClient, SyncEngine |
| `@senkronla/cli` | Operator CLI — unlock code generation |
| `@senkronla/web` | Operator portal + developer docs (EN/TR) |

## Quick Start

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
- Web portal: http://localhost:3000

**Requires Postgres** for the API (migrations run on startup). Start bundled Postgres:

```bash
cd docker && docker compose --profile bundled-db up postgres -d
```

Or point `ESR_DATABASE_URL` in `.env` to an existing instance.

**Config:** copy `.env.example` to `.env`, or use `packages/server/config.example.yaml` as `config.yaml` with `ESR_CONFIG_PATH`.

```bash
pnpm --filter @senkronla/server migrate   # run migrations manually
```

### Docker — bundled Postgres

```bash
cp docker/.env.example .env
cd docker
docker compose --profile bundled-db up --build
```

### Docker — existing Postgres

Set `ESR_DATABASE_URL` in `.env` to your instance, then start without the bundled profile:

```bash
# macOS/Windows — Postgres on host
ESR_DATABASE_URL=postgresql://user:pass@host.docker.internal:5432/esr

docker compose up api web
```

## Documentation

- **Specification:** [docs/envelope-sync-relay/README.md](./docs/envelope-sync-relay/README.md)
- **Operator guide:** [docs/OPERATOR.md](./docs/OPERATOR.md)
- **OpenAPI:** [openapi.yaml](./openapi.yaml) (served at `/docs`)
- **Implementation plan:** [docs/envelope-sync-relay/en/11-IMPLEMENTATION-PLAN.md](./docs/envelope-sync-relay/en/11-IMPLEMENTATION-PLAN.md)

## Scripts

```bash
pnpm build       # Build all packages
pnpm test        # Run all tests
pnpm lint        # Typecheck all packages
pnpm typecheck   # Alias for lint in packages
```

## Release target

Full v1 delivery includes REST API, WebSocket notifications, and `EsrSync` client facade per the specification.

## License

[MIT](LICENSE) — Copyright (c) 2026 Kemal Ersin
