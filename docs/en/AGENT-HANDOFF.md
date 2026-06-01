# Agent Handoff — Envelope Sync Relay v1

> **Provide this file** to the implementation agent together with the entire `en/` folder (or `../tr/`).
> The agent must not be aware of any specific consumer application; it should only build the universal sync service.

## Task summary

Build **Envelope Sync Relay (ESR)** — a self-hosted, zero-knowledge, REST-based document sync service.

- Offline-first applications transport opaque snapshot envelopes (`ESR-DOC1`) across devices
- Server cannot read content (E2EE payload)
- No user account / registration
- Device limit: configurable free slot + one-time unlock packages
- When limit reached: `payment` (unlock/payment) or `block` (hard cap) — operator chooses
- When device removed: slot frees up; can be used for free on another device

## Single source of truth (SSOT)

All design decisions are in `en/` (English) or `../tr/` (Turkish). In case of conflict, priority:

1. `04-API-REFERENCE.md`
2. `13-WEBSOCKET-NOTIFICATIONS.md` (WS implementation)
3. `03-PROTOCOL.md`
3. `06-SLOT-LICENSING.md`
4. `05-DEVICE-PAIRING-AND-RECOVERY.md`
5. Others

If deviation is required, create `../DEVIATIONS.md` and justify it.

## Deliverables

| Component | Package / path |
|-----------|----------------|
| Protocol (Zod, crypto helpers, identity utilities) | `@esr/protocol` — `generateNamespaceId`, `generateRecoveryPhrase`, `buildRecoveryKeyProof` |
| HTTP client + SyncEngine + **EsrSync facade** | `@esr/client` — doc [14-ESR-SYNC-FACADE.md](./14-ESR-SYNC-FACADE.md) |
| REST API server | `packages/server` |
| Admin CLI (unlock code) | `@esr/cli` |
| Docker compose | `docker/docker-compose.yml` |
| Tests | Vitest, integration with testcontainers |
| OpenAPI | `openapi.yaml` compliance |

## Critical design decisions (do not change)

| Topic | Decision |
|-------|----------|
| Protocol magic | `ESR-DOC1` |
| Inner encryption | `ENV-ENC1` (AES-256-GCM + PBKDF2-SHA256) |
| Document id v1 | `primary` only |
| Identity | UUID v4 `namespaceId` + device_token + recovery hash |
| API prefix | `/v1/namespaces/{namespaceId}` — **no tenant** |
| `namespaceId` generation | `@esr/protocol.generateNamespaceId()` — app does not copy; adapter returns existing workspace id if present |
| Recovery phrase | `@esr/protocol.generateRecoveryPhrase()` + `buildRecoveryKeyProof()`; server stores Argon2id hash only |
| Conflict | Server does not merge; 409 + client UI |
| Slot model | `max = free_device_limit + purchased_slots` |
| Purchased slots | Cumulative; preserved on recovery |
| Re-pair same clientDeviceId | Old device revoked, slot count unchanged |
| Last device | Cannot be removed (`LAST_DEVICE_PROTECTED`) |
| Blob storage MVP | Filesystem on same server |
| Payment MVP | Manual unlock code; webhook Phase 8 |
| WebSocket | Notification only; `esr-notifications-v1`; polling fallback required (doc 13) |

## Implementation phase order

`11-IMPLEMENTATION-PLAN.md` — Phase 0 through 7 for REST MVP; then **Phase 7b WebSocket** (doc 13).

## When a phase or feature ships

After completing a phase or a previously planned capability, **sync documentation before closing the task**:

1. Follow [`.cursor/rules/feature-shipped-docs.mdc`](../../.cursor/rules/feature-shipped-docs.mdc) — update the feature spec, `11-IMPLEMENTATION-PLAN.md`, cross-referenced docs (`07`, `08`, `10`, `12`, `OPERATOR.md`), both `en/` and `tr/` README indexes, OpenAPI, web/agent docs, and changelogs.
2. Replace *planned* wording with *shipped* only where behaviour is live; mark phase checklists `- [x]`.
3. Search for stale future tense (`planned`, `planlandı`, `to be implemented`, …) in scope and fix.

## Acceptance criteria (brief)

- [ ] Docker `up` → `/health` ok
- [ ] Create → pair 2 devices → push/pull sync
- [ ] 3rd device: 403 per block or payment mode config
- [ ] Unlock code → slot increase → pair success
- [ ] Revoke → slot freed → new pair without payment
- [ ] Recovery → tokens revoked, slots + head preserved
- [ ] 409 revision conflict correct
- [ ] No payload in logs (verify with test)
- [ ] Example node script runs
- [ ] `@esr/protocol` identity unit tests: UUID v4, recovery round-trip proof, normalize
- [ ] (Phase 7b) A push → B WS notify → B HTTP pull

## Technology

Implementer may choose; recommendation: **TypeScript, Node 22, Hono/Fastify, PostgreSQL 16, Vitest**.

Public API contract (`openapi.yaml`, `ESR-DOC1`) must not change.

## Deliberately out of scope

- Snapshot over WebSocket (meta notification only)
- CRDT / entity merge
- User accounts / OAuth
- Subscription billing (one-time unlock only)
- Multi-document per namespace — shipped; see [15-MULTI-DOCUMENT.md](./15-MULTI-DOCUMENT.md), [14-ESR-SYNC-FACADE.md](./14-ESR-SYNC-FACADE.md) §5.2

## First commands (agent)

1. Read `./README.md` (or `../tr/README.md`)
2. Create repo scaffold with `11-IMPLEMENTATION-PLAN.md` Phase 0
3. `packages/protocol` + identity utilities (`identity.ts`) + fixtures + unit tests
4. Continue in order

## Integration note (for operator, not agent)

Consumer applications use `EsrSync.connect()` + `DocumentAdapter` by default (doc 14). This agent delivers the facade in Phase 6c.
