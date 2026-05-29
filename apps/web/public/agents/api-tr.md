# Senkronla — REST API referansı (`/v1`)

> **Hedef kitle:** JavaScript SDK olmadan Senkronla entegre eden agent'lar (Swift, Kotlin, Rust, sunucu işleri).
> **İlgili:** [Agent genel bakış](tr.md) · [SDK referansı](sdk-tr.md) · [İnsan API sayfası](/tr/api) · OpenAPI: `openapi.yaml`

Temel URL: `https://relay.ornek.com/v1`  
Format: JSON  
Sağlık (auth yok): `GET https://relay.ornek.com/health`

Spec v1.2, namespace başına **çoklu adlandırılmış belge** (`primary`, `settings`, …) destekler: `/documents/{documentId}/...`. `/documents/primary/...` alias'ı geçerlidir.

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
14. [Kurtarma anahtarı kanıtı](#kurtarma-anahtarı-kanıtı)
15. [WebSocket bildirimleri](#websocket-bildirimleri)
16. [Hata kodları](#hata-kodları)
17. [Relay kotaları](#relay-kotaları)

---

## Kimlik doğrulama

Oluşturma, eşleştirme veya kurtarma sonrası `deviceToken`:

```http
Authorization: Bearer dvt_a1b2c3d4e5f6...
```

WebSocket: aynı token, alt protokol `esr-notifications-v1`.

**Auth gerektirmeyen:** `POST /v1/namespaces`, `POST .../devices`, `POST .../recover`.

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
    { "documentId": "primary", "revision": "...", "writtenAt": "...", "contentSha256": "...", "contentMagic": "ENV-RAW1", "sizeBytes": 128 },
    { "documentId": "settings", "revision": "...", "writtenAt": "...", "contentSha256": "...", "contentMagic": "ENV-RAW1", "sizeBytes": 64 }
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

Önce `head/meta`, revision farklıysa `GET .../head`. `payload` base64 decode → JSON. İlk pull öncesi `DOCUMENT_NOT_FOUND` beklenir.

---

## Eşleştirme

Ana: `POST .../pairing-tokens` → `{ code, qrPayload, expiresAt }`  
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
    "details": { "remoteMeta": { "revision": "...", "writtenAt": "...", "deviceId": "...", "contentSha256": "...", "contentMagic": "ENV-RAW1", "sizeBytes": 128 } }
  }
}
```

Her zaman **`error.code`** ile dallanın.

---

## Zarf formatı (ESR-DOC1)

- **`schemaVersion: 1`** — yalnızca `documentId: "primary"`
- **`schemaVersion: 2`** — geçerli herhangi bir `documentId`

Uygulama JSON'u `payload` (base64) içinde. İçerik `ENV-RAW1`.

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
  "contentMagic": "ENV-RAW1",
  "contentSha256": "a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3",
  "payload": "eyJub3RlIjoiSGVsbG8ifQ=="
}
```

`contentSha256` = `payload` baytlarının SHA-256 hex'i. Zarf hash'ini elle yazmayın.

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
