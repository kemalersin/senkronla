# Senkronla — REST API reference (`/v1`)

> **Audience:** AI coding agents integrating Senkronla without the JavaScript SDK (Swift, Kotlin, Rust, server jobs, custom engines).
> **Companion:** [Agent overview](en.md) · [SDK reference](sdk-en.md) · [Human API page](/api) · OpenAPI: `openapi.yaml`

Base URL: `https://your-relay.example.com/v1`  
Format: JSON  
Health (no auth): `GET https://your-relay.example.com/health`

**Postman:** Download the runnable collection and environment from the interactive API page — [`/postman/senkronla-relay.postman_collection.json`](/postman/senkronla-relay.postman_collection.json), [`senkronla-relay-local.postman_environment.json`](/postman/senkronla-relay-local.postman_environment.json). Run the `Quick start` folder in order to auto-save `deviceToken` and related fields.

Spec v1.3 adds optional **application registry** (`X-ESR-App-Id`, namespace–app binding). Spec v1.2 supports **multiple named documents** per namespace.

---

## Table of contents

1. [Authentication](#authentication)
2. [Typical flow](#typical-flow-no-sdk)
3. [Endpoints reference](#endpoints-reference)
4. [Create namespace](#create-namespace-first-device)
5. [Get namespace & list documents](#get-namespace--list-documents)
6. [Push document](#push-document)
7. [Pull document](#pull-document)
8. [Pairing](#pairing)
9. [Recovery](#recovery)
10. [Device list & revoke](#device-list--revoke)
11. [Limits & unlock](#limits--unlock)
12. [Error response shape](#error-response-shape)
13. [Envelope format (ESR-DOC1)](#envelope-format-esr-doc1)
14. [Envelope encryption (ENV-ENC1)](#envelope-encryption-env-enc1)
15. [Recovery key proof](#recovery-key-proof)
16. [WebSocket notifications](#websocket-notifications)
17. [Error codes](#error-codes)
18. [Relay quotas & size limits](#relay-quotas--size-limits)
19. [App registry admin & developer APIs](#app-registry-admin--developer-apis)

---

## Authentication

### Device token

After create, pair, or recover you receive `deviceToken`. Send on all authenticated routes:

```http
Authorization: Bearer dvt_a1b2c3d4e5f6...
```

### Application context (v1.3 — when `apps.enabled`)

Required on **all** `/v1` routes except `/health`, `/v1/admin/*`, and `/v1/developer/*`:

| Client type | Headers |
|-------------|---------|
| Web SPA | `X-ESR-App-Id` + browser `Origin` (must match registered origin) |
| iOS / Android | `X-ESR-App-Id` + `X-ESR-Platform` + `X-ESR-Bundle-Id` (+ optional `X-ESR-Client-Secret`) |

```http
X-ESR-App-Id: esr_app_mynotes
Origin: https://app.example.com
```

Create namespace response includes `appId` when app registry is enabled. Cross-app access → `403 APP_NAMESPACE_MISMATCH`.

WebSocket: browser identifies app via handshake `Origin`; send `Authorization: Bearer {deviceToken}`. Subprotocol: `esr-notifications-v1`.

**Unauthenticated routes (still require app context when enabled):** `POST /v1/namespaces`, `POST .../devices` (pairing redeem), `POST .../recover`.

---

## Typical flow (no SDK)

1. `POST /v1/namespaces` → save `deviceToken`
2. `GET .../documents/{documentId}/head/meta` → read current revision (`primary` or other id)
3. `PUT .../documents/{documentId}` → push envelope (`expectedRevision: null` on first push)
4. Subscribe WebSocket (optional `subscribe` with `documentIds[]`) or poll `head/meta`
5. `GET .../head` when revision differs from local known revision

---

## Endpoints reference

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/health` | no | Relay health (outside `/v1`) |
| `POST` | `/v1/namespaces` | no | Create workspace + first device |
| `GET` | `/v1/namespaces/{id}` | yes | Metadata, limits, primary head summary |
| `GET` | `/v1/namespaces/{id}/documents` | yes | List all document heads in namespace |
| `GET` | `/v1/namespaces/{id}/documents/{documentId}/head/meta` | yes | Lightweight head |
| `GET` | `/v1/namespaces/{id}/documents/{documentId}/head` | yes | Full envelope for import |
| `PUT` | `/v1/namespaces/{id}/documents/{documentId}` | yes | Push snapshot |
| `GET` | `.../documents/primary/...` | yes | Alias for `documentId=primary` |
| `POST` | `/v1/namespaces/{id}/pairing-tokens` | yes | Host: generate 6-digit code |
| `POST` | `/v1/namespaces/{id}/devices` | no* | Guest: redeem pairing code |
| `GET` | `/v1/namespaces/{id}/devices` | yes | List devices + limits |
| `DELETE` | `/v1/namespaces/{id}/devices/{deviceId}` | yes | Revoke device |
| `POST` | `/v1/namespaces/{id}/recover` | no | Recovery with phrase proof |
| `GET` | `/v1/namespaces/{id}/limits` | yes | Current slot limits |
| `POST` | `/v1/namespaces/{id}/unlock` | yes | Redeem unlock code |
| `GET` | `/v1/namespaces/{id}/notifications` | yes | WebSocket upgrade |

\* Pairing redeem uses pairing code, not device token.

---

## Create namespace (first device)

```http
POST /v1/namespaces
Content-Type: application/json

{
  "namespaceId": "550e8400-e29b-41d4-a716-446655440000",
  "namespaceLabel": "Acme Corp workspace",
  "deviceLabel": "Alice laptop",
  "clientDeviceId": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  "recoveryKeyProof": {
    "salt": "c2FsdC1leGFtcGxlLWJ5dGVz",
    "hash": "a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3"
  }
}
```

```http
HTTP/1.1 201 Created

{
  "namespaceId": "550e8400-e29b-41d4-a716-446655440000",
  "deviceToken": "dvt_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
  "deviceId": "01HZPXDEVICEHOST01",
  "limits": {
    "freeDeviceLimit": 2,
    "purchasedSlots": 0,
    "maxDevices": 2,
    "activeDevices": 1,
    "canAddDevice": true,
    "onLimitReached": { "mode": "payment", "slotPackages": [3, 5, 10] }
  }
}
```

---

## Get namespace & list documents

```http
GET /v1/namespaces/550e8400-e29b-41d4-a716-446655440000
Authorization: Bearer dvt_...
```

Returns `namespaceLabel`, `limits`, `head` (primary summary), `documents[]`, `lastSyncAt`.

```http
GET /v1/namespaces/{id}/documents
Authorization: Bearer dvt_...
```

```json
{
  "documents": [
    {
      "documentId": "primary",
      "revision": "01HZQXK8Y3V5G2N4M6P7R9S1T",
      "writtenAt": "2026-05-28T10:15:00.000Z",
      "deviceId": "01HZPXDEVICEHOST01",
      "contentSha256": "...",
      "contentMagic": "ENV-ENC1",
      "sizeBytes": 128
    },
    {
      "documentId": "settings",
      "revision": "01HZQXSETTINGSREV01",
      "writtenAt": "2026-05-28T10:20:00.000Z",
      "deviceId": "01HZPXDEVICEHOST01",
      "contentSha256": "...",
      "contentMagic": "ENV-ENC1",
      "sizeBytes": 64
    }
  ]
}
```

---

## Push document

**First push** — omit `expectedRevision` or set `null`:

```http
PUT /v1/namespaces/{id}/documents/primary
Authorization: Bearer dvt_...
Content-Type: application/json

{
  "expectedRevision": null,
  "envelope": { /* ESR-DOC1 — see below */ }
}
```

**Update** — `expectedRevision` must match current head:

```http
PUT /v1/namespaces/{id}/documents/settings
Authorization: Bearer dvt_...
Content-Type: application/json

{
  "expectedRevision": "01HZQXSETTINGSREV01",
  "envelope": { /* new revision ULID inside envelope */ }
}
```

Success `201`:

```http
HTTP/1.1 201 Created
RateLimit-PutDocument-Limit: 120
RateLimit-PutDocument-Remaining: 119
RateLimit-PutDocument-Reset: 3600

{
  "revision": "01HZQXNEWREVISION01",
  "writtenAt": "2026-05-28T10:30:00.000Z",
  "contentSha256": "...",
  "writerDeviceId": "01HZPXDEVICEHOST01",
  "rateLimits": {
    "global_ip": { "action": "global_ip", "limit": 300, "remaining": 299, "resetAfterSeconds": 42, "windowSeconds": 60 },
    "put_document": { "action": "put_document", "limit": 120, "remaining": 119, "resetAfterSeconds": 3600, "windowSeconds": 3600 }
  }
}
```

---

## Pull document

```http
GET /v1/namespaces/{id}/documents/primary/head/meta
Authorization: Bearer dvt_...
```

Compare `revision` to local known revision. If different:

```http
GET /v1/namespaces/{id}/documents/primary/head
Authorization: Bearer dvt_...
```

Returns full `ESR-DOC1` envelope. The `payload` field is an `ENV-ENC1` JSON string — decrypt with your sync password (`extractDocument` or `extractDocumentFromInnerPayload`).

`DOCUMENT_NOT_FOUND` on first pull before any push is expected.

---

## Pairing

**Host:**

```http
POST /v1/namespaces/{id}/pairing-tokens
Authorization: Bearer dvt_...
Content-Type: application/json

{ "ttlSeconds": 600 }
```

Optional **pairing scope** (when `apps.enabled`):

```json
{ "ttlSeconds": 600, "allowedAppIds": ["esr_app_mynotes", "esr_app_mynotes_mobile"] }
```

Guest redeem with a non-listed `X-ESR-App-Id` → `403 APP_PAIRING_NOT_ALLOWED`. Omit `allowedAppIds` to allow any active app.

```json
{
  "code": "482913",
  "expiresAt": "2026-05-28T10:25:00.000Z",
  "qrPayload": "esr://pair/v1/{namespaceId}?code=482913&exp=1748427900&host=Alice%20laptop"
}
```

When scoped, `qrPayload` may include `&apps=esr_app_a,esr_app_b` and the response echoes `allowedAppIds`.

**Guest:**

```http
POST /v1/namespaces/{id}/devices
Content-Type: application/json

{
  "pairingCode": "482913",
  "deviceLabel": "Bob phone",
  "clientDeviceId": "7c9e6679-7425-40de-944b-e07fc1f90ae7"
}
```

→ `201` with new `deviceToken`.

---

## Recovery

**Warning:** Revokes **all** existing device tokens in the workspace.

```http
POST /v1/namespaces/{id}/recover
Content-Type: application/json

{
  "recoveryKeyProof": { "salt": "...", "hash": "..." },
  "deviceLabel": "Recovery laptop",
  "clientDeviceId": "9b2c3d4e-5f6a-7b8c-9d0e-1f2a3b4c5d6e"
}
```

```json
{
  "deviceToken": "dvt_recovery_token...",
  "deviceId": "01HZPXDEVICERECOV01",
  "revokedDeviceCount": 2,
  "limits": { }
}
```

---

## Device list & revoke

```http
GET /v1/namespaces/{id}/devices
Authorization: Bearer dvt_...
```

```http
DELETE /v1/namespaces/{id}/devices/{deviceId}
Authorization: Bearer dvt_...
```

→ `204`. Cannot revoke the last remaining device.

---

## Limits & unlock

```http
GET /v1/namespaces/{id}/limits
Authorization: Bearer dvt_...
```

```http
POST /v1/namespaces/{id}/unlock
Authorization: Bearer dvt_...
Content-Type: application/json

{ "unlockCode": "UNLK-7X9K-2M4P" }
```

```json
{
  "slotsAdded": 3,
  "purchasedSlots": 3,
  "maxDevices": 5,
  "canAddDevice": true
}
```

| `onLimitReached.mode` | Behavior |
|-------------------------|----------|
| `payment` | `DEVICE_LIMIT_PAYMENT_REQUIRED` — show upgrade; operator unlock codes add slots |
| `block` | `DEVICE_LIMIT_BLOCKED` — user must revoke a device |

---

## Error response shape

```json
{
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Expected revision does not match server head",
    "details": {
      "remoteMeta": {
        "revision": "01HZQXK8Y3V5G2N4M6P7R9S1T",
        "writtenAt": "2026-05-28T10:15:00.000Z",
        "deviceId": "01HZPXDEVICEHOST01",
        "contentSha256": "...",
        "contentMagic": "ENV-ENC1",
        "sizeBytes": 128
      }
    }
  }
}
```

Always branch on **`error.code`**, not HTTP status alone.

---

## Envelope format (ESR-DOC1)

Each `documentId` has its own revision chain.

- **`schemaVersion: 1`** — only `documentId: "primary"`
- **`schemaVersion: 2`** — any valid `documentId` (non-primary documents)

Application JSON is carried in the `payload` field. In production it must be **encrypted** as `ENV-ENC1` — see [Envelope encryption](#envelope-encryption-env-enc1).

**Primary (`schemaVersion: 1`):**

```json
{
  "magic": "ESR-DOC1",
  "schemaVersion": 1,
  "namespaceId": "550e8400-e29b-41d4-a716-446655440000",
  "namespaceLabel": "Acme Corp workspace",
  "documentId": "primary",
  "revision": "01HZQXK8Y3V5G2N4M6P7R9S1T",
  "deviceId": "01HZPXDEVICEHOST01",
  "writtenAt": "2026-05-28T10:15:00.000Z",
  "contentType": "application/vnd.myapp+json",
  "contentMagic": "ENV-ENC1",
  "contentSha256": "d0673c157ada6198e2c7ec13a4398c38aae980ec3d996c5a1c53530f874755ec",
  "payload": "{\"magic\":\"ENV-ENC1\",\"kdf\":\"PBKDF2-SHA256\",\"iterations\":600000,\"salt\":\"AQIDBAUGBwgJCgsMDQ4PEA\",\"nonce\":\"AQIDBAUGBwgJCgsM\",\"ciphertext\":\"lFyUxY5-9CZir9Nq-oWz5hHBLmMA33VDBh3jlw\"}"
}
```

**Secondary document (`schemaVersion: 2`, e.g. `settings`):** same shape with `"schemaVersion": 2` and `"documentId": "settings"`. Path `PUT .../documents/settings` must match envelope `documentId`.

**Validation rules:**

- `contentSha256` = SHA-256 hex of the `payload` field as a UTF-8 string
- `revision` must be a new ULID on each push
- `namespaceId` must match route and adapter
- Full serialized JSON must fit within `maxEnvelopeBytes` (default 50 MB)

Unencrypted `ENV-RAW1` is for local development only.

---

## Envelope encryption (ENV-ENC1)

In production, application data must travel inside an encrypted `ESR-DOC1` envelope (`ENV-ENC1` inner payload). The relay stores an opaque string only. If you use the JavaScript SDK, see also [SDK — Envelope encryption](sdk-en.md#envelope-encryption-env-enc1).

### What is the sync password?

The encryption password is an **application secret** that locks the envelope. Senkronla does not generate it and never sends it to the relay. You provide it — master password, workspace sync password, vault PIN derivative, etc.

The client uses this password before every push and pull (via `resolvePassword()` in the SDK). All paired devices must share the same password; pairing and recovery do not transfer it automatically.

### Do not confuse secrets

| Secret | Role |
|--------|------|
| **Sync password** | `ENV-ENC1` encryption; app-provided; never sent to server |
| **24-word recovery phrase** | Namespace access proof; does not auto-decrypt envelopes |
| **deviceToken** | Relay API session; unrelated to envelope encryption |
| **demo-sync-passphrase** | Documentation/Postman examples on this site only |

### What is inside `payload`?

The outer envelope sets `contentMagic: ENV-ENC1`. The `payload` string is JSON the relay does not parse:

```json
{
  "magic": "ENV-ENC1",
  "kdf": "PBKDF2-SHA256",
  "iterations": 600000,
  "salt": "...",
  "nonce": "...",
  "ciphertext": "..."
}
```

- **`salt` + `nonce`** — random per push; not secret; carried with ciphertext so the pull device can decrypt
- **`ciphertext`** — application JSON encrypted with AES-256-GCM
- **`kdf` / `iterations`** — PBKDF2-SHA256, default 600000

### Building envelopes without the SDK

Use `buildEnvEnc1Payload` from `@senkronla/protocol`, then set `contentSha256 = sha256Hex(payload)` on the outer envelope. **Never put the password in an HTTP request.**

```typescript
import { buildEnvEnc1Payload, sha256Hex } from '@senkronla/protocol'

const documentJson = '{"note":"Hello"}'
const password = await yourApp.getSyncPassword() // never sent to the relay
const payload = await buildEnvEnc1Payload(documentJson, password)

const envelope = {
  magic: 'ESR-DOC1',
  schemaVersion: 2,
  namespaceId,
  namespaceLabel,
  documentId: 'notes',
  revision: newRevisionUlid,
  deviceId,
  writtenAt: new Date().toISOString(),
  contentType: 'application/vnd.myapp+json',
  contentMagic: 'ENV-ENC1',
  contentSha256: sha256Hex(payload),
  payload,
}

// PUT /v1/namespaces/{id}/documents/{documentId}
// Body: { "expectedRevision": null | "...", "envelope": envelope }
```

On pull: `extractDocumentFromInnerPayload(envelope.payload, password)` or `@senkronla/client` → `extractDocument(envelope, password)`.

**Warning — Recovery ≠ sync password:** `POST .../recover` only issues a new `deviceToken`. Envelopes encrypted with a lost sync password cannot be recovered — plan separate password backup UX.

---

## Recovery key proof

The 24-word BIP39 phrase **never leaves the device**. Only `{ salt, hash }` is sent:

- Salt: 16 random bytes, base64url
- Hash: Argon2id of normalized phrase with that salt, base64url
- Defaults: `memoryCost: 65536`, `timeCost: 3`, `parallelism: 4`

```typescript
import { buildRecoveryKeyProof, generateRecoveryPhrase } from '@senkronla/protocol'

const phrase = generateRecoveryPhrase() // show to user once
const recoveryKeyProof = await buildRecoveryKeyProof(phrase)
// send recoveryKeyProof in POST /namespaces or POST /recover
```

**Never implement Argon2 parameters yourself** — import from `@senkronla/protocol`.

---

## WebSocket notifications

```http
GET /v1/namespaces/{id}/notifications
Upgrade: websocket
Sec-WebSocket-Protocol: esr-notifications-v1
Authorization: Bearer dvt_...
```

After `auth_ok`, optionally filter events:

```json
{ "type": "subscribe", "documentIds": ["primary", "settings"] }
```

Omit `subscribe` to receive all documents in the namespace (v1 default).

**Messages (notification only — always fetch via HTTP GET):**

```json
{
  "type": "head_changed",
  "documentId": "primary",
  "revision": "01HZQXUPDATEDREV02",
  "contentSha256": "...",
  "writtenAt": "2026-05-28T11:00:00.000Z",
  "writerDeviceId": "01HZPXDEVICEHOST01"
}
```

```json
{
  "type": "limits_changed",
  "maxDevices": 5,
  "activeDevices": 2,
  "purchasedSlots": 3
}
```

On `head_changed` → compare revision → `GET .../head` if changed.

---

## Error codes

| Code | HTTP | Action |
|------|------|--------|
| `VALIDATION_ERROR` | 400 | Fix request body |
| `PAIRING_CODE_INVALID` | 400 | Code expired/wrong — generate new |
| `UNLOCK_CODE_INVALID` | 400 | Invalid unlock code |
| `DEVICE_TOKEN_INVALID` | 401 | Re-pair or recover |
| `RECOVERY_INVALID` | 401 | Wrong recovery proof |
| `DEVICE_LIMIT_PAYMENT_REQUIRED` | 403 | Upgrade / unlock UI |
| `DEVICE_LIMIT_BLOCKED` | 403 | Revoke a device |
| `NAMESPACE_NOT_FOUND` | 404 | Check namespaceId |
| `DOCUMENT_NOT_FOUND` | 404 | No push yet — expected on first pull |
| `NAMESPACE_EXISTS` | 409 | Use pair or recover |
| `REVISION_CONFLICT` | 409 | Read `details.remoteMeta`, run conflict UX |
| `ENVELOPE_TOO_LARGE` | 413 | Shrink snapshot (default max ~50 MB) |
| `ENVELOPE_INVALID` | 422 | Fix envelope schema/hash |
| `RATE_LIMIT_EXCEEDED` | 429 | `Retry-After`, `error.details.rateLimit`, matching `RateLimit-*` headers |
| `APP_ID_REQUIRED` | 400 | Send `X-ESR-App-Id` (relay has app registry) |
| `APP_ORIGIN_REQUIRED` | 400 | Web client missing `Origin` |
| `APP_ORIGIN_NOT_ALLOWED` | 403 | Origin not registered for app |
| `APP_NAMESPACE_MISMATCH` | 403 | Namespace belongs to another app |
| `APP_NOT_FOUND` | 403 | Unknown `appId` |
| `APP_SUSPENDED` | 403 | Operator suspended app |
| `APP_PAIRING_NOT_ALLOWED` | 403 | App not in pairing token `allowedAppIds` |
| `APP_CLIENT_SECRET_INVALID` | 401 | Wrong native client secret |
| `APP_NOT_VERIFIED` | 403 | App pending verification |
| `APP_NATIVE_ID_REQUIRED` | 400 | Missing platform/bundle headers |

See [16-APP-REGISTRY.md](https://github.com/kemalersin/senkronla/blob/main/docs/envelope-sync-relay/en/16-APP-REGISTRY.md) for full app error list.

---

## App registry admin & developer APIs

When `apps.enabled: true`, operators and (in `self_service` mode) developers manage apps out-of-band from sync routes.

| Audience | Base | Auth | Web UI |
|----------|------|------|--------|
| Operator | `/v1/admin/apps` | `ESR_ADMIN_TOKEN` | `/operator` (Apps tab) |
| Developer | `/v1/developer/*` | JWT from `/developer/login` | `/developer` |

OpenAPI: repo root `openapi.yaml` (tags **Applications**, **Developer**, **Admin**). Operator guide: [docs/OPERATOR.md](https://github.com/kemalersin/senkronla/blob/main/docs/OPERATOR.md).

**v1.2 → v1.3 migration:** keep `apps.enabled: false` until clients send app headers; then enable registry, seed or register apps, set `legacyDefaultAppId` for existing namespaces. Details: [16-APP-REGISTRY §19](https://github.com/kemalersin/senkronla/blob/main/docs/envelope-sync-relay/en/16-APP-REGISTRY.md#19-migration-from-v12).

---

## Relay quotas & size limits

Defaults (operator-configurable via `config.yaml` / `ESR_*`):

| Quota | Default | Scope | Window |
|-------|---------|-------|--------|
| General API | 300 / minute | Client IP | 1 min |
| Document push | 120 / hour | Device | 1 hour |
| Pairing redeem | 20 / hour | Namespace | 1 hour |
| Pairing token | 30 / hour | Namespace | 1 hour |
| Recovery | 5 / hour | Namespace | 1 hour |

**Max envelope size:** 52,428,800 bytes (50 MB) — `sync.maxEnvelopeBytes` / `ESR_MAX_ENVELOPE_BYTES`.

**Headers:** `RateLimit-*` for `global_ip`; push uses `RateLimit-PutDocument-*`; recover/pair/pairing-token use their prefixed headers. `Reset` = seconds until window rolls.

**JSON `rateLimits` (success only):** Keys: `global_ip`, `put_document`, `recover`, `pair_device`, `pairing_token`. Each value: `{ action, limit, remaining, resetAfterSeconds, windowSeconds }`.

**Push:** Every successful `PUT .../documents/{documentId}` consumes `put_document` quota (default 120/hour per device).

**429:** `error.details.rateLimit` (single object); no top-level `rateLimits` on errors. Use `Retry-After`.

Exempt from `global_ip`: `/health`, `/metrics`, WebSocket notifications.

---

*Senkronla REST API agent reference · `/v1` · ESR deployment out of scope*
