# 07 — Sunucu Yapılandırması

## 1. Config dosyası

Varsayılan path: `/etc/esr/config.yaml` veya `./config.yaml`

Environment override: `ESR_*` prefix (nested `__` veya `.` — implementer dokümante eder).

## 2. Tam şema

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
  driver: "filesystem"                     # mevcut şemada yalnızca filesystem
  filesystem:
    path: "/data/blobs"
  # s3: — packages/server şemasında henüz yok; gelecek tasarım

auth:
  adminApiToken: "${ESR_ADMIN_TOKEN}"      # min 32 char random
  deviceTokenBytes: 32

recovery:
  argon2:
    memoryCost: 65536
    timeCost: 3
    parallelism: 4

limits:
  # İlk kaç cihaz ücretsiz (namespace create anında kopyalanır)
  defaultFreeDeviceLimit: 2

  # Limit dolunca: payment | block
  onLimitReached:
    mode: payment
    slotPackages: [3, 5, 10]

  # Rate limits — API yanıt anahtarları: global_ip, put_document, recover, pair_device, pairing_token
  rateLimit:
    enabled: true
    recoverPerHour: 5              # recover
    pairingPerHour: 20             # pair_device
    pairingTokensPerHour: 30       # pairing_token
    pushPerHourPerDevice: 120      # put_document (başlıklar: RateLimit-PutDocument-*)
    generalPerMinutePerIp: 300     # global_ip

pairing:
  codeTtlSeconds: 600
  codeLength: 6
  maxTtlSeconds: 3600

sync:
  maxEnvelopeBytes: 52428800             # 50 MB
  maxDocumentsPerNamespace: 32           # document_heads satır üst sınırı; 0 = sınırsız
  revisionRetentionDays: 0               # 0 = hepsini tut; push sonrası N günden eski head-dışı revizyonları otomatik sil
  revisionRetentionCount: 0              # 0 = kapalı; belge başına son N revizyonu tut (head N'ye dahil)
  allowedDocumentIds: []                 # boş = geçerli herhangi bir id; dolu = allowlist
  allowedContentTypes: []                # empty = all allowed; örn. application/vnd.*.snapshot+json

unlock:
  codePrefix: "ESR-UNLK"
  defaultExpiryDays: 365
  hmacSecret: "${ESR_UNLOCK_HMAC_SECRET}"

# Uygulama kaydı (v1.3 — yayında). Bkz. doc 16.
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
    enabled: false                         # şema alanı; portal kapısı registrationMode + jwtSecret kullanır
    jwtSecret: "${ESR_DEVELOPER_JWT_SECRET}"
    sessionTtlHours: 168
    requireEmailVerification: true
  seed: []

# payment — packages/server şemasında henüz yok (yalnızca faz 2 tasarımı)
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

> **Şema notu:** Yetkili anahtarlar `packages/server/src/config/schema.ts` içindedir. Yukarıda “henüz yok” işaretli bloklar (`blob.s3`, `payment`) tasarım yer tutucusudur — production YAML'e kopyalamayın.

## 3. Ortam değişkenleri (repo kökü `.env`)

Tek `.env` dosyası hem **host dev** (`pnpm dev`) hem **Docker Compose** için kullanılır. `.env.example` dosyasından kopyalayın.

```bash
# Host dev — localhost'ta API
ESR_DATABASE_URL=postgresql://esr:esr@localhost:5432/esr

# Bundled Postgres (Docker) — API URL bu değerlerden üretilir; şifredeki özel karakterler encode edilir
POSTGRES_USER=esr
POSTGRES_PASSWORD=change-me
POSTGRES_DB=esr
# Konteynerden harici DB (gerekirse şifreyi URL-encode edin):
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

# Uygulama kaydı (v1.3 — isteğe bağlı; bkz. doc 16)
ESR_APPS__ENABLED=false
ESR_APPS__REGISTRATION_MODE=operator_managed
ESR_DEVELOPER_JWT_SECRET=change-me-long-random-min-32-chars
```

Compose komutu (repo kökünden): `docker compose --project-directory . -f docker/docker-compose.yml --env-file .env …`

`.env` değişince: `up -d --force-recreate api web`. Bkz. [OPERATOR.md](../OPERATOR.md) § Updating live services.

## 4. docker-compose.yml (referans)

> **Güncel dosya:** [`docker/docker-compose.yml`](../../docker/docker-compose.yml) — repo kökü `.env`, `env_file: ${PWD}/.env`, bundled DB için `POSTGRES_*` / `ESR_DATABASE_*` parçaları, harici Postgres için isteğe bağlı `ESR_COMPOSE_DATABASE_URL`. Repo kökünden `--project-directory .` ile çalıştırın.

Aşağıdaki şema örnektir (isteğe bağlı Caddy dahil); üretimde genelde host nginx kullanılır — bkz. [OPERATOR.md](../OPERATOR.md) § Reverse proxy.

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

## 5. Caddyfile örneği

```
sync.senkron.la {
  reverse_proxy api:8080
}
```

## 6. Operatör senaryoları

| Senaryo | Config |
|---------|--------|
| Kişisel, ücretsiz, geniş limit | `free: 10`, `mode: block` |
| Ticari hosted | `free: 2`, `mode: payment`, packages `[3,5,10]` |
| Demo | `free: 99`, `mode: block` |
| Sıkı | `free: 1`, `mode: payment` |
| Kapalı ticari | `free: 2`, `mode: block` (3. cihaz imkansız) |
| **Revizyon geçmişi kısaltma** | `revisionRetentionDays: 30` ve/veya `revisionRetentionCount: 50` — push sonrası otomatik temizlik; operatör paneli veya `POST /v1/admin/revisions/purge` ile manuel |
| **App registry kapalı (varsayılan)** | `apps.enabled: false` — v1.2 açık relay |
| **Self-hosted tek uygulama** | `apps.enabled: true`, `registrationMode: operator_managed`, `seed: [...]` |
| **Public hosted platform** | `apps.enabled: true`, `registrationMode: self_service`, geliştirici portalı açık |

Tam app registry config: [16-APP-REGISTRY.md](./16-APP-REGISTRY.md) §5.

## 7. contentType kısıtlama (opsiyonel)

```yaml
sync:
  allowedContentTypes:
    - "application/vnd.example.myapp.snapshot+json"
```

Boş liste → tüm contentType değerleri kabul.

Push sırasında envelope `contentType` whitelist kontrolü → 403 `CONTENT_TYPE_NOT_ALLOWED`.

## 8. Migrasyon

Implementer DB migration aracı kullanır (Drizzle, golang-migrate, vb.).

İlk migration: doc 10 şeması.

Config değişikliği DB migration gerektirmez (restart yeterli).

## 9. Yedekleme

Operatör sorumluluğu:

| Bileşen | Yedek |
|---------|-------|
| PostgreSQL | pg_dump günlük |
| Blob volume | rsync / snapshot |
| Config + secrets | güvenli vault |

Restore prosedürü README'de operatör için ayrı kısa bölüm.

## 10. Sağlık ve hazır olma

`/health` checks:

- DB `SELECT 1`
- Blob path writable + readable
- Config valid (startup'ta Zod validate)

Startup invalid config → process exit non-zero.
