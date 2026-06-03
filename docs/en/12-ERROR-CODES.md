# 12 — Error Codes

All API errors use the following JSON body:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": {}
  }
}
```

`message` may be shown on the client; however, **persistent UI logic must be built on `code`** (for multiple languages).

## Sync API (`/v1` — namespaces, documents, devices)

| HTTP | code | Description | details |
|------|------|-------------|---------|
| 400 | VALIDATION_ERROR | Request body or path invalid | `{ fields: [...] }` |
| 400 | INVALID_DOCUMENT_ID | Path `documentId` format invalid | `{ documentId }` |
| 400 | PAIRING_CODE_INVALID | Code wrong, expired, or already used | — |
| 400 | UNLOCK_CODE_INVALID | Unlock code invalid or expired | — |
| 401 | UNAUTHORIZED | Authorization header missing or invalid | — |
| 401 | DEVICE_TOKEN_INVALID | Token invalid or revoked | — |
| 401 | RECOVERY_INVALID | Recovery proof could not be verified | — |
| 403 | FORBIDDEN | General authorization denied | — |
| 403 | DEVICE_LIMIT_PAYMENT_REQUIRED | Slots full; payment/unlock required | `{ slotPackages: number[], maxDevices, activeDevices }` |
| 403 | DEVICE_LIMIT_BLOCKED | Slots full; block mode, no payment | `{ maxDevices, activeDevices }` |
| 403 | LAST_DEVICE_PROTECTED | Last device cannot be removed | — |
| 403 | CONTENT_TYPE_NOT_ALLOWED | contentType not in whitelist | — |
| 403 | DOCUMENT_LIMIT_REACHED | `maxDocumentsPerNamespace` exceeded | `{ maxDocumentsPerNamespace, documentCount }` |
| 403 | DOCUMENT_ID_NOT_ALLOWED | `documentId` not in `allowedDocumentIds` | `{ documentId, allowedDocumentIds }` |
| 404 | NOT_FOUND | General record not found | — |
| 404 | NAMESPACE_NOT_FOUND | Namespace not found | — |
| 404 | DOCUMENT_NOT_FOUND | No push yet (no head) | — |
| 404 | DEVICE_NOT_FOUND | Device id invalid | — |
| 409 | NAMESPACE_EXISTS | namespaceId conflict | — |
| 409 | REVISION_CONFLICT | expectedRevision != head | `{ expectedRevision, actualRevision, remoteMeta }` |
| 409 | UNLOCK_CODE_ALREADY_REDEEMED | Code already used | — |
| 413 | ENVELOPE_TOO_LARGE | maxEnvelopeBytes exceeded | `{ maxBytes, actualBytes }` |
| 422 | ENVELOPE_INVALID | Magic, schema, sha256 error | `{ reason: string }` |
| 422 | ENVELOPE_DOCUMENT_MISMATCH | Envelope `documentId` ≠ path `documentId` | `{ envelopeDocumentId, pathDocumentId }` |
| 429 | RATE_LIMIT_EXCEEDED | Rate limit | `{ retryAfterSeconds, action, rateLimit }` — `rateLimit` has `action`, `limit`, `remaining` (0), `resetAfterSeconds`, `windowSeconds`; also `Retry-After` and `RateLimit-*` headers |
| 500 | INTERNAL_ERROR | Unexpected server error | — |

## Application registry (v1.3 — shipped)

See [16-APP-REGISTRY.md](./16-APP-REGISTRY.md). Active when `apps.enabled: true`.

| HTTP | code | Description | details |
|------|------|-------------|---------|
| 400 | APP_ID_REQUIRED | Missing `X-ESR-App-Id` header | — |
| 400 | APP_ORIGIN_REQUIRED | Web client without `Origin` | — |
| 400 | APP_NATIVE_ID_REQUIRED | Native client missing platform/bundle headers | — |
| 401 | APP_CLIENT_SECRET_INVALID | Native confidential secret wrong | — |
| 403 | APP_NOT_FOUND | Unknown `appId` | — |
| 403 | APP_NOT_VERIFIED | App not in `active` status | `{ status }` |
| 403 | APP_SUSPENDED | Operator suspended app | — |
| 403 | APP_ARCHIVED | App archived — mutations blocked | — |
| 403 | APP_ORIGIN_NOT_ALLOWED | `Origin` not in registered origins | `{ origin }` |
| 403 | APP_BUNDLE_NOT_ALLOWED | Bundle/package not registered | `{ platform, bundleId }` |
| 403 | APP_NAMESPACE_MISMATCH | Namespace belongs to another app | — |
| 403 | APP_PAIRING_NOT_ALLOWED | App not in pairing token `allowedAppIds` | `{ allowedAppIds }` |
| 409 | APP_ORIGIN_EXISTS | Origin already registered | — |
| 409 | APP_BUNDLE_EXISTS | Bundle already registered for app | — |
| 422 | APP_ORIGIN_VERIFICATION_FAILED | DNS or HTTPS origin verification failed | `{ origin, method, reason }` |

## Admin API (`/v1/admin/*`)

| HTTP | code | Description | details |
|------|------|-------------|---------|
| 401 | UNAUTHORIZED | Admin token missing or invalid | — |
| 503 | ADMIN_API_DISABLED | `ESR_ADMIN_TOKEN` not configured | — |

Other admin routes reuse sync and app-registry codes (`NOT_FOUND`, `VALIDATION_ERROR`, `APP_ARCHIVED`, etc.).

## Developer portal (`/v1/developer/*`)

Active when `apps.enabled: true`, `registrationMode: self_service`, and JWT secret is configured.

| HTTP | code | Description | details |
|------|------|-------------|---------|
| 400 | INVALID_TOKEN | Email verification or password-reset token invalid/expired | — |
| 400 | VALIDATION_ERROR | Request body invalid | `{ fields: [...] }` |
| 401 | UNAUTHORIZED | Developer JWT missing or invalid | — |
| 401 | DEVELOPER_INVALID_CREDENTIALS | Wrong email or password | — |
| 403 | DEVELOPER_EMAIL_NOT_VERIFIED | Email not verified yet | — |
| 403 | DEVELOPER_ACCOUNT_DISABLED | Operator disabled account | — |
| 403 | DEVELOPER_FORBIDDEN | App does not belong to signed-in developer | — |
| 403 | DEVELOPER_APP_LIMIT_REACHED | Per-developer app quota exceeded | `{ limit }` |
| 409 | DEVELOPER_EMAIL_EXISTS | Email already registered | `{ email }` |
| 429 | RATE_LIMIT_EXCEEDED | Auth mail rate limit | `{ retryAfterSeconds, action, rateLimit }` |
| 503 | DEVELOPER_PORTAL_DISABLED | Portal not enabled or JWT secret missing | — |
| 503 | MAIL_NOT_CONFIGURED | Outbound mail not configured | — |

## WebSocket notifications (`/v1/namespaces/:id/notifications`)

Delivered as `{ "type": "error", "code": "...", "message": "..." }` — not HTTP. See [13-WEBSOCKET-NOTIFICATIONS.md](./13-WEBSOCKET-NOTIFICATIONS.md).

| code | Description |
|------|-------------|
| WS_AUTH_REQUIRED | Auth message not received in time |
| WS_AUTH_INVALID | Device token invalid or revoked |
| WS_NAMESPACE_MISMATCH | Token namespace ≠ path |
| WS_TOO_MANY_CONNECTIONS | Per-device connection limit exceeded |
| WS_INVALID_MESSAGE | Malformed JSON or message shape |
| WS_INVALID_SUBSCRIBE | Invalid `subscribe` payload |

When `websocket.enabled: false`, the upgrade route is not registered (HTTP `404`).

## SDK client-only codes (`@senkronla/client`)

Thrown locally by the SDK before or instead of a relay round-trip. Also surfaced as `EsrError.code`. Relay errors pass through unchanged.

| code | Description |
|------|-------------|
| ESR_CLIENT_NO_TOKEN | No device token — call `ensureNamespace`, `joinPairing`, or `recover` |
| ESR_CLIENT_OFFLINE | Network unavailable |
| ESR_CLIENT_NO_FETCH | Fetch API not available in environment |
| ESR_CLIENT_HTTP_ERROR | HTTP error without parseable `error.code` |
| ESR_CLIENT_SYNC_FAILED | Unexpected sync failure |
| ESR_CLIENT_NAMESPACE_EXISTS | Namespace already exists — use pairing or recovery |
| ESR_CLIENT_CONFLICT_CANCELLED | User cancelled `onConflict` |
| ESR_CLIENT_NO_DOCUMENT | `EsrSync.connect` missing `document` / `documents` |
| ESR_CLIENT_UNKNOWN_DOCUMENT_ID | `sync(documentId)` not in configured documents |
| ESR_CLIENT_INVALID_DOCUMENT_ID | `documentId` format invalid |
| ESR_CLIENT_INVALID_DOCUMENT_SLOT | Invalid entry in `documents[]` |
| ESR_CLIENT_DUPLICATE_DOCUMENT_ID | Duplicate id in `documents[]` |
| ESR_CLIENT_NAMESPACE_MISMATCH | Multi-document config namespace mismatch |
| ESR_CLIENT_ENCRYPTION_PASSWORD_REQUIRED | Password missing for ENV-ENC1 |
| ESR_CLIENT_UNSUPPORTED_CONTENT | Unsupported inner content magic |
| ESR_CLIENT_INVALID_ENVELOPE | Envelope build/parse failed |

## Web portal proxy (Next.js BFF)

Returned by `/api/developer/*` and `/api/operator/*` when the relay cannot be reached:

| HTTP | code | Description |
|------|------|-------------|
| 401 | UNAUTHORIZED | Portal session cookie missing or invalid |
| 502 | RELAY_UNREACHABLE | Relay API unreachable from web app |

## Client mapping (recommended)

```typescript
export function isDeviceLimitError(e: EsrError): boolean {
  return e.code === 'DEVICE_LIMIT_PAYMENT_REQUIRED' ||
         e.code === 'DEVICE_LIMIT_BLOCKED'
}

export function isConflictError(e: EsrError): boolean {
  return e.code === 'REVISION_CONFLICT'
}
```

## Retry policy

| code | Retry |
|------|-------|
| 429 | Yes, Retry-After |
| 500 | Yes, exponential backoff (max 3) |
| 409 REVISION_CONFLICT | No — conflict UI |
| 403 DEVICE_LIMIT_* | No — unlock UI |
| 401 DEVICE_TOKEN_INVALID | No — re-pair or recovery |
| ESR_CLIENT_OFFLINE | Yes, when online |

## Log level

| HTTP | Log |
|------|-----|
| 4xx | warn (payload redacted) |
| 5xx | error + stack |
