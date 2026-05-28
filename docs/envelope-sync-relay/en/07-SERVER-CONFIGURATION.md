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
  publicUrl: "https://sync.example.com"   # checkout redirect, QR
  trustProxy: true                         # behind reverse proxy

database:
  url: "postgresql://esr:secret@postgres:5432/esr"
  poolSize: 10
  ssl: false

blob:
  driver: "filesystem"                     # filesystem | s3
  filesystem:
    path: "/data/blobs"
  s3:
    endpoint: ""
    bucket: "esr-blobs"
    accessKey: ""
    secretKey: ""
    region: "auto"

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

  # Rate limits (see API doc)
  rateLimit:
    enabled: true
    recoverPerHour: 5
    pairingPerHour: 20

pairing:
  codeTtlSeconds: 600
  codeLength: 6
  maxTtlSeconds: 3600

sync:
  maxEnvelopeBytes: 52428800             # 50 MB
  allowedContentTypes: []                # empty = all allowed; e.g. application/vnd.*.snapshot+json

unlock:
  codePrefix: "ESR-UNLK"
  defaultExpiryDays: 365
  hmacSecret: "${ESR_UNLOCK_HMAC_SECRET}"

payment:                                     # optional phase 2
  enabled: false
  provider: "stripe"
  webhookSecret: ""
  priceByPackage:
    "3": "price_xxx"
    "5": "price_yyy"
    "10": "price_zzz"

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

## 3. Environment variables (minimum docker)

```bash
ESR_DATABASE_URL=postgresql://esr:esr@postgres:5432/esr
ESR_ADMIN_TOKEN=change-me-long-random
ESR_UNLOCK_HMAC_SECRET=change-me-long-random
ESR_BLOB_PATH=/data/blobs
ESR_PUBLIC_URL=https://sync.example.com
ESR_DEFAULT_FREE_DEVICE_LIMIT=2
ESR_ON_LIMIT_MODE=payment          # payment | block
ESR_SLOT_PACKAGES=3,5,10
ESR_WEBSOCKET_ENABLED=true
ESR_WS_PING_INTERVAL=30
```

## 4. docker-compose.yml (reference)

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
      - blobs:/data/blobs
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
sync.example.com {
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
