# Envelope Sync Relay (ESR) — Developer Documentation

> **Türkçe sürüm:** [tr/README.md](../tr/README.md)

> **Implementation agent:** Read [AGENT-HANDOFF.md](./AGENT-HANDOFF.md) first.

This folder contains the full specification and developer guide for **Envelope Sync Relay**, a universal, self-hosted, zero-knowledge document synchronization service.

The service is designed to transport an **encrypted snapshot envelope** for any offline-first application across devices. It does not know the application schema; it only manages revision, device, and slot metadata.

---

## Reading order (for implementation agent)

| # | Document | Content |
|---|----------|---------|
| 1 | [01-OVERVIEW.md](./01-OVERVIEW.md) | Vision, scope, terminology, design principles |
| 2 | [02-ARCHITECTURE.md](./02-ARCHITECTURE.md) | Components, data flow, deployment |
| 3 | [03-PROTOCOL.md](./03-PROTOCOL.md) | `ESR-DOC1` envelope format, inner payload rules |
| 4 | [04-API-REFERENCE.md](./04-API-REFERENCE.md) | REST API — all endpoints, request/response, error codes |
| 5 | [05-DEVICE-PAIRING-AND-RECOVERY.md](./05-DEVICE-PAIRING-AND-RECOVERY.md) | Device pairing, removal, recovery key |
| 6 | [06-SLOT-LICENSING.md](./06-SLOT-LICENSING.md) | Slot model, payment, unlock codes (no registration) |
| 7 | [07-SERVER-CONFIGURATION.md](./07-SERVER-CONFIGURATION.md) | Server settings, env, docker |
| 8 | [08-SECURITY.md](./08-SECURITY.md) | Threat model, crypto, rate limit |
| 9 | [14-ESR-SYNC-FACADE.md](./14-ESR-SYNC-FACADE.md) | **`EsrSync` — default client API (start here)** |
| 9b | [09-CLIENT-INTEGRATION-GUIDE.md](./09-CLIENT-INTEGRATION-GUIDE.md) | Advanced integration (`RelayClient` direct) |
| 10 | [10-DATA-MODEL.md](./10-DATA-MODEL.md) | PostgreSQL schema, indexes |
| 11 | [11-IMPLEMENTATION-PLAN.md](./11-IMPLEMENTATION-PLAN.md) | Phases, repo structure, tests, acceptance criteria |
| 12 | [12-ERROR-CODES.md](./12-ERROR-CODES.md) | HTTP error codes and client retry policy |
| 13 | [13-WEBSOCKET-NOTIFICATIONS.md](./13-WEBSOCKET-NOTIFICATIONS.md) | WebSocket push-to-pull notifications (v1.1) |
| 14 | [openapi.yaml](../openapi.yaml) | Machine-readable REST API definition |
| 15 | [15-MULTI-DOCUMENT.md](./15-MULTI-DOCUMENT.md) | **Multi-document per namespace (spec v1.2)** |

---

## Quick summary

```
┌─────────────┐     ESR-DOC1 envelope      ┌──────────────────────────┐
│  Client A   │ ─────── HTTP PUT ─────────▶│  Envelope Sync Relay     │
│  (any app)  │ ◀────── HTTP GET ──────────│  Postgres + blob store   │
└─────────────┘                            │  WS: head_changed (v1.1) │
┌─────────────┐         ▲                  └────────────┬─────────────┘
│  Client B   │ ── WS notify ── pull HTTP ────────────┘
└─────────────┘
```

**Core features:**

- Zero-knowledge: server cannot read payload content
- No registration/account: identity = namespace + device token + recovery key
- Device slot model: free limit + purchased slots (cumulative)
- When limit reached: `payment` (buy package) or `block` (hard cap)
- When device removed: slot frees up; can be used for free on another device
- Conflict: server does not merge; client chooses local/remote
- **WebSocket (v1.1):** `head_changed` notification → HTTP pull (data does not travel over WS)

**Deliberately out of scope (v1):**

- User account / email / OAuth
- Subscription / recurring billing
- Snapshot / envelope over WebSocket
- Entity-level CRDT merge
- Server-side content search or query

---

## Consumer application integration

This specification is application-agnostic. Each consumer app should maintain its own integration guide **outside** this folder (mapping local profile/workspace UUID to `namespaceId`, implementing `DocumentAdapter`, UI wiring). Do not add app-specific references to files in `envelope-sync-relay/`.

**v1.0.1:** Tenant layer removed — API `/v1/namespaces/{namespaceId}`; `namespaceId` UUID v4 required.

**v1.1.0:** WebSocket notification channel — see [13-WEBSOCKET-NOTIFICATIONS.md](./13-WEBSOCKET-NOTIFICATIONS.md).

**v1.2.0 (shipped):** `@senkronla/client` `EsrSync` facade — see [14-ESR-SYNC-FACADE.md](./14-ESR-SYNC-FACADE.md).

**v1.2.0:** Multiple documents per namespace — server, client SDK, WS subscribe, docs — see [15-MULTI-DOCUMENT.md](./15-MULTI-DOCUMENT.md).

---

| Field | Value |
|-------|-------|
| Spec version | 1.2.0 (multi-document in v1.2) |
| Protocol magic | `ESR-DOC1` |
| API prefix | `/v1` |
| Min. TLS | 1.2 |

---

## License and distribution note

The service is designed as a universal OSS/self-host product. The operator (server owner) configures the revenue model via slot packages and `on_limit_reached.mode` in their own deployment.
