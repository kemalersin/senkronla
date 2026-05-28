# 01 — Overview

## 1. Problem

Offline-first applications store data locally (IndexedDB, SQLite, files). When users want to see the same data on multiple devices:

- Manual export/import has high friction
- File-based sync (iCloud folder) has browser/platform constraints
- Central backend may be undesirable for privacy-focused apps such as finance/health

**Envelope Sync Relay (ESR)** enables cross-device sync by storing the application's **opaque (meaningless) encrypted document envelope** on a self-hosted server. The server cannot read the content.

## 2. Solution summary

ESR consists of three layers:

| Layer | Responsibility | Who knows? |
|-------|----------------|------------|
| **Application** | Snapshot production, import, business rules | Application developer |
| **ESR Client SDK** | Push/pull, pairing, conflict, offline queue | Integration |
| **ESR Server** | Blob storage, revision index, device/slot | Operator |

The server operates at the **document unit** level; not at entity/record level.

## 3. Glossary

| Term | Definition |
|------|------------|
| **Namespace** | Logical container for synchronized data. Usually a workspace, vault, or profile. **UUID v4 required** (global uniqueness). |
| **Document** | Single document within a namespace. v1 supports `primary` only. |
| **Envelope (ESR-DOC1)** | Outer JSON envelope written to server; metadata + opaque payload. |
| **Payload** | Inner JSON string produced by the application (plain or encrypted by the application). |
| **Revision** | Monotonically unique version identifier (ULID recommended). Each successful push creates a new revision. |
| **Device** | Client paired to a namespace. Authenticates with `device_token`. |
| **Host device** | First device that creates the namespace; generates pairing tokens. |
| **Pairing token** | Short-lived, single-use pairing code. |
| **Recovery key** | Client-side secret proving namespace ownership (server stores hash only). |
| **Slot** | Right to have a device paired at the same time. |
| **Free limit** | Number of concurrent devices allowed without payment (operator setting). |
| **Purchased slots** | Additional slots added to namespace via unlock code / payment (cumulative). |
| **Operator** | Person or organization running the relay server. |
| **Notification (WS)** | Meta notification from server to client; does not carry data. Triggers pull. |

## 4. Design principles

1. **Zero-knowledge by default:** Payload is E2EE; server does not decrypt.
2. **Offline-first compatible:** Client runs locally without network; sync continues when online.
3. **Dumb server, smart client:** Merge, conflict resolution, snapshot logic on client.
4. **No registration:** User account not required; namespace + token sufficient.
5. **Self-hosted:** API and blob in same deployment; no external SaaS required.
6. **Universal protocol:** Namespace/document abstraction; application schema identified via `contentType`.
7. **Configurable commercial model:** Slot limit and payment/block mode via operator config.
8. **Push-to-pull:** WebSocket is notification only; snapshot always over HTTP (doc 13).

## 5. User stories (v1)

### US-1: Initial setup
User enables sync in app → host device creates namespace → recovery key shown → user saves key.

### US-2: Second device (within limit)
Host generates pairing code/QR → second device enters code → receives device token → pull/push begins.

### US-3: Limit reached (payment mode)
Third device to be added → API returns `DEVICE_LIMIT_PAYMENT_REQUIRED` → client shows slot package purchase / unlock code UI → slot increases → pairing continues.

### US-4: Limit reached (block mode)
API returns `DEVICE_LIMIT_BLOCKED` → user sees "no more devices can be added" message; no payment offered.

### US-5: Device removal
Host or same device selects "Remove this device" → slot frees up → new device uses same slot for free.

### US-6: Device loss
Recovery key revokes all devices → new host → purchased slots preserved → re-pairing.

### US-7: Conflict
Two devices edit offline → both attempt push → one gets 409 or conflict on pull → client chooses local/remote.

### US-8: Instant remote update (v1.1)
Client A pushes → relay broadcasts `head_changed` WS → Client B HTTP pull → UI updates.

## 6. Non-goals (v1)

- Multiple documents per namespace (v2)
- WebDAV/S3 transport (separate client transport; server always HTTP)
- Federation (multi-relay federation)
- Admin web UI (v1: config file + CLI sufficient; admin API optional)

## 7. Success criteria (MVP)

- [ ] Host can create namespace + recovery
- [ ] 2+ devices sync via pairing
- [ ] Push/pull works with revision; 409 conflict returned correctly
- [ ] Free limit and payment/block mode change via config
- [ ] Unlock code adds slot; revoke frees slot
- [ ] Recovery revokes all device tokens, slots preserved
- [ ] Payload not visible in server logs
- [ ] Docker compose `up` → health ok
- [ ] REST API compliant with OpenAPI spec
- [ ] Vitest/integration test suite passes
- [ ] (v1.1) WS `head_changed` → client HTTP pull
