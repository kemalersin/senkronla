# 11 — Implementation Plan and Acceptance Criteria

This document defines what the implementation agent builds in order, test expectations, and the definition of done.

## 1. Target deliverable

A working **Envelope Sync Relay** monorepo:

- API + Postgres + blob volume up via Docker compose
- `@esr/protocol` npm package (Zod + verify/build)
- `@esr/client` npm package (RelayClient + SyncEngine)
- `@esr/server` or `packages/server` HTTP API
- `@esr/cli` admin unlock code generator
- Vitest test suite (>80% coverage core paths)
- OpenAPI spec compliance

**Universal:** No package references a specific application name.

## 2. Phase plan

### Phase 0 — Project skeleton (2–3 days)

- [ ] Monorepo scaffold (npm/pnpm workspaces or cargo workspace)
- [ ] TypeScript strict, ESLint, Prettier
- [ ] `packages/protocol` — ESR-DOC1 Zod, sha256, fixtures
- [ ] `packages/protocol/src/identity.ts` — `generateNamespaceId`, `isValidNamespaceId`, `generateRecoveryPhrase`, `normalizeRecoveryPhrase`, `buildRecoveryKeyProof`, `verifyRecoveryKeyProof` (doc 05 Argon2id; doc 09)
- [ ] CI: lint + test on push
- [ ] Docker compose postgres only

**Output:** protocol unit tests green

### Phase 1 — Database and config (2–3 days)

- [ ] Migration 001 (doc 10 DDL)
- [ ] Config loader + Zod validate (doc 07)
- [ ] Health endpoint
- [ ] Structured logging (redaction)

**Output:** `GET /health` ok; invalid config fails startup

### Phase 2 — Namespace + devices + pairing (4–5 days)

- [ ] POST namespace create
- [ ] Recovery hash storage (client-provided salt/hash)
- [ ] device_token issue + auth middleware
- [ ] POST pairing-tokens, POST devices redeem
- [ ] GET devices list, DELETE device revoke
- [ ] Slot limit check (free + purchased)
- [ ] `on_limit_reached.mode` block/payment errors

**Output:** integration test: 2 device pair; 3rd blocked per config

### Phase 3 — Document push/pull (3–4 days)

- [ ] Blob filesystem driver
- [ ] GET head/meta, GET head
- [ ] PUT primary with expectedRevision
- [ ] 409 REVISION_CONFLICT
- [ ] Envelope validation + sha256

**Output:** two-client push/pull round-trip test

### Phase 4 — Recovery (2 days)

- [ ] POST recover with Argon2id verify
- [ ] Revoke all devices, preserve slots + head
- [ ] Rate limit recover

**Output:** recovery integration test

### Phase 5 — Unlock / slots (2–3 days)

- [ ] unlock_codes table + admin CLI generate
- [ ] POST unlock redeem
- [ ] GET limits
- [ ] unlock_events audit

**Output:** unlock + pair 3rd device test (payment mode)

### Phase 6 — Client SDK (4–5 days)

- [ ] `@esr/client` RelayClient all API methods
- [ ] SyncEngine: pull/push/conflict/debounce
- [ ] ENV-ENC1 encode/decode in protocol or client
- [ ] Browser + Node export (`package.json` exports`)

**Output:** example app or vitest mock server e2e

### Phase 6c — `EsrSync` facade (3–4 days)

See [14-ESR-SYNC-FACADE.md](./14-ESR-SYNC-FACADE.md)

- [ ] `EsrStorage` + `createLocalStorageAdapter` + `createMemoryStorageAdapter`
- [ ] `createDocumentAdapter` factory
- [ ] `EsrSync.connect` — internal RelayClient + SyncEngine + NotificationClient + scheduler
- [ ] `ensureNamespace`, `startPairing`, `joinPairing`, `recover`, `sync`, `notifyLocalChange`
- [ ] Callbacks: `onRecoveryPhrase`, `onConflict`, `onDeviceLimit`, `onStatusChange`
- [ ] `EsrError` + protocol identity tools integration
- [ ] Vitest: memory storage + mock relay e2e
- [ ] Doc 14 minimal example working (example app)

**Output:** v1.2.0 client tag; integration checklist §10 green

### Phase 7 — Hardening (2–3 days)

- [ ] Rate limits
- [ ] CORS
- [ ] Metrics endpoint
- [ ] Security test checklist (doc 08)
- [ ] README operator guide
- [ ] OpenAPI final review

**Output:** REST MVP release tag v1.0.0

### Phase 7b — WebSocket notifications (2–3 days)

See [13-WEBSOCKET-NOTIFICATIONS.md](./13-WEBSOCKET-NOTIFICATIONS.md)

- [ ] `NotificationHub` + `GET /v1/namespaces/:id/notifications` upgrade
- [ ] PUT primary / unlock → `head_changed` / `limits_changed` broadcast
- [ ] Ping/pong, auth, revoke → close 4403
- [ ] `@esr/protocol` WS message Zod schemas
- [ ] `@esr/client` `NotificationClient` + reconnect + poll fallback
- [ ] `SyncEngine` `ws_with_poll_fallback` mode
- [ ] Caddy/nginx WS proxy notes
- [ ] Integration: A push → B WS → B HTTP pull

**Output:** v1.1.0 tag (REST + WS)

### Phase 8 — Optional (post-MVP)

- [ ] Payment webhook (Stripe)
- [ ] S3 blob driver
- [x] Revision history table
- [x] Admin web UI (operator portal)

## 3. File structure (detail)

```
senkronla/
├── packages/
│   ├── protocol/
│   │   ├── src/
│   │   │   ├── envelope.ts
│   │   │   ├── inner-payload.ts      # ENV-RAW1, ENV-ENC1
│   │   │   ├── crypto.ts             # sha256, aes-gcm, pbkdf2
│   │   │   └── index.ts
│   │   ├── fixtures/
│   │   └── package.json
│   ├── client/
│   │   ├── src/
│   │   │   ├── esr-sync.ts              # facade (doc 14)
│   │   │   ├── esr-sync-scheduler.ts
│   │   │   ├── esr-storage.ts
│   │   │   ├── document-adapter.ts
│   │   │   ├── notification-client.ts
│   │   │   ├── relay-client.ts
│   │   │   ├── sync-engine.ts
│   │   │   ├── sync-scheduler.ts
│   │   │   ├── errors.ts
│   │   │   └── index.ts
│   │   └── package.json
│   ├── server/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── config/
│   │   │   ├── db/
│   │   │   ├── notification-hub.ts
│   │   │   ├── routes/
│   │   │   │   ├── namespaces.ts
│   │   │   │   ├── notifications-ws.ts
│   │   │   │   ├── devices.ts
│   │   │   │   ├── documents.ts
│   │   │   │   ├── unlock.ts
│   │   │   │   ├── admin.ts
│   │   │   │   └── health.ts
│   │   │   ├── services/
│   │   │   │   ├── slot-service.ts
│   │   │   │   ├── pairing-service.ts
│   │   │   │   ├── document-service.ts
│   │   │   │   └── recovery-service.ts
│   │   │   ├── middleware/
│   │   │   │   ├── auth-device.ts
│   │   │   │   ├── auth-admin.ts
│   │   │   │   └── rate-limit.ts
│   │   │   └── blob/
│   │   │       └── filesystem.ts
│   │   ├── migrations/
│   │   └── package.json
│   └── cli/
│       ├── src/
│       │   └── generate-unlock-code.ts
│       └── package.json
├── docker/
│   ├── docker-compose.yml
│   └── Dockerfile
├── docs/                              # this specification
│   ├── en/
│   ├── tr/
│   ├── openapi.yaml
│   └── OPERATOR.md
├── openapi.yaml                       # repo root SSOT
├── package.json
└── README.md
```

## 4. Test strategy

### 4.1 Unit

- protocol: envelope round-trip, sha256 mismatch
- slot-service: max calculation, canPair
- conflict decision logic (client SyncEngine)

### 4.2 Integration (supertest + testcontainers postgres)

- full pairing flow
- push/pull/conflict 409
- recovery revokes tokens
- unlock adds slots
- rate limit 429

### 4.3 E2E (optional)

- `@esr/client` against running docker stack

### 4.4 Security

- log redaction grep test
- cross-namespace auth rejection

## 5. Acceptance criteria (Definition of Done)

MVP is **complete** only when:

1. All doc 04 API endpoints (admin optional) implemented
2. Routes match OpenAPI
3. Docker compose `up` → health ok
4. README: operator setup + unlock CLI usage
5. Client example: minimal HTML or node script demonstrating create → pair → sync
6. 100% doc 05 + doc 06 test scenarios pass
7. Payload never in any log file (automated test)
8. Config `payment` and `block` modes switchable

## 6. Code quality

- TypeScript strict, no `any` in public API
- Parameterized SQL only
- Errors: typed error classes with `code` field
- Public JSDoc on `@esr/client` exports

## 7. Versioning

- Semver packages
- API `/v1` prefix; breaking → `/v2`
- Envelope `schemaVersion` independent

## 8. README content (operator)

Implementer must write root README:

- Quick start docker
- Config reference link
- Generate unlock code CLI
- Backup/restore blob+postgres
- Security notes (TLS, admin token)
- CORS production warning

## 9. Example minimal client script

```typescript
// examples/node-basic-sync.ts
import { RelayClient, SyncEngine } from '@esr/client'

// DocumentAdapter mock for demo JSON document
// create namespace → push → print limits
```

Agent must deliver this script in working form.

## 10. Multi-document (spec v1.2)

**Spec:** [15-MULTI-DOCUMENT.md](./15-MULTI-DOCUMENT.md). **Shipped** (2026-05).

| Sub-phase | Scope | Status |
|-----------|--------|--------|
| 7a | Server: parametric routes, blob, envelope schemaVersion 2, `GET /documents` | done |
| 7b | WebSocket `documentId` + optional subscribe filter | done |
| 7c | Client: RelayClient, SyncState, EsrSync `documents[]` | done |
| 7d | OpenAPI, web docs, operator guide, examples | done |

**Definition of done:** Two documents in one namespace sync independently; primary-only clients against a current server unchanged; integration tests in doc 15 §13.

### Phase 8 — Application registry (v1.3 — done)

See [16-APP-REGISTRY.md](./16-APP-REGISTRY.md) §20.

| Sub-phase | Scope | Status |
|-----------|--------|--------|
| 8a | Migration 006, config `apps`, app context middleware, namespace `app_uuid`, dynamic CORS | done |
| 8b | Admin API `/v1/admin/apps`, YAML seed, suspend | done |
| 8c | DNS TXT + HTTPS well-known verification, localhost dev | done |
| 8d | Developer portal `/v1/developer/*`, self_service mode | done |
| 8e | Native bundle registration, client secret, pairing `allowedAppIds`, SDK `appId` | done |
| 8f | OpenAPI, agent docs, OPERATOR.md, v1.2 migration guide | done |

**Definition of done:** `apps.enabled: false` passes all existing tests; operator_managed web app creates namespace bound to app; self_service developer verifies domain without operator; wrong origin / cross-app namespace rejected.

### Phase 9 — Operator limit overrides (v1.3.2)

See [17-OPERATOR-LIMIT-OVERRIDES.md](./17-OPERATOR-LIMIT-OVERRIDES.md).

| Sub-phase | Scope | Status |
|-----------|--------|--------|
| 9a | Migration 010, `limit_overrides` JSONB, audit table | done |
| 9b | `limit-resolution-service`, cascade + slot/rate wiring | done |
| 9c | `namespace_create` enforcement | done |
| 9d | Admin GET/PATCH limits API, OpenAPI | done |
| 9e | Operator portal drawers + BFF | done |
| 9f | Integration tests | done |

**Definition of done:** Namespace override beats app override beats developer beats config; operator can clear overrides via PATCH null keys.

## 11. Known limitations (current release)

- Multi-document uses `documents[]` in `@senkronla/client` (see doc 14 §5.2)
- No payment webhook (manual unlock only)
- Filesystem blob only
- English/Turkish error messages — implementer picks one for server; client maps codes

## 12. Agent instructions

Implementation agent must:

1. Treat **this docs/ folder** as single source of truth
2. On ambiguity, priority doc 04 > doc 03 > doc 06
3. Must not write application-specific code
4. Tests green after each phase
5. Maintain CHANGELOG.md
6. Record deviations in `../DEVIATIONS.md`
