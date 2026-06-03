# @senkronla/demo

An interactive, two-column tutorial for the [Senkronla](https://senkron.la) client SDK ([`@senkronla/client`](../../packages/client)). The left column narrates each step with a runnable code snippet; the right column shows the live output of that code running for real against a relay.

The build output is a **single static `index.html`** (all JS/CSS inlined via [`vite-plugin-singlefile`](https://github.com/richVue/vite-plugin-singlefile)), so it can be hosted anywhere as one file.

## What it covers

Twelve steps, each mapping a code snippet to a live result:

1. Welcome and overview
2. Installing the SDK
3. Building a document from JSON (`createDocumentAdapter`)
4. Connecting to a relay (`EsrSync.connect`, including `appId` when `apps.enabled`)
5. Creating the namespace (`ensureNamespace`)
6. Showing the recovery phrase (`onRecoveryPhrase`)
7. Manual sync (`sync`)
8. Envelope encryption (`encrypt: true` → `ENV-ENC1`)
9. Syncing real data and inspecting the `ESR-DOC1` envelope
10. Device pairing (`startPairing` + QR, `joinPairing`)
11. Conflict resolution (`onConflict`)
12. Live notifications (`notificationsEnabled` over WebSocket)

Open the page in two tabs (or pair a phone via the **Join** button) to watch changes flow between devices.

## Application registry

When the relay has the application registry enabled (`apps.enabled`), `EsrSync.connect` requires an `appId`. The demo defaults to `esr_app_demo`. Apps are registered either by the operator (`operator_managed`) or by app owners through the developer portal (`self_service`) — see the [App Registry guide](https://senkron.la/guides) and `/developer/register`.

## Develop

```bash
pnpm --filter @senkronla/demo dev      # http://localhost:5173
```

The SDK is consumed as a workspace dependency, so build it first if you have not already:

```bash
pnpm --filter @senkronla/protocol --filter @senkronla/client build
```

## Build (single file)

```bash
pnpm --filter @senkronla/demo build    # → apps/demo/dist/index.html
pnpm --filter @senkronla/demo preview
```

## Configuration

- **Relay URL** and **App ID** are editable from the connection step (step 4). Defaults: `https://sync.senkron.la/v1` and `esr_app_demo`.
- **Theme** (light/dark) and **language** (EN/TR) are in the header. The language defaults to Turkish when the browser language starts with `tr`, otherwise English.

This is a demo: the sync password is held in memory for the session only and is not persisted.
