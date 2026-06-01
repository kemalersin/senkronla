# Operator Guide

Guide for self-hosting and operating a Senkronla (Envelope Sync Relay) deployment.

## Prerequisites

- PostgreSQL 16+
- Persistent host directory for blob storage (Docker Compose: `ESR_BLOB_PATH` bind-mounted at `/data/blobs` in the api container)
- TLS termination (Caddy, nginx, or cloud load balancer)
- Long random secrets for admin and unlock HMAC

## Configuration

Copy `.env.example` to `.env` or use `packages/server/config.example.yaml` as `config.yaml`.

| Variable | Purpose |
|----------|---------|
| `ESR_DATABASE_URL` | PostgreSQL connection string |
| `ESR_ADMIN_TOKEN` | Admin API bearer token (min 32 chars) |
| `ESR_UNLOCK_HMAC_SECRET` | Unlock code HMAC secret (future use) |
| `ESR_BLOB_PATH` | Host filesystem path for blobs (`pnpm dev` and Docker bind-mount at `/data/blobs`; use `--project-directory .` for relative paths) |
| `ESR_PUBLIC_URL` | Public API URL (used by CLI and portal) |
| `ESR_DEFAULT_FREE_DEVICE_LIMIT` | Free device slots per namespace |
| `ESR_ON_LIMIT_MODE` | `payment` or `block` when limit reached |
| `ESR_CORS_ORIGINS` | Comma-separated allowed origins (avoid `*` in production) |
| `ESR_MAX_DOCUMENTS_PER_NAMESPACE` | Max documents per namespace ( default `32`, `0` = unlimited) |
| `ESR_ALLOWED_DOCUMENT_IDS` | Optional comma-separated document ID allowlist (e.g. `primary,settings`) |
| `ESR_REVISION_RETENTION_DAYS` | After each push, auto-purge non-head revisions older than N days per document (`0` = keep all) |
| `ESR_REVISION_RETENTION_COUNT` | After each push, keep last N revisions per document (`0` = off; head counts toward N) |

### Multi-document

Each namespace can hold multiple opaque envelopes (`primary`, `settings`, etc.). The relay stores one row per document in `document_heads` and blobs keyed by `(namespace, documentId, revision)`.

- **`sync.maxDocumentsPerNamespace`** (env `ESR_MAX_DOCUMENTS_PER_NAMESPACE`): caps how many distinct document IDs a namespace may create. Default **32**. Set **0** for no cap.
- **`sync.revisionRetentionDays`** (env `ESR_REVISION_RETENTION_DAYS`): after each push, automatically delete non-head revision records and blob files older than this many days for that namespace and document. Default **0** (keep all revisions).
- **`sync.revisionRetentionCount`** (env `ESR_REVISION_RETENTION_COUNT`): after each push, keep only the last N revisions per document in that namespace (the current head counts toward N). Default **0** (disabled).
- **`sync.allowedDocumentIds`** (env `ESR_ALLOWED_DOCUMENT_IDS`): when non-empty, only listed IDs are accepted on push; useful to lock a deployment to known document types.
- **Operator portal:** the namespace table shows **Documents** (count) and **Primary head** (revision/size of `primary` only).
- **Admin overview:** the `documents` stat is total `document_heads` rows across all namespaces.

See [15-MULTI-DOCUMENT.md](en/15-MULTI-DOCUMENT.md) for protocol and client integration.

### Application registry (v1.3 — shipped)

Optional layer: registered apps (`appId`) with verified web origins or native bundle IDs; **namespaces are bound to the app that created them**.

| Config | Use case |
|--------|----------|
| `apps.enabled: false` | Default — v1.2 open relay, no app checks |
| `apps.registrationMode: operator_managed` | Operator registers apps via YAML seed or admin API |
| `apps.registrationMode: self_service` | Application owners register via developer portal + DNS verification |

Key variables: `ESR_APPS__ENABLED`, `ESR_APPS__REGISTRATION_MODE`, `ESR_APPS__ALLOW_LOCALHOST_ORIGINS`, `ESR_APPS__LEGACY_DEFAULT_APP_ID`, `ESR_APPS__NATIVE__REQUIRE_CLIENT_SECRET`, `ESR_APPS__NATIVE__REQUIRE_MANUAL_REVIEW`, `ESR_DEVELOPER_JWT_SECRET` (or `ESR_APPS__DEVELOPER_PORTAL__JWT_SECRET`), `ESR_APPS__LIMITS__PER_APP__*`. Full list: [16-APP-REGISTRY §5.2](en/16-APP-REGISTRY.md#52-environment-variables).

When `apps.enabled: true`, static CORS lists are superseded by per-app verified origins (localhost allowed only if `allowLocalhostOrigins: true`).

Full spec: [16-APP-REGISTRY.md](en/16-APP-REGISTRY.md) · [TR](tr/16-APP-REGISTRY.md).

### Operator limit overrides (v1.3.2)

Per-namespace, per-app, and per-developer limits override config defaults at runtime. Cascade: **namespace → app → developer → config**.

| API | Purpose |
|-----|---------|
| `GET/PATCH /v1/admin/namespaces/:namespaceId/limits` | Slot + rate overrides for one workspace |
| `GET/PATCH /v1/admin/apps/:appId/limits` | Defaults for all namespaces under the app |
| `GET/PATCH /v1/admin/developers/:developerId/limits` | Defaults for all apps owned by the developer |

Operator portal: Namespaces drawer, Apps/Developer **Limits** section. Spec: [17-OPERATOR-LIMIT-OVERRIDES.md](en/17-OPERATOR-LIMIT-OVERRIDES.md).

### Revision retention and manual purge

Every document push stores a revision history row and blob file. Configure automatic cleanup:

| Config | Env | Default |
|--------|-----|---------|
| `sync.revisionRetentionDays` | `ESR_REVISION_RETENTION_DAYS` | `0` (keep all) |
| `sync.revisionRetentionCount` | `ESR_REVISION_RETENTION_COUNT` | `0` (off) |

When either value is greater than zero, retention runs automatically after each push for that namespace and document. Both can be enabled (date purge first, then count).

**Operator portal:** **Revisions** on namespace or app rows; deployment-wide purge under **Settings → Revisions**. The panel shows current server retention values from `GET /v1/admin/settings/sync`.

**Admin API:**

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/settings/sync` | Read `revisionRetentionDays`, `revisionRetentionCount`, and related sync limits |
| `POST` | `/admin/revisions/purge` | Manual purge by date (`mode: date`, `before`) or count (`mode: count`, `keepLastRevisions`); scope `deployment`, `namespace`, or `app` |

Date mode always keeps the current head. Count mode includes the head in the keep limit. See [15-MULTI-DOCUMENT §8.4](en/15-MULTI-DOCUMENT.md#84-document_revisions-history).

### Migrating from v1.2 to v1.3

1. **Keep `apps.enabled: false`** until all client builds send `X-ESR-App-Id` (and web `Origin` or native bundle headers).
2. **Register apps** via YAML seed (`apps.seed`) or admin API; in `self_service` mode, developers use `/developer`.
3. **Set `legacyDefaultAppId`** so existing namespaces without `app_uuid` resolve to your primary app.
4. **Verify origins** (DNS TXT or HTTPS well-known) before flipping `apps.enabled: true` in production.
5. **Roll out clients** with `appId` in SDK / headers; test pairing scope with `allowedAppIds` if you restrict guest apps.

Step-by-step checklist and SQL notes: [16-APP-REGISTRY §19 (EN)](en/16-APP-REGISTRY.md#19-migration-from-v12) · [§19 (TR)](tr/16-APP-REGISTRY.md#19-v12den-geçiş).

### Admin app API (v1.3)

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

YAML `apps.seed` still merges at startup. Admin API manages runtime registry without DB access.

**Operator portal (web):** `/operator` → **Apps** tab lists registered applications, supports create/suspend/archive, origin verification instructions, native bundle approval, and client secret generate/rotate when `apps.nativeRequireClientSecret` is true (app must be `active` with all bundles approved). Proxied via BFF to the admin API above. **Developers** tab lists self-service accounts — verify email, disable, or re-enable (BFF → admin developer API below).

#### Native client secret (operator / developer portals)

| Condition | Behaviour |
|-----------|-----------|
| App create | No secret assigned (`client_secret_hash` is null) |
| Relay `native.requireClientSecret: true` | Unauthenticated API routes require `X-ESR-Client-Secret` |
| Portal **Generate secret** | Calls rotate-secret; plaintext shown once |
| UI visibility | `/health` → `apps.nativeRequireClientSecret: true`, app `active`, ≥1 bundle, all bundles approved |

Developers use the same flow in `/developer` when self-service is enabled. See [16-APP-REGISTRY §12.3 (EN)](en/16-APP-REGISTRY.md#123-approval-flows-and-client-secret) · [§12.3 (TR)](tr/16-APP-REGISTRY.md#123-onay-akışları-ve-client-secret).

### Admin developer API (v1.3)

Requires `ESR_ADMIN_TOKEN`. Base path: `/v1/admin/developers`. Useful when `apps.registrationMode: self_service` and `requireEmailVerification: true` (manual email approval) or to suspend abusive accounts.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/developers` | List developers (`?q=`, `?filter=all\|verified\|unverified\|disabled`, pagination) |
| `GET` | `/admin/developers/:developerId` | Detail (email, verification, disabled state, app count) |
| `PATCH` | `/admin/developers/:developerId` | `{ "emailVerified": true/false }` and/or `{ "disabled": true/false }` |

Disabling an account increments `session_version` (forces logout) and blocks login with `403 DEVELOPER_ACCOUNT_DISABLED`.

### Developer portal API (v1.3)

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

Generate a code after manual payment or support verification.

**npm (recommended for operators):**

```bash
export ESR_ADMIN_TOKEN="your-admin-token"
export ESR_PUBLIC_URL="https://sync.senkron.la"

npx @senkronla/cli generate-unlock-code \
  --namespace-id 550e8400-e29b-41d4-a716-446655440000 \
  --slots 3 \
  --note "Invoice #1234"
```

**Monorepo development:**

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

See [en/08-SECURITY.md](./en/08-SECURITY.md). Automated coverage lives in `packages/server/src/faz7.integration.test.ts`.

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

Copy `.env.example` to `.env` at the repo root. Compose reads it with `--env-file .env` and passes variables into containers via `env_file`.

Bundled Postgres profile:

```bash
docker compose --project-directory . -f docker/docker-compose.yml --env-file .env --profile bundled-db up --build
```

External Postgres: set `ESR_COMPOSE_DATABASE_URL` in `.env` and run `docker compose --project-directory . -f docker/docker-compose.yml --env-file .env up api web` without the bundled profile.

Optional CPU/RAM limits per container (shared host, Linux cgroups):

```bash
docker compose --project-directory . -f docker/docker-compose.yml -f docker/docker-compose.resources.example.yml \
  --env-file .env --profile bundled-db up --build
```

Edit `docker-compose.resources.example.yml` to switch tiers (~100 namespaces default, ~1000 moderate values in file comments). Limits cap containers on one VM; at ~1000 namespaces prefer external or managed Postgres on a separate host — see [02-ARCHITECTURE.md](en/02-ARCHITECTURE.md) §6.2.
