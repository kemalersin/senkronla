# 04 — API Reference

Base URL: `https://{host}/v1`

All requests/responses use `Content-Type: application/json; charset=utf-8` unless noted.

## 1. Authentication

| Context | Header |
|--------|--------|
| Namespace operations | `Authorization: Bearer {device_token}` |
| Admin operations | `Authorization: Bearer {admin_api_token}` |
| Namespace creation | No auth (protected by recovery hash) |
| Pairing token redeem | No auth (token is single-use) |
| Recovery | No auth (recovery proof in body) |

`device_token`: opaque string, min 32 byte random, base64url encode recommended.

## 2. Standard error body

```json
{
  "error": {
    "code": "DEVICE_LIMIT_PAYMENT_REQUIRED",
    "message": "Human readable Turkish or English message",
    "details": {}
  }
}
```

HTTP status → `error.code` mapping: [12-ERROR-CODES.md](./12-ERROR-CODES.md).

## 3. Namespace lifecycle

### 3.1 Create namespace (host)

```http
POST /v1/namespaces
```

**`namespaceId`:** UUID v4 required (server validates).

**Body:**

```json
{
  "namespaceId": "550e8400-e29b-41d4-a716-446655440000",
  "namespaceLabel": "Personal Workspace",
  "recoveryKeyProof": {
    "salt": "<base64url>",
    "hash": "<base64url argon2id hash of recovery phrase>"
  },
  "deviceLabel": "My Laptop",
  "clientDeviceId": "7c9e6679-7425-40de-944b-e07fc1f90ae7"
}
```

**Note:** `recoveryKeyProof` — the client does not send the recovery phrase to the server; only salt+hash. The same proof is repeated in the recovery flow (see doc 05).

**201 Response:**

```json
{
  "namespaceId": "550e8400-e29b-41d4-a716-446655440000",
  "deviceToken": "dvt_xxxxxxxxxxxxxxxx",
  "deviceId": "01JFAAAA...",
  "limits": {
    "freeDeviceLimit": 2,
    "purchasedSlots": 0,
    "maxDevices": 2,
    "activeDevices": 1
  },
  "recoveryKeyDisplay": {
    "phrase": "word1 word2 ... word24",
    "warning": "Store this recovery key securely. It will not be shown again."
  }
}
```

**Note:** `recoveryKeyDisplay.phrase` is returned only once in the create response (server generates phrase or client generates and sends hash — **preference: client generates, only hash goes to server**).

**Recommended create flow (client generates recovery):**

```json
{
  "namespaceId": "...",
  "namespaceLabel": "...",
  "recoveryKeyHash": "<argon2id>",
  "recoveryKeySalt": "<base64url>",
  "deviceLabel": "...",
  "clientDeviceId": "..."
}
```

Server never sees the phrase. No `recoveryKeyDisplay` in create response; client already displayed the phrase.

**409:** `namespaceId` already exists → `NAMESPACE_EXISTS`

### 3.2 Namespace info

```http
GET /v1/namespaces/{namespaceId}
Authorization: Bearer {device_token}
```

**200:**

```json
{
  "namespaceId": "...",
  "namespaceLabel": "...",
  "limits": {
    "freeDeviceLimit": 2,
    "purchasedSlots": 3,
    "maxDevices": 5,
    "activeDevices": 2
  },
  "head": {
    "revision": "01JF...",
    "writtenAt": "2026-05-25T14:30:00.000Z",
    "deviceId": "...",
    "contentSha256": "...",
    "contentMagic": "ENV-ENC1",
    "sizeBytes": 842016
  },
  "lastSyncAt": "2026-05-25T14:30:00.000Z"
}
```

`head` is null if no push yet.

### 3.3 Delete namespace (recovery required)

```http
DELETE /v1/namespaces/{namespaceId}
Authorization: Bearer {device_token}
Body: { "recoveryKeyProof": { "salt", "hash" } }
```

**204** or recovery with admin token. MVP: recovery proof required.

## 4. Device management

### 4.1 Device list

```http
GET /v1/namespaces/{namespaceId}/devices
Authorization: Bearer {device_token}
```

**200:**

```json
{
  "devices": [
    {
      "deviceId": "01JF...",
      "clientDeviceId": "7c9e6679-...",
      "label": "My Laptop",
      "pairedAt": "2026-05-20T10:00:00.000Z",
      "lastSeenAt": "2026-05-25T14:00:00.000Z",
      "isCurrent": true
    }
  ],
  "limits": { "maxDevices": 5, "activeDevices": 2 }
}
```

`isCurrent`: device that owns the token.

### 4.2 Create pairing token (host or existing device)

```http
POST /v1/namespaces/{namespaceId}/pairing-tokens
Authorization: Bearer {device_token}
```

**Body (optional):**

```json
{ "ttlSeconds": 600 }
```

Default TTL: 600 (10 min). Max: 3600.

**201:**

```json
{
  "code": "847291",
  "expiresAt": "2026-05-25T14:40:00.000Z",
  "qrPayload": "esr://pair/v1/{namespaceId}?code=847291&exp=..."
}
```

- `code`: 6 digit numeric
- Single use; invalidated after redeem

**403 DEVICE_LIMIT_PAYMENT_REQUIRED** or **403 DEVICE_LIMIT_BLOCKED** — no token generated if no slot available.

### 4.3 Redeem pairing token (new device)

```http
POST /v1/namespaces/{namespaceId}/devices
```

**No auth.**

**Body:**

```json
{
  "pairingCode": "847291",
  "deviceLabel": "Phone",
  "clientDeviceId": "a1b2c3d4-..."
}
```

**201:**

```json
{
  "deviceToken": "dvt_yyyyyyyyyyyyyyyy",
  "deviceId": "01JFBBBB...",
  "limits": { "maxDevices": 5, "activeDevices": 3 }
}
```

**400:** invalid/expired code → `PAIRING_CODE_INVALID`
**403:** slot limit → `DEVICE_LIMIT_*`

### 4.4 Remove device

```http
DELETE /v1/namespaces/{namespaceId}/devices/{deviceId}
Authorization: Bearer {device_token}
```

- Any paired device can remove itself or another device (MVP)
- **Exception:** Last remaining device cannot be removed → `LAST_DEVICE_PROTECTED`
- No host priority; at least 1 device must remain except via recovery

**204:** slot freed.

## 5. Recovery

```http
POST /v1/namespaces/{namespaceId}/recover
```

**Body:**

```json
{
  "recoveryKeyProof": {
    "salt": "<base64url>",
    "hash": "<base64url>"
  },
  "deviceLabel": "Recovered Laptop",
  "clientDeviceId": "new-uuid"
}
```

**200:**

```json
{
  "deviceToken": "dvt_new...",
  "deviceId": "01JFNEW...",
  "revokedDeviceCount": 2,
  "limits": {
    "freeDeviceLimit": 2,
    "purchasedSlots": 3,
    "maxDevices": 5,
    "activeDevices": 1
  }
}
```

- All old `device_token` invalidated
- `purchasedSlots` **preserved**
- Blob/head revision **preserved** (data not deleted)

**401:** `RECOVERY_INVALID`

## 6. Document sync

The API supports **multiple documents per namespace**. Paths use `{documentId}` (lowercase `[a-z][a-z0-9_-]{0,62}`). Legacy `/documents/primary/*` routes remain valid aliases.

| `schemaVersion` | `documentId` in envelope |
|-----------------|--------------------------|
| `1` | Must be `"primary"` |
| `2` | Any valid id; must match URL path |

### 6.0 List document heads

```http
GET /v1/namespaces/{namespaceId}/documents
Authorization: Bearer {device_token}
```

**200:**

```json
{
  "documents": [
    {
      "documentId": "primary",
      "revision": "01JF...",
      "writtenAt": "...",
      "deviceId": "...",
      "contentSha256": "...",
      "contentMagic": "ENV-RAW1",
      "sizeBytes": 128
    },
    {
      "documentId": "settings",
      "revision": "01JK...",
      "writtenAt": "...",
      "deviceId": "...",
      "contentSha256": "...",
      "contentMagic": "ENV-ENC1",
      "sizeBytes": 512
    }
  ]
}
```

Empty namespace (no push yet): `{ "documents": [] }`.

### 6.1 Head meta (lightweight)

```http
GET /v1/namespaces/{namespaceId}/documents/{documentId}/head/meta
Authorization: Bearer {device_token}
```

Alias: `GET .../documents/primary/head/meta`

**200:**

```json
{
  "revision": "01JF...",
  "writtenAt": "...",
  "deviceId": "...",
  "contentSha256": "...",
  "contentMagic": "ENV-ENC1",
  "sizeBytes": 842016
}
```

**404:** `DOCUMENT_NOT_FOUND` (no push yet)

### 6.2 Head full envelope

```http
GET /v1/namespaces/{namespaceId}/documents/{documentId}/head
```

Alias: `GET .../documents/primary/head`
Authorization: Bearer {device_token}
```

**200:** Full `EsrDocEnvelope` JSON.

### 6.3 Push

```http
PUT /v1/namespaces/{namespaceId}/documents/{documentId}
```

Alias: `PUT .../documents/primary`
Authorization: Bearer {device_token}
```

**Body:**

```json
{
  "expectedRevision": "01JFOLD..." ,
  "envelope": { "...ESR-DOC1..." }
}
```

- `expectedRevision`: `null` or omit → only allowed if no head (first push)
- if head exists, `expectedRevision` **required** and must match head

**201:**

```json
{
  "revision": "01JFNEW...",
  "writtenAt": "...",
  "contentSha256": "..."
}
```

**409 Conflict:**

```json
{
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Remote revision differs from expected",
    "details": {
      "expectedRevision": "01JFOLD",
      "actualRevision": "01JFREMOTE",
      "remoteMeta": {
        "revision": "01JFREMOTE",
        "writtenAt": "...",
        "contentSha256": "...",
        "deviceId": "..."
      }
    }
  }
}
```

**422:** envelope validation / sha256 mismatch → `ENVELOPE_INVALID`

**422:** envelope `documentId` ≠ path → `ENVELOPE_DOCUMENT_MISMATCH`

**400:** invalid `{documentId}` path → `INVALID_DOCUMENT_ID`

**403:** too many documents in namespace → `DOCUMENT_LIMIT_REACHED` (config `sync.maxDocumentsPerNamespace`, default 32)

### 6.4 Device last seen (optional heartbeat)

```http
POST /v1/namespaces/{namespaceId}/devices/me/heartbeat
Authorization: Bearer {device_token}
```

**204** — update `lastSeenAt`.

## 7. Slot / Unlock

### 7.1 Query limits

```http
GET /v1/namespaces/{namespaceId}/limits
Authorization: Bearer {device_token}
```

**200:**

```json
{
  "freeDeviceLimit": 2,
  "purchasedSlots": 0,
  "maxDevices": 2,
  "activeDevices": 2,
  "onLimitReached": {
    "mode": "payment",
    "slotPackages": [3, 5, 10]
  },
  "canAddDevice": false
}
```

### 7.2 Apply unlock code

```http
POST /v1/namespaces/{namespaceId}/unlock
Authorization: Bearer {device_token}
```

**Body:**

```json
{
  "unlockCode": "ESR-UNLK-3-XXXXXXXXXXXX"
}
```

**200:**

```json
{
  "slotsAdded": 3,
  "purchasedSlots": 3,
  "maxDevices": 5,
  "canAddDevice": true
}
```

**400:** `UNLOCK_CODE_INVALID` | `UNLOCK_CODE_ALREADY_REDEEMED`

### 7.3 Get checkout URL (optional — payment mode)

```http
POST /v1/namespaces/{namespaceId}/checkout
Authorization: Bearer {device_token}
```

**Body:**

```json
{
  "packageSize": 3,
  "successRedirectUrl": "myapp://sync/unlock-success",
  "cancelRedirectUrl": "myapp://sync/unlock-cancel"
}
```

**200:**

```json
{
  "checkoutUrl": "https://pay.example.com/...",
  "sessionId": "cs_..."
}
```

Webhook → unlock code or direct slot increase (doc 06).

## 8. Admin API (optional MVP — CLI alternative)

All admin endpoints use `Authorization: Bearer {admin_api_token}`.

### 8.1 Generate unlock code

```http
POST /v1/admin/unlock-codes
```

```json
{
  "namespaceId": "550e8400-...",
  "slots": 3,
  "expiresAt": "2027-05-25T00:00:00.000Z",
  "note": "Manual payment #1234"
}
```

**201:**

```json
{
  "unlockCode": "ESR-UNLK-3-K7M9P2Q4R6T8",
  "slots": 3,
  "expiresAt": "..."
}
```

### 8.2 Manually set namespace slots

```http
PATCH /v1/admin/namespaces/{namespaceId}/slots
```

```json
{ "purchasedSlotsDelta": 3 }
```

### 8.3 Read server config (read-only)

```http
GET /v1/admin/config
```

### 8.4 Read sync settings (retention)

```http
GET /v1/admin/settings/sync
```

**200:**

```json
{
  "revisionRetentionDays": 0,
  "revisionRetentionCount": 0,
  "maxDocumentsPerNamespace": 32,
  "maxEnvelopeBytes": 52428800
}
```

Config keys: `sync.revisionRetentionDays` (`ESR_REVISION_RETENTION_DAYS`), `sync.revisionRetentionCount` (`ESR_REVISION_RETENTION_COUNT`). See [07-SERVER-CONFIGURATION.md](./07-SERVER-CONFIGURATION.md) and [15-MULTI-DOCUMENT.md §8.4](./15-MULTI-DOCUMENT.md#84-document_revisions-history).

### 8.5 Purge old revisions (manual)

```http
POST /v1/admin/revisions/purge
```

```json
{
  "mode": "date",
  "before": "2026-01-01T00:00:00.000Z",
  "scope": "namespace",
  "namespaceId": "550e8400-e29b-41d4-a716-446655440000"
}
```

Count mode example:

```json
{
  "mode": "count",
  "keepLastRevisions": 50,
  "scope": "app",
  "appId": "esr_app_example"
}
```

**200:**

```json
{
  "deletedRevisions": 12,
  "deletedBlobFiles": 12
}
```

Date mode always preserves the current head. Count mode includes the head in the keep limit. Operator portal: **Revisions** on namespace/app rows and deployment-wide under settings.

## 9. Health

```http
GET /health
```

```json
{ "status": "ok", "version": "1.1.0", "db": "ok", "blob": "ok", "websocket": "enabled" }
```

WebSocket endpoints: [13-WEBSOCKET-NOTIFICATIONS.md](./13-WEBSOCKET-NOTIFICATIONS.md) — outside OpenAPI scope.

## 10. Rate limiting

Configurable in `limits.rateLimit` (see [07-SERVER-CONFIGURATION.md](./07-SERVER-CONFIGURATION.md)). When enabled, counters use a sliding window in PostgreSQL.

| Action key (JSON) | HTTP header prefix | Default limit | Scope |
|-------------------|-------------------|---------------|--------|
| `global_ip` | `RateLimit-*` | 300 / minute | Client IP |
| `put_document` | `RateLimit-PutDocument-*` | 120 / hour | Device (`device_uuid`) |
| `pair_device` | `RateLimit-Pair-*` | 20 / hour | Namespace |
| `pairing_token` | `RateLimit-PairingToken-*` | 30 / hour | Namespace |
| `recover` | `RateLimit-Recover-*` | 5 / hour | Namespace |

Exempt from `global_ip`: `GET /health`, metrics path, Swagger `/docs`, WebSocket `.../notifications`.

**Document PUT quota:** Every successful `PUT /v1/namespaces/{namespaceId}/documents/{documentId}` (including `primary` and non-primary ids) consumes one `put_document` event. There is no separate “first push only” rule.

### 10.1 Quota in successful responses

**Headers:** `onSend` emits all quotas tracked on the request (`RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`; document PUT/recover/pair use prefixed names above). `Reset` is seconds until the oldest event in the window expires.

**JSON body `rateLimits`:** Present only on routes that call `withRateLimits()`:

| Method | Path pattern | Typical keys in `rateLimits` |
|--------|----------------|------------------------------|
| PUT | `.../documents/{documentId}` | `global_ip`, `put_document` |
| GET | `.../documents/{documentId}/head/meta` | `global_ip` only |
| GET | `.../documents/{documentId}/head` | `global_ip` only |
| GET | `.../documents` | `global_ip` only |
| POST | `.../recover` | `global_ip`, `recover` |
| POST | `.../pairing-tokens` | `global_ip`, `pairing_token` |
| POST | `.../devices` (pair redeem) | `global_ip`, `pair_device` |

No `rateLimits` object on: `POST /v1/namespaces`, `GET /v1/namespaces/{id}`, `GET .../devices`, `GET .../limits`, unlock, `DELETE .../devices/{id}` (headers may still include `global_ip`).

Each entry shape:

```json
"put_document": {
  "action": "put_document",
  "limit": 120,
  "remaining": 119,
  "resetAfterSeconds": 3600,
  "windowSeconds": 3600
}
```

### 10.2 Rate limit errors

Exceeded: **429** `RATE_LIMIT_EXCEEDED`.

- Header: `Retry-After` (seconds)
- Header: matching `RateLimit-*` for the exceeded action
- Body: `error.details.retryAfterSeconds`, `error.details.action`, `error.details.rateLimit` (single quota object, same fields as above). No top-level `rateLimits` on errors.

See [12-ERROR-CODES.md](./12-ERROR-CODES.md).

## 11. CORS

For self-host SPA clients:

```
Access-Control-Allow-Origin: configurable (default *)
Access-Control-Allow-Headers: Authorization, Content-Type
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
```

Production operators should use an origin whitelist.

Full list of error codes: [12-ERROR-CODES.md](./12-ERROR-CODES.md).
