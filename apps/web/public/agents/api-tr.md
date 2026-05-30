# Senkronla — REST API referansı (`/v1`)

> **Hedef kitle:** JavaScript SDK olmadan Senkronla entegre eden agent'lar (Swift, Kotlin, Rust, sunucu işleri).
> **İlgili:** [Agent genel bakış](tr.md) · [SDK referansı](sdk-tr.md) · [İnsan API sayfası](/tr/api) · OpenAPI: `openapi.yaml`

Temel URL: `https://relay.ornek.com/v1`  
Format: JSON  
Sağlık (auth yok): `GET https://relay.ornek.com/health`

**Postman:** İnteraktif API sayfasından koleksiyon + ortam dosyalarını indirin — [`/postman/senkronla-relay.postman_collection.json`](/postman/senkronla-relay.postman_collection.json), [`senkronla-relay-local.postman_environment.json`](/postman/senkronla-relay-local.postman_environment.json). `Quick start` klasörü sırayla çalıştırıldığında `deviceToken` ve diğer alanlar otomatik kaydedilir.

Spec v1.3, isteğe bağlı **uygulama kaydı** (`X-ESR-App-Id`, namespace–app bağlama) ekler. Spec v1.2, namespace başına **çoklu adlandırılmış belge** (`primary`, `settings`, …) destekler: `/documents/{documentId}/...`. `/documents/primary/...` alias'ı geçerlidir.

---

## İçindekiler

1. [Kimlik doğrulama](#kimlik-doğrulama)
2. [Tipik akış](#tipik-akış)
3. [Uç nokta referansı](#uç-nokta-referansı)
4. [Namespace oluşturma](#namespace-oluşturma)
5. [Namespace getir & belge listesi](#namespace-getir--belge-listesi)
6. [Belge push](#belge-push)
7. [Belge pull](#belge-pull)
8. [Eşleştirme](#eşleştirme)
9. [Kurtarma](#kurtarma)
10. [Cihaz listesi & iptal](#cihaz-listesi--iptal)
11. [Limitler & açılış](#limitler--açılış)
12. [Hata yanıt şekli](#hata-yanıt-şekli)
13. [Zarf formatı (ESR-DOC1)](#zarf-formatı-esr-doc1)
14. [Zarf şifrelemesi (ENV-ENC1)](#zarf-şifrelemesi-env-enc1)
15. [Kurtarma anahtarı kanıtı](#kurtarma-anahtarı-kanıtı)
16. [WebSocket bildirimleri](#websocket-bildirimleri)
17. [Hata kodları](#hata-kodları)
18. [Relay kotaları](#relay-kotaları)
19. [App registry admin & geliştirici API'leri](#app-registry-admin--geliştirici-apileri)

---

## Kimlik doğrulama

### Cihaz token

Oluşturma, eşleştirme veya kurtarma sonrası `deviceToken`:

```http
Authorization: Bearer dvt_a1b2c3d4e5f6...
```

### Uygulama bağlamı (v1.3 — `apps.enabled` iken)

Tüm `/v1` uçlarında zorunlu (`/health`, `/v1/admin/*`, `/v1/developer/*` hariç):

| İstemci | Header'lar |
|---------|------------|
| Web SPA | `X-ESR-App-Id` + tarayıcı `Origin` (doğrulanmış origin ile eşleşmeli) |
| iOS / Android / desktop | `X-ESR-App-Id` + `X-ESR-Platform` + `X-ESR-Bundle-Id` (+ isteğe bağlı `X-ESR-Client-Secret`) |

**İki katman:** App başlıkları hangi entegrasyonun relay'i kullanabileceğini; `Authorization: Bearer {deviceToken}` hangi eşleşmiş cihazın hangi namespace'e eriştiğini belirler. İlk `POST /v1/namespaces`'te device token yok — yanıtta döner.

**Native secret:** Uygulama kaydında otomatik oluşmaz. `native.requireClientSecret: true` iken kimlik doğrulamasız uçlarda zorunlu. `rotate-secret` ile oluşturulur. `/health` → `apps.nativeRequireClientSecret`.

Namespace oluşturma yanıtında `appId` döner. Yanlış app → `403 APP_NAMESPACE_MISMATCH`.

WebSocket: handshake `Origin`; `Authorization: Bearer {deviceToken}`; alt protokol `esr-notifications-v1`.

**Auth'suz uçlar (app bağlamı yine gerekli):** `POST /v1/namespaces`, `POST .../devices`, `POST .../recover`.

---

## Tipik akış

1. `POST /v1/namespaces` → `deviceToken` kaydet
2. `GET .../documents/{documentId}/head/meta` → revision oku
3. `PUT .../documents/{documentId}` → zarf push (`expectedRevision: null` ilk push)
4. WebSocket (`subscribe` + `documentIds[]` isteğe bağlı) veya `head/meta` poll
5. Revision farklıysa `GET .../head`

---

## Uç nokta referansı

| Metot | Yol | Auth | Amaç |
|-------|-----|------|------|
| `GET` | `/health` | hayır | Relay sağlığı |
| `POST` | `/v1/namespaces` | hayır | Alan + ilk cihaz |
| `GET` | `/v1/namespaces/{id}` | evet | Metadata, limitler, primary head |
| `GET` | `/v1/namespaces/{id}/documents` | evet | Tüm belge head'leri |
| `GET` | `.../documents/{documentId}/head/meta` | evet | Hafif head |
| `GET` | `.../documents/{documentId}/head` | evet | Tam zarf |
| `PUT` | `.../documents/{documentId}` | evet | Push |
| `POST` | `.../pairing-tokens` | evet | Ana cihaz: 6 haneli kod |
| `POST` | `.../devices` | hayır* | Misafir: kod kullan |
| `GET` | `.../devices` | evet | Cihaz listesi |
| `DELETE` | `.../devices/{deviceId}` | evet | Cihaz iptal |
| `POST` | `.../recover` | hayır | Kurtarma kanıtı |
| `GET` | `.../limits` | evet | Slot limitleri |
| `POST` | `.../unlock` | evet | Açılış kodu |
| `GET` | `.../notifications` | evet | WebSocket |

---

## Namespace oluşturma

```http
POST /v1/namespaces
Content-Type: application/json

{
  "namespaceId": "550e8400-e29b-41d4-a716-446655440000",
  "namespaceLabel": "Müşteri çalışma alanı",
  "deviceLabel": "Alice dizüstü",
  "clientDeviceId": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  "recoveryKeyProof": { "salt": "...", "hash": "..." }
}
```

→ `201` + `deviceToken` — kalıcı saklayın.

---

## Namespace getir & belge listesi

```http
GET /v1/namespaces/{id}/documents
Authorization: Bearer dvt_...
```

```json
{
  "documents": [
    { "documentId": "primary", "revision": "...", "writtenAt": "...", "contentSha256": "...", "contentMagic": "ENV-ENC1", "sizeBytes": 128 },
    { "documentId": "settings", "revision": "...", "writtenAt": "...", "contentSha256": "...", "contentMagic": "ENV-ENC1", "sizeBytes": 64 }
  ]
}
```

---

## Belge push

**İlk push:** `expectedRevision: null`

```http
PUT /v1/namespaces/{id}/documents/primary
Authorization: Bearer dvt_...
Content-Type: application/json

{ "expectedRevision": null, "envelope": { } }
```

**Güncelleme:** `expectedRevision` head ile eşleşmeli.

Başarı `201` — `RateLimit-PutDocument-*` başlıkları ve `rateLimits.put_document` gövdesi.

---

## Belge pull

Önce `head/meta`, revision farklıysa `GET .../head`. `payload` alanı `ENV-ENC1` JSON string'idir — parola ile çözülür (`extractDocument` veya `extractDocumentFromInnerPayload`). İlk pull öncesi `DOCUMENT_NOT_FOUND` beklenir.

---

## Eşleştirme

Ana: `POST .../pairing-tokens` → `{ code, qrPayload, expiresAt }`

İsteğe bağlı **eşleştirme kapsamı** (`apps.enabled` iken):

```json
{ "ttlSeconds": 600, "allowedAppIds": ["esr_app_mynotes", "esr_app_mynotes_mobile"] }
```

Listede olmayan `X-ESR-App-Id` ile misafir redeem → `403 APP_PAIRING_NOT_ALLOWED`. `allowedAppIds` atlanırsa tüm aktif app'ler kabul edilir.

Kapsamlı token'da `qrPayload` içinde `&apps=esr_app_a,esr_app_b` olabilir; yanıt `allowedAppIds` döner.

Misafir: `POST .../devices` + `pairingCode` → yeni `deviceToken`

---

## Kurtarma

**Uyarı:** Workspace'teki **tüm** cihaz token'larını iptal eder.

```http
POST /v1/namespaces/{id}/recover
```

`recoveryKeyProof` + yeni `clientDeviceId` gönderin.

---

## Cihaz listesi & iptal

`GET .../devices` · `DELETE .../devices/{deviceId}` → `204` (son cihaz iptal edilemez)

---

## Limitler & açılış

`GET .../limits` · `POST .../unlock` + `{ "unlockCode": "UNLK-..." }`

| `onLimitReached.mode` | Davranış |
|--------|----------|
| `payment` | `DEVICE_LIMIT_PAYMENT_REQUIRED` |
| `block` | `DEVICE_LIMIT_BLOCKED` |

---

## Hata yanıt şekli

```json
{
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "...",
    "details": { "remoteMeta": { "revision": "...", "writtenAt": "...", "deviceId": "...", "contentSha256": "...", "contentMagic": "ENV-ENC1", "sizeBytes": 128 } }
  }
}
```

Her zaman **`error.code`** ile dallanın.

---

## Zarf formatı (ESR-DOC1)

- **`schemaVersion: 1`** — yalnızca `documentId: "primary"`
- **`schemaVersion: 2`** — geçerli herhangi bir `documentId`

Uygulama JSON'u `payload` içinde taşınır. Üretimde **`ENV-ENC1`** ile şifrelenmiş olmalıdır — ayrıntılar için [Zarf şifrelemesi](#zarf-şifrelemesi-env-enc1).

```json
{
  "magic": "ESR-DOC1",
  "schemaVersion": 1,
  "namespaceId": "550e8400-e29b-41d4-a716-446655440000",
  "namespaceLabel": "Müşteri çalışma alanı",
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

**Doğrulama kuralları:**

- `contentSha256` = `payload` alanının UTF-8 metninin SHA-256 hex'i
- `revision` her push'ta yeni ULID olmalı
- `namespaceId` route ve adapter ile eşleşmeli
- Serialize edilmiş zarf `maxEnvelopeBytes` limitine sığmalı (varsayılan 50 MB)

Şifresiz `ENV-RAW1` yalnızca yerel geliştirme içindir.

---

## Zarf şifrelemesi (ENV-ENC1)

Üretimde uygulama verisi `ENV-ENC1` ile şifrelenmiş `ESR-DOC1` zarfının `payload` alanında taşınmalıdır. Relay yalnızca opak string saklar; içeriği çözemez. JavaScript SDK kullanıyorsanız [SDK — Zarf şifrelemesi](sdk-tr.md#zarf-şifrelemesi-env-enc1) bölümüne de bakın.

### Senkron parolası nedir?

Şifreleme parolası, zarfı kilitleyen **uygulama gizlisidir**. Senkronla bunu üretmez ve relay'e göndermez. Siz sağlarsınız — master password, workspace sync password, vault PIN türevi vb.

Her push ve pull öncesi istemci bu parolayı kullanır (SDK'da `resolvePassword()`). Tüm eşleşmiş cihazlar aynı parolayı bilmelidir; eşleştirme veya kurtarma parolayı otomatik taşımaz.

### Gizlileri karıştırmayın

| Gizli | Rol |
|-------|-----|
| **Senkron parolası** | `ENV-ENC1` şifreleme; uygulama sağlar; sunucuya gitmez |
| **24 kelimelik kurtarma ifadesi** | Namespace erişim kanıtı; zarf içeriğini otomatik açmaz |
| **deviceToken** | Relay API oturumu; zarf şifrelemesiyle ilgisi yok |
| **demo-sync-passphrase** | Yalnızca bu dokümantasyondaki HTTP/Postman örnekleri için |

### Payload içinde neler var?

Dış zarfın `contentMagic` alanı `ENV-ENC1` olur. `payload` string'i şu JSON'dur (relay parse etmez):

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

- **`salt` + `nonce`** — her push'ta rastgele; gizli değildir; pull tarafının çözebilmesi için ciphertext ile birlikte taşınır
- **`ciphertext`** — AES-256-GCM ile şifrelenmiş uygulama JSON'u
- **`kdf` / `iterations`** — PBKDF2-SHA256, varsayılan 600000

### REST ile zarf oluşturma (SDK yok)

`@senkronla/protocol` paketinden `buildEnvEnc1Payload` kullanın; ardından `contentSha256 = sha256Hex(payload)` ile dış zarfı tamamlayın. **Parolayı asla HTTP isteğine koymayın.**

```typescript
import { buildEnvEnc1Payload, sha256Hex } from '@senkronla/protocol'

const documentJson = '{"note":"Hello"}'
const password = await yourApp.getSyncPassword() // relay'e gitmez
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

Pull tarafında: `extractDocumentFromInnerPayload(envelope.payload, password)` veya `@senkronla/client` → `extractDocument(envelope, password)`.

**Uyarı — Kurtarma ≠ senkron parolası:** `POST .../recover` yalnızca yeni `deviceToken` verir. Kaybolmuş senkron parolasıyla şifrelenmiş eski zarflar açılamaz — parola yedekleme UX'inizi ayrıca planlayın.

---

## Kurtarma anahtarı kanıtı

24 kelimelik BIP39 ifadesi **cihazdan çıkmaz**. Yalnızca `{ salt, hash }`:

```typescript
import { buildRecoveryKeyProof, generateRecoveryPhrase } from '@senkronla/protocol'

const phrase = generateRecoveryPhrase()
const recoveryKeyProof = await buildRecoveryKeyProof(phrase)
```

Argon2 parametrelerini kendiniz uygulamayın.

---

## WebSocket bildirimleri

```http
GET /v1/namespaces/{id}/notifications
Upgrade: websocket
Sec-WebSocket-Protocol: esr-notifications-v1
Authorization: Bearer dvt_...
```

`auth_ok` sonrası: `{ "type": "subscribe", "documentIds": ["primary", "settings"] }`

`head_changed` ve `limits_changed` — veri her zaman HTTP GET ile çekilir.

---

## Hata kodları

| Kod | HTTP | Eylem |
|-----|------|-------|
| `VALIDATION_ERROR` | 400 | İstek gövdesini düzelt |
| `PAIRING_CODE_INVALID` | 400 | Yeni kod |
| `DEVICE_TOKEN_INVALID` | 401 | Yeniden eşleştir/kurtar |
| `RECOVERY_INVALID` | 401 | Yanlış kanıt |
| `DEVICE_LIMIT_PAYMENT_REQUIRED` | 403 | Yükseltme UI |
| `DEVICE_LIMIT_BLOCKED` | 403 | Cihaz iptal |
| `NAMESPACE_NOT_FOUND` | 404 | namespaceId kontrol |
| `DOCUMENT_NOT_FOUND` | 404 | Henüz push yok |
| `NAMESPACE_EXISTS` | 409 | Eşleştir/kurtar |
| `REVISION_CONFLICT` | 409 | Çakışma UX |
| `ENVELOPE_TOO_LARGE` | 413 | ~50 MB limit |
| `ENVELOPE_INVALID` | 422 | Zarf şeması |
| `RATE_LIMIT_EXCEEDED` | 429 | `Retry-After`, `RateLimit-*` |
| `APP_ID_REQUIRED` | 400 | `X-ESR-App-Id` gönderin |
| `APP_ORIGIN_REQUIRED` | 400 | Web istemcide `Origin` eksik |
| `APP_ORIGIN_NOT_ALLOWED` | 403 | Origin kayıtlı veya doğrulanmış değil |
| `APP_NAMESPACE_MISMATCH` | 403 | Namespace başka app'e ait |
| `APP_NOT_FOUND` | 403 | Bilinmeyen `appId` |
| `APP_SUSPENDED` | 403 | Operatör app'i askıya aldı |
| `APP_PAIRING_NOT_ALLOWED` | 403 | App, pairing token `allowedAppIds` listesinde değil |
| `APP_CLIENT_SECRET_INVALID` | 401 | Yanlış native client secret |
| `APP_NOT_VERIFIED` | 403 | App doğrulama/onay bekliyor |
| `APP_NATIVE_ID_REQUIRED` | 400 | Platform/bundle başlıkları eksik |
| `APP_BUNDLE_NOT_ALLOWED` | 403 | Bundle kayıtlı veya onaylı değil |

Bkz. [16-APP-REGISTRY.md](https://github.com/kemalersin/senkronla/blob/main/docs/envelope-sync-relay/tr/16-APP-REGISTRY.md).

---

## App registry admin & geliştirici API'leri

`apps.enabled: true` iken operatörler ve (`self_service` modunda) geliştiriciler app'leri sync rotalarından ayrı yönetir.

| Hedef | Taban | Auth | Web UI |
|-------|-------|------|--------|
| Operatör | `/v1/admin/apps` | `ESR_ADMIN_TOKEN` | `/operator` (Apps sekmesi) |
| Geliştirici | `/v1/developer/*` | `/developer/login` JWT | `/developer` |

OpenAPI: repo kökü `openapi.yaml` (etiketler **Applications**, **Developer**, **Admin**). Operatör rehberi: [docs/OPERATOR.md](https://github.com/kemalersin/senkronla/blob/main/docs/OPERATOR.md).

**v1.2 → v1.3 geçiş:** İstemciler app başlığı gönderene kadar `apps.enabled: false` bırakın; ardından kaydı açın, app'leri seed/register edin, mevcut namespace'ler için `legacyDefaultAppId` ayarlayın. Ayrıntı: [16-APP-REGISTRY §19](https://github.com/kemalersin/senkronla/blob/main/docs/envelope-sync-relay/tr/16-APP-REGISTRY.md#19-v12den-geçiş).

---

## Relay kotaları

| Kota | Varsayılan | Kapsam |
|------|------------|--------|
| Genel API | 300 / dk | İstemci IP |
| Belge push (`put_document`) | 120 / saat | Cihaz |
| Eşleştirme | 20 / saat | Namespace |
| Kurtarma | 5 / saat | Namespace |

**Max zarf:** 52.428.800 bayt (50 MB). Push başlıkları: `RateLimit-PutDocument-*`. Her başarılı `PUT .../documents/{documentId}` `put_document` kotasından düşer.

---

*Senkronla REST API agent referansı · `/v1` · ESR dağıtımı kapsam dışı*
