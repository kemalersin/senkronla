# 16 — Uygulama Kaydı (App Registry) ve Namespace Bağlama

| Alan | Değer |
|------|--------|
| Durum | **Spec v1.3 — uygulandı** (Faz 8a–8e; operatör ve geliştirici portalları) |
| Hedef spec sürümü | **1.3.0** |
| Üzerine inşa | REST MVP (v1.0), WebSocket (v1.1), çoklu belge (v1.2) |
| API prefix | `/v1` (değişmedi; ek uçlar) |
| Protokol magic | `ESR-DOC1` (değişmedi) |

> **English:** [../en/16-APP-REGISTRY.md](../en/16-APP-REGISTRY.md)

---

## 1. Özet

Spec **v1.3**, mevcut cihaz token kimlik doğrulama modelinin **üstüne** isteğe bağlı bir **Uygulama Kaydı (Application Registry)** katmanı getirir. Kayıtlı her uygulama (`appId`) bir tüketici entegrasyonunu temsil eder (web SPA, iOS, Android). Özellik açıkken **namespace'ler tam olarak bir uygulamaya bağlıdır**.

Operatör, uygulamaların nasıl kaydedileceğini config ile seçer:

| Mod | Uygulamayı kim kaydeder |
|-----|-------------------------|
| `disabled` | Özellik kapalı — v1.2 davranışı korunur |
| `operator_managed` | Yalnızca operatör (YAML seed + admin API) |
| `self_service` | Uygulama sahipleri — geliştirici portalı + otomatik domain/bundle doğrulama |

**Güvenlik sınırı:**

- **Uygulama kimlik bilgileri** → *“Bu relay'i hangi entegrasyon kullanabilir?”*
- **Cihaz token + pairing/recovery** → *“Bu cihaz hangi kullanıcı workspace'ine erişebilir?”*

Uygulama kaydı **mevcut namespace'lere erişim vermez**. Veri erişimi pairing/recovery ile korunur; E2EE değişmez.

**Kapsam dışı (v1.3):**

- Senkron verisi için son kullanıcı hesabı (Alice'in “Senkronla girişi” yok)
- Namespace sahipleri için OAuth / sosyal giriş
- Relay'ler arası uygulama federasyonu
- `file://` origin desteği (kapsam dışı; bkz. §8.4)

---

## 2. Motivasyon

| Sorun | v1.2 davranışı | v1.3 çözümü |
|-------|----------------|-------------|
| Bilinmeyen istemciler public relay'i kötüye kullanır | Yalnızca IP rate limit | App başına kota + askıya alma |
| Operatör her entegrasyonu elle whitelist'ler | Statik CORS listesi | Doğrulanmış origin'lerden dinamik CORS |
| Entegrasyon başına audit yok | Loglarda yalnızca namespaceId | namespace, cihaz, isteklerde `appId` |
| Hosted platform geliştirici onboarding ister | Operatör YAML yazar | Self-service portal + DNS doğrulama |
| Pairing kodunu sunan her istemci | Yalnızca kod | Pairing token'da isteğe bağlı `allowedAppIds` |

---

## 3. Roller

```mermaid
flowchart LR
  OP[Operatör\nrelay işletir]
  DEV[Uygulama sahibi\napp kaydeder]
  EU[Son kullanıcı\nnamespace sahibi]

  OP -->|config, abuse, kota| RELAY[ESR Relay]
  DEV -->|appId, domain, bundle| RELAY
  EU -->|namespace, pairing, recovery| RELAY
```

| Rol | Açıklama | Ne kaydeder |
|-----|----------|-------------|
| **Operatör** | Relay deployment sahibi, config, admin token | Platform politikası; `operator_managed` modunda uygulamalar |
| **Uygulama sahibi (geliştirici)** | MyNotes, TodoApp vb. geliştirir | `self_service` modunda app + origin/bundle |
| **Son kullanıcı** | Alice workspace senkronlar | Uygulama istemcisi üzerinden namespace — **app kaydı değil** |

---

## 4. Tasarım ilkeleri

1. **Config ile opt-in** — `apps.enabled: false` tam v1.2 uyumluluğu.
2. **Katmanlı auth** — App kapısı ek katman; cihaz token semantiği aynı.
3. **Namespace tek app'e ait** — Özellik açıkken her namespace'in `app_uuid` değeri vardır; cross-app API erişimi reddedilir.
4. **Web güveni = Origin + public appId** — Tarayıcı SPA için client secret yok (Firebase/OAuth public client modeli).
5. **Native güveni = bundle/package (+ opsiyonel secret veya attestation)** — Native HTTP'de Origin header yok.
6. **Domain sahipliği otomatik** — Self-service DNS TXT veya HTTPS well-known zorunlu; operatör manuel onay yedek.
7. **Zero-knowledge korunur** — App katmanı yalnızca metadata görür; envelope kuralları değişmez.

---

## 5. Yapılandırma

### 5.1 Tam şema

```yaml
apps:
  # Ana anahtar. false = v1.2 (app kontrolü yok, app_uuid'siz namespace'ler).
  enabled: false

  # Uygulamalar nasıl kaydedilir (enabled: false iken yok sayılır).
  registrationMode: operator_managed   # operator_managed | self_service

  # Geliştirme kolaylığı — production'da asla true.
  allowLocalhostOrigins: false

  # Migrasyon: mevcut namespace'leri (app_uuid IS NULL) okuma/yazmada bu app'e ata.
  legacyDefaultAppId: null

  verification:
    dnsRecordPrefix: "_esr-verify"
    wellKnownPath: "/.well-known/esr-app-verification"
    challengeTtlSeconds: 86400
    fetchTimeoutSeconds: 10

  limits:
    perApp:
      namespacesPerDay: 100
      pairingTokensPerHour: 30
      recoverPerHour: 5
    perDeveloper:
      maxApps: 10                          # yalnızca self_service

  native:
    requireClientSecret: false
    requireManualReview: true

  developerPortal:
    enabled: false                         # şema alanı; runtime kapısı registrationMode + jwtSecret kullanır (aşağıya bakın)
    jwtSecret: "${ESR_DEVELOPER_JWT_SECRET}"
    sessionTtlHours: 168
    requireEmailVerification: true

  # operator_managed: startup'ta seed (DB ile birleşir; çakışmada DB kazanır).
  seed:
    - appId: esr_app_internal
      name: Dahili Web Uygulaması
      type: web
      status: active
      origins:
        - https://app.example.com
    - appId: esr_app_mobile
      name: Mobil İstemci
      type: native
      status: active
      bundleIds:
        ios: com.example.app
        android: com.example.app
      clientSecretHash: null
```

### 5.2 Ortam değişkenleri

İç içe anahtarlar `__` ile yazılır ([07-SERVER-CONFIGURATION.md](./07-SERVER-CONFIGURATION.md) §3). `load-config.ts` destekledikleri:

```bash
ESR_APPS__ENABLED=true
ESR_APPS__REGISTRATION_MODE=self_service          # operator_managed | self_service
ESR_APPS__ALLOW_LOCALHOST_ORIGINS=false
ESR_APPS__LEGACY_DEFAULT_APP_ID=esr_app_primary   # yalnızca v1.2 geçişi
ESR_APPS__NATIVE__REQUIRE_CLIENT_SECRET=false
ESR_APPS__NATIVE__REQUIRE_MANUAL_REVIEW=true
ESR_APPS__DEVELOPER_PORTAL__JWT_SECRET=change-me-long-random-min-32-chars
ESR_DEVELOPER_JWT_SECRET=change-me-long-random-min-32-chars   # jwtSecret alias'ı
ESR_APPS__LIMITS__PER_APP__NAMESPACES_PER_DAY=100
ESR_APPS__LIMITS__PER_APP__PAIRING_TOKENS_PER_HOUR=30
ESR_APPS__LIMITS__PER_APP__RECOVER_PER_HOUR=5
```

**Yalnızca YAML (şu an env override yok):** `verification.*`, `limits.perDeveloper.maxApps`, `developerPortal.enabled`, `developerPortal.sessionTtlHours`, `developerPortal.requireEmailVerification`, `seed[]`.

**Geliştirici portalı runtime:** Portal `apps.enabled: true`, `registrationMode: self_service` ve `developerPortal.jwtSecret` (min 32 karakter) varken açılır. `developerPortal.enabled` alanı config'te durur ama sunucu kapısı **okumaz** — `registrationMode` + JWT secret kullanın.

### 5.3 Mod matrisi

| `enabled` | `registrationMode` | Davranış |
|-----------|-------------------|----------|
| `false` | herhangi | v1.2 — `X-ESR-App-Id` yok, app bağsız namespace |
| `true` | `operator_managed` | Operatör YAML + `POST /v1/admin/apps`; geliştirici portalı yok |
| `true` | `self_service` | Geliştirici portalı + DNS/bundle doğrulama; admin yalnızca suspend |

`enabled: true` iken:

- Tüm public ve cihaz-auth uçları geçerli app bağlamı ister (§7).
- `POST /v1/namespaces` namespace'i **istek yapan app'e bağlar**.
- Başka app'in namespace'ine ait cihaz token → `403 APP_NAMESPACE_MISMATCH`.

---

## 6. Uygulama modeli

### 6.1 App tipleri

| type | Kimlik sinyali | Doğrulama |
|------|----------------|-----------|
| `web` | `Origin` header (tam eşleşme) | DNS TXT veya HTTPS well-known |
| `native` | `X-ESR-Bundle-Id` + `X-ESR-Platform: ios\|android\|desktop` | Manuel inceleme ve/veya client secret; gelecekte attestation |

### 6.2 Public tanımlayıcılar

| Alan | Format | Gizli mi? |
|------|--------|-----------|
| `appId` | `esr_app_` + 12 char base32 | **Hayır** — SDK'da gömülü |
| `clientSecret` | rastgele 32+ byte | **Evet** — yalnızca native confidential; hash saklanır; **oluşturma sırasında atanmaz** — yalnızca `rotate-secret` ile |

Web SPA **client secret kullanmamalı** (HTML/bundle'dan çıkarılabilir).

`native.requireClientSecret: true` iken auth gerektirmeyen uçlarda (`POST /v1/namespaces`, pairing redeem, recover) `X-ESR-Client-Secret` veya SDK `clientSecret` seçeneği zorunludur. Relay `/health` yanıtında `apps.nativeRequireClientSecret` alanı portal UI'nin secret bölümünü gösterip göstermeyeceğini belirler.

### 6.3 App durum makinesi

```mermaid
stateDiagram-v2
  [*] --> pending: oluştur
  pending --> pending_verification: origin/bundle ekle
  pending_verification --> active: doğrulama OK
  pending_verification --> pending: doğrulama başarısız/süresi doldu
  active --> suspended: operatör abuse
  suspended --> active: operatör geri al
  active --> archived: geliştirici sil
  archived --> [*]
```

| status | API erişimi | Tipik neden |
|--------|-------------|-------------|
| `pending` | Hayır — kayıt tamamlanmadı | App oluşturuldu; henüz origin/bundle yok |
| `pending_verification` | Hayır — doğrulama veya onay bekliyor | Web: origin doğrulanmadı. Native: bundle operatör onayı bekliyor (`requireManualReview`) |
| `active` | Evet | Web: en az bir doğrulanmış origin. Native: tüm bundle'lar onaylı |
| `suspended` | Hayır — `403 APP_SUSPENDED` | Operatör askıya aldı |
| `archived` | Hayır — soft delete | Geliştirici veya operatör arşivledi |

---

## 7. İstek kimlik doğrulama

### 7.1 Zorunlu header'lar (`apps.enabled: true`)

| Header | Zorunlu | Açıklama |
|--------|---------|----------|
| `X-ESR-App-Id` | Her zaman | Public app tanımlayıcı |
| `Origin` | Web | Tarayıcı gönderir; kayıtlı origin ile eşleşmeli |
| `X-ESR-Platform` | Native | `ios`, `android` veya `desktop` |
| `X-ESR-Bundle-Id` | Native | Bundle ID (iOS), package name (Android) veya uygulama kimliği (masaüstü) |
| `X-ESR-Client-Secret` | Native confidential | `native.requireClientSecret: true` iken |
| `Authorization` | Cihaz uçları | Mevcut `Bearer {device_token}` — **uygulama kaydı değil**; eşleşmiş cihaz kimliği (§7.3) |

İsteğe bağlı telemetri (güvenlik değil):

| Header | Örnek |
|--------|-------|
| `X-ESR-Client-Version` | `mynotes-ios/1.2.0` |

### 7.2 İki kimlik katmanı

App registry ve cihaz token'ı **ayrı** sorulara cevap verir:

| Katman | Header'lar | Soru |
|--------|------------|------|
| **Uygulama** | `X-ESR-App-Id` + (`Origin` veya native platform/bundle) [+ isteğe bağlı `X-ESR-Client-Secret`] | Bu relay'i hangi kayıtlı entegrasyon kullanabilir? |
| **Cihaz** | `Authorization: Bearer {device_token}` | Bu istek hangi eşleşmiş cihazdan, hangi namespace için? |

`POST /v1/namespaces` (ilk cihaz) henüz `device_token` üretmediği için `Authorization` gönderilmez; yanıtta `deviceToken` döner. Sonraki push/pull, pairing host uçları vb. cihaz token'ı gerektirir — app başlıkları yine zorunludur (`apps.enabled` açıkken).

### 7.3 Doğrulama algoritması

```
function validateAppContext(request):
  if !config.apps.enabled:
    return OK

  appId = header X-ESR-App-Id
  if missing: reject APP_ID_REQUIRED

  app = db.apps.findByAppId(appId)
  if !app: reject APP_NOT_FOUND
  if app.status != active: reject APP_SUSPENDED | APP_NOT_VERIFIED

  if app.type == web:
    origin = header Origin ?? parseRefererOrigin(Referer)
    if !origin: reject APP_ORIGIN_REQUIRED
    if config.apps.allowLocalhostOrigins && isLocalhost(origin):
      pass
    else if origin not in app.verified_origins:
      reject APP_ORIGIN_NOT_ALLOWED

  if app.type == native:
    platform = header X-ESR-Platform
    bundleId = header X-ESR-Bundle-Id
    if !platform || !bundleId: reject APP_NATIVE_ID_REQUIRED
    if !app.bundle_ids.matches(platform, bundleId):
      reject APP_BUNDLE_NOT_ALLOWED
    if config.apps.native.requireClientSecret:
      secret = header X-ESR-Client-Secret
      if !constantTimeEquals(hash(secret), app.client_secret_hash):
        reject APP_CLIENT_SECRET_INVALID

  attach request.appContext = app
  return OK
```

### 7.4 Cihaz token çapraz kontrolü

Cihaz auth middleware sonrası:

```
if config.apps.enabled:
  namespace = request.namespace
  if namespace.app_uuid != request.appContext.uuid:
    reject 403 APP_NAMESPACE_MISMATCH
```

### 7.5 Endpoint matrisi

| Endpoint | App bağlamı | Cihaz token | Not |
|----------|-------------|-------------|-----|
| `POST /v1/namespaces` | Zorunlu | — | `namespace.app_uuid` set eder |
| `POST /v1/namespaces/.../devices` | Zorunlu | — | Pairing redeem |
| `POST /v1/namespaces/.../recover` | Zorunlu | — | Recovery |
| `POST /v1/namespaces/.../pairing-tokens` | Zorunlu | Evet | Body'de opsiyonel `allowedAppIds` |
| Sync (`head`, `push`, `pull`) | Zorunlu | Evet | |
| WebSocket `/notifications` | Zorunlu (Origin) | Evet | Handshake |
| `GET /health` | Hayır | — | |
| Admin `/v1/admin/*` | Hayır | Admin token | |
| Developer `/v1/developer/*` | Developer JWT | — | yalnızca self_service |

### 7.6 Pairing kapsamı (opsiyonel)

Host hangi app'lerin kodu kullanabileceğini kısıtlayabilir:

```json
POST /v1/namespaces/{namespaceId}/pairing-tokens
{
  "ttlSeconds": 600,
  "allowedAppIds": ["esr_app_mynotes", "esr_app_mynotes_mobile"]
}
```

Listede olmayan `X-ESR-App-Id` ile redeem → `403 APP_PAIRING_NOT_ALLOWED`.

Varsayılan (alan yok): her **active** app redeem edebilir.

---

## 8. Origin ve domain doğrulama

### 8.1 Tam origin kuralları

Kayıtlı origin'ler **scheme ve port dahil** tam origin'dir:

```
https://app.example.com
https://app.example.com:8443
http://localhost:5173
http://127.0.0.1:3000
```

- Wildcard yok (`*.example.com` yasak).
- `https` ve `http` farklıdır.

### 8.2 DNS TXT doğrulama

```
_esr-verify.notes.example.com  TXT  esr_verify=esr_app_abc123:<random_token>
```

### 8.3 HTTPS well-known doğrulama

```
GET https://notes.example.com/.well-known/esr-app-verification
```

```json
{
  "appId": "esr_app_abc123",
  "token": "<aynı random token>"
}
```

### 8.4 Localhost geliştirme

`allowLocalhostOrigins: true` iken:

- `http://localhost:*` ve `http://127.0.0.1:*` DNS doğrulaması olmadan kabul edilir.
- Öneri: ayrı dev app (`esr_app_mynotes_dev`).
- Production'da `allowLocalhostOrigins: false` (true ise startup uyarısı).

### 8.5 `file://` (desteklenmiyor)

App registry açıkken Origin olmayan non-native istekler reddedilir. Statik `file://` sayfalar doğrulanabilir origin kaydedemez. Bunun yerine local dev server kullanın (`http://localhost:5173`).

---

## 9. Native uygulamalar (iOS / Android / masaüstü)

Native HTTP istemcileri güvenilir `Origin` göndermez. `type: native` kayıt kullanın.

### 9.1 Header'lar

**Uygulama bağlamı** (native — app registry katmanı):

```http
X-ESR-App-Id: esr_app_mynotes_mobile
X-ESR-Platform: ios
X-ESR-Bundle-Id: com.example.mynotes
```

`native.requireClientSecret: true` iken aynı isteklere ekleyin:

```http
X-ESR-Client-Secret: {client_secret}
```

**Kimlik doğrulamalı sync isteği** (uygulama + eşleşmiş cihaz):

```http
X-ESR-App-Id: esr_app_mynotes_mobile
X-ESR-Platform: ios
X-ESR-Bundle-Id: com.example.mynotes
Authorization: Bearer dvt_...
```

`Authorization` uygulama kaydı için değildir — §7.2'deki cihaz token'ıdır. İlk `POST /v1/namespaces` çağrısında henüz yoktur.

Android: `X-ESR-Platform: android`, paket adı `X-ESR-Bundle-Id` içinde.

Masaüstü (Electron, Tauri vb.): `X-ESR-Platform: desktop`, uygulama kimliği (ör. `com.example.mynotes`) `X-ESR-Bundle-Id` içinde.

### 9.2 Doğrulama katmanları

| Katman | Mekanizma | Sahteciliğe dayanıklılık |
|--------|-----------|--------------------------|
| **A — Operatör yönetimli** | Operatör bundle ID ekler | Düşük (curl ile header spoof) |
| **B — Confidential client** | Auth'suz uçlarda `X-ESR-Client-Secret` | Orta (Keychain/Keystore) |
| **C — Attestation (gelecek v1.4)** | App Attest / Play Integrity | Yüksek |

Katman A private self-hosted için yeterli. Public hosted relay için Katman B önerilir.

### 9.3 Self-service native akışı

1. Geliştirici `type: native` app oluşturur.
2. iOS bundle ID, Android paket adı ve/veya masaüstü uygulama kimliği ekler.
3. `requireManualReview: true` ise operatör onayına kadar `pending_verification`.
4. `active` → native header'lar kabul edilir.

### 9.4 SDK connect seçenekleri

```typescript
await EsrSync.connect({
  relayUrl: 'https://sync.senkron.la',
  appId: 'esr_app_mynotes_mobile',
  appPlatform: 'ios',
  bundleId: 'com.example.mynotes',
  clientSecret: process.env.ESR_CLIENT_SECRET,
})
```

---

## 10. Namespace bağlama

### 10.1 Kural

`apps.enabled: true` iken:

- Her namespace satırında null olmayan `app_uuid` FK → `apps.id`.
- `(namespace_id)` global unique kalır (UUID v4).
- Mantıksal izolasyon: app `A` ile oluşturulan namespace yalnızca `A` app bağlamıyla erişilebilir.

Aynı kişi iki app kullanırsa → iki bağımsız namespace evreni (farklı `namespaceId`).

### 10.2 Namespace oluşturma (güncellenmiş)

```http
POST /v1/namespaces
X-ESR-App-Id: esr_app_mynotes
Origin: https://notes.example.com
```

Body v1.2 ile aynı. Yanıta eklenen:

```json
{
  "namespaceId": "...",
  "appId": "esr_app_mynotes",
  "deviceToken": "...",
  ...
}
```

### 10.3 Recovery

Recovery, namespace'in app'i ile eşleşen app bağlamı gerektirir. Yanlış app → `403 APP_NAMESPACE_MISMATCH`.

### 10.4 App'ler arası migrasyon

**v1.3'te desteklenmez.** Namespace'i app'ler arası taşımak operatör aracı gerektirir — kapsam dışı.

---

## 11. Dinamik CORS

`apps.enabled: true` iken statik `cors.allowedOrigins` yalnızca fallback:

```typescript
cors.origin = (origin, callback) => {
  if (!config.apps.enabled) {
    return staticList(origin)
  }
  if (!origin) return callback(null, false)  // non-browser
  if (config.apps.allowLocalhostOrigins && isLocalhost(origin)) {
    return callback(null, true)
  }
  const app = appRegistry.findActiveByOrigin(origin)
  if (app) return callback(null, origin)  // echo exact origin
  return callback(null, false)
}
```

- Doğrulanmış origin'lerden dinamik allow list
- WebSocket handshake aynı Origin kuralı

---

## 12. Geliştirici portalı (self_service)

`registrationMode: self_service` iken etkin.

### 12.1 Geliştirici hesabı

Senkron son kullanıcı kimliğinden ayrı. E-posta, şifre hash, doğrulama durumu.

Geliştirici entegrasyonu kaydeder; Alice uygulamayı kullanır — geliştirici hesabı açmaz.

### 12.2 API yüzeyi

Base: `/v1/developer`

| Method | Path | Auth | Açıklama |
|--------|------|------|----------|
| POST | `/register` | — | Geliştirici hesabı |
| POST | `/login` | — | JWT oturum |
| POST | `/logout` | JWT | Oturum kapat |
| GET | `/me` | JWT | Profil |
| POST | `/apps` | JWT | App oluştur |
| GET | `/apps` | JWT | Kendi app'lerini listele |
| GET | `/apps/:appId` | JWT | Detay |
| PATCH | `/apps/:appId` | JWT | İsim güncelle |
| POST | `/apps/:appId/origins` | JWT | Web origin ekle |
| POST | `/apps/:appId/origins/:originId/verify` | JWT | DNS/HTTPS kontrolü |
| DELETE | `/apps/:appId/origins/:originId` | JWT | Origin kaldır |
| POST | `/apps/:appId/bundles` | JWT | Bundle ekle |
| DELETE | `/apps/:appId` | JWT | App arşivle |
| POST | `/apps/:appId/rotate-secret` | JWT | Native secret oluştur/yenile (plaintext yalnızca yanıtta) |

Admin API (`/v1/admin/apps`): suspend, kota override, native bundle manuel onay.

### 12.3 Onay akışları ve client secret

#### Web uygulamaları

1. Geliştirici veya operatör `type: web` app oluşturur → `pending`
2. HTTPS origin ekler → `pending_verification`
3. DNS TXT veya `/.well-known/esr-app-verification` doğrulaması → origin `verified_at` set
4. Koşullar sağlanınca servis `active` yapar → sync API kabul eder

Portal: geliştirici `/developer` veya operatör `/operator` → Apps → origin doğrula.

#### Native uygulamalar (iOS / Android / masaüstü)

1. `type: native` app oluştur → `pending`
2. Platform + bundle ID ekle (`ios`, `android`, `desktop`) → `pending_verification`
3. `native.requireManualReview: true` (varsayılan) ise operatör bundle onaylar (`POST .../bundles/:id/approve` veya portal **Onayla**)
4. Tüm bundle'lar onaylı → `active`

Native listede `pending_verification` durumu portalda **Onay bekliyor** olarak gösterilir (origin doğrulamasından farklı terminoloji).

#### Client secret yaşam döngüsü

| Adım | Davranış |
|------|----------|
| App oluşturma | `client_secret_hash` **NULL** — otomatik secret yok |
| Relay config | `native.requireClientSecret: true` → auth'suz uçlarda secret zorunlu |
| Oluşturma / yenileme | `POST /v1/developer/apps/:appId/rotate-secret` veya operatör portal **Gizli anahtar oluştur** |
| SDK | `EsrSync.connect({ clientSecret })` veya `X-ESR-Client-Secret` başlığı |
| Portal UI | Yalnızca `/health` → `apps.nativeRequireClientSecret: true`, app `active`, en az bir bundle, **tüm bundle'lar onaylı** iken gösterilir |
| Güvenlik | Web build'lerine gömülmemeli; Keychain / Keystore / sunucu env |

Secret rotate edildiğinde önceki hash anında geçersiz olur.

---

## 13. Operatör admin API

Base: `/v1/admin/apps` — `admin_api_token` gerekir.

| Method | Path | Açıklama |
|--------|------|----------|
| POST | `/apps` | App oluştur (portal atla) |
| GET | `/apps` | Tümünü listele |
| GET | `/apps/:appId` | Detay (origin + bundle) |
| PATCH | `/apps/:appId` | `name`, `status` (askıya al / geri al) |
| DELETE | `/apps/:appId` | Arşivle |
| POST | `/apps/:appId/origins` | Origin ekle (`verified: true` ile doğrudan veya challenge) |
| POST | `/apps/:appId/origins/:originId/verify` | DNS/HTTPS doğrula |
| DELETE | `/apps/:appId/origins/:originId` | Origin kaldır |
| POST | `/apps/:appId/bundles` | Native bundle ekle |
| POST | `/apps/:appId/bundles/:bundleId/approve` | Bekleyen bundle onayla |
| POST | `/apps/:appId/rotate-secret` | Native client secret oluştur/yenile |

Web portal `/operator` → **Apps** sekmesi bu API'yi BFF üzerinden kullanır. **Developers** sekmesi self-service hesap yönetimi (`/v1/admin/developers`).

---

## 14. Veri modeli

### 14.1 ER diyagramı (eklemeler)

Yeni tablolar: `developers`, `apps`, `app_origins`, `app_bundles`.

`namespaces.app_uuid` → `apps.id` FK.

`apps.enabled: false` iken `namespaces.app_uuid` nullable.

### 14.2 Migrasyon `006_app_registry.sql`

Tam DDL için [EN sürüm §14.2](../en/16-APP-REGISTRY.md#142-migration-006_app_registrysql-reference).

### 14.3 Pairing token

`allowed_app_ids`: nullable text array. NULL = kısıt yok.

---

## 15. Rate limit ve kotalar

Yeni scope'lar:

| action id | Kapsam |
|-----------|--------|
| `namespace_create` | app_id + IP |
| `pairing_token` | app_id |

App kotası aşımı → `429 RATE_LIMIT_EXCEEDED`, `details.appId`.

---

## 16. Güvenlik

### 16.1 Ek tehdit modeli

| Tehdit | Önlem |
|--------|-------|
| Kayıtsız istemci spam | `apps.enabled` + app kotası |
| Registry'de domain hijack | DNS/HTTPS doğrulama |
| curl ile Origin spoof | Tarayıcı kullanıcıları için irrelevant; non-browser rate limit |
| Çalıntı appId | Domain/bundle eşleşmesi olmadan web için işe yaramaz |
| Cross-app namespace probe | Uniform `APP_NAMESPACE_MISMATCH` |

### 16.2 App registry'nin korumadığı alanlar

- Payload gizliliği (E2EE + zero-knowledge)
- Yetkisiz namespace erişimi (pairing/recovery)
- Operatör metadata görünürlüğü

---

## 17. Hata kodları (yeni)

| HTTP | code | Açıklama |
|------|------|----------|
| 400 | APP_ID_REQUIRED | `X-ESR-App-Id` eksik |
| 400 | APP_ORIGIN_REQUIRED | Web isteğinde Origin yok |
| 400 | APP_NATIVE_ID_REQUIRED | Native header eksik |
| 401 | APP_CLIENT_SECRET_INVALID | Yanlış native secret |
| 403 | APP_NOT_FOUND | Bilinmeyen appId |
| 403 | APP_NOT_VERIFIED | App henüz active değil |
| 403 | APP_SUSPENDED | Operatör askıya aldı |
| 403 | APP_ORIGIN_NOT_ALLOWED | Origin kayıtlı değil |
| 403 | APP_BUNDLE_NOT_ALLOWED | Bundle/package uyuşmuyor |
| 403 | APP_NAMESPACE_MISMATCH | Namespace başka app'e ait |
| 403 | APP_PAIRING_NOT_ALLOWED | allowedAppIds dışında |
| 409 | APP_ORIGIN_EXISTS | Duplicate origin |
| 409 | APP_BUNDLE_EXISTS | Duplicate bundle |

Tam liste: [12-ERROR-CODES.md](./12-ERROR-CODES.md).

---

## 18. SDK değişiklikleri

```typescript
interface EsrSyncOptions {
  relayUrl: string
  appId?: string
  appPlatform?: 'web' | 'ios' | 'android' | 'desktop'
  bundleId?: string
  clientSecret?: string
  clientVersion?: string
}
```

| Relay config | appId'siz eski SDK |
|--------------|-------------------|
| `apps.enabled: false` | Çalışır |
| `apps.enabled: true` | `APP_ID_REQUIRED` — SDK güncellemesi gerekir |

---

## 19. v1.2'den migrasyon

1. `apps.enabled: false` ile v1.3 deploy — davranış değişmez.
2. Seed app'ler oluştur.
3. `legacyDefaultAppId` set et.
4. `UPDATE namespaces SET app_uuid = ... WHERE app_uuid IS NULL`.
5. `apps.enabled: true` aç.
6. SDK'da zorunlu `appId` yayınla.
7. Migrasyon sonrası `legacyDefaultAppId` kaldır.

### Self-hosted önerilen varsayılan

```yaml
apps:
  enabled: true
  registrationMode: operator_managed
  allowLocalhostOrigins: false
  seed:
    - appId: esr_app_primary
      name: Kuruluş Uygulamaları
      type: web
      status: active
      origins:
        - https://app.example.com
```

---

## 20. Uygulama planı (tamamlandı)

### Faz A — Çekirdek registry — tamamlandı

Migrasyon, config, middleware, namespace bağlama, dinamik CORS, SDK header'ları.

### Faz B — Operatör admin API — tamamlandı

`/v1/admin/apps` CRUD, suspend, seed merge.

### Faz C — Domain doğrulama — tamamlandı

DNS TXT + HTTPS well-known, localhost dev yolu.

### Faz D — Geliştirici portalı — tamamlandı

JWT auth, self-service CRUD, e-posta doğrulama.

### Faz E — Native + pairing scope — tamamlandı

Bundle kayıt, client secret, `allowedAppIds`, WS Origin.

### Faz F — Dokümantasyon ve OpenAPI — tamamlandı

Agent docs, OPERATOR.md, Postman.

---

## 21. Kabul kriterleri

- [ ] `apps.enabled: false` — tüm v1.2 testleri geçer
- [ ] `operator_managed` — eşleşen origin ile sync çalışır
- [ ] Yanlış origin → `403 APP_ORIGIN_NOT_ALLOWED`
- [ ] App A namespace'i app B ile erişilemez
- [ ] `self_service` — operatör olmadan domain verify → active
- [ ] Localhost dev `allowLocalhostOrigins: true` ile çalışır
- [ ] `allowedAppIds` pairing kısıtı çalışır
- [ ] Dinamik CORS yalnızca doğrulanmış origin'ler
- [ ] Web SDK'da client secret yok
- [ ] Legacy namespace migrasyonu `legacyDefaultAppId` ile

---

## 22. İlgili belgeler

| Belge | Güncelleme |
|-------|------------|
| [04-API-REFERENCE.md](./04-API-REFERENCE.md) | App header'ları, yeni uçlar |
| [07-SERVER-CONFIGURATION.md](./07-SERVER-CONFIGURATION.md) | `apps` config |
| [08-SECURITY.md](./08-SECURITY.md) | App tehdit modeli |
| [10-DATA-MODEL.md](./10-DATA-MODEL.md) | Yeni tablolar |
| [11-IMPLEMENTATION-PLAN.md](./11-IMPLEMENTATION-PLAN.md) | Faz A–F |
| [12-ERROR-CODES.md](./12-ERROR-CODES.md) | App hata kodları |
| [14-ESR-SYNC-FACADE.md](./14-ESR-SYNC-FACADE.md) | `appId` connect |

---

## 23. Sürüm geçmişi

| Sürüm | Değişiklik |
|-------|------------|
| **1.3.0** | App registry, namespace–app bağlama, operator/self-service modları |
| 1.2.0 | Namespace başına çoklu belge |
| 1.1.0 | WebSocket bildirimleri |
| 1.0.x | İlk ESR MVP |
