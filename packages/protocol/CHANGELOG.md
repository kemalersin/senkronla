# Changelog

All notable changes to `@senkronla/protocol` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial package scaffold with `ESR-DOC1` constants and `isValidNamespaceId`
- Vitest test setup

## [0.3.0] — Faz 4

### Added

- `generateNamespaceId`, `generateRecoveryPhrase`, `normalizeRecoveryPhrase`
- `buildRecoveryKeyProof`, `verifyRecoveryKeyProof`, `verifyStoredRecoveryProof`
- Argon2id defaults per doc 05 (64 MiB, timeCost 3, parallelism 4)
- Recovery utility unit tests

## [0.2.0] — Faz 3

### Added

- `EsrDocEnvelopeSchema`, `parseEnvelope`, `verifyEnvelope`
- `sha256Hex` helper
- Test fixtures for valid and invalid envelope integrity
- Unit tests for envelope parse/verify
