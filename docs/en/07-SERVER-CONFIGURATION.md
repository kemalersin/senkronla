# 07 — Server Configuration

## 1. Config file

Default path: `/etc/esr/config.yaml` or `./config.yaml`

Environment override: `ESR_*` prefix (nested `__` or `.` — implementer documents).

## 2. Full schema

```yaml
# Envelope Sync Relay — Server Configuration v1

server:
  host: "0.0.0.0"
  port: 8080
  publicUrl: "https://sync.senkron.la"   # checkout redirect, QR
  trustProxy: true                         # behind reverse proxy

database:
  url: "postgresql://esr:secret@postgres:5432/esr"
  poolSize: 10
  ssl: false

blob:
  driver: "filesystem"                     # filesystem only in current schema
  filesystem:
    path: "/data/blobs"
  # s3: — not implemented in packages/server schema yet; reserved for future docs

auth:
  adminApiToken: "${ESR_ADMIN_TOKEN}"      # min 32 char random
  deviceTokenBytes: 32

recovery:
  argon2:
    memoryCost: 65536
    timeCost: 3
    parallelism: 4

limits:
  # How many devices are free (copied at namespace create time)
  defaultFreeDeviceLimit: 2

  # When limit reached: payment | block
  onLimitReached:
    mode: payment
    slotPackages: [3, 5, 10]

  # Rate limits — action ids in API responses: global_ip, put_document, recover, pair_device, pairing_token
  rateLimit:
    enabled: true
    recoverPerHour: 5              # recover
    pairingPerHour: 20             # pair_device
    pairingTokensPerHour: 30       # pairing_token
    pushPerHourPerDevice: 120      # put_document (headers: RateLimit-PutDocument-*)
    generalPerMinutePerIp: 300     # global_ip

# Operator overrides (runtime, DB) sit above this block — see doc 17.
# Cascade: namespace → app → developer → values below.

pairing:
  codeTtlSeconds: 600
  codeLength: 6
  maxTtlSeconds: 3600

sync:
  maxEnvelopeBytes: 52428800             # 50 MB
  maxDocumentsPerNamespace: 32           # Cap document_heads rows; 0 = unlimited
  revisionRetentionDays: 0               # 0 = keep all; auto-purge non-head revisions older than N days after each push
  revisionRetentionCount: 0              # 0 = off; keep last N revisions per document (head counts toward N)
  allowedDocumentIds: []                 # empty = any valid id; else allowlist only
  allowedContentTypes: []                # empty = all allowed; e.g. application/vnd.*.snapshot+json

unlock:
  codePrefix: "ESR-UNLK"
  defaultExpiryDays: 365
  hmacSecret: "${ESR_UNLOCK_HMAC_SECRET}"

# Application registry (v1.3 — shipped). See doc 16.
apps:
  enabled: false
  registrationMode: operator_managed   # operator_managed | self_service
  allowLocalhostOrigins: false
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
      maxApps: 10
  native:
    requireClientSecret: false
    requireManualReview: true
  developerPortal:
    enabled: false                         # schema field; portal gate uses registrationMode + jwtSecret
    jwtSecret: "${ESR_DEVELOPER_JWT_SECRET}"
    sessionTtlHours: 168
    requireEmailVerification: true
  seed: []                             # operator_managed static apps at startup

# payment — not in packages/server schema yet (phase 2 design only)
# payment:
#   enabled: false
#   provider: "stripe"
#   ...

cors:
  allowedOrigins:
    - "*"
  # production: ["https://app.example.com"]

logging:
  level: "info"
  format: "json"
  redactPaths:
    - "envelope.payload"
    - "deviceToken"
    - "recoveryKeyProof"

metrics:
  enabled: true
  path: "/metrics"

websocket:
  enabled: true
  pingIntervalSeconds: 30
  pongTimeoutSeconds: 10
  maxConnectionsPerNamespace: 20
  maxConnectionsPerDevice: 3
```

> **Schema note:** Authoritative keys are in `packages/server/src/config/schema.ts`. Blocks marked “not implemented” above (`blob.s3`, `payment`) are design placeholders — do not copy them into production YAML expecting the server to load them.

## 3. Environment variables (repo-root `.env`)

One `.env` at the repo root serves **host dev** (`pnpm dev`) and **Docker Compose**. Copy from `.env.example`.

```bash
# Host dev — API on localhost
ESR_DATABASE_URL=postgresql://esr:esr@localhost:5432/esr

# Bundled Postgres (Docker) — API URL built from these; special chars in password are URL-encoded
POSTGRES_USER=esr
POSTGRES_PASSWORD=change-me
POSTGRES_DB=esr
# Optional external DB from containers (URL-encode password if needed):
# ESR_COMPOSE_DATABASE_URL=postgresql://esr:secret@host.docker.internal:5432/esr

ESR_PUBLISH_PORT=8080
WEB_PUBLISH_PORT=3000
ESR_PUBLIC_URL=https://sync.senkron.la
ESR_ADMIN_TOKEN=change-me-long-random-min-32-chars
ESR_UNLOCK_HMAC_SECRET=change-me-long-random-min-32-chars
ESR_BLOB_PATH=./data/blobs
ESR_TRUST_PROXY=true
ESR_DEFAULT_FREE_DEVICE_LIMIT=2
ESR_ON_LIMIT_MODE=payment
ESR_CORS_ORIGINS=https://senkron.la
ESR_WEBSOCKET_ENABLED=true
ESR_MAX_ENVELOPE_BYTES=52428800

# Application registry (v1.3 — optional; see doc 16)
ESR_APPS__ENABLED=false
ESR_APPS__REGISTRATION_MODE=operator_managed
ESR_DEVELOPER_JWT_SECRET=change-me-long-random-min-32-chars
```

Compose command (from repo root): `docker compose --project-directory . -f docker/docker-compose.yml --env-file .env …`

After `.env` changes: `up -d --force-recreate api web`. See [OPERATOR.md](../OPERATOR.md) § Updating live services.

## 4. docker-compose.yml (reference)

> **Current file:** [`docker/docker-compose.yml`](../../docker/docker-compose.yml) — repo-root `.env`, `env_file: ${PWD}/.env`, bundled DB via `POSTGRES_*` / `ESR_DATABASE_*` parts, optional `ESR_COMPOSE_DATABASE_URL` for external Postgres. Run from repo root with `--project-directory .`.

The sketch below is illustrative (includes optional Caddy); production often uses host nginx instead — see [OPERATOR.md](../OPERATOR.md) § Reverse proxy.

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: esr
      POSTGRES_PASSWORD: esr
      POSTGRES_DB: esr
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U esr"]
      interval: 5s
      timeout: 5s
      retries: 5

  api:
    build: .
    ports:
      - "8080:8080"
    environment:
      ESR_DATABASE_URL: postgresql://esr:esr@postgres:5432/esr
      ESR_ADMIN_TOKEN: ${ESR_ADMIN_TOKEN}
      ESR_UNLOCK_HMAC_SECRET: ${ESR_UNLOCK_HMAC_SECRET}
      ESR_BLOB_PATH: /data/blobs
      ESR_PUBLIC_URL: ${ESR_PUBLIC_URL:-http://localhost:8080}
      ESR_DEFAULT_FREE_DEVICE_LIMIT: ${ESR_DEFAULT_FREE_DEVICE_LIMIT:-2}
      ESR_ON_LIMIT_MODE: ${ESR_ON_LIMIT_MODE:-payment}
    volumes:
      - ${ESR_BLOB_PATH:-./data/blobs}:/data/blobs
    depends_on:
      postgres:
        condition: service_healthy

  caddy:
    image: caddy:2-alpine
    ports:
      - "443:443"
      - "80:80"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
    depends_on:
      - api

volumes:
  pgdata:
  blobs:
  caddy_data:
```

## 5. Caddyfile example

```
sync.senkron.la {
  reverse_proxy api:8080
}
```

## 6. Operator scenarios

| Scenario | Config |
|---------|--------|
| Personal, free, generous limit | `free: 10`, `mode: block` |
| Commercial hosted | `free: 2`, `mode: payment`, packages `[3,5,10]` |
| Demo | `free: 99`, `mode: block` |
| Strict | `free: 1`, `mode: payment` |
| Closed commercial | `free: 2`, `mode: block` (3rd device impossible) |
| **Revision history trimmed** | `revisionRetentionDays: 30` and/or `revisionRetentionCount: 50` — auto cleanup after each push; manual purge via operator portal or `POST /v1/admin/revisions/purge` |
| **App registry off (default)** | `apps.enabled: false` — v1.2 open relay |
| **Self-hosted single app** | `apps.enabled: true`, `registrationMode: operator_managed`, `seed: [...]` |
| **Public hosted platform** | `apps.enabled: true`, `registrationMode: self_service`, developer portal on |

Full app registry config: [16-APP-REGISTRY.md](./16-APP-REGISTRY.md) §5.

## 7. contentType restriction (optional)

```yaml
sync:
  allowedContentTypes:
    - "application/vnd.example.myapp.snapshot+json"
```

Empty list → all contentType values accepted.

Envelope `contentType` whitelist check during push → 403 `CONTENT_TYPE_NOT_ALLOWED`.

## 8. Migration

Implementer uses a DB migration tool (Drizzle, golang-migrate, etc.).

First migration: doc 10 schema.

Config changes do not require DB migration (restart sufficient).

## 9. Backup

Operator responsibility:

| Component | Backup |
|---------|-------|
| PostgreSQL | daily pg_dump |
| Blob volume | rsync / snapshot |
| Config + secrets | secure vault |

Restore procedure in README as a separate short section for operators.

## 10. Health and readiness

`/health` checks:

- DB `SELECT 1`
- Blob path writable + readable
- Config valid (Zod validate at startup)

Invalid config at startup → process exit non-zero.
