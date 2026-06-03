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

## Sync API (`/v1` — namespace, belge, cihaz)

| HTTP | code | Açıklama | details |
|------|------|----------|---------|
| 400 | VALIDATION_ERROR | Request body veya path geçersiz | `{ fields: [...] }` |
| 400 | INVALID_DOCUMENT_ID | Path `documentId` formatı geçersiz | `{ documentId }` |
| 400 | PAIRING_CODE_INVALID | Kod yanlış, süresi dolmuş veya kullanılmış | — |
| 400 | UNLOCK_CODE_INVALID | Unlock kodu geçersiz veya süresi dolmuş | — |
| 401 | UNAUTHORIZED | Authorization header eksik veya geçersiz | — |
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
| 403 | APP_ARCHIVED | App arşivlendi — mutasyon engelli | — |
| 403 | APP_ORIGIN_NOT_ALLOWED | Origin kayıtlı değil | `{ origin }` |
| 403 | APP_BUNDLE_NOT_ALLOWED | Bundle kayıtlı değil | `{ platform, bundleId }` |
| 403 | APP_NAMESPACE_MISMATCH | Namespace başka app'e ait | — |
| 403 | APP_PAIRING_NOT_ALLOWED | `allowedAppIds` dışında | `{ allowedAppIds }` |
| 409 | APP_ORIGIN_EXISTS | Origin zaten kayıtlı | — |
| 409 | APP_BUNDLE_EXISTS | Bundle zaten kayıtlı | — |
| 422 | APP_ORIGIN_VERIFICATION_FAILED | DNS veya HTTPS origin doğrulaması başarısız | `{ origin, method, reason }` |

## Admin API (`/v1/admin/*`)

| HTTP | code | Açıklama | details |
|------|------|----------|---------|
| 401 | UNAUTHORIZED | Admin token eksik veya geçersiz | — |
| 503 | ADMIN_API_DISABLED | `ESR_ADMIN_TOKEN` yapılandırılmamış | — |

Diğer admin rotaları sync ve app-registry kodlarını yeniden kullanır (`NOT_FOUND`, `VALIDATION_ERROR`, `APP_ARCHIVED` vb.).

## Geliştirici portalı (`/v1/developer/*`)

`apps.enabled: true`, `registrationMode: self_service` ve JWT secret ayarlı iken geçerli.

| HTTP | code | Açıklama | details |
|------|------|----------|---------|
| 400 | INVALID_TOKEN | E-posta doğrulama veya şifre sıfırlama token'ı geçersiz/süresi dolmuş | — |
| 400 | VALIDATION_ERROR | İstek gövdesi geçersiz | `{ fields: [...] }` |
| 401 | UNAUTHORIZED | Developer JWT eksik veya geçersiz | — |
| 401 | DEVELOPER_INVALID_CREDENTIALS | Yanlış e-posta veya parola | — |
| 403 | DEVELOPER_EMAIL_NOT_VERIFIED | E-posta henüz doğrulanmadı | — |
| 403 | DEVELOPER_ACCOUNT_DISABLED | Operatör hesabı devre dışı bıraktı | — |
| 403 | DEVELOPER_FORBIDDEN | App bu geliştiriciye ait değil | — |
| 403 | DEVELOPER_APP_LIMIT_REACHED | Geliştirici app kotası doldu | `{ limit }` |
| 409 | DEVELOPER_EMAIL_EXISTS | E-posta zaten kayıtlı | `{ email }` |
| 429 | RATE_LIMIT_EXCEEDED | Auth mail rate limit | `{ retryAfterSeconds, action, rateLimit }` |
| 503 | DEVELOPER_PORTAL_DISABLED | Portal kapalı veya JWT secret eksik | — |
| 503 | MAIL_NOT_CONFIGURED | Giden posta yapılandırılmamış | — |

## WebSocket bildirimleri (`/v1/namespaces/:id/notifications`)

HTTP değil; `{ "type": "error", "code": "...", "message": "..." }` olarak iletilir. Bkz. [13-WEBSOCKET-NOTIFICATIONS.md](./13-WEBSOCKET-NOTIFICATIONS.md).

| code | Açıklama |
|------|----------|
| WS_AUTH_REQUIRED | Auth mesajı zamanında alınmadı |
| WS_AUTH_INVALID | Cihaz token geçersiz veya revoke |
| WS_NAMESPACE_MISMATCH | Token namespace ≠ path |
| WS_TOO_MANY_CONNECTIONS | Cihaz başına bağlantı limiti aşıldı |
| WS_INVALID_MESSAGE | Hatalı JSON veya mesaj şekli |
| WS_INVALID_SUBSCRIBE | Geçersiz `subscribe` gövdesi |

`websocket.enabled: false` iken upgrade rotası kayıtlı değildir (HTTP `404`).

## SDK istemci kodları (`@senkronla/client`)

Relay çağrısından önce veya yerine SDK tarafından fırlatılır. Relay hataları olduğu gibi geçer.

| code | Açıklama |
|------|----------|
| ESR_CLIENT_NO_TOKEN | Cihaz token yok — `ensureNamespace`, `joinPairing` veya `recover` |
| ESR_CLIENT_OFFLINE | Ağ yok |
| ESR_CLIENT_NO_FETCH | Ortamda Fetch API yok |
| ESR_CLIENT_HTTP_ERROR | Parse edilemeyen HTTP hatası |
| ESR_CLIENT_SYNC_FAILED | Beklenmeyen sync hatası |
| ESR_CLIENT_NAMESPACE_EXISTS | Namespace zaten var — eşleştirme/kurtarma |
| ESR_CLIENT_CONFLICT_CANCELLED | Kullanıcı `onConflict` iptal etti |
| ESR_CLIENT_NO_DOCUMENT | `EsrSync.connect` içinde `document` / `documents` eksik |
| ESR_CLIENT_UNKNOWN_DOCUMENT_ID | `sync(documentId)` yapılandırılmamış |
| ESR_CLIENT_INVALID_DOCUMENT_ID | `documentId` formatı geçersiz |
| ESR_CLIENT_INVALID_DOCUMENT_SLOT | `documents[]` girişi geçersiz |
| ESR_CLIENT_DUPLICATE_DOCUMENT_ID | `documents[]` içinde yinelenen id |
| ESR_CLIENT_NAMESPACE_MISMATCH | Çoklu belge yapılandırma uyuşmazlığı |
| ESR_CLIENT_ENCRYPTION_PASSWORD_REQUIRED | ENV-ENC1 için parola eksik |
| ESR_CLIENT_UNSUPPORTED_CONTENT | Desteklenmeyen içerik magic |
| ESR_CLIENT_INVALID_ENVELOPE | Zarf oluşturma/parse hatası |

## Web portal proxy (Next.js BFF)

`/api/developer/*` ve `/api/operator/*` relay'e ulaşamadığında:

| HTTP | code | Açıklama |
|------|------|----------|
| 401 | UNAUTHORIZED | Portal oturum çerezi eksik/geçersiz |
| 502 | RELAY_UNREACHABLE | Web uygulamasından relay API'ye ulaşılamıyor |

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
| ESR_CLIENT_OFFLINE | Evet, çevrimiçi olunca |

## Log seviyesi

| HTTP | Log |
|------|-----|
| 4xx | warn (payload redacted) |
| 5xx | error + stack |
