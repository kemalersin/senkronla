# Senkronla — SDK referansı (`@senkronla/client`)

> **Hedef kitle:** Senkronla'yı JavaScript/TypeScript ile entegre eden yapay zeka agent'ları.
> **İlgili:** [Agent genel bakış](tr.md) · [REST API referansı](api-tr.md) · [İnsan SDK sayfası](/tr/sdk)

JS/TS yığınları için varsayılan yol: **`EsrSync`** facade. SDK çalıştırılamıyorsa [REST](api-tr.md) kullanın.

---

## İçindekiler

1. [Kurulum](#kurulum)
2. [Uygulama kodu vs SDK](#uygulama-kodu-vs-sdk)
3. [Minimal kurulum](#minimal-kurulum)
4. [Çoklu belge](#çoklu-belge)
5. [EsrSync.connect seçenekleri](#esrsyncconnect-seçenekleri)
6. [Belge adapter'ı](#belge-adapterı)
7. [Zarf şifrelemesi (ENV-ENC1)](#zarf-şifrelemesi-env-enc1)
8. [Yerel depolama (EsrStorage)](#yerel-depolama-esrstorage)
9. [EsrSync metotları](#esrsync-metotları)
10. [Cihaz yönetimi](#cihaz-yönetimi)
11. [Sync yaşam döngüsü](#sync-yaşam-döngüsü)
12. [Durum değerleri](#durum-değerleri-esrsyncstatus)
13. [SDK hata kodları](#sdk-istemci-hata-kodları)
14. [Düşük seviye RelayClient](#düşük-seviye-relayclient)

---

## Kurulum

```bash
npm install @senkronla/client
# veya
pnpm add @senkronla/client
```

Node.js 22+ veya `fetch` ve Web Crypto destekleyen modern tarayıcı gerekir.

**`@senkronla/client`** TypeScript tiplerini ve tipik bir `EsrSync` entegrasyonu için gereken her şeyi içerir. SDK push/pull sırasında `ESR-DOC1` / `ENV-ENC1` zarflarını oluşturur ve çözer — bu yol için ikinci bir paket gerekmez.

npm'de yayında: [@senkronla/client](https://www.npmjs.com/package/@senkronla/client) · [@senkronla/protocol](https://www.npmjs.com/package/@senkronla/protocol) · [@senkronla/cli](https://www.npmjs.com/package/@senkronla/cli)

### Yalnızca REST entegrasyonu

`EsrSync` kullanmadan relay'e doğrudan HTTP ile istek atıyorsanız **`@senkronla/protocol`** ekleyin — örneğin Swift/Kotlin native uygulama, sunucu tarafı iş veya özel bir fetch istemcisi:

```bash
npm install @senkronla/protocol
# veya
pnpm add @senkronla/protocol
```

Protocol paketi `buildEnvEnc1Payload`, `sha256Hex` ve şema doğrulama gibi düşük seviye yardımcılar sağlar; dış zarfı siz birleştirip `PUT .../documents/{documentId}` gönderirsiniz. Web ve Node uygulamalarının çoğu yalnızca SDK ile başlamalıdır. Tam REST akışı: [API — Zarf şifreleme](/tr/api#encryption).

Çalıştırılabilir örnek: `examples/multi-document-sync.ts` (`ESR_RELAY_URL` ile `pnpm example:multi-document`).

---

## Uygulama kodu vs SDK

Senkronla opak JSON anlık görüntüleri saklar. Uygulamanın veri modelini, arayüzünü, faturalandırma ekranlarını veya store katmanını **içermez**. Örneklerde yer tutucu adlar kullanılır — `@senkronla/client` parçası **değildir**:

```typescript
// Kod örneği açıklaması
//   // app:     UYGULAMA kodu — @senkronla/client parçası değil
//   appStore, appUi, appSession — yer tutucu; uygulamanın state/UI/auth katmanına bağlayın
//   EsrSync, createDocumentAdapter, … — SDK (@senkronla/client)
```

| Alan | Uygulama sağlar | SDK sağlar |
|------|-----------------|------------|
| Belge adapter'ı | `exportDocument` / `importDocument` — uygulama durumunu JSON olarak serileştirin ve uygulayın | Uygulamanın sağladığı fonksiyonları sarar; push/pull sırasında çağırır |
| Çalışma alanı kimliği | Müşteri başına sabit UUID; `ensureNamespace()` öncesi kalıcı saklayın | Kimliği relay'e gönderir; kayıt açıkken namespace'i uygulamaya bağlar |
| Kurtarma ifadesi UX | `onRecoveryPhrase` — 24 kelimelik ifadeyi kopyalama/kaydetme modalı (zorunlu, bir kez) | Çalışma alanı oluşturulunca ifade üretir; uygulama callback'ini çağırır |
| Çakışma UX | `onConflict` — kullanıcıya sorun; `remote`, `local` veya `cancel` döndürün (zorunlu) | Revision uyuşmazlığını algılar; uygulama seçene kadar bekler |
| Cihaz limiti UX | `onDeviceLimit` — slotlar dolunca yükseltme / iptal arayüzü (isteğe bağlı) | `DEVICE_LIMIT_*` hatalarını slot paketi ipuçlarıyla iletir |
| Senkron göstergeleri | `onStatusChange`, `onDocumentStatusChange` — rozet veya spinner (isteğe bağlı) | `idle`, `syncing`, `conflict`, `offline` vb. bildirir |
| Yerel düzenleme bağlantısı | Yerel düzenlemeden sonra `appStore` dinleyicisinden (veya eşdeğerinden) `notifyLocalChange(documentId?)` çağırın | Gecikmeli push kuyruğu (varsayılan 2 sn) |
| Eşleştirme ekranları | `startPairing()` sonucundaki `code` / `qrPayload` değerlerini gösterin; misafir `joinPairing()` için kodu girer | Eşleştirme token'ı oluşturur; kod, QR yükü, süre döndürür |
| Senkron parolası | `resolvePassword()` veya manuel `buildEnvelope` parolası — `appSession`, keychain veya prompt | Push'ta `ENV-ENC1` zarfı oluşturur; pull'da çözer |
| Yerel kalıcılık | `EsrStorage` uygulaması veya `createLocalStorageAdapter`; mobilde güvenli depolama | `deviceToken`, belge revision'ları, isteğe bağlı kurtarma ifadesi saklar |
| Relay bağlantısı | Relay operatöründen `relayUrl`, `appId`, native alanlar | Relay'e HTTP + WebSocket istemcisi |

İnsan dokümantasyonu: [/tr/sdk#integration](/tr/sdk#integration)

---

## Minimal kurulum

```typescript
// Kod örneği açıklaması — yukarıdaki "Uygulama kodu vs SDK" bölümüne bakın
import {
  EsrSync,
  createDocumentAdapter,
  createLocalStorageAdapter,
  generateNamespaceId,
} from '@senkronla/client'

const namespaceId = generateNamespaceId()
// app: ensureNamespace öncesi kalıcı saklayın — yeniden kurulumda aynı id

const document = createDocumentAdapter({
  namespaceId,
  namespaceLabel: 'Müşteri çalışma alanı',
  contentType: 'application/vnd.myapp+json',
  encrypt: true,
  // app: senkron parolası — SDK üretmez
  resolvePassword: async () => appSession.getSyncPassword(),
  // app: uygulama durumunu JSON olarak serileştirin / geri yükleyin
  exportDocument: () => appStore.exportJson(),
  importDocument: (json) => appStore.importJson(json),
})

const sync = await EsrSync.connect({
  relayUrl: 'https://sync.ornek.com/v1',
  appId: 'esr_app_mynotes', // GET /health → apps.enabled true iken zorunlu
  document,
  storage: createLocalStorageAdapter('myapp'),
  // app: zorunlu — bir kez gösterin; kullanıcı çevrimdışı kaydetmeli
  onRecoveryPhrase: async ({ phrase }) => {
    await appUi.showRecoveryModal(phrase)
  },
  // app: zorunlu — 'remote' | 'local' | 'cancel' döndürün
  onConflict: async (ctx) => {
    return appUi.askKeepLocalOrRemote(ctx.remoteMeta.writtenAt)
  },
})
// Native: appPlatform, bundleId; GET /health → apps.nativeRequireClientSecret iken clientSecret

await sync.ensureNamespace()
await sync.sync()
// app: her yerel düzenlemeden sonra çağırın
appStore.onChange(() => sync.notifyLocalChange('primary'))
```

---

## Çoklu belge

Aynı namespace'te ayrı anlık görüntüler için `documents[]` kullanın:

```typescript
import {
  EsrSync,
  createDocumentAdapter,
  createMemoryStorageAdapter,
} from '@senkronla/client'

let appState = { notes: ['Hoş geldiniz'] }
let settings = { theme: 'light' as const }

const sync = await EsrSync.connect({
  relayUrl: 'https://sync.ornek.com/v1',
  appId: 'esr_app_mynotes', // GET /health → apps.enabled true iken zorunlu
  storage: createMemoryStorageAdapter(),
  documents: [
    {
      adapter: createDocumentAdapter({
        namespaceId,
        namespaceLabel: 'Müşteri çalışma alanı',
        contentType: 'application/vnd.myapp+json',
        encrypt: true,
        resolvePassword: async () => appSession.getSyncPassword(),
        exportDocument: async () => appState,
        importDocument: async (json) => {
          appState = json as typeof appState
        },
      }),
    },
    {
      documentId: 'settings',
      adapter: createDocumentAdapter({
        namespaceId,
        namespaceLabel: 'Müşteri çalışma alanı',
        contentType: 'application/vnd.example.settings+json',
        encrypt: true,
        resolvePassword: async () => appSession.getSyncPassword(),
        exportDocument: async () => settings,
        importDocument: async (json) => {
          settings = json as typeof settings
        },
      }),
    },
  ],
  // app: zorunlu callback'ler — appUi ile değiştirin
  onRecoveryPhrase: async ({ phrase }) => appUi.showRecoveryModal(phrase),
  onConflict: async (ctx) => {
    return appUi.askKeepLocalOrRemote(ctx.remoteMeta.writtenAt)
  },
  onDocumentStatusChange: (documentId, status) => appUi.setDocBadge(documentId, status),
})

console.log(sync.documentIds) // ['primary', 'settings']

settingsStore.onChange(() => sync.notifyLocalChange('settings'))
await sync.sync('settings')

const listed = await sync.relay.listDocuments(namespaceId)
```

`primary` dışı id'ler `schemaVersion: 2` kullanır (SDK otomatik yönetir).

---

## EsrSync.connect seçenekleri

| Seçenek | Zorunlu | Varsayılan | Açıklama |
|---------|---------|------------|----------|
| `relayUrl` | evet | — | `/v1` ile biten temel URL |
| `appId` | relay gerektiriyorsa | — | Public app id (`esr_app_…`) — `apps.enabled` iken |
| `appPlatform` | native | — | `ios`, `android` veya `desktop` |
| `bundleId` | native | — | Bundle ID, paket adı veya masaüstü uygulama kimliği |
| `clientSecret` | native confidential | — | `native.requireClientSecret: true` iken; rotate-secret ile, kayıtta otomatik değil |
| `clientVersion` | hayır | — | `X-ESR-Client-Version` telemetri |
| `document` | birinden* | — | Tek belge (`primary`) |
| `documents` | birinden* | — | Çoklu slot (`documentId?` + `adapter`) |
| `storage` | evet | — | `EsrStorage` — web'de `createLocalStorageAdapter()` |
| `onRecoveryPhrase` | evet | — | Namespace oluşturulunca `{ phrase, namespaceId }` ile bir kez |
| `onConflict` | evet | — | `'remote'`, `'local'` veya `'cancel'`; `ctx.documentId` slot'u belirtir |
| `deviceLabel` | hayır | otomatik | Cihaz listesinde görünür |
| `onDeviceLimit` | hayır | — | `DEVICE_LIMIT_*` — faturalandırma UI |
| `onStatusChange` | hayır | — | Genel sync göstergesi |
| `onDocumentStatusChange` | hayır | — | Belge bazlı durum |
| `onError` | hayır | — | `EsrError` loglama |
| `pushDebounceMs` | hayır | `2000` | `notifyLocalChange()` sonrası push gecikmesi |
| `notificationsEnabled` | hayır | `true` | WebSocket + poll yedek |
| `notificationMode` | hayır | `ws_with_poll_fallback` | veya `poll_only` |
| `websocketEnabled` | hayır | `true` | WS öncesi `/health` ile `websocket.enabled` kontrolü |
| `persistRecoveryPhrase` | hayır | `true` | İfadeyi `EsrStorage`'da sakla |
| `pauseSchedulerWhenHidden` | hayır | `true` | Sekme gizliyken arka plan sync duraklat |
| `pullIntervalConnectedMs` | hayır | — | WS bağlıyken poll aralığı |
| `pullIntervalDisconnectedMs` | hayır | — | Çevrimdışı poll aralığı |
| `enabled` | hayır | `true` | Hazır olana kadar `false` |
| `fetch` | hayır | `globalThis.fetch` | Test veya özel runtime için |

\* `document` veya `documents` — tam olarak biri.

### Tam connect örneği (web SPA)

```typescript
const sync = await EsrSync.connect({
  relayUrl: 'https://sync.ornek.com/v1',
  appId: 'esr_app_mynotes', // GET /health → apps.enabled true iken zorunlu
  document,
  storage: createLocalStorageAdapter('myapp'),
  deviceLabel: 'Alice laptop',
  onRecoveryPhrase: async ({ phrase }) => appUi.showRecoveryModal(phrase),
  onConflict: async (ctx) => appUi.askKeepLocalOrRemote(ctx.remoteMeta.writtenAt),
  onDocumentStatusChange: (documentId, status) => appUi.setDocBadge(documentId, status),
  onDeviceLimit: async (ctx) => {
    if (ctx.code === 'DEVICE_LIMIT_PAYMENT_REQUIRED') appUi.showUpgrade(ctx.slotPackages)
  },
  onStatusChange: (status) => appUi.setSyncIndicator(status),
  onError: (error) => appLogger.warn(error.code),
  pushDebounceMs: 2000,
  notificationsEnabled: true,
  persistRecoveryPhrase: true,
})
// Native: appPlatform, bundleId; GET /health → apps.nativeRequireClientSecret iken clientSecret
```

`appId`'yi yalnızca relay `apps.enabled: false` (v1.2 legacy) iken atlayın. Kayıt, native alanlar ve client secret için [Uygulama kaydı](#uygulama-kaydı-v13) bölümüne bakın.

---

## Uygulama kaydı (v1.3)

Relay'de `apps.enabled: true` iken her entegrasyon kayıtlı `appId` ile kendini tanıtmalıdır. Namespace'ler onu oluşturan uygulamaya bağlıdır.

### İki kimlik katmanı

| Katman | Mekanizma | Soru |
|--------|-----------|------|
| Uygulama | `appId` + `Origin` (web) veya platform/bundle başlıkları (native) | Hangi entegrasyon relay'i kullanabilir? |
| Cihaz | `Authorization: Bearer {deviceToken}` | Hangi eşleşmiş cihaz, hangi namespace? |

App başlıkları tüm `/v1` rotalarında zorunlu (create/pair/recover dahil). İlk `POST /v1/namespaces`'te cihaz token'ı yok — yanıtta döner.

### Kayıt modları

| Config | Kim kaydeder |
|--------|--------------|
| `apps.enabled: false` | App başlığı yok — v1.2 |
| `operator_managed` | Operatör (YAML veya `/operator`) |
| `self_service` | Geliştiriciler `/developer` |

### Onay

- **Web:** HTTPS origin → DNS TXT veya well-known → `active`
- **Native:** bundle ekle → `requireManualReview` açıksa operatör onaylar → tüm bundle'lar onaylı → `active`

### Native client secret

- Kayıtta otomatik atanmaz
- `native.requireClientSecret: true` iken kimlik doğrulamasız rotalarda zorunlu
- `POST .../rotate-secret` veya portal
- `EsrSync.connect({ clientSecret })` veya `X-ESR-Client-Secret`
- Web build'lerine gömülmemeli

Tam spec: [16-APP-REGISTRY.md](https://github.com/kemalersin/senkronla/blob/main/docs/tr/16-APP-REGISTRY.md). İnsan dokümantasyonu: `/sdk#app-registry`, `/api#app-registry`.

---

## Belge adapter'ı

`createDocumentAdapter` veya `DocumentAdapter` uygulayın:

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

`createDocumentAdapter` `exportDocument: () => Promise<unknown>` kabul eder — değerler otomatik JSON-stringify edilir.

**Kurallar:**

- `namespaceId` geçerli **UUID v4** olmalı, cihazlar arası sabit.
- `contentType` vendor MIME olmalı.
- `encryption.enabled` **`true`** önerilir — `resolvePassword()` ile parola sağlayın; SDK `ENV-ENC1` üretir. Ayrıntılar: [Zarf şifrelemesi](#zarf-şifrelemesi-env-enc1).
- `exportDocument()` hızlı olmalı.

---

## Zarf şifrelemesi (ENV-ENC1)

Üretimde `createDocumentAdapter({ encrypt: true, resolvePassword })` veya `buildEnvelope({ encrypt: true, password })` kullanın. REST ayrıntıları: [API — Zarf şifrelemesi](api-tr.md#zarf-şifrelemesi-env-enc1).

### Senkron parolası — SDK nasıl alır?

Parola **uygulamanıza aittir**; SDK üretmez. `DocumentAdapter.encryption()` içinde `enabled: true` ve `resolvePassword()` tanımlarsınız. `SyncEngine` her push/pull öncesi `resolvePassword()` çağırır ve sonucu `buildEnvelope` / `extractDocument`'a verir.

Tipik kaynaklar: oturum açılışında sorulan master password, OS keychain / secure enclave, kurulum sırasında belirlenen workspace parolası. Eşleştirilmiş cihazlar aynı parolayı paylaşmalıdır — SDK bunu cihazlar arası senkronize etmez.

### Push / pull akışı

1. **Push:** `buildDocument()` → `resolvePassword()` → `buildEnvelope({ encrypt: true, password })` → `PUT .../documents/{documentId}`
2. **Pull:** `GET .../head` → `resolvePassword()` → `extractDocument(envelope, password)` → `importDocument(json)`
3. `salt` ve `nonce` her push'ta rastgele üretilir ve `payload` içinde saklanır — relay kullanmaz, pull cihazı için gereklidir

### Şifreli adapter örneği

```typescript
const document = createDocumentAdapter({
  namespaceId: appWorkspace.id,
  namespaceLabel: appWorkspace.name,
  contentType: 'application/vnd.myapp+json',
  encrypt: true,
  // app: senkron parolası — SDK üretmez
  resolvePassword: async () => appSession.getSyncPassword(),
  exportDocument: () => appStore.exportSnapshot(),
  importDocument: (json) => appStore.importSnapshot(json),
})
```

### Doğrudan buildEnvelope

```typescript
import { buildEnvelope, extractDocument } from '@senkronla/client'

// app: resolvePassword() ile aynı kaynak
const password = await appSession.getSyncPassword()

const envelope = await buildEnvelope({
  namespaceId: appWorkspace.id,
  namespaceLabel: appWorkspace.name,
  documentJson: JSON.stringify(await appStore.exportSnapshot()),
  deviceId: clientDeviceId,
  contentType: 'application/vnd.myapp+json',
  encrypt: true,
  password,
})

// Pull — aynı parola ENV-ENC1'i çözer
const json = await extractDocument(remoteEnvelope, password)
```

**Uyarı — Kurtarma ifadesi ≠ senkron parolası:** `onRecoveryPhrase` namespace oluşturulduğunda bir kez gösterilir ve relay erişim kanıtı içindir. Zarf şifreleme parolası ayrıdır; kaybolursa şifreli uzak veri geri getirilemez.

---

## Yerel depolama (EsrStorage)

| Adapter | Kullanım |
|---------|----------|
| `createLocalStorageAdapter()` | Tarayıcı — `localStorage` içinde `esr.` önekli anahtarlar |
| `createMemoryStorageAdapter(initial?)` | Node script'leri, testler, örnekler |

Namespace başına anahtarlar:

| Anahtar | Amaç |
|---------|------|
| `deviceToken` | Bearer token |
| `knownRemoteRevision` | Belge başına son revision (çakışma) |
| `recoveryPhrase` | `persistRecoveryPhrase: true` ise |
| `global:clientDeviceId` | Kurulum başına bir kez |

Mobilde Keychain / Keystore — düz localStorage kullanmayın.

---

## EsrSync metotları

| Metot | Amaç |
|-------|------|
| `ensureNamespace(opts?)` | İlk açılışta alan oluştur veya token doğrula |
| `sync(documentId?)` | Tam pull/push; id ile tek belge, yoksa tüm slotlar |
| `notifyLocalChange(documentId?)` | Kirli işaretle; gecikmeli push |
| `flushPush(documentId?)` | Anında push |
| `startPairing(opts?)` | Ana cihaz: `{ code, qrPayload, expiresAt }`; `apps.enabled` iken isteğe bağlı `{ allowedAppIds }` |
| `joinPairing(code)` | Misafir: kodu kullanır, `sync()` çalıştırır |
| `recover(phrase)` | Kurtarma; diğer cihazları iptal eder |
| `listDevices()` | Eşleşmiş cihazları ve slot limitlerini listeler (ayarlar ekranı) |
| `revokeDevice(deviceId)` | Sunucu ULID ile bir cihazı iptal eder — son cihaz olamaz |
| `redeemUnlockCode(code)` | Operatör açılış kodu |
| `resolveConflict(choice, documentId?)` | Manuel çakışma çözümü |
| `getStatus()` | `EsrSyncStatus` |
| `getLastError()` | Son `EsrError` |
| `disable()` | Zamanlayıcı ve bildirimleri durdur |

Salt okunur: `relayUrl`, `relay` (`RelayClient`), `documentIds`.

`apps.enabled` iken misafir redeem'i belirli app'lere kısıtlamak için:

```typescript
await sync.startPairing({
  allowedAppIds: ['esr_app_mynotes', 'esr_app_mynotes_mobile'],
})
```

#### Çakışmalar

```typescript
// app: uygulama tarafında uygulayın — @senkronla/client sağlamaz
onConflict: async (ctx) => {
  // ctx: { namespaceId, documentId, knownRevision, remoteRevision, remoteMeta }
  return appUi.askKeepLocalOrRemote(ctx.remoteMeta.writtenAt) // 'remote' | 'local' | 'cancel'
}

await sync.resolveConflict('remote', 'settings')
```

Zarf yardımcıları: `buildEnvelope`, `buildEnvEnc1Payload`, `extractDocument`, `buildRecoveryKeyProof` — bkz. [Zarf şifrelemesi](#zarf-şifrelemesi-env-enc1) ve [API referansı](api-tr.md#zarf-şifrelemesi-env-enc1).

---

## Cihaz yönetimi

Geçerli `deviceToken`'a sahip herhangi bir eşleşmiş cihaz, aynı namespace'teki diğer cihazları listeleyip iptal edebilir. **Cihazları yönet** ayarlar ekranı veya eşleştirmede slot limiti için kullanın.

**REST (SDK üzerinden):**

| Metod | Yol | SDK |
|-------|-----|-----|
| `GET` | `/v1/namespaces/{namespaceId}/devices` | `sync.listDevices()` veya `sync.relay.listDevices(namespaceId)` |
| `DELETE` | `/v1/namespaces/{namespaceId}/devices/{deviceId}` | `sync.revokeDevice(deviceId)` → `204 No Content` |

İkisi de `Authorization: Bearer dvt_...` gerektirir. Tam şekiller: [api-tr.md § Cihazlar](api-tr.md#cihaz-listesi--iptal).

### `listDevices()`

Mevcut namespace oturumu için aktif cihazları ve slot sayaçlarını döndürür.

```typescript
const { devices, limits } = await sync.listDevices()

for (const device of devices) {
  console.log(device.label, device.isCurrent ? '(bu cihaz)' : '')
}

// limits.maxDevices, limits.activeDevices, limits.canAddDevice
// limits.onLimitReached?.mode — 'payment' | 'block'
```

| Alan | Anlam |
|------|--------|
| `device.deviceId` | Sunucu id (ULID) — **`revokeDevice()` içinde kullanın** |
| `device.clientDeviceId` | Kurulum başına id — yalnızca gösterim |
| `device.label` | Eşleştirmeden gelen ad |
| `device.pairedAt` | ISO zaman damgası |
| `device.lastSeenAt` | Son aktivite veya `null` |
| `device.isCurrent` | Bu SDK oturumu için `true` |
| `limits.maxDevices` | Ücretsiz + satın alınan slotlar |
| `limits.activeDevices` | İptal edilmemiş cihazlar |
| `limits.canAddDevice` | Şimdi yeni eşleştirme mümkün mü |

### `revokeDevice(deviceId)`

Tek cihazı iptal eder. `listDevices()` dönen sunucu **`deviceId`** geçin — `clientDeviceId` değil.

```typescript
import { isEsrError } from '@senkronla/client'

try {
  await sync.revokeDevice('01HZPXDEVICEGUEST01')
  const refreshed = await sync.listDevices() // ayarlar UI güncelle
} catch (error) {
  if (isEsrError(error) && error.code === 'LAST_DEVICE_PROTECTED') {
    // namespace'te en az bir aktif cihaz kalmalı
  }
}
```

| Kural | Açıklama |
|-------|----------|
| Son cihaz | `403 LAST_DEVICE_PROTECTED` |
| Bilinmeyen / zaten iptal | `404 DEVICE_NOT_FOUND` |
| Kendini iptal | Başka aktif cihaz varken mümkün; bu token geçersiz olur — `EsrStorage` temizleyip eşleştirme/kurtarmaya yönlendirin |
| `recover()` farkı | Kurtarma **diğer tüm** cihazları iptal eder ve bu kuruluma yeni token verir |

Ayarlar UI örneği:

```typescript
const { devices } = await sync.listDevices()

async function removeDevice(deviceId: string) {
  await sync.revokeDevice(deviceId)
  return sync.listDevices()
}
```

### Cihaz slot limitleri

Çalışma alanı doluyken eşleştirme `joinPairing` şu kodlarla başarısız olabilir:

| Kod | Operatör modu | UX |
|-----|---------------|-----|
| `DEVICE_LIMIT_PAYMENT_REQUIRED` | `payment` | Yükseltme / unlock — isteğe bağlı `onDeviceLimit` ve `slotPackages`; `redeemUnlockCode()` |
| `DEVICE_LIMIT_BLOCKED` | `block` | Sert üst sınır — `listDevices()` + `revokeDevice()` ile eski cihaz iptal |

`EsrSync.connect()` içinde `onDeviceLimit` verilirse `DEVICE_LIMIT_*` orada yakalanır; yoksa `onError` / `getLastError()`.

**Block modu — iptal edip eşleştirmeyi tekrarla:**

```typescript
try {
  await sync.joinPairing(code)
} catch (error) {
  if (!isEsrError(error) || error.code !== 'DEVICE_LIMIT_BLOCKED') throw error

  const { devices } = await sync.listDevices()
  const other = devices.find((d) => !d.isCurrent)
  if (other) await sync.revokeDevice(other.deviceId)
  await sync.joinPairing(code)
}
```

**Payment modu — slot aç:**

```typescript
await sync.redeemUnlockCode('UNLK-7X9K-2M4P')
await sync.joinPairing(code) // veya listDevices() ile limit kontrol
```

---

## Sync yaşam döngüsü

1. **Açılış** → `ensureNamespace()` → `sync()`
2. **Düzenleme** → `notifyLocalChange(documentId?)`
3. **Ağ / odak** → `sync()` veya `sync('settings')`
4. **Çıkış** → `flushPush(documentId?)` → isteğe bağlı `disable()`

---

## Durum değerleri (`EsrSyncStatus`)

`idle` · `syncing` · `pending_push` · `remote_pending` · `conflict` · `offline` · `ws_connected` · `error` · `disabled`

---

## SDK istemci hata kodları

Tüm hatalar `EsrError` ve kararlı `code` taşır. Relay hataları olduğu gibi geçer.

### Yalnızca SDK (yerel)

| Kod | Eylem |
|-----|-------|
| `ESR_CLIENT_NO_TOKEN` | `ensureNamespace`, `joinPairing` veya `recover` |
| `ESR_CLIENT_OFFLINE` | Çevrimiçi olunca `sync()` tekrar |
| `ESR_CLIENT_NO_FETCH` | Fetch API yok — Node 18+ veya polyfill |
| `ESR_CLIENT_HTTP_ERROR` | Genel HTTP hatası |
| `ESR_CLIENT_SYNC_FAILED` | Beklenmeyen sync hatası |
| `ESR_CLIENT_NAMESPACE_EXISTS` | Eşleştirme/kurtarma |
| `ESR_CLIENT_CONFLICT_CANCELLED` | Kullanıcı iptal |
| `ESR_CLIENT_NO_DOCUMENT` | `connect`'e `document` / `documents` verin |
| `ESR_CLIENT_UNKNOWN_DOCUMENT_ID` | `sync(id)` yapılandırılmamış |
| `ESR_CLIENT_INVALID_DOCUMENT_ID` | `documentId` formatını düzelt |
| `ESR_CLIENT_INVALID_DOCUMENT_SLOT` | `documents[]` girişini düzelt |
| `ESR_CLIENT_DUPLICATE_DOCUMENT_ID` | `documents[]` yinelenmesini kaldır |
| `ESR_CLIENT_NAMESPACE_MISMATCH` | Çoklu belge yapılandırmasını düzelt |
| `ESR_CLIENT_ENCRYPTION_PASSWORD_REQUIRED` | ENV-ENC1 parolası verin |
| `ESR_CLIENT_UNSUPPORTED_CONTENT` | Desteklenmeyen içerik magic |
| `ESR_CLIENT_INVALID_ENVELOPE` | Zarf oluşturma/parse hatası |

### Yaygın relay kodları (SDK üzerinden)

| Kod | Eylem |
|-----|-------|
| `REVISION_CONFLICT` | Çakışma akışı |
| `DEVICE_LIMIT_PAYMENT_REQUIRED` | Yükseltme UI |
| `DEVICE_LIMIT_BLOCKED` | Cihaz iptal |
| `DEVICE_TOKEN_INVALID` | Yeniden eşleştir/kurtar |
| `DOCUMENT_NOT_FOUND` | Belge için ilk pull'da normal |

Tam relay listesi: [api-tr.md § Hata kodları](api-tr.md#hata-kodları) ve `docs/tr/12-ERROR-CODES.md`.

`isEsrError(err)` ve `isOfflineError(err)` kullanın.

---

## Düşük seviye RelayClient

`sync.relay` tip güvenli HTTP metotları sunar: `createNamespace`, `getNamespace`, `listDocuments`, `getHeadMeta`, `getHead`, `pushDocument`, eşleştirme, kurtarma vb. Tam HTTP şekilleri: [api-tr.md](api-tr.md).

---

*Senkronla SDK agent referansı · `@senkronla/client` · ESR dağıtımı kapsam dışı*
