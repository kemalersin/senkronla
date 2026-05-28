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

### 6.1 Head meta (lightweight)

```http
GET /v1/namespaces/{namespaceId}/documents/primary/head/meta
Authorization: Bearer {device_token}
```

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
GET /v1/namespaces/{namespaceId}/documents/primary/head
Authorization: Bearer {device_token}
```

**200:** Full `EsrDocEnvelope` JSON.

### 6.3 Push

```http
PUT /v1/namespaces/{namespaceId}/documents/primary
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

## 9. Health

```http
GET /health
```

```json
{ "status": "ok", "version": "1.1.0", "db": "ok", "blob": "ok", "websocket": "enabled" }
```

WebSocket endpoints: [13-WEBSOCKET-NOTIFICATIONS.md](./13-WEBSOCKET-NOTIFICATIONS.md) — outside OpenAPI scope.

## 10. Rate limiting

| Endpoint group | Limit |
|----------------|-------|
| POST recover | 5 / hour / namespace |
| POST devices (pair) | 20 / hour / namespace |
| POST pairing-tokens | 30 / hour / namespace |
| PUT primary | 120 / hour / device |
| General | 300 req / min / IP |

Exceeded: **429** `RATE_LIMIT_EXCEEDED`, `Retry-After` header.

## 11. CORS

For self-host SPA clients:

```
Access-Control-Allow-Origin: configurable (default *)
Access-Control-Allow-Headers: Authorization, Content-Type
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
```

Production operators should use an origin whitelist.

Full list of error codes: [12-ERROR-CODES.md](./12-ERROR-CODES.md).
