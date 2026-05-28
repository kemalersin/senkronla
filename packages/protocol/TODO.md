# @senkronla/protocol — TODO

Spec: [docs/envelope-sync-relay/en/03-PROTOCOL.md](../../docs/envelope-sync-relay/en/03-PROTOCOL.md)

## Faz 0 — Scaffold

- [x] Package scaffold + Vitest
- [x] `isValidNamespaceId`
- [x] `ESR-DOC1` Zod schema + parse/verify
- [ ] `ENV-RAW1` / `ENV-ENC1` inner payload parsers
- [x] SHA-256 helpers
- [ ] AES-256-GCM + PBKDF2 (ENV-ENC1)
- [x] Fixtures directory (`valid-raw-envelope.json`, `invalid-sha256-envelope.json`)

## Faz 0 — Identity (doc 05, 09)

- [x] `generateNamespaceId`
- [x] `generateRecoveryPhrase`
- [x] `normalizeRecoveryPhrase`
- [x] `buildRecoveryKeyProof` (Argon2id)
- [x] `verifyRecoveryKeyProof`
- [x] `verifyStoredRecoveryProof`
- [x] Unit tests for recovery utilities

## Definition of Done

- [ ] >80% coverage on core paths
- [ ] No `any` in public API
- [ ] CHANGELOG updated per release
