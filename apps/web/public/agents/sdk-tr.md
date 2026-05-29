# Senkronla — SDK referansı (`@senkronla/client`)

> **Hedef kitle:** Senkronla'yı JavaScript/TypeScript ile entegre eden yapay zeka agent'ları.
> **İlgili:** [Agent genel bakış](tr.md) · [REST API referansı](api-tr.md) · [İnsan SDK sayfası](/tr/sdk)

JS/TS yığınları için varsayılan yol: **`EsrSync`** facade. SDK çalıştırılamıyorsa [REST](api-tr.md) kullanın.

---

## İçindekiler

1. [Kurulum](#kurulum)
2. [Minimal kurulum](#minimal-kurulum)
3. [Çoklu belge](#çoklu-belge)
4. [EsrSync.connect seçenekleri](#esrsyncconnect-seçenekleri)
5. [Belge adapter'ı](#belge-adapterı)
6. [Yerel depolama (EsrStorage)](#yerel-depolama-esrstorage)
7. [EsrSync metotları](#esrsync-metotları)
8. [Sync yaşam döngüsü](#sync-yaşam-döngüsü)
9. [Durum değerleri](#durum-değerleri-esrsyncstatus)
10. [SDK hata kodları](#sdk-istemci-hata-kodları)
11. [Düşük seviye RelayClient](#düşük-seviye-relayclient)

---

## Kurulum

```bash
pnpm add @senkronla/client
# EsrSync dışında manuel zarf veya kurtarma kanıtı için:
pnpm add @senkronla/protocol
```

Node 18+ veya `fetch` ve Web Crypto destekleyen modern tarayıcı gerekir.

Çalıştırılabilir örnek: `examples/multi-document-sync.ts` (`ESR_RELAY_URL` ile `pnpm example:multi-document`).

---

## Minimal kurulum

```typescript
import {
  EsrSync,
  createDocumentAdapter,
  createLocalStorageAdapter,
  generateNamespaceId,
} from '@senkronla/client'

const namespaceId = generateNamespaceId()
// ensureNamespace öncesi kalıcı saklayın — yeniden kurulumda aynı id

const document = createDocumentAdapter({
  namespaceId,
  namespaceLabel: 'Müşteri çalışma alanı',
  contentType: 'application/vnd.myapp+json',
  exportDocument: () => appStore.exportJson(),
  importDocument: (data) => appStore.importJson(data),
})

const sync = await EsrSync.connect({
  relayUrl: 'https://sync.ornek.com/v1',
  document,
  storage: createLocalStorageAdapter(),
  onRecoveryPhrase: async ({ phrase, namespaceId }) => {
    await ui.showRecoveryModal(phrase) // ZORUNLU — bir kez
  },
  onConflict: async (ctx) => {
    // ctx.documentId hangi slot'ta çakışma olduğunu gösterir
    return ui.askKeepLocalOrRemote(ctx.remoteMeta.writtenAt)
  },
})

await sync.ensureNamespace()
await sync.sync()
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
  storage: createMemoryStorageAdapter(),
  documents: [
    {
      adapter: createDocumentAdapter({
        namespaceId,
        namespaceLabel: 'Müşteri çalışma alanı',
        contentType: 'application/vnd.myapp+json',
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
        exportDocument: async () => settings,
        importDocument: async (json) => {
          settings = json as typeof settings
        },
      }),
    },
  ],
  onRecoveryPhrase: async ({ phrase }) => ui.showRecoveryModal(phrase),
  onConflict: async (ctx) => {
    console.log('Çakışma:', ctx.documentId)
    return 'remote'
  },
  onDocumentStatusChange: (documentId, status) => ui.setDocBadge(documentId, status),
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
- `encryption.enabled` **`false`** kalmalı (`ENV-ENC1` gelene kadar).
- `exportDocument()` hızlı olmalı.

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
| `startPairing()` | Ana cihaz: `{ code, qrPayload, expiresAt }` |
| `joinPairing(code)` | Misafir: kodu kullanır, `sync()` çalıştırır |
| `recover(phrase)` | Kurtarma; diğer cihazları iptal eder |
| `listDevices()` | Cihazlar + limitler |
| `revokeDevice(deviceId)` | Başka cihazı kaldır |
| `redeemUnlockCode(code)` | Operatör açılış kodu |
| `resolveConflict(choice, documentId?)` | Manuel çakışma çözümü |
| `getStatus()` | `EsrSyncStatus` |
| `getLastError()` | Son `EsrError` |
| `disable()` | Zamanlayıcı ve bildirimleri durdur |

Salt okunur: `relayUrl`, `relay` (`RelayClient`), `documentIds`.

#### Çakışmalar

```typescript
onConflict: async (ctx) => {
  // ctx: { namespaceId, documentId, knownRevision, remoteRevision, remoteMeta }
  return ui.askUser()
}

await sync.resolveConflict('remote', 'settings')
```

Zarf yardımcıları: `buildEnvelope`, `buildRecoveryKeyProof` — bkz. [API referansı — zarf formatı](api-tr.md#zarf-formatı-esr-doc1).

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

| Kod | Eylem |
|-----|-------|
| `ESR_CLIENT_NO_TOKEN` | `ensureNamespace`, `joinPairing` veya `recover` |
| `ESR_CLIENT_OFFLINE` | Çevrimiçi olunca `sync()` tekrar |
| `ESR_CLIENT_NAMESPACE_EXISTS` | Eşleştirme/kurtarma |
| `ESR_CLIENT_CONFLICT_CANCELLED` | Kullanıcı iptal |
| `REVISION_CONFLICT` | Çakışma akışı |
| `DEVICE_LIMIT_PAYMENT_REQUIRED` | Yükseltme UI |
| `DEVICE_LIMIT_BLOCKED` | Cihaz iptal |

`isEsrError(err)` ve `isOfflineError(err)` kullanın.

---

## Düşük seviye RelayClient

`sync.relay` tip güvenli HTTP metotları sunar: `createNamespace`, `getNamespace`, `listDocuments`, `getHeadMeta`, `getHead`, `pushDocument`, eşleştirme, kurtarma vb. Tam HTTP şekilleri: [api-tr.md](api-tr.md).

---

*Senkronla SDK agent referansı · `@senkronla/client` · ESR dağıtımı kapsam dışı*
