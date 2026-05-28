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
| 404 | NOT_FOUND | General record not found | — |
| 404 | NAMESPACE_NOT_FOUND | Namespace not found | — |
| 404 | DOCUMENT_NOT_FOUND | No push yet (no head) | — |
| 404 | DEVICE_NOT_FOUND | Device id invalid | — |
| 409 | NAMESPACE_EXISTS | namespaceId conflict | — |
| 409 | REVISION_CONFLICT | expectedRevision != head | `{ expectedRevision, actualRevision, remoteMeta }` |
| 409 | UNLOCK_CODE_ALREADY_REDEEMED | Code already used | — |
| 413 | ENVELOPE_TOO_LARGE | maxEnvelopeBytes exceeded | `{ maxBytes, actualBytes }` |
| 422 | ENVELOPE_INVALID | Magic, schema, sha256 error | `{ reason: string }` |
| 429 | RATE_LIMIT_EXCEEDED | Rate limit | `{ retryAfterSeconds }` |
| 500 | INTERNAL_ERROR | Unexpected server error | — |

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
