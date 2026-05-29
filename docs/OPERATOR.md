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
