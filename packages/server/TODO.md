# @senkronla/server — TODO

Spec: [docs/en/04-API-REFERENCE.md](../../docs/en/04-API-REFERENCE.md)

## Faz 0 — Scaffold

- [x] Fastify app shell
- [x] Config loader (env + Zod)
- [x] `GET /health`, `GET /metrics`
- [x] Swagger UI at `/docs` (OpenAPI SSOT: root `openapi.yaml`)

## Faz 1 — Database & config

- [x] Migration 001 (doc 10 DDL)
- [x] YAML config file support (`config.yaml`, `ESR_CONFIG_PATH`)
- [x] Full Zod schema (doc 07)
- [x] Invalid config fails startup
- [x] PostgreSQL connection pool (`pg`)
- [x] Auto-migrate on startup + `pnpm migrate` script
- [x] Structured logging with payload redaction (Pino)
- [x] Health: DB `SELECT 1` + blob read/write probe (503 when degraded)

## Faz 2 — Namespace + devices + pairing

- [x] `POST /v1/namespaces`
- [x] `GET /v1/namespaces/:id`
- [x] Device token auth middleware
- [x] `POST /v1/namespaces/:id/pairing-tokens`
- [x] `POST /v1/namespaces/:id/devices` (pairing redeem)
- [x] `GET /v1/namespaces/:id/devices`
- [x] `DELETE /v1/namespaces/:id/devices/:deviceId`
- [x] `GET /v1/namespaces/:id/limits`
- [x] Slot limit engine (free + purchased)
- [x] `payment` / `block` limit errors
- [x] Re-pair same `clientDeviceId` without extra slot
- [x] Migration 002 (`device_id` ULID column)
- [x] Integration tests (testcontainers)

## Faz 3 — Documents

- [x] Blob filesystem driver (store/retrieve envelopes)
- [x] `GET head`, `GET head/meta`, `PUT primary`
- [x] 409 `REVISION_CONFLICT`
- [x] Envelope validation (`ENVELOPE_INVALID`, `ENVELOPE_TOO_LARGE`, `CONTENT_TYPE_NOT_ALLOWED`)
- [x] Integration tests (testcontainers) + `src/scripts/faz3-smoke.ts`

## Faz 4 — Recovery

- [x] `POST /v1/namespaces/:id/recover`
- [x] Rate limiting (5/hour/namespace, `429 RATE_LIMIT_EXCEEDED`)
- [x] Migration `003_rate_limit_events.sql`
- [x] Integration tests + `src/scripts/faz4-smoke.ts`

## Faz 5 — Unlock / slots

- [x] Unlock code redeem (`POST /v1/namespaces/:id/unlock`)
- [x] Admin unlock code generation (`POST /v1/admin/unlock-codes`)
- [x] `unlock_events` audit trail
- [x] Integration tests + `src/scripts/faz5-smoke.ts`

## Faz 7 — Hardening

- [x] Rate limits (pairing, pairing-tokens, push, global IP)
- [x] CORS production notes + startup warnings
- [x] Security checklist tests (doc 08)
- [x] OpenAPI ↔ route contract tests
- [x] Blob path traversal protection
- [x] Operator guide (`docs/OPERATOR.md`)

## Faz 7b — WebSocket

- [x] `NotificationHub`
- [x] `GET /v1/namespaces/:id/notifications` upgrade
- [x] `head_changed` / `limits_changed` broadcast
- [ ] Device revoke → WS close 4403
- [ ] WS integration test (testcontainers)

## Definition of Done (full release)

- [x] All doc 04 endpoints implemented
- [x] English error messages with typed `error.code`
- [ ] Docker compose health ok
- [ ] Integration tests with testcontainers
