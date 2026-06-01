# Changelog

All notable changes to `@senkronla/protocol` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Monorepo release versions follow the root [`CHANGELOG.md`](../../CHANGELOG.md).

## [Unreleased]

## [0.1.11]

### Added

- npm package README and registry metadata for public publish on `@senkronla/protocol`

### Fixed

- Exclude `*.test.ts` from build output so test files are not shipped in the npm tarball

## [0.1.10]

### Changed

- Tarayıcı uyumluluğu: `sha256Hex` artık `@noble/hashes`; recovery Argon2id `hash-wasm` (Node `node:crypto` / native `argon2` kaldırıldı).
- Recovery phrase: `bip39` → `@scure/bip39` (tarayıcıda `Buffer` gerektirmez).

## [0.1.6]

### Added

- `NATIVE_PLATFORMS`, `NativePlatform`, `AppPlatform`, and `isNativePlatform()` for app registry headers and bundle registration

## [0.1.2]

### Added

- `ENV-ENC1` inner payload encoding/decoding — `buildEnvEnc1Payload`, `extractDocumentFromInnerPayload`, `buildInnerPayload`, `innerPayloadContentMagic`
- PBKDF2-SHA256 (600000 iterations) + AES-256-GCM encryption helpers
- Vitest tests for `ENV-RAW1` / `ENV-ENC1` roundtrip and deterministic doc fixtures

## [0.1.1]

### Added

- Multi-document envelope schema support (schema version 2)

## [0.1.0]

### Added

- `EsrDocEnvelopeSchema`, `parseEnvelope`, `verifyEnvelope`
- `sha256Hex` helper; test fixtures for valid and invalid envelope integrity
- `generateNamespaceId`, `generateRecoveryPhrase`, `normalizeRecoveryPhrase`
- `buildRecoveryKeyProof`, `verifyRecoveryKeyProof`, `verifyStoredRecoveryProof`
- Argon2id defaults per doc 05 (64 MiB, timeCost 3, parallelism 4)
- Unit tests for envelope parse/verify and recovery utilities
