# Senkronla — Agent entegrasyon rehberi (SDK ve REST)

> **Amaç:** Uygulamanıza Senkronla entegrasyonu yapan yapay zeka agent'ları için tek dosyalık referans.
> **Kapsam dışı:** relay dağıtımı, Docker, Postgres, `ESR_*` ortam değişkenleri, operatör paneli — operatörler için insan okuyuculara yönelik [ESR kurulum rehberi](/tr/guides/esr).

---

## İçindekiler

1. [Mimari](#mimari)
2. [Entegrasyon kontrol listesi](#entegrasyon-kontrol-listesi)
3. [Temel kavramlar](#temel-kavramlar)
4. [SDK entegrasyonu](#sdk-entegrasyonu-önerilen)
5. [REST entegrasyonu](#rest-entegrasyonu-sdk-yok)
6. [Zarf formatı (ESR-DOC1)](#zarf-formatı-esr-doc1)
7. [Kurtarma anahtarı kanıtı](#kurtarma-anahtarı-kanıtı)
8. [WebSocket bildirimleri](#websocket-bildirimleri)
9. [Cihaz limitleri ve açılış kodları](#cihaz-limitleri-ve-açılış-kodları)
10. [Hata kodları](#hata-kodları)
11. [Relay kotaları ve boyut limitleri](#relay-kotaları-ve-boyut-limitleri)
12. [Güvenlik](#güvenlik)
13. [Paketler](#paketler)
14. [Agent uygulama kuralları](#agent-uygulama-kuralları)

---

## Mimari

Senkronla, açık kaynak ve self-hosted bir **Envelope Sync Relay (ESR)**'dir. Uygulamanız müşteri çalışma alanı başına **tek bir JSON anlık görüntüsünü** cihazlar arasında senkronize eder. Relay opak `ESR-DOC1` zarflarını saklar — uygulama yükünüzü **asla ayrıştırmaz**.

```
┌─────────────┐     ESR-DOC1 zarfı         ┌──────────────┐
│  Cihaz A    │ ───── PUT /primary ──────► │ Envelope     │
│  (uygulama) │ ◄──── GET /head ────────── │ Sync Relay   │
└─────────────┘     WebSocket bildirimi  └──────────────┘
       ▲                                          │
       │              aynı namespace              │
┌─────────────┐                                  │
│  Cihaz B    │ ◄────────────────────────────────┘
└─────────────┘
```

**Sorumluluk paylaşımı:**

| Katman | Sahiplik |
|--------|----------|
| **Uygulamanız** | UX, veri modeli, JSON export/import, kurtarma ifadesi UI, çakışma UX, faturalandırma UI |
| **Senkronla relay** | Opak depolama, revision koordinasyonu, cihaz token'ları, slot limitleri, push bildirimleri |
| **SDK (`@senkronla/client`)** | HTTP + isteğe bağlı WebSocket, token depolama, gecikmeli push, çakışma yönetimi |

**SDK vs REST seçimi:**

| Yol | Ne zaman |
|-----|----------|
| **SDK** (`@senkronla/client`) | JavaScript/TypeScript — tarayıcı, Electron, React Native (fetch ile), Node 18+ |
| **REST** (`/v1`) | Swift, Kotlin, sunucu işleri, özel sync motorları, JS olmayan yığınlar |

Varsayılan: JS mümkünse **`EsrSync`** facade.

---

## Entegrasyon kontrol listesi

Üretime çıkmadan önce:

- [ ] `/v1` ile biten çalışan relay (örn. `https://sync.ornek.com/v1`)
- [ ] Müşteri çalışma alanı başına sabit **`namespaceId`** (UUID v4)
- [ ] Uygulama durumunu JSON olarak round-trip eden **`DocumentAdapter`** (veya REST zarf oluşturucu)
- [ ] **`onRecoveryPhrase`** UI — ifade çalışma alanı oluşturulurken **bir kez** gösterilir; sonra alınamaz
- [ ] **`onConflict`** UI — kullanıcı yerel/uzak seçer; **sunucu tarafı birleştirme yok**
- [ ] Sync döngüsü: başlangıçta `ensureNamespace()` → `sync()`; düzenlemede `notifyLocalChange()`; çıkışta `flushPush()`
- [ ] `DEVICE_LIMIT_*` hataları için cihaz limiti UX
- [ ] `deviceToken` için güvenli depolama (mobilde Keychain / Keystore)

---

## Temel kavramlar

| Terim | Anlam |
|-------|-------|
| **namespace** | İzole sync alanı; namespace başına bir JSON anlık görüntüsü. Sizin seçtiğiniz UUID v4. |
| **deviceToken** | Oluşturma/eşleştirme/kurtarma sonrası Bearer gizlisi. Cihaz silinince veya kurtarmada iptal. SDK `EsrStorage`'da saklar. |
| **clientDeviceId** | İstemcide üretilen, kurulum başına sabit UUID. Zarf içinde bu kurulumu tanımlar. |
| **deviceId** | Sunucunun atadığı ULID (ayarlar UI, iptal). |
| **revision** | Her anlık görüntüde ULID. Push'ta iyimser kilitleme için gerekli. |
| **envelope** | JSON'unuzu saran `ESR-DOC1` + metadata. Relay opak bayt saklar. |
| **primary document** | v1: namespace başına tek belge (`documentId: "primary"`). |
| **pairing code** | 6 haneli kod; ana cihaz üretir, misafir TTL içinde kullanır (varsayılan ~10 dk). |
| **recovery phrase** | 24 kelime BIP39. Bir kez gösterilir. **Sunucuya gitmez** — yalnızca Argon2id hash kanıtı. |

**Kim ne yapar:** Uygulamanız UX ve veri modelini sahiplenir. Senkronla taşımayı sahiplenir: paket depolama, sürümleme, cihaz slotları, eş bildirim.

---

## SDK entegrasyonu (önerilen)

### Kurulum

```bash
pnpm add @senkronla/client
# EsrSync dışında manuel zarf veya kurtarma kanıtı için:
pnpm add @senkronla/protocol
```

Node 18+ veya `fetch` ve Web Crypto destekleyen modern tarayıcı gerekir.

### Minimal kurulum

```typescript
import {
  EsrSync,
  createDocumentAdapter,
  createLocalStorageAdapter,
} from '@senkronla/client'

const document = createDocumentAdapter({
  namespaceId: '550e8400-e29b-41d4-a716-446655440000',
  namespaceLabel: 'Müşteri çalışma alanı',
  contentType: 'application/vnd.myapp+json',
  exportDocument: () => appStore.exportJson(),
  importDocument: (data) => appStore.importJson(data),
})

const sync = await EsrSync.connect({
  relayUrl: 'https://sync.ornek.com/v1',
  document,
  storage: createLocalStorageAdapter('myapp'),
  onRecoveryPhrase: async ({ phrase }) => {
    await ui.showRecoveryModal(phrase) // ZORUNLU — bir kez
  },
  onConflict: async (ctx) => {
    return ui.askKeepLocalOrRemote(ctx.remoteMeta.writtenAt) // 'local' | 'remote' | 'cancel'
  },
})

await sync.ensureNamespace()
await sync.sync()
appStore.onChange(() => sync.notifyLocalChange())
```

### EsrSync.connect seçenekleri

| Seçenek | Zorunlu | Varsayılan | Açıklama |
|---------|---------|------------|----------|
| `relayUrl` | evet | — | `/v1` ile biten temel URL |
| `document` | evet | — | `DocumentAdapter` örneği |
| `storage` | evet | — | `EsrStorage` (web'de `createLocalStorageAdapter(prefix)`) |
| `onRecoveryPhrase` | evet | — | Namespace oluşturulunca 24 kelime ile bir kez çağrılır |
| `onConflict` | evet | — | Sürümler ayrılınca `'remote'`, `'local'` veya `'cancel'` |
| `deviceLabel` | hayır | otomatik | Cihaz listesinde görünür |
| `onDeviceLimit` | hayır | — | `DEVICE_LIMIT_*` — faturalandırma UI |
| `onStatusChange` | hayır | — | Sync göstergesi |
| `onError` | hayır | — | `EsrError` loglama |
| `pushDebounceMs` | hayır | `2000` | `notifyLocalChange()` sonrası push gecikmesi |
| `notificationsEnabled` | hayır | `true` | WebSocket + poll yedek |
| `notificationMode` | hayır | `ws_with_poll_fallback` | veya `poll_only` |
| `persistRecoveryPhrase` | hayır | `true` | İfadeyi `EsrStorage`'da sakla (güvenlik tradeoff) |
| `pauseSchedulerWhenHidden` | hayır | `true` | Sekme gizliyken arka plan sync duraklat |
| `enabled` | hayır | `true` | Hazır olana kadar `false` |

### Belge adapter'ı

Uygulama durumu ile Senkronla arasındaki köprü. `createDocumentAdapter` veya `DocumentAdapter` uygulayın:

```typescript
interface DocumentAdapter {
  buildDocument(): Promise<string>
  importDocument(documentJson: string): Promise<void>
  contentType(): string
  encryption(): { enabled: boolean; resolvePassword(): Promise<string | undefined> }
  namespaceId(): string
  namespaceLabel(): string
}
```

**Kurallar:**

- `namespaceId` cihazlar ve yeniden kurulumlar arasında **sabit** olmalı.
- `contentType` vendor MIME olmalı.
- `encryption.enabled` **`false`** kalmalı (`ENV-ENC1` gelene kadar v1 yalnızca `ENV-RAW1`).
- `buildDocument()` hızlı olmalı — her push öncesi çalışır.

### Yerel depolama (EsrStorage)

`EsrStorage` uygulayın veya `createLocalStorageAdapter('prefix')` kullanın. Namespace başına anahtarlar:

| Anahtar | Amaç |
|---------|------|
| `deviceToken` | Kimlik doğrulamalı istekler için Bearer token |
| `knownRemoteRevision` | Son görülen sunucu revision (çakışma algılama) |
| `recoveryPhrase` | `persistRecoveryPhrase: true` ise isteğe bağlı |
| `global:clientDeviceId` | Kurulum başına bir kez üretilir |

Mobilde Keychain / Keystore destekli `EsrStorage` — token için düz localStorage kullanmayın.

### EsrSync metotları

| Metot | Amaç |
|-------|------|
| `ensureNamespace(opts?)` | İlk açılışta alan oluştur veya token doğrula |
| `sync()` | Tam pull/push döngüsü |
| `notifyLocalChange()` | Kirli işaretle; gecikmeli push |
| `flushPush()` | Anında push (çıkış, kritik kayıt) |
| `startPairing()` | Ana cihaz: `{ code, qrPayload, expiresAt }` |
| `joinPairing(code)` | Misafir: kodu kullanır, token saklar, `sync()` çalıştırır |
| `recover(phrase)` | Kurtarma; diğer tüm cihazları iptal eder |
| `listDevices()` | Ayarlar UI: cihazlar + limitler |
| `revokeDevice(deviceId)` | Başka cihazı kaldır (son cihaz değil) |
| `redeemUnlockCode(code)` | Operatör açılış kodu |
| `resolveConflict('local' \| 'remote')` | Manuel çakışma çözümü |
| `getStatus()` | Güncel `EsrSyncStatus` |
| `getLastError()` | Varsa son `EsrError` |
| `disable()` | Zamanlayıcı ve bildirimleri durdur |

#### ensureNamespace()

```typescript
const { namespaceId, created, recoveryPhrase } = await sync.ensureNamespace({
  namespaceLabel: 'Müşteri çalışma alanı',
})

if (created) {
  console.log('Kullanıcı offline kaydetmeli:', recoveryPhrase)
}
```

#### sync()

```typescript
const result = await sync.sync()

switch (result.status) {
  case 'ok': break
  case 'offline': /* ağ gelince tekrar dene */ break
  case 'conflict': /* onConflict veya resolveConflict */ break
  case 'error': console.error(result.error.code) break
}
```

Çağır: uygulama açılışı (`ensureNamespace` sonrası), ağ yeniden bağlanması, pencere odağı, WebSocket `head_changed`.

#### notifyLocalChange() / flushPush()

```typescript
appStore.onChange(() => sync.notifyLocalChange())
await sync.flushPush() // debounce atla — çıkış öncesi
```

#### Eşleştirme

**Ana cihaz:**

```typescript
const { code, qrPayload, expiresAt } = await sync.startPairing()
// qrPayload: esr://pair/v1/{namespaceId}?code=482913&exp=...&host=...
```

**Misafir** (adapter'da aynı `namespaceId`):

```typescript
await sync.joinPairing('482913')
```

#### Kurtarma

```typescript
await sync.recover('kelime1 kelime2 ... kelime24')
// yeni token; TÜM diğer cihazlar iptal; sync() en günceli indirir
```

#### Çakışmalar

```typescript
onConflict: async (ctx) => {
  // ctx.remoteMeta: { revision, writtenAt, deviceId, contentSha256, ... }
  return ui.askUser() // 'remote' | 'local' | 'cancel'
}
```

`'cancel'` yerel düzenlemeleri bekletir; durum `'conflict'` kalır.

### Sync yaşam döngüsü

1. **Uygulama açılışı** → `ensureNamespace()` → `sync()`
2. **Yerel düzenleme** → `notifyLocalChange()` (varsayılan 2 sn debounce)
3. **Ağ / odak** → `sync()`
4. **Çıkış** → `flushPush()` → isteğe bağlı `disable()`

### Durum değerleri (`EsrSyncStatus`)

| Durum | Anlam |
|-------|-------|
| `idle` | Hazır |
| `syncing` | Pull veya push çalışıyor |
| `pending_push` | Yerel değişiklik kuyrukta |
| `remote_pending` | Uzak değişiklik algılandı |
| `conflict` | `onConflict` bekleniyor |
| `offline` | Ağ yok |
| `ws_connected` | WebSocket bağlı |
| `error` | `getLastError()` kontrol et |
| `disabled` | `disable()` ile kapatıldı |

### SDK istemci hata kodları

| Kod | Eylem |
|-----|-------|
| `ESR_CLIENT_NO_TOKEN` | `ensureNamespace`, `joinPairing` veya `recover` |
| `ESR_CLIENT_OFFLINE` | Çevrimiçi olunca `sync()` tekrar |
| `ESR_CLIENT_NAMESPACE_EXISTS` | Eşleştirme/kurtarma, oluşturma değil |
| `ESR_CLIENT_CONFLICT_CANCELLED` | Kullanıcı iptal — yerel düzenleme bekliyor |
| `REVISION_CONFLICT` | Çakışma akışı gerekli |
| `DEVICE_LIMIT_PAYMENT_REQUIRED` | Yükseltme / açılış UI |
| `DEVICE_LIMIT_BLOCKED` | Cihaz iptal ettir |

`isEsrError(err)` ve `isOfflineError(err)` yardımcılarını kullanın.

---

## REST entegrasyonu (SDK yok)

Temel URL: `https://relay.ornek.com/v1`  
Format: JSON  
Sağlık (auth yok): `GET https://relay.ornek.com/health`

### Kimlik doğrulama

Oluşturma, eşleştirme veya kurtarma sonrası `deviceToken` alırsınız:

```http
Authorization: Bearer dvt_a1b2c3d4e5f6...
```

WebSocket: aynı token, alt protokol `esr-notifications-v1`.

**Auth gerektirmeyen:** `POST /v1/namespaces`, `POST .../devices` (eşleştirme), `POST .../recover`.

### Tipik akış

1. `POST /v1/namespaces` → `deviceToken` kaydet
2. `GET .../documents/primary/head/meta` → revision oku
3. `PUT .../documents/primary` → zarf push (ilk push'ta `expectedRevision: null`)
4. WebSocket veya `head/meta` poll
5. Revision farklıysa `GET .../head`

### Uç nokta referansı

| Metot | Yol | Auth | Amaç |
|-------|-----|------|------|
| `GET` | `/health` | hayır | Relay sağlığı (`/v1` dışı) |
| `POST` | `/v1/namespaces` | hayır | Alan + ilk cihaz oluştur |
| `GET` | `/v1/namespaces/{id}` | evet | Metadata, limitler, head özeti |
| `GET` | `.../documents/primary/head/meta` | evet | Hafif head |
| `GET` | `.../documents/primary/head` | evet | Tam zarf |
| `PUT` | `.../documents/primary` | evet | Anlık görüntü push |
| `POST` | `.../pairing-tokens` | evet | Ana cihaz: 6 haneli kod |
| `POST` | `.../devices` | hayır* | Misafir: kod kullan |
| `GET` | `.../devices` | evet | Cihaz listesi |
| `DELETE` | `.../devices/{deviceId}` | evet | Cihaz iptal |
| `POST` | `.../recover` | hayır | Kurtarma kanıtı |
| `GET` | `.../limits` | evet | Slot limitleri |
| `POST` | `.../unlock` | evet | Açılış kodu |
| `GET` | `.../notifications` | evet | WebSocket |

\* Eşleştirmede pairing kodu kullanılır, device token değil.

### Namespace oluşturma

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

### Belge push / pull

**İlk push:** `expectedRevision: null`

**Güncelleme:** `expectedRevision` head ile eşleşmeli

**Pull:** önce `head/meta`, revision farklıysa `GET .../head` — `payload` base64 decode → JSON.

### Eşleştirme

Ana: `POST .../pairing-tokens` → `{ code, qrPayload, expiresAt }`  
Misafir: `POST .../devices` + `pairingCode` → yeni `deviceToken`

### Kurtarma

**Uyarı:** Workspace'teki **tüm** cihaz token'larını iptal eder.

```http
POST /v1/namespaces/{id}/recover
```

`recoveryKeyProof` + yeni `clientDeviceId` gönderin.

### Hata yanıt şekli

```json
{
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "...",
    "details": { "remoteMeta": { ... } }
  }
}
```

Her zaman **`error.code`** ile dallanın.

---

## Zarf formatı (ESR-DOC1)

v1 tek **primary** belge senkronize eder. Uygulama JSON'u `payload` (base64) içinde. İçerik `ENV-RAW1` (`ENV-ENC1` henüz yok — `encryption.enabled: false`).

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

**Doğrulama:**

- `contentSha256` = `payload` baytlarının SHA-256 hex'i
- Her push'ta yeni ULID `revision`
- Tam JSON `maxEnvelopeBytes` içinde (varsayılan 50 MB)

```typescript
import { buildEnvelope, buildRecoveryKeyProof } from '@senkronla/client'
```

Zarf hash'ini elle yazmayın — SDK/protocol kullanın.

---

## Kurtarma anahtarı kanıtı

24 kelimelik BIP39 ifadesi **cihazdan çıkmaz**. Yalnızca `{ salt, hash }` gider:

- Salt: 16 rastgele bayt, base64url
- Hash: normalize ifadenin Argon2id hash'i
- Varsayılan: `memoryCost: 65536`, `timeCost: 3`, `parallelism: 4`

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

**Yalnızca bildirim — veri her zaman HTTP GET ile:**

```json
{ "type": "head_changed", "documentId": "primary", "revision": "...", ... }
{ "type": "limits_changed", "maxDevices": 5, "activeDevices": 2, ... }
```

SDK `notificationsEnabled: true` iken otomatik yönetir.

---

## Cihaz limitleri ve açılış kodları

```json
{
  "freeDeviceLimit": 2,
  "purchasedSlots": 0,
  "maxDevices": 2,
  "activeDevices": 2,
  "canAddDevice": false,
  "onLimitReached": { "mode": "payment", "slotPackages": [3, 5, 10] }
}
```

| `mode` | Davranış |
|--------|----------|
| `payment` | `DEVICE_LIMIT_PAYMENT_REQUIRED` — yükseltme UI |
| `block` | `DEVICE_LIMIT_BLOCKED` — cihaz iptal |

Açılış kodları operatör üretir; uygulama `redeemUnlockCode` / `POST .../unlock` çağırır.

---

## Hata kodları

| Kod | HTTP | Eylem |
|-----|------|-------|
| `VALIDATION_ERROR` | 400 | İstek gövdesini düzelt |
| `PAIRING_CODE_INVALID` | 400 | Yeni kod üret |
| `UNLOCK_CODE_INVALID` | 400 | Geçersiz açılış kodu |
| `DEVICE_TOKEN_INVALID` | 401 | Yeniden eşleştir/kurtar |
| `RECOVERY_INVALID` | 401 | Yanlış kurtarma kanıtı |
| `DEVICE_LIMIT_PAYMENT_REQUIRED` | 403 | Yükseltme UI |
| `DEVICE_LIMIT_BLOCKED` | 403 | Cihaz iptal |
| `NAMESPACE_NOT_FOUND` | 404 | namespaceId kontrol |
| `DOCUMENT_NOT_FOUND` | 404 | Henüz push yok |
| `NAMESPACE_EXISTS` | 409 | Eşleştir/kurtar |
| `REVISION_CONFLICT` | 409 | `details.remoteMeta`, çakışma UX |
| `ENVELOPE_TOO_LARGE` | 413 | Anlık görüntüyü küçült (~50 MB) |
| `ENVELOPE_INVALID` | 422 | Zarf şeması/hash |
| `RATE_LIMIT_EXCEEDED` | 429 | `Retry-After` ile bekle |

---

## Relay kotaları ve boyut limitleri

Varsayılanlar (operatör yapılandırır):

| Kota | Varsayılan | Kapsam | Pencere |
|------|------------|--------|---------|
| Genel API | 300 / dakika | İstemci IP | 1 dk |
| Belge push | 120 / saat | Cihaz | 1 saat |
| Eşleştirme | 20 / saat | Namespace | 1 saat |
| Pairing token | 30 / saat | Namespace | 1 saat |
| Kurtarma | 5 / saat | Namespace | 1 saat |

**Max zarf:** 52.428.800 bayt (50 MB).

Genel IP kotasından muaf: `/health`, `/metrics`, WebSocket bildirimleri.

---

## Güvenlik

- **`deviceToken`** oturum gizlisi gibi — güvenli depolama
- **Kurtarma ifadesi** bir kez — kopyala/kaydet UX; sunucudan alınamaz
- Kurtarma **tüm cihazları iptal eder** — UX'te uyar
- Üretimde zarf/token loglama
- CORS operatör tarafından yapılandırılır
- v1 `ENV-RAW1` — hassas alanları uygulama JSON'unda şifreleyin (`ENV-ENC1` gelene kadar)

---

## Paketler

| Paket | Rol |
|-------|------|
| `@senkronla/client` | `EsrSync`, `RelayClient`, adapter'lar |
| `@senkronla/protocol` | Zarf şeması, kurtarma kanıtı |
| `@senkronla/server` | Relay API (self-hosted — operatörler) |

---

## Agent uygulama kuralları

1. JS/TS için **SDK tercih et**.
2. **`onRecoveryPhrase` ve `onConflict` atlama** — üretim için zorunlu.
3. Kurtarma hash ve zarf SHA-256 **elle yazma** — `@senkronla/protocol`.
4. Relay URL **`/v1` ile bitsin**.
5. Eşleştirmede **aynı `namespaceId`**.
6. **Otomatik birleştirme yok** — çakışma UX zorunlu.
7. **Bu dosyayla başla** — kenar durumlar için insan dokümantasyonu:
   - [Entegrasyon rehberleri](/tr/guides)
   - [SDK referansı](/tr/sdk)
   - [REST API](/tr/api)
   - [ESR kurulum](/tr/guides/esr) — yalnızca operatörler

---

*Senkronla agent rehberi · SDK + REST · ESR dağıtımı kapsam dışı*
