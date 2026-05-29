# Senkronla — Agent entegrasyon rehberi

> **Amaç:** Uygulamanıza Senkronla entegrasyonu yapan yapay zeka agent'ları için giriş noktası.
> **Kapsam dışı:** relay dağıtımı, Docker, Postgres, `ESR_*` ortam değişkenleri, operatör paneli — operatörler için [ESR kurulum rehberi](/tr/guides/esr).

---

## Referans dosyaları

| Dosya | Ne zaman |
|-------|----------|
| **[SDK referansı](sdk-tr.md)** | JavaScript/TypeScript — `@senkronla/client`, `EsrSync`, adapter'lar, sync döngüsü |
| **[REST API referansı](api-tr.md)** | Swift, Kotlin, Rust, sunucu işleri — `/v1` HTTP, zarflar, WebSocket |

Yığınınıza uygun **tek** dosyayla başlayın. Tam indeks için [llms.txt](/llms.txt).

---

## İçindekiler

1. [Mimari](#mimari)
2. [Entegrasyon kontrol listesi](#entegrasyon-kontrol-listesi)
3. [Temel kavramlar](#temel-kavramlar)
4. [Uygulama kaydı (v1.3)](#uygulama-kaydı-v13)
5. [Güvenlik](#güvenlik)
6. [Paketler](#paketler)
7. [Agent uygulama kuralları](#agent-uygulama-kuralları)

---

## Mimari

Senkronla, açık kaynak ve self-hosted bir **Envelope Sync Relay (ESR)**'dir. Uygulamanız müşteri çalışma alanı başına **adlandırılmış JSON anlık görüntülerini** cihazlar arasında senkronize eder. Relay opak `ESR-DOC1` zarflarını saklar — uygulama yükünüzü **asla ayrıştırmaz**.

```
┌─────────────┐   PUT/GET /documents/{id}    ┌──────────────┐
│  Cihaz A    │ ───────────────────────────► │ Envelope     │
│  (uygulama) │ ◄─────────────────────────── │ Sync Relay   │
└─────────────┘   WebSocket head_changed     └──────────────┘
       ▲                                          │
       │              aynı namespace              │
┌─────────────┐                                  │
│  Cihaz B    │ ◄────────────────────────────────┘
└─────────────┘
```

**Sorumluluk paylaşımı:**

| Katman | Sahiplik |
|--------|----------|
| **Uygulamanız** | UX, veri modeli, JSON export/import, kurtarma ifadesi UI, çakışma UX |
| **Senkronla relay** | Opak depolama, revision koordinasyonu, cihaz token'ları, slot limitleri |
| **SDK (`@senkronla/client`)** | HTTP + WebSocket, token depolama, gecikmeli push, çakışma yönetimi |

**SDK vs REST:**

| Yol | Ne zaman |
|-----|----------|
| **[SDK](sdk-tr.md)** | JavaScript/TypeScript — tarayıcı, Electron, Node 18+ |
| **[REST](api-tr.md)** | JS olmayan yığınlar, özel sync motorları |

JS/TS için varsayılan: [sdk-tr.md](sdk-tr.md) içindeki **`EsrSync`**.

Spec v1.2 namespace başına çoklu belge destekler (`primary`, `settings`, …). Bkz. `docs/envelope-sync-relay/tr/15-MULTI-DOCUMENT.md`.

---

## Entegrasyon kontrol listesi

- [ ] `/v1` ile biten çalışan relay
- [ ] Sabit **`namespaceId`** (UUID v4) müşteri çalışma alanı başına
- [ ] **`DocumentAdapter`** ([SDK](sdk-tr.md)) veya REST zarf oluşturucu ([API](api-tr.md)) — üretimde **`ENV-ENC1`** şifreleme
- [ ] **Senkron parolası UX** — uygulama sağlar; eşleştirme/kurtarma taşımaz; tüm cihazlar aynı parolayı bilmeli
- [ ] **`onRecoveryPhrase`** UI — ifade **bir kez** gösterilir
- [ ] **`onConflict`** UI — belge başına yerel/uzak seçimi; **sunucu birleştirmesi yok**
- [ ] Sync döngüsü: `ensureNamespace()` → `sync()`; `notifyLocalChange(documentId?)`; `flushPush(documentId?)`
- [ ] `DEVICE_LIMIT_*` için cihaz limiti UX
- [ ] `deviceToken` güvenli depolama (Keychain / Keystore)
- [ ] Relay'de **app registry** açıksa: `appId` kaydı; SDK veya REST'te `X-ESR-App-Id` ([Uygulama kaydı](#uygulama-kaydı-v13))

---

## Temel kavramlar

| Terim | Anlam |
|-------|-------|
| **namespace** | İzole sync alanı. UUID v4. Bir veya daha fazla adlandırılmış belge içerir. |
| **document** | Adlandırılmış anlık görüntü (`documentId`, varsayılan `primary`). |
| **deviceToken** | Oluşturma/eşleştirme/kurtarma sonrası Bearer gizlisi. |
| **revision** | Her anlık görüntüde ULID. Push'ta iyimser kilitleme. |
| **envelope** | JSON'unuzu saran `ESR-DOC1`. Relay opak bayt saklar. Üretimde `ENV-ENC1` ile şifrelenir. |
| **sync password** | Zarf şifreleme parolası — uygulama sağlar; relay'e gitmez; kurtarma ifadesinden farklıdır. |
| **recovery phrase** | 24 kelime BIP39. Bir kez. **Sunucuya gitmez** — yalnızca hash kanıtı. |

---

## Uygulama kaydı (v1.3)

Operatör `apps.enabled` açtığında her entegrasyon kendini tanıtmalı. **Namespace'ler oluşturan app'e bağlıdır.**

| Katman | Soru |
|--------|------|
| **App** (`appId` + origin/bundle) | Hangi entegrasyon relay'i kullanabilir? |
| **Cihaz token** | Hangi cihaz hangi namespace'te? |

| Relay config | Sizin yapmanız gereken |
|--------------|------------------------|
| `apps.enabled: false` | Değişiklik yok (v1.2) |
| `apps.enabled: true` | `appId` alın (operatör veya geliştirici portalı) |

**Web:**

```http
X-ESR-App-Id: esr_app_mynotes
Origin: https://app.example.com
```

**Native:**

```http
X-ESR-App-Id: esr_app_mynotes_mobile
X-ESR-Platform: ios
X-ESR-Bundle-Id: com.example.mynotes
```

**SDK:** `EsrSync.connect({ appId, … })` — bkz. [sdk-tr.md](sdk-tr.md).

Tam spec: [16-APP-REGISTRY.md](https://github.com/kemalersin/senkronla/blob/main/docs/envelope-sync-relay/tr/16-APP-REGISTRY.md).

**Operatör / geliştirici portalları (insan UI):** `/operator` (app registry yönetimi) · `/developer` (self-service kayıt, etkinse). SDK entegrasyonu için gerekli değil — agent'lar `/v1` ve yukarıdaki referansları kullanır.

---

## Güvenlik

- **`deviceToken`** oturum gizlisi gibi — güvenli depolama
- **Kurtarma ifadesi** bir kez — sunucudan alınamaz
- Kurtarma **tüm cihazları iptal eder**
- Üretimde zarf/token loglama
- Üretimde `encrypt: true` + `resolvePassword()` — SDK `ENV-ENC1` zarfları üretir ([SDK — Zarf şifrelemesi](sdk-tr.md#zarf-şifrelemesi-env-enc1), [API — Zarf şifrelemesi](api-tr.md#zarf-şifrelemesi-env-enc1))
- **Senkron parolası** kurtarma ifadesinden ayrıdır — kaybolursa şifreli uzak veri açılamaz

---

## Paketler

| Paket | Rol |
|-------|------|
| `@senkronla/client` | `EsrSync`, adapter'lar — bkz. [sdk-tr.md](sdk-tr.md) |
| `@senkronla/protocol` | Zarf şeması, kurtarma kanıtı, `generateNamespaceId` |
| `@senkronla/server` | Relay API (operatörler) |

---

## Agent uygulama kuralları

1. JS/TS için **[SDK](sdk-tr.md)** tercih et.
2. **`onRecoveryPhrase` ve `onConflict` atlama** — zorunlu.
3. Kurtarma hash ve zarf SHA-256 **elle yazma** — `@senkronla/protocol`.
4. Relay URL **`/v1` ile bitsin**.
5. Eşleştirmede **aynı `namespaceId`**.
6. **Otomatik birleştirme yok**.
7. **Doğru referans dosyasını önce çek:**
   - [sdk-tr.md](sdk-tr.md) — `EsrSync.connect`, adapter'lar, **senkron parolası / ENV-ENC1**
   - [api-tr.md](api-tr.md) — HTTP, zarflar, **ENV-ENC1 şifreleme**, WebSocket, hata kodları
8. Kenar durumlar için insan dokümantasyonu:
   - [Entegrasyon rehberleri](/tr/guides)
   - [SDK referansı](/tr/sdk)
   - [REST API](/tr/api)
   - [ESR kurulum](/tr/guides/esr) — yalnızca operatörler

---

*Senkronla agent rehberi · [SDK](sdk-tr.md) · [API](api-tr.md) · ESR dağıtımı kapsam dışı*
