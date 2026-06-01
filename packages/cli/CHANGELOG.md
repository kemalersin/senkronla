# Changelog

All notable changes to `@senkronla/cli` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Monorepo release versions follow the root [`CHANGELOG.md`](../../CHANGELOG.md).

## [Unreleased]

## [0.1.11]

### Added

- npm package README and registry metadata for public publish on `@senkronla/cli`

### Changed

- CLI `--help` version string tracks `package.json` version

## [0.1.0]

### Added

- Initial CLI scaffold with help output
- `generate-unlock-code` command calling admin unlock API
- Flags: `--namespace-id`, `--slots`, `--expires-at`, `--note`, `--api-url`, `--admin-token`
