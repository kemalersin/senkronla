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

## Full list

| HTTP | code | Description | details |
|------|------|-------------|---------|
| 400 | VALIDATION_ERROR | Request body or path invalid | `{ fields: [...] }` |
| 400 | INVALID_DOCUMENT_ID | Path `documentId` format invalid | `{ documentId }` |
| 400 | PAIRING_CODE_INVALID | Code wrong, expired, or already used | — |
| 400 | UNLOCK_CODE_INVALID | Unlock code invalid or expired | — |
| 401 | UNAUTHORIZED | Authorization header missing | — |
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

## Application registry (v1.3 — planned)

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
| 403 | APP_ORIGIN_NOT_ALLOWED | `Origin` not in registered origins | `{ origin }` |
| 403 | APP_BUNDLE_NOT_ALLOWED | Bundle/package not registered | `{ platform, bundleId }` |
| 403 | APP_NAMESPACE_MISMATCH | Namespace belongs to another app | — |
| 403 | APP_PAIRING_NOT_ALLOWED | App not in pairing token `allowedAppIds` | `{ allowedAppIds }` |
| 409 | APP_ORIGIN_EXISTS | Origin already registered | — |
| 409 | APP_BUNDLE_EXISTS | Bundle already registered for app | — |

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

## Log level

| HTTP | Log |
|------|-----|
| 4xx | warn (payload redacted) |
| 5xx | error + stack |
