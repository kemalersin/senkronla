# @senkronla/cli

[![npm version](https://img.shields.io/npm/v/@senkronla/cli)](https://www.npmjs.com/package/@senkronla/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://github.com/kemalersin/senkronla/blob/main/LICENSE)

Operator CLI for [Senkronla](https://senkron.la) — generate unlock codes and other relay admin tasks from the terminal.

Use this when you run a self-hosted Envelope Sync Relay and need to issue slot unlock codes after manual payment or support verification. End users redeem codes from their app via `POST /v1/namespaces/{id}/unlock`.

For application integration (sync SDK), use [`@senkronla/client`](https://www.npmjs.com/package/@senkronla/client) instead.

## Install

```bash
npm install -g @senkronla/cli
# or run without installing
npx @senkronla/cli --help
```

**Node.js 22+** required.

## Quick start

Set admin credentials (same token as the relay admin API):

```bash
export ESR_ADMIN_TOKEN="your-long-random-admin-token"
export ESR_PUBLIC_URL="https://sync.senkron.la"   # optional; default http://localhost:8080
```

Generate an unlock code:

```bash
senkronla generate-unlock-code \
  --namespace-id 550e8400-e29b-41d4-a716-446655440000 \
  --slots 3 \
  --note "Invoice #1234"
```

Output is JSON from `POST /v1/admin/unlock-codes`.

## Commands

### `generate-unlock-code`

```bash
senkronla generate-unlock-code --namespace-id <uuid> --slots <number> [options]
```

| Option | Required | Description |
|--------|----------|-------------|
| `--namespace-id` | yes | Target namespace UUID |
| `--slots` | yes | Number of device slots to unlock |
| `--expires-at` | no | ISO-8601 expiry datetime |
| `--note` | no | Operator note (audit trail) |
| `--api-url` | no | Relay base URL (default: `ESR_PUBLIC_URL` or `http://localhost:8080`) |
| `--admin-token` | no | Admin bearer token (default: `ESR_ADMIN_TOKEN`) |

## Monorepo development

From the Senkronla repository:

```bash
pnpm --filter @senkronla/cli exec senkronla generate-unlock-code --help
```

## Documentation

- [Operator guide](https://github.com/kemalersin/senkronla/blob/main/docs/OPERATOR.md) — unlock codes, admin API
- [ESR setup](https://senkron.la/guides/esr) — deploy the relay
- [API reference](https://senkron.la/api) — `/v1/admin/unlock-codes`

## License

[MIT](https://github.com/kemalersin/senkronla/blob/main/LICENSE)
