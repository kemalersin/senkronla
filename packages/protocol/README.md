# @senkronla/protocol

**ESR-DOC1** envelope parsing, inner payload encoding, recovery cryptography, and shared types for [Senkronla](https://senkron.la) — a self-hosted, zero-knowledge envelope sync relay.

Use this package when you talk to the relay over HTTP yourself (custom fetch client, native mobile app, server-side job) and need spec-accurate envelope and recovery helpers. For a full sync SDK with pairing, push/pull, and WebSocket notifications, use [`@senkronla/client`](https://www.npmjs.com/package/@senkronla/client) instead.

## Install

```bash
npm install @senkronla/protocol
# or
pnpm add @senkronla/protocol
```

**Node.js 22+** or modern browsers (uses Web Crypto and `@noble/hashes` / `hash-wasm` — no Node-only native addons).

## Subpath exports

| Import | Purpose |
|--------|---------|
| `@senkronla/protocol` | Envelopes, inner payloads, WebSocket message schemas, identity |
| `@senkronla/protocol/identity` | `generateNamespaceId`, `isValidNamespaceId` |
| `@senkronla/protocol/recovery-phrase` | BIP39-style recovery phrase helpers |
| `@senkronla/protocol/recovery` | Argon2id recovery key proof (build / verify) |

## Quick example

Build and verify an `ESR-DOC1` envelope:

```typescript
import {
  buildInnerPayload,
  buildEnvRaw1Payload,
  parseEnvelope,
  verifyEnvelope,
  generateNamespaceId,
} from '@senkronla/protocol'

const namespaceId = generateNamespaceId()
const inner = buildInnerPayload({
  schemaVersion: 1,
  documentId: 'primary',
  contentType: 'application/vnd.myapp+json',
  documentJson: JSON.stringify({ hello: 'world' }),
})

const payload = buildEnvRaw1Payload(inner)
// Wrap payload in EsrDocEnvelope (see spec) and POST to relay /v1/namespaces/:id/documents/:documentId

const envelope = parseEnvelope(rawJsonFromRelay)
const result = verifyEnvelope(envelope)
if (!result.ok) {
  throw new Error(result.reason)
}
```

Recovery phrase and key proof (namespace recovery flow):

```typescript
import {
  generateRecoveryPhrase,
  buildRecoveryKeyProof,
  verifyRecoveryKeyProof,
} from '@senkronla/protocol'

const phrase = generateRecoveryPhrase()
const proof = await buildRecoveryKeyProof({ phrase, namespaceId })
const valid = await verifyRecoveryKeyProof({ phrase, namespaceId, proof })
```

Optional **ENV-ENC1** encryption (password-protected inner payload):

```typescript
import { buildEnvEnc1Payload, extractDocumentFromInnerPayload } from '@senkronla/protocol'

const encrypted = await buildEnvEnc1Payload(inner, { password: 'user-secret' })
const decrypted = await extractDocumentFromInnerPayload(encrypted, {
  resolvePassword: async () => 'user-secret',
})
```

## Main API surface

- **Envelopes** — `EsrDocEnvelopeSchema`, `parseEnvelope`, `verifyEnvelope`, schema v1/v2
- **Inner payload** — `buildInnerPayload`, `buildEnvRaw1Payload`, `buildEnvEnc1Payload`, `extractDocumentFromInnerPayload`
- **Identity** — `generateNamespaceId`, `isValidNamespaceId`, `DocumentIdSchema`
- **Recovery** — `generateRecoveryPhrase`, `buildRecoveryKeyProof`, `verifyRecoveryKeyProof`
- **WebSocket** — `WsServerMessageSchema`, `parseWsServerMessage`, `WS_SUBPROTOCOL`
- **App registry** — `NativePlatform`, `isNativePlatform` (native client headers)

## Documentation

- [Integration guides](https://senkron.la/guides) — concepts and relay setup
- [SDK reference](https://senkron.la/sdk) — when to use protocol vs client
- [API reference](https://senkron.la/api) — REST `/v1` contract
- [Specification (EN)](https://github.com/kemalersin/senkronla/tree/main/docs/en) — full ESR spec

## License

[MIT](https://github.com/kemalersin/senkronla/blob/main/LICENSE)
