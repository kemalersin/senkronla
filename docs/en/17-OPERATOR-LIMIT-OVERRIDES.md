# 17 — Operator limit overrides

| Field | Value |
|-------|-------|
| Status | **Spec v1.3.2 — implemented** |
| Builds on | Rate limits (doc 08), slot licensing (doc 06), app registry (doc 16) |
| API prefix | `/v1/admin/*` |

> **Türkçe:** [../tr/17-OPERATOR-LIMIT-OVERRIDES.md](../tr/17-OPERATOR-LIMIT-OVERRIDES.md)

---

## 1. Summary

Operators can override **rate limits** and **device slot limits** at three scopes. Each limit key is independent; unset keys inherit from the next scope down.

**Resolution order (highest wins):**

```
namespace.limit_overrides[key]
  ?? app.limit_overrides[key]
  ?? developer.limit_overrides[key]
  ?? rowFallback[key]      // slots only: namespaces.free_device_limit / purchased_slots
  ?? configFallback[key]   // limits.rateLimit.* / apps.limits.perApp.*
```

**Out of scope:** `global_ip` remains config/env only (no entity cascade). IP quotas apply uniformly before route handlers.

---

## 2. Override keys

### 2.1 Rate limits

| Key | Action id | Counter scope | Config fallback |
|-----|-----------|---------------|-----------------|
| `recoverPerHour` | `recover` | `namespace_uuid` | `limits.rateLimit.recoverPerHour` |
| `pairingPerHour` | `pair_device` | `namespace_uuid` | `limits.rateLimit.pairingPerHour` |
| `pairingTokensPerHour` | `pairing_token` | `namespace_uuid` | `limits.rateLimit.pairingTokensPerHour` |
| `pushPerHourPerDevice` | `put_document` | `device_uuid` | `limits.rateLimit.pushPerHourPerDevice` |
| `namespacesPerDay` | `namespace_create` | `app_uuid` + `client_ip` | `apps.limits.perApp.namespacesPerDay` |

Window seconds are fixed: 3600 for hourly actions, 86400 for `namespace_create`.

### 2.2 Slot limits

| Key | Meaning | Row fallback |
|-----|---------|--------------|
| `freeDeviceLimit` | Effective free device slots | `namespaces.free_device_limit` |
| `purchasedSlots` | Effective purchased slots | `namespaces.purchased_slots` |

Effective max devices: `freeDeviceLimit + purchasedSlots` (doc 06).

---

## 3. Storage

Columns on `namespaces`, `apps`, `developers`:

```sql
limit_overrides JSONB DEFAULT NULL
```

Partial JSON example:

```json
{
  "recoverPerHour": 20,
  "freeDeviceLimit": 10
}
```

- `PATCH` merges keys; key set to JSON `null` removes that override at the scope.
- Max values capped server-side (e.g. 10_000) to prevent operator mistakes.

Audit table `operator_limit_audit`: scope, before/after JSON, `created_at`.

---

## 4. Context loading

For namespace-scoped routes, resolution loads:

1. Namespace row (+ `limit_overrides`)
2. App via `namespaces.app_uuid` (when set)
3. Developer via `apps.developer_uuid` (when set)

For `namespace_create` (`POST /v1/namespaces`), only app + developer + config apply (no namespace yet).

---

## 5. Admin API

Base: `/v1/admin/*` — `Authorization: Bearer {admin_api_token}`.

| Method | Path |
|--------|------|
| GET | `/admin/namespaces/{namespaceId}/limits` |
| PATCH | `/admin/namespaces/{namespaceId}/limits` |
| GET | `/admin/apps/{appId}/limits` |
| PATCH | `/admin/apps/{appId}/limits` |
| GET | `/admin/developers/{developerId}/limits` |
| PATCH | `/admin/developers/{developerId}/limits` |

GET response shape:

```json
{
  "effective": { "recoverPerHour": 5, "freeDeviceLimit": 2, ... },
  "sources": {
    "recoverPerHour": "config",
    "freeDeviceLimit": "namespace"
  },
  "overrides": {
    "namespace": { "freeDeviceLimit": 10 },
    "app": null,
    "developer": null
  },
  "configDefaults": { ... }
}
```

PATCH body: partial `limitOverrides` object.

429 responses include `error.details.effectiveLimitSource`: `namespace` | `app` | `developer` | `config`.

---

## 6. Operator portal

- **Namespaces tab:** row opens drawer with effective limits and override form.
- **Apps / Developers drawers:** Limits section.
- Placeholders show config defaults; “Clear override” sets key to inherit.

See [OPERATOR.md](../OPERATOR.md).

---

## 7. Examples

### VIP namespace

Operator sets on namespace `550e8400-...`:

```json
{ "freeDeviceLimit": 20, "pushPerHourPerDevice": 500 }
```

All devices in that namespace get higher PUT quota; slot cap rises without changing global config.

### Abusive app (self-service)

Developer default high; operator caps app:

```json
{ "namespacesPerDay": 10, "pairingPerHour": 5 }
```

All namespaces under that app inherit unless namespace override exists.

### Per-developer trial tier

```json
{ "namespacesPerDay": 3, "freeDeviceLimit": 1 }
```

Applies to all apps owned by that developer when no app/namespace override.

---

## 8. Config layer (unchanged)

Static settings remain the bottom layer:

- Env `ESR_*` overrides YAML (doc 07)
- Operator DB overrides do **not** replace env; they sit above config at runtime

Priority stack:

```
operator namespace → operator app → operator developer → env → YAML → Zod defaults
```

---

## 9. Related documents

- [06-SLOT-LICENSING.md](./06-SLOT-LICENSING.md) §7 — slot overrides (superseded by this doc)
- [07-SERVER-CONFIGURATION.md](./07-SERVER-CONFIGURATION.md) — base limits
- [16-APP-REGISTRY.md](./16-APP-REGISTRY.md) §15 — `namespace_create` quota
