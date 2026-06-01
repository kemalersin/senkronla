# 03 — Protocol: ESR-DOC1

## 1. General

Envelope Sync Relay transports application data via a JSON envelope with **ESR-DOC1** magic. The envelope is written to the server; the server validates structure but does not know payload semantics.

Two layers:

```
┌─────────────────────────────────────┐
│ ESR-DOC1 — outer envelope (server reads meta) │
│  ┌───────────────────────────────┐  │
│  │ Inner payload — opaque string │  │
│  │ (ENV-RAW1 or ENV-ENC1)      │  │
│  │  ┌─────────────────────────┐  │  │
│  │  │ Application document (JSON)  │  │  │
│  │  └─────────────────────────┘  │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

## 2. ESR-DOC1 schema

### 2.1 TypeScript / Zod

```typescript
import { z } from 'zod'

export const ESR_DOC_MAGIC = 'ESR-DOC1' as const
export const ESR_SCHEMA_VERSION = 1

export const InnerContentMagic = z.enum(['ENV-RAW1', 'ENV-ENC1'])
export type InnerContentMagic = z.infer<typeof InnerContentMagic>

export const EsrDocEnvelopeSchema = z.object({
  magic: z.literal(ESR_DOC_MAGIC),
  schemaVersion: z.number().int().min(1).max(1),
  /** Namespace identity — UUID v4 required */
  namespaceId: z.string().uuid(),
  /** Human-readable label — shown in UI; server does not validate */
  namespaceLabel: z.string().min(1).max(256),
  /** Document slot — v1 "primary" only */
  documentId: z.literal('primary'),
  /** Monotonically unique — ULID recommended */
  revision: z.string().min(1).max(64),
  /** Writing device — client persistent UUID */
  deviceId: z.string().min(1).max(64),
  /** ISO 8601 UTC */
  writtenAt: z.string().datetime(),
  /** Inner payload MIME — free text, application defined */
  contentType: z.string().min(1).max(128),
  /** Inner wrapper type */
  contentMagic: InnerContentMagic,
  /** SHA-256 hex (lowercase) of payload string */
  contentSha256: z.string().regex(/^[a-f0-9]{64}$/),
  /** Opaque inner JSON string (ENV-RAW1 or ENV-ENC1 object serialized) */
  payload: z.string().min(1),
})

export type EsrDocEnvelope = z.infer<typeof EsrDocEnvelopeSchema>
```

### 2.2 JSON example

```json
{
  "magic": "ESR-DOC1",
  "schemaVersion": 1,
  "namespaceId": "550e8400-e29b-41d4-a716-446655440000",
  "namespaceLabel": "Personal Workspace",
  "documentId": "primary",
  "revision": "01JFXYZABCDEF1234567890ABCD",
  "deviceId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "writtenAt": "2026-05-25T14:30:00.000Z",
  "contentType": "application/vnd.example.myapp.snapshot+json",
  "contentMagic": "ENV-ENC1",
  "contentSha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "payload": "{\"magic\":\"ENV-ENC1\",\"kdf\":\"PBKDF2-SHA256\",\"iterations\":600000,\"salt\":\"...\",\"nonce\":\"...\",\"ciphertext\":\"...\"}"
}
```

## 3. Inner payload: ENV-RAW1 / ENV-ENC1

Server **does not parse** this layer. Client SDK provides reference implementation.

### 3.1 ENV-RAW1 (unencrypted — not recommended for production)

```json
{
  "magic": "ENV-RAW1",
  "data": "<application document JSON string or embedded object>"
}
```

`payload` field = `JSON.stringify` of this object.

### 3.2 ENV-ENC1 (recommended)

```json
{
  "magic": "ENV-ENC1",
  "kdf": "PBKDF2-SHA256",
  "iterations": 600000,
  "salt": "<base64url, 16+ bytes>",
  "nonce": "<base64url, 12 bytes for AES-GCM>",
  "ciphertext": "<base64url>"
}
```

- Encryption: AES-256-GCM
- Key: PBKDF2-SHA256(password, salt, iterations) → 256 bit
- `ciphertext` after decrypt is application document (UTF-8 JSON string)

**Password source belongs to the application** (master password, sync password, etc.). ESR server never sees password.

### 3.3 contentType

Application defines freely. Examples:

- `application/vnd.example.notes.snapshot+json`
- `application/octet-stream`

Server only stores; no routing.

## 4. Revision rules

| Rule | Description |
|------|-------------|
| Generation | Each push new ULID; previous revision never reused |
| Comparison | String equality (ULID lexicographic ≈ time order) |
| Head | Server maintains single head per namespace+document |
| History | Not required in MVP; optional `revisions` table |

## 5. Integrity verification

On push, server **required**:

1. `EsrDocEnvelopeSchema` Zod/JSON Schema validate
2. `magic === ESR-DOC1`
3. `namespaceId`, `documentId` must match URL path
4. `contentSha256 === SHA256(payload)` (hex lowercase)
5. `revision` must not have been recorded as head before (replay protection — optional strict)

On pull, client **required**:

1. Same sha256 verify
2. Decrypt + import

## 6. Serialize

- UTF-8 JSON
- MVP: pretty-print (`null, 2`) or compact — server accepts both; comparison not canonical, sha256 over payload string

## 7. Conflict semantics

Server does not merge.

```
PUT expectedRevision=R1, head=R2  → 409 Conflict
```

409 response body contains remote head meta (see API doc).

Client conflict detection (pull side):

```
IF remote.revision != knownRemoteRevision
AND localHasChangesSinceLastPush
THEN conflict → user chooses remote | local
```

## 8. deviceId

- Client generates `crypto.randomUUID()` on install; stores in localStorage/secure storage
- Envelope `deviceId` = this persistent device identity
- ESR server `devices.id` (DB) may differ; mapping is client responsibility

## 9. Version upgrade

| schemaVersion | Change |
|---------------|--------|
| 1 | Initial version; `documentId` must be `"primary"` |
| 2 | Arbitrary `documentId` per [15-MULTI-DOCUMENT.md](./15-MULTI-DOCUMENT.md); pre-v1.2 servers reject with `422 ENVELOPE_INVALID` |

Full multi-document specification: **[15-MULTI-DOCUMENT.md](./15-MULTI-DOCUMENT.md)** (spec v1.2).

## 10. Test vectors (implementer must create)

`packages/protocol/fixtures/`:

- `valid-raw-envelope.json`
- `valid-enc-envelope.json`
- `invalid-sha256.json`
- `invalid-magic.json`

Expected `verifyEnvelope()` result must be documented for each fixture.

## 11. Reference functions (pseudocode)

```typescript
async function buildEnvelope(input: BuildInput): Promise<EsrDocEnvelope> {
  const innerJson = await encodeInnerPayload(input.document, input.encryption)
  const contentSha256 = await sha256Hex(innerJson)
  return {
    magic: 'ESR-DOC1',
    schemaVersion: 1,
    namespaceId: input.namespaceId,
    namespaceLabel: input.namespaceLabel,
    documentId: 'primary',
    revision: newUlid(),
    deviceId: input.deviceId,
    writtenAt: new Date().toISOString(),
    contentType: input.contentType,
    contentMagic: input.encrypt ? 'ENV-ENC1' : 'ENV-RAW1',
    contentSha256,
    payload: innerJson,
  }
}

async function verifyEnvelope(env: EsrDocEnvelope): Promise<boolean> {
  const hash = await sha256Hex(env.payload)
  return hash === env.contentSha256.toLowerCase()
}
```
