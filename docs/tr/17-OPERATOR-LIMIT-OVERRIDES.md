# 17 — Operatör limit override

| Alan | Değer |
|------|--------|
| Durum | **Spec v1.3.2 — uygulandı** |
| Üzerine inşa | Rate limit (doc 08), slot lisanslama (doc 06), app registry (doc 16) |
| API prefix | `/v1/admin/*` |

> **English:** [../en/17-OPERATOR-LIMIT-OVERRIDES.md](../en/17-OPERATOR-LIMIT-OVERRIDES.md)

---

## 1. Özet

Operatör **rate limit** ve **cihaz slot** limitlerini üç kapsamda override edebilir. Her limit anahtarı bağımsızdır; tanımsız anahtarlar bir alt kapsama / config'e düşer.

**Çözümleme sırası (yüksek öncelik önce):**

```
namespace.limit_overrides[key]
  ?? app.limit_overrides[key]
  ?? developer.limit_overrides[key]
  ?? rowFallback[key]      // slot: namespaces.free_device_limit / purchased_slots
  ?? configFallback[key]   // limits.rateLimit.* / apps.limits.perApp.*
```

**Kapsam dışı:** `global_ip` yalnızca config/env ile kalır (entity cascade yok).

---

## 2. Override anahtarları

### 2.1 Rate limit

| Anahtar | Action id | Sayaç kapsamı | Config fallback |
|---------|-----------|---------------|-----------------|
| `recoverPerHour` | `recover` | `namespace_uuid` | `limits.rateLimit.recoverPerHour` |
| `pairingPerHour` | `pair_device` | `namespace_uuid` | `limits.rateLimit.pairingPerHour` |
| `pairingTokensPerHour` | `pairing_token` | `namespace_uuid` | `limits.rateLimit.pairingTokensPerHour` |
| `pushPerHourPerDevice` | `put_document` | `device_uuid` | `limits.rateLimit.pushPerHourPerDevice` |
| `namespacesPerDay` | `namespace_create` | `app_uuid` + `client_ip` | `apps.limits.perApp.namespacesPerDay` |

Pencere süreleri sabit: saatlik aksiyonlar 3600s, `namespace_create` 86400s.

### 2.2 Slot limitleri

| Anahtar | Anlam | Satır fallback |
|---------|-------|----------------|
| `freeDeviceLimit` | Etkin ücretsiz cihaz slotu | `namespaces.free_device_limit` |
| `purchasedSlots` | Etkin satın alınmış slot | `namespaces.purchased_slots` |

Etkin max: `freeDeviceLimit + purchasedSlots` (doc 06).

---

## 3. Depolama

`namespaces`, `apps`, `developers` tablolarında:

```sql
limit_overrides JSONB DEFAULT NULL
```

Kısmi JSON örneği:

```json
{
  "recoverPerHour": 20,
  "freeDeviceLimit": 10
}
```

- `PATCH` anahtarları birleştirir; JSON `null` = o kapsamdaki override silinir.
- Üst sınır sunucuda zorlanır (ör. 10_000).

`operator_limit_audit` tablosu: scope, before/after, `created_at`.

---

## 4. Bağlam yükleme

Namespace rotalarında: namespace → app (`app_uuid`) → developer (`developer_uuid`).

`POST /v1/namespaces` için yalnızca app + developer + config (henüz namespace yok).

---

## 5. Admin API

Base: `/v1/admin/*` — admin token.

| Method | Path |
|--------|------|
| GET | `/admin/namespaces/{namespaceId}/limits` |
| PATCH | `/admin/namespaces/{namespaceId}/limits` |
| GET | `/admin/apps/{appId}/limits` |
| PATCH | `/admin/apps/{appId}/limits` |
| GET | `/admin/developers/{developerId}/limits` |
| PATCH | `/admin/developers/{developerId}/limits` |

GET yanıtı: `effective`, `sources`, `overrides`, `configDefaults`.

429 yanıtında `error.details.effectiveLimitSource`: `namespace` | `app` | `developer` | `config`.

---

## 6. Operatör portalı

- **Namespaces:** satır → drawer (effective + form)
- **Apps / Developers:** drawer Limits bölümü

Bkz. [OPERATOR.md](../OPERATOR.md).

---

## 7. Örnekler

**VIP namespace:** `{ "freeDeviceLimit": 20, "pushPerHourPerDevice": 500 }`

**Kötüye kullanan app:** `{ "namespacesPerDay": 10, "pairingPerHour": 5 }`

**Developer trial:** `{ "namespacesPerDay": 3, "freeDeviceLimit": 1 }`

---

## 8. Config katmanı

Operatör override env/YAML'ın **üstünde** runtime'da uygulanır; env > YAML > Zod varsayılanı taban katman olarak kalır.

---

## 9. İlgili belgeler

- [06-SLOT-LICENSING.md](./06-SLOT-LICENSING.md) §7
- [07-SERVER-CONFIGURATION.md](./07-SERVER-CONFIGURATION.md)
- [16-APP-REGISTRY.md](./16-APP-REGISTRY.md) §15
