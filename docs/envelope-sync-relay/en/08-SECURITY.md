# 08 — Security

## 1. Threat model

### 1.1 Protected assets

| Asset | Goal |
|--------|--------|
| Payload (application document) | Confidentiality, integrity |
| device_token | Unauthorized API access |
| recovery phrase | Namespace takeover |
| unlock codes | Free slots |

### 1.2 Trusted parties

| Party | Trust |
|-------|-------|
| Client device | User-controlled |
| Operator (server) | Sees metadata; cannot read content (E2EE) |

### 1.3 Untrusted

- Network (outside TLS)
- Other namespaces (UUID isolation)
- Brute force pairing/recovery attempts

## 2. Zero-knowledge boundaries

Server **cannot see:**

- Decrypted payload
- Recovery phrase
- Encryption password
- Application entity content

Server **can see (metadata):**

- namespaceId, namespaceLabel
- revision, writtenAt, deviceId
- contentSha256, contentMagic, sizeBytes
- active device count, slot purchases
- IP, request timestamps (access log)

**User must be informed:** Self-host operator has metadata access.

## 3. Transport

- TLS 1.2+ required in production
- HSTS recommended
- `file://` clients connect to relay over HTTPS (CORS config)

## 4. Authentication

### 4.1 device_token

```
token = random(32 bytes) → base64url
store = SHA-256(token)
compare = constant-time
```

Bearer header; **never** carried in query string.

### 4.2 admin_api_token

- From config/env; min 64 char recommended
- Admin endpoints only
- Rotation: operator changes config

### 4.3 Recovery

- Argon2id hash (params from config)
- Phrase normalize: NFKD, lowercase, trim, single spaces
- Rate limit + exponential backoff IP

## 5. Envelope integrity

Push:

1. JSON schema validate
2. SHA-256(payload) == contentSha256
3. namespaceId/documentId path match
4. maxEnvelopeBytes limit
5. contentMagic allowed enum

Manipulation detection repeated on client pull as well.

## 6. Pairing security

| Risk | Mitigation |
|------|------------|
| Code brute force | 6 digit + rate limit + lockout |
| Code interception | Short TTL; user education |
| MITM | TLS |

Host shares pairing code over trusted channel (QR near field).

## 7. Slot / unlock security

- Unlock codes unpredictable (crypto random or HMAC)
- Redeem not idempotent — second redeem 409
- Admin token leak → all admin endpoints at risk; separate network/VPN recommended

## 8. Logging and privacy

**Never logged:**

- `envelope.payload`
- `deviceToken` (plaintext)
- recovery phrase or proof input
- encryption password
- admin token

**May be logged:**

- request id, namespaceId, deviceId (server), endpoint, status, duration
- error codes

Redaction middleware must be validated with mandatory tests.

## 9. CORS and CSRF

- SPA uses bearer token → no cookie CSRF
- CORS origin whitelist in production
- Admin API separate origin or VPN

## 10. Blob storage

- Filesystem: path traversal protection — blob key sanitize
- Namespace prefix isolation (blob path)
- S3: bucket policy private; presigned URL not required in MVP

## 11. Dependency security

- Lockfile commit
- CI: `npm audit` / `cargo audit`
- Minimal dependency principle

## 12. Security test checklist

- [ ] Invalid token → 401
- [ ] Cross-namespace token → 401
- [ ] Tampered payload sha256 → 422
- [ ] Oversized envelope → 413
- [ ] Recovery rate limit → 429
- [ ] Pairing brute force → 429
- [ ] Logs contain no payload (grep test)
- [ ] SQL injection fuzz (parameterized queries)
- [ ] Path traversal blob key
- [ ] WS cross-namespace token rejected
- [ ] WS frames contain no envelope payload

## 13. Client security recommendations (integration guide)

- Recovery phrase screenshot warning
- device_token secure storage
- Sync password session-only option
- Certificate pinning (optional, mobile)

## 14. WebSocket (v1.1)

- Auth: same `device_token` as REST; namespace path match required
- Data: metadata only (`head_changed`); **envelope/payload never sent over WS**
- Token not carried in query string (log leakage)
- Device revoke → WS close `4403`
- Rate limit: max concurrent connections per namespace

Details: [13-WEBSOCKET-NOTIFICATIONS.md](./13-WEBSOCKET-NOTIFICATIONS.md)

## 15. Application registry (v1.3 — planned)

When `apps.enabled: true`, an additional gate validates registered applications before device-token auth:

| Layer | Protects |
|-------|----------|
| App context (`X-ESR-App-Id` + Origin/bundle) | Relay abuse, unknown integrations |
| Device token + namespace `app_uuid` match | Cross-app namespace access |
| Pairing / recovery (unchanged) | End-user data access |

- Web SPAs: no client secret; trust exact `Origin` match + DNS/HTTPS verification
- Native: bundle/package headers; optional confidential secret; attestation deferred to v1.4
- `file://` origins not supported when app registry is enabled
- Developer accounts (self_service) are **not** end-user sync accounts

Full spec: [16-APP-REGISTRY.md](./16-APP-REGISTRY.md).

## 16. Incident response (operator)

1. admin token rotate
2. Force recovery on suspicious namespace (manual)
3. Blob backup restore
4. Audit unlock_events
