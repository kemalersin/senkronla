# Senkronla — Agent integration guide

> **Purpose:** Entry point for AI coding agents integrating Senkronla into an application.
> **Out of scope:** relay deployment, Docker, Postgres, `ESR_*` env vars, operator portal — use the human [ESR setup guide](/guides/esr) for operators.

---

## Reference files

| File | Use when |
|------|----------|
| **[SDK reference](sdk-en.md)** | JavaScript/TypeScript — `@senkronla/client`, `EsrSync`, adapters, sync loop |
| **[REST API reference](api-en.md)** | Swift, Kotlin, Rust, server jobs — `/v1` HTTP, envelopes, WebSocket |

Start with **one** file matching your stack. Fetch [llms.txt](/llms.txt) for the full index.

---

## Table of contents

1. [Architecture](#architecture)
2. [Integration checklist](#integration-checklist)
3. [Core concepts](#core-concepts)
4. [Application registry (v1.3)](#application-registry-v13)
5. [Security](#security)
6. [Packages](#packages)
7. [Agent implementation rules](#agent-implementation-rules)

---

## Architecture

Senkronla is an open-source, self-hosted **Envelope Sync Relay (ESR)**. Your app syncs **named JSON snapshots per customer workspace** across devices. The relay stores opaque `ESR-DOC1` envelopes — it **never parses** your application payload.

```
┌─────────────┐   PUT/GET /documents/{id}   ┌──────────────┐
│  Device A   │ ───────────────────────────► │ Envelope     │
│  (your app) │ ◄─────────────────────────── │ Sync Relay   │
└─────────────┘   WebSocket head_changed     └──────────────┘
       ▲                                          │
       │              same namespace              │
┌─────────────┐                                  │
│  Device B   │ ◄────────────────────────────────┘
└─────────────┘
```

**Division of responsibility:**

| Layer | Owns |
|-------|------|
| **Your app** | UX, data model, export/import JSON, recovery phrase UI, conflict UX, billing UI |
| **Senkronla relay** | Opaque storage, revision coordination, device tokens, slot limits, push notifications |
| **SDK (`@senkronla/client`)** | HTTP + optional WebSocket, token storage, debounced push, conflict orchestration |

**Choose SDK vs REST:**

| Path | When |
|------|------|
| **[SDK](sdk-en.md)** | JavaScript/TypeScript — browser, Electron, React Native (with fetch), Node 18+ |
| **[REST](api-en.md)** | Non-JS stacks, custom sync engines, or when SDK cannot run |

Default for JS/TS: **`EsrSync`** via [sdk-en.md](sdk-en.md).

Spec v1.2 supports multiple documents per namespace (`primary`, `settings`, …). See [15-MULTI-DOCUMENT.md](https://github.com/kemalersin/senkronla/blob/main/docs/en/15-MULTI-DOCUMENT.md).

---

## Integration checklist

Before shipping production integration:

- [ ] Running relay with base URL ending in `/v1` (e.g. `https://sync.example.com/v1`)
- [ ] Stable **`namespaceId`** (UUID v4) per customer workspace — same across reinstalls
- [ ] **`DocumentAdapter`** ([SDK](sdk-en.md)) or REST envelope builder ([API](api-en.md)) — production **`ENV-ENC1`** encryption
- [ ] **Sync password UX** — app-provided; pairing/recovery do not transfer it; all devices must share the same password
- [ ] **`onRecoveryPhrase`** UI — phrase shown **once** at workspace creation; cannot be retrieved later
- [ ] **`onConflict`** UI — user picks local vs remote per `documentId`; **no server-side merge**
- [ ] Sync loop: `ensureNamespace()` → `sync()` on startup; `notifyLocalChange(documentId?)` on edits; `flushPush(documentId?)` before logout
- [ ] Device limit UX for `DEVICE_LIMIT_*` errors
- [ ] Secure storage for `deviceToken` (Keychain / Keystore on mobile)
- [ ] When relay has **app registry** enabled: register `appId` with operator or developer portal; pass `appId` in SDK / `X-ESR-App-Id` on REST (see [Application registry](#application-registry-v13))

---

## Core concepts

| Term | Meaning |
|------|---------|
| **namespace** | Isolated sync workspace. UUID v4 you choose. Holds one or more named documents. |
| **document** | Named snapshot (`documentId`, default `primary`). Multiple independent documents per namespace. |
| **deviceToken** | Bearer secret after create/pair/recover. SDK stores in `EsrStorage`. |
| **clientDeviceId** | Client-generated UUID, stable per app install. |
| **deviceId** | Server-assigned ULID for this paired device (settings UI, revoke). |
| **revision** | ULID on each snapshot. Required for optimistic locking on push. |
| **envelope** | `ESR-DOC1` wrapper around your JSON + metadata. Relay stores opaque bytes. Encrypted as `ENV-ENC1` in production. |
| **pairing code** | 6-digit code; host generates, guest redeems within TTL (~10 min). |
| **sync password** | Envelope encryption secret — app-provided; never sent to relay; distinct from recovery phrase. |
| **recovery phrase** | 24-word BIP39 phrase. Shown once. **Never sent to server** — only Argon2id hash proof. |

**Who does what:** Your app owns UX and data model. Senkronla owns transport: storing packages, versioning, device slots, notifying peers.

---

## Application registry (v1.3)

When the relay operator enables `apps.enabled`, every integration must identify itself. **Namespaces are bound to the app that created them.**

| Layer | Answers |
|-------|---------|
| **App** (`appId` + origin or bundle) | Which integration may call this relay |
| **Device token** | Which paired device in which namespace |

| Relay config | Your action |
|--------------|-------------|
| `apps.enabled: false` (default) | No change — v1.2 behaviour |
| `apps.enabled: true` | Obtain `appId` from operator (`operator_managed`) or developer portal (`self_service`) |

**Web (hosted SPA):**

```http
X-ESR-App-Id: esr_app_mynotes
Origin: https://app.example.com
```

Browser sends `Origin` automatically. No client secret in web builds.

**Native (iOS / Android / desktop):**

```http
X-ESR-App-Id: esr_app_mynotes_mobile
X-ESR-Platform: ios
X-ESR-Bundle-Id: com.example.mynotes
```

When `native.requireClientSecret: true`, also send `X-ESR-Client-Secret` (or SDK `clientSecret`). Secrets are **not** auto-created on app registration — use `rotate-secret` after the app is `active` and bundles are approved. Check `GET /health` → `apps.nativeRequireClientSecret`.

**Device token** (`Authorization: Bearer dvt_...`) is separate — paired device identity, not app registry. Omit on first `POST /v1/namespaces`.

**SDK:** pass `appId` (and native fields) to `EsrSync.connect()` — see [sdk-en.md](sdk-en.md).

**Local dev:** operator sets `allowLocalhostOrigins: true`; use `http://localhost:{port}` as registered origin.

Full spec: [16-APP-REGISTRY.md](https://github.com/kemalersin/senkronla/blob/main/docs/en/16-APP-REGISTRY.md).

**Operator / developer portals (human UI):** `/operator` (app registry admin) · `/developer` (self-service registration when enabled). Not required for SDK integration — agents use `/v1` and the references above.

---

## Security

- Treat **`deviceToken`** like a session secret — secure storage on client
- **Recovery phrase** shown once — build copy/save UX; cannot retrieve from server
- Recovery **revokes all devices** — warn users before recover flow
- Do not log envelopes or tokens in production
- CORS is operator-configured — your web app origin must be allowed on the relay (or registered via app registry when `apps.enabled`)
- Enable `encrypt: true` + `resolvePassword()` in production — SDK builds `ENV-ENC1` envelopes ([SDK — Envelope encryption](sdk-en.md#envelope-encryption-env-enc1), [API — Envelope encryption](api-en.md#envelope-encryption-env-enc1))
- **Sync password** is separate from recovery phrase — if lost, encrypted remote data cannot be recovered

---

## Packages

| Package | Role |
|---------|------|
| `@senkronla/client` | `EsrSync`, `RelayClient`, adapters, envelope helpers — see [sdk-en.md](sdk-en.md) |
| `@senkronla/protocol` | Envelope schema, recovery proof, `generateNamespaceId` |
| `@senkronla/server` | Relay API (self-hosted — operators only) |

---

## Agent implementation rules

1. **Prefer [SDK](sdk-en.md)** for JS/TS unless the stack forbids it.
2. **Never skip** `onRecoveryPhrase` or `onConflict` — both required for production.
3. **Never hand-roll** recovery hashing or envelope SHA-256 — use `@senkronla/protocol`.
4. **Relay URL** must end with `/v1`.
5. **Same `namespaceId`** on host and guest adapters for pairing.
6. **Conflict UX is mandatory** — no automatic merge exists.
7. **Fetch the right reference file first:**
   - [sdk-en.md](sdk-en.md) — `EsrSync.connect`, adapters, **sync password / ENV-ENC1**
   - [api-en.md](api-en.md) — HTTP endpoints, envelopes, **ENV-ENC1 encryption**, WebSocket, error codes
8. Open human docs only for edge cases:
   - [Integration guides](/guides) — concepts, flows, offline behavior
   - [SDK reference](/sdk) — interactive method browser
   - [REST API](/api) — interactive HTTP examples
   - [ESR setup](/guides/esr) — operators only (deployment)

---

*Senkronla agent guide · [SDK](sdk-en.md) · [API](api-en.md) · ESR deployment out of scope*
