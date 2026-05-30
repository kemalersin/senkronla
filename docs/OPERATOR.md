# Operator Guide

Guide for self-hosting and operating a Senkronla (Envelope Sync Relay) deployment.

## Prerequisites

- PostgreSQL 16+
- Persistent volume for blob storage (`ESR_BLOB_PATH`)
- TLS termination (Caddy, nginx, or cloud load balancer)
- Long random secrets for admin and unlock HMAC

## Configuration

Copy `.env.example` to `.env` or use `packages/server/config.example.yaml` as `config.yaml`.

| Variable | Purpose |
|----------|---------|
| `ESR_DATABASE_URL` | PostgreSQL connection string |
| `ESR_ADMIN_TOKEN` | Admin API bearer token (min 32 chars) |
| `ESR_UNLOCK_HMAC_SECRET` | Unlock code HMAC secret (future use) |
| `ESR_BLOB_PATH` | Filesystem blob storage path |
| `ESR_PUBLIC_URL` | Public API URL (used by CLI and portal) |
| `ESR_DEFAULT_FREE_DEVICE_LIMIT` | Free device slots per namespace |
| `ESR_ON_LIMIT_MODE` | `payment` or `block` when limit reached |
| `ESR_CORS_ORIGINS` | Comma-separated allowed origins (avoid `*` in production) |
| `ESR_MAX_DOCUMENTS_PER_NAMESPACE` | Max documents per namespace ( default `32`, `0` = unlimited) |
| `ESR_ALLOWED_DOCUMENT_IDS` | Optional comma-separated document ID allowlist (e.g. `primary,settings`) |

### Multi-document

Each namespace can hold multiple opaque envelopes (`primary`, `settings`, etc.). The relay stores one row per document in `document_heads` and blobs keyed by `(namespace, documentId, revision)`.

- **`sync.maxDocumentsPerNamespace`** (env `ESR_MAX_DOCUMENTS_PER_NAMESPACE`): caps how many distinct document IDs a namespace may create. Default **32**. Set **0** for no cap.
- **`sync.allowedDocumentIds`** (env `ESR_ALLOWED_DOCUMENT_IDS`): when non-empty, only listed IDs are accepted on push; useful to lock a deployment to known document types.
- **Operator portal:** the namespace table shows **Documents** (count) and **Primary head** (revision/size of `primary` only).
- **Admin overview:** the `documents` stat is total `document_heads` rows across all namespaces.

See [15-MULTI-DOCUMENT.md](envelope-sync-relay/en/15-MULTI-DOCUMENT.md) for protocol and client integration.

### Application registry (v1.3 — Faz 8a/8b shipped)

Optional layer: registered apps (`appId`) with verified web origins or native bundle IDs; **namespaces are bound to the app that created them**.

| Config | Use case |
|--------|----------|
| `apps.enabled: false` | Default — v1.2 open relay, no app checks |
| `apps.registrationMode: operator_managed` | Operator registers apps via YAML seed or admin API |
| `apps.registrationMode: self_service` | Application owners register via developer portal + DNS verification |

Key variables: `ESR_APPS__ENABLED`, `ESR_APPS__REGISTRATION_MODE`, `ESR_APPS__REQUIRE_REGISTRATION`, `ESR_APPS__ALLOW_LOCALHOST_ORIGINS`, `ESR_APPS__LEGACY_DEFAULT_APP_ID`, `ESR_DEVELOPER_JWT_SECRET` (or `ESR_APPS__DEVELOPER_PORTAL__JWT_SECRET`), `ESR_APPS__LIMITS__PER_APP__*`. Full list: [16-APP-REGISTRY §5.2](envelope-sync-relay/en/16-APP-REGISTRY.md#52-environment-variables).

When `apps.enabled: true`, static CORS lists are superseded by per-app verified origins (localhost allowed only if `allowLocalhostOrigins: true`).

Full spec: [16-APP-REGISTRY.md](envelope-sync-relay/en/16-APP-REGISTRY.md) · [TR](envelope-sync-relay/tr/16-APP-REGISTRY.md).

### Migrating from v1.2 to v1.3

1. **Keep `apps.enabled: false`** until all client builds send `X-ESR-App-Id` (and web `Origin` or native bundle headers).
2. **Register apps** via YAML seed (`apps.seed`) or admin API; in `self_service` mode, developers use `/developer`.
3. **Set `legacyDefaultAppId`** so existing namespaces without `app_uuid` resolve to your primary app.
4. **Verify origins** (DNS TXT or HTTPS well-known) before flipping `apps.enabled: true` in production.
5. **Roll out clients** with `appId` in SDK / headers; test pairing scope with `allowedAppIds` if you restrict guest apps.

Step-by-step checklist and SQL notes: [16-APP-REGISTRY §19 (EN)](envelope-sync-relay/en/16-APP-REGISTRY.md#19-migration-from-v12) · [§19 (TR)](envelope-sync-relay/tr/16-APP-REGISTRY.md#19-v12den-geçiş).

### Admin app API (v1.3 — Faz 8b)

Requires `ESR_ADMIN_TOKEN`. Base path: `/v1/admin/apps`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/apps` | List apps (`?q=`, `?status=`, pagination) |
| `POST` | `/admin/apps` | Create app with optional origins/bundles |
| `GET` | `/admin/apps/:appId` | Detail with origins and bundles |
| `PATCH` | `/admin/apps/:appId` | Update `name` and/or `status` (suspend/restore) |
| `DELETE` | `/admin/apps/:appId` | Archive (`status: archived`) |
| `POST` | `/admin/apps/:appId/origins` | Add origin (`verified: false` for challenge flow) |
| `POST` | `/admin/apps/:appId/origins/:originId/verify` | Run DNS TXT or HTTPS well-known verification |
| `DELETE` | `/admin/apps/:appId/origins/:originId` | Remove origin |
| `POST` | `/admin/apps/:appId/bundles` | Add native bundle |
| `POST` | `/admin/apps/:appId/bundles/:bundleId/approve` | Approve pending bundle |

Pairing scope (when `apps.enabled`):

```json
POST /v1/namespaces/{namespaceId}/pairing-tokens
{
  "ttlSeconds": 600,
  "allowedAppIds": ["esr_app_mynotes", "esr_app_mynotes_mobile"]
}
```

Guest redeem with a non-listed `X-ESR-App-Id` → `403 APP_PAIRING_NOT_ALLOWED`. Omit `allowedAppIds` to allow any active app.

YAML `apps.seed` still merges at startup (Faz 8a). Admin API manages runtime registry without DB access.

**Operator portal (web):** `/operator` → **Apps** tab lists registered applications, supports create/suspend/archive, origin verification instructions, and native bundle approval (proxied via BFF to the admin API above). **Developers** tab lists self-service accounts — verify email, disable, or re-enable (BFF → admin developer API below).

### Admin developer API (v1.3)

Requires `ESR_ADMIN_TOKEN`. Base path: `/v1/admin/developers`. Useful when `apps.registrationMode: self_service` and `requireEmailVerification: true` (manual email approval) or to suspend abusive accounts.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/developers` | List developers (`?q=`, `?filter=all\|verified\|unverified\|disabled`, pagination) |
| `GET` | `/admin/developers/:developerId` | Detail (email, verification, disabled state, app count) |
| `PATCH` | `/admin/developers/:developerId` | `{ "emailVerified": true/false }` and/or `{ "disabled": true/false }` |

Disabling an account increments `session_version` (forces logout) and blocks login with `403 DEVELOPER_ACCOUNT_DISABLED`.

### Developer portal API (v1.3 — Faz 8d)

Requires `apps.registrationMode: self_service` and `ESR_DEVELOPER_JWT_SECRET` (min 32 chars). Base path: `/v1/developer`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/developer/register` | — | Create developer account |
| `POST` | `/developer/login` | — | Issue JWT session token |
| `POST` | `/developer/logout` | JWT | Invalidate session |
| `GET` | `/developer/me` | JWT | Profile |
| `GET` | `/developer/apps` | JWT | List own apps (`?q=`, pagination) |
| `POST` | `/developer/apps` | JWT | Create app (`pending`) |
| `GET` | `/developer/apps/:appId` | JWT | Detail |
| `PATCH` | `/developer/apps/:appId` | JWT | Update name |
| `DELETE` | `/developer/apps/:appId` | JWT | Archive |
| `POST` | `/developer/apps/:appId/origins` | JWT | Add origin (verification challenge) |
| `POST` | `/developer/apps/:appId/origins/:originId/verify` | JWT | DNS/HTTPS verification |
| `DELETE` | `/developer/apps/:appId/origins/:originId` | JWT | Remove origin |
| `POST` | `/developer/apps/:appId/bundles` | JWT | Add native bundle |
| `POST` | `/developer/apps/:appId/rotate-secret` | JWT | Rotate native client secret |

**Developer portal (web):** `/developer` — register/login, app CRUD, origin verification (BFF → relay developer API).

Suspend and manual native bundle approval remain operator-only via admin API.

### Production CORS

In production, set explicit origins instead of `*`:

```yaml
cors:
  allowedOrigins:
    - "https://app.example.com"
```

The server logs a warning at startup if `NODE_ENV=production` and CORS allows all origins.

Enable `server.trustProxy: true` when running behind a reverse proxy so rate limits use the correct client IP.

## Rate limits

Default limits (doc 04):

| Endpoint | Limit |
|----------|-------|
| `POST .../recover` | 5 / hour / namespace |
| `POST .../devices` (pair) | 20 / hour / namespace |
| `POST .../pairing-tokens` | 30 / hour / namespace |
| `PUT .../documents/primary` | 120 / hour / device |
| General API | 300 / minute / IP |

Override via config or env (`ESR_RECOVER_PER_HOUR`, `ESR_PAIRING_PER_HOUR`, etc.).

Exceeded limits return **429** `RATE_LIMIT_EXCEEDED` with a `Retry-After` header.

## Unlock codes

Generate a code after manual payment or support verification:

```bash
pnpm --filter @senkronla/cli exec senkronla generate-unlock-code \
  --namespace-id 550e8400-e29b-41d4-a716-446655440000 \
  --slots 3 \
  --note "Invoice #1234"
```

Requires `ESR_ADMIN_TOKEN` and a running API. The user redeems via `POST /v1/namespaces/{id}/unlock` from their device.

## Migrations

Migrations run automatically on API startup. To apply manually:

```bash
pnpm --filter @senkronla/server migrate
```

## Health checks

```bash
curl -s http://localhost:8080/health | jq
```

Returns **503** when database or blob storage is degraded.

## Backup

| Component | Recommendation |
|-----------|----------------|
| PostgreSQL | Daily `pg_dump` |
| Blob volume | Filesystem snapshot or rsync |
| Config + secrets | Secure vault (not in git) |

Restore: replay database dump, restore blob volume, restart API.

## Security checklist

See [envelope-sync-relay/en/08-SECURITY.md](./envelope-sync-relay/en/08-SECURITY.md). Automated coverage lives in `packages/server/src/faz7.integration.test.ts`.

Production minimum:

- TLS 1.2+ on all public endpoints
- Rotate `ESR_ADMIN_TOKEN` if leaked
- Restrict admin API to VPN or internal network
- Never log device tokens, envelope payloads, or recovery proofs
- Monitor `unlock_events` and `rate_limit_events` for abuse

## Incident response

1. Rotate admin token and redeploy
2. Force recovery for compromised namespaces (operator manual process)
3. Restore from backup if data integrity is affected
4. Review `unlock_events` audit table

## Docker

Bundled Postgres profile:

```bash
cd docker && docker compose --profile bundled-db up --build
```

External Postgres: set `ESR_DATABASE_URL` and run `docker compose up api web` without the bundled profile.
