# 12 — Hata Kodları

Tüm API hataları aşağıdaki JSON gövdesini kullanır:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": {}
  }
}
```

`message` istemci tarafından gösterilebilir; ancak **kalıcı UI mantığı `code` üzerinden** kurulmalıdır (çoklu dil için).

## Tam liste

| HTTP | code | Açıklama | details |
|------|------|----------|---------|
| 400 | VALIDATION_ERROR | Request body veya path geçersiz | `{ fields: [...] }` |
| 400 | INVALID_DOCUMENT_ID | Path `documentId` formatı geçersiz | `{ documentId }` |
| 400 | PAIRING_CODE_INVALID | Kod yanlış, süresi dolmuş veya kullanılmış | — |
| 400 | UNLOCK_CODE_INVALID | Unlock kodu geçersiz veya süresi dolmuş | — |
| 401 | UNAUTHORIZED | Authorization header eksik | — |
| 401 | DEVICE_TOKEN_INVALID | Token geçersiz veya revoke edilmiş | — |
| 401 | RECOVERY_INVALID | Recovery proof doğrulanamadı | — |
| 403 | FORBIDDEN | Genel yetki reddi | — |
| 403 | DEVICE_LIMIT_PAYMENT_REQUIRED | Slot dolu; ödeme/unlock gerekli | `{ slotPackages: number[], maxDevices, activeDevices }` |
| 403 | DEVICE_LIMIT_BLOCKED | Slot dolu; mod block, ödeme yok | `{ maxDevices, activeDevices }` |
| 403 | LAST_DEVICE_PROTECTED | Son cihaz kaldırılamaz | — |
| 403 | CONTENT_TYPE_NOT_ALLOWED | contentType whitelist'te yok | — |
| 403 | DOCUMENT_LIMIT_REACHED | `maxDocumentsPerNamespace` aşıldı | `{ maxDocumentsPerNamespace, documentCount }` |
| 403 | DOCUMENT_ID_NOT_ALLOWED | `documentId` `allowedDocumentIds` içinde değil | `{ documentId, allowedDocumentIds }` |
| 404 | NOT_FOUND | Genel kayıt yok | — |
| 404 | NAMESPACE_NOT_FOUND | Namespace bulunamadı | — |
| 404 | DOCUMENT_NOT_FOUND | Henüz push yok (head yok) | — |
| 404 | DEVICE_NOT_FOUND | Cihaz id geçersiz | — |
| 409 | NAMESPACE_EXISTS | namespaceId çakışması | — |
| 409 | REVISION_CONFLICT | expectedRevision != head | `{ expectedRevision, actualRevision, remoteMeta }` |
| 409 | UNLOCK_CODE_ALREADY_REDEEMED | Kod daha önce kullanılmış | — |
| 413 | ENVELOPE_TOO_LARGE | maxEnvelopeBytes aşıldı | `{ maxBytes, actualBytes }` |
| 422 | ENVELOPE_INVALID | Magic, schema, sha256 hatası | `{ reason: string }` |
| 422 | ENVELOPE_DOCUMENT_MISMATCH | Zarf `documentId` ≠ path `documentId` | `{ envelopeDocumentId, pathDocumentId }` |
| 429 | RATE_LIMIT_EXCEEDED | Rate limit | `{ retryAfterSeconds, action, rateLimit }` — `rateLimit`: `action`, `limit`, `remaining` (0), `resetAfterSeconds`, `windowSeconds`; ayrıca `Retry-After` ve `RateLimit-*` başlıkları |
| 500 | INTERNAL_ERROR | Beklenmeyen sunucu hatası | — |

## Uygulama kaydı (v1.3 — yayında)

Bkz. [16-APP-REGISTRY.md](./16-APP-REGISTRY.md). `apps.enabled: true` iken geçerli.

| HTTP | code | Açıklama | details |
|------|------|----------|---------|
| 400 | APP_ID_REQUIRED | `X-ESR-App-Id` header eksik | — |
| 400 | APP_ORIGIN_REQUIRED | Web istemcisinde `Origin` yok | — |
| 400 | APP_NATIVE_ID_REQUIRED | Native header eksik | — |
| 401 | APP_CLIENT_SECRET_INVALID | Native secret yanlış | — |
| 403 | APP_NOT_FOUND | Bilinmeyen `appId` | — |
| 403 | APP_NOT_VERIFIED | App `active` değil | `{ status }` |
| 403 | APP_SUSPENDED | Operatör askıya aldı | — |
| 403 | APP_ORIGIN_NOT_ALLOWED | Origin kayıtlı değil | `{ origin }` |
| 403 | APP_BUNDLE_NOT_ALLOWED | Bundle kayıtlı değil | `{ platform, bundleId }` |
| 403 | APP_NAMESPACE_MISMATCH | Namespace başka app'e ait | — |
| 403 | APP_PAIRING_NOT_ALLOWED | `allowedAppIds` dışında | `{ allowedAppIds }` |
| 409 | APP_ORIGIN_EXISTS | Origin zaten kayıtlı | — |
| 409 | APP_BUNDLE_EXISTS | Bundle zaten kayıtlı | — |

## İstemci eşlemesi (önerilen)

```typescript
export function isDeviceLimitError(e: EsrError): boolean {
  return e.code === 'DEVICE_LIMIT_PAYMENT_REQUIRED' ||
         e.code === 'DEVICE_LIMIT_BLOCKED'
}

export function isConflictError(e: EsrError): boolean {
  return e.code === 'REVISION_CONFLICT'
}
```

## Retry politikası

| code | Retry |
|------|-------|
| 429 | Evet, Retry-After |
| 500 | Evet, exponential backoff (max 3) |
| 409 REVISION_CONFLICT | Hayır — conflict UI |
| 403 DEVICE_LIMIT_* | Hayır — unlock UI |
| 401 DEVICE_TOKEN_INVALID | Hayır — re-pair veya recovery |

## Log seviyesi

| HTTP | Log |
|------|-----|
| 4xx | warn (payload redacted) |
| 5xx | error + stack |
