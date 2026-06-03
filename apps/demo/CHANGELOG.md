# Changelog

All notable changes to `@senkronla/demo` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Monorepo release versions follow the root [`CHANGELOG.md`](../../CHANGELOG.md).

## [Unreleased]

### Added

- Join modal — QR payload placeholder shows a full `esr://pair/v1/…` example (namespace ID, code, expiry, host)
- Connect step — random friendly `deviceLabel` (e.g. `Alice laptop`) assigned once per browser, shown in the SDK snippet and passed to `EsrSync.connect`

## [0.1.19]

### Added

- Completion screen — **Show to your agent** / **Ajanına göster** opens locale SDK agent doc (`sdk-en.md` / `sdk-tr.md`); next-step links pinned in a bottom footer; intro and footer site links are icon-only from MD (≤1279px)

## [0.1.18]

### Fixed

- Sync step **Sync now** stays enabled while status is **pending push** (local changes waiting to upload), even after an earlier sync in the same session
- Encrypt envelope step rebuilds plaintext and encrypted envelope previews when the document, password, or encryption toggle changes (including after edits on the Document step)
- Sync-data **Add and sync** no longer double-calls PUT and `head/meta` — `flushPush()` + `onHeadMeta` only (removed extra `refreshHead()` when notifications are off)
- Page reload keeps relay `rateLimits` in the manual sync response panel — restore session via `GET head/meta` instead of namespace `head` snapshot
- Manual sync **Sync now** marks local document changes before `sync()` so the response body updates (new revision and `rateLimits`) after edits on earlier steps
- Encrypt envelope **Run** no longer repeats relay calls — reconnect skips namespace refresh; `flushPush()` plus one `head/meta` refresh
- Sync-data **Add and sync** button is disabled while the note input is empty
- Status badges no longer stay on **pending push** / **gönderim bekliyor** after a successful push when WebSocket notifications are enabled (client `flushPush()` fix)
- Page reload no longer double-fetches `head/meta` when notifications are on — namespace refresh skips meta; `onHeadMeta` fills the sync response panel
- Encrypt envelope **Run** defers notification head/meta until after push — single `head/meta` on **Çalıştır** when WebSocket is enabled
- Push/sync buttons no longer call `refreshHead()` after `flushPush()` when notifications are off (fixes duplicate head/meta)

## [0.1.17]

### Fixed

- Connect step Reconnect no longer fires three consecutive `head/meta` requests — removed duplicate focus/visibility pull handlers that overlapped with `EsrSyncScheduler`; reconnect preserves cached health response
- Page reload no longer double-fetches `GET /namespaces/{id}` and `/devices` — session bootstrap reuses the namespace refresh already performed in `connect()`
- Connect no longer shows “Connected” when `GET /health` fails (network or CORS) — SDK session is not opened until the relay responds
- Intro and completion screen docs link label — EN “Guides”, TR “Rehberler” (intro step uses `intro.links`, not `completion.links`)
- README and `apps/demo/README.md` document the live demo at [demo.senkron.la](https://demo.senkron.la/)
- README — centered **Interactive Tutorial** badge linking to [demo.senkron.la](https://demo.senkron.la/)
- Deploy workflow publishes `CNAME` (`demo.senkron.la`) on the `demo` branch so GitHub Pages custom domain is not cleared on force-push

## [0.1.16]

### Added

- Interactive two-column SDK tutorial (Vite + React) that builds to a single static `index.html`; covers document adapters, connection (`appId` when `apps.enabled`, default `esr_app_demo`), namespace, recovery, sync, pairing with QR, conflicts, envelope encryption, and live notifications, with light/dark themes and EN/TR localization
- GitHub Actions workflow (`.github/workflows/deploy-demo.yml`) — builds and force-pushes `dist/index.html` to the `demo` branch for GitHub Pages; see README § GitHub Pages

### Changed

- Recovery step — copyable phrase word cards (plus copy-all), no synthetic JSON “response” block; left panel documents optional `persistRecoveryPhrase` for StorageAdapter persistence; connect step introduces the same option on `EsrSync.connect` with a right-panel toggle (left SDK snippet follows toggle state); toggle reconnects preserve health output and avoid layout shift; right panel explains when the phrase was acknowledged, the namespace already existed, or the phrase is no longer in session memory; demo preferences (relay URL, app ID, toggles, wizard step, connection) persist in `localStorage` across page reloads with silent session restore when previously connected; dedupe bootstrap/connect so Strict Mode and health restore do not double-fetch relay endpoints; namespace step reuses `ensureNamespace()` namespace payload instead of a duplicate `GET /namespaces/{id}`; connect/namespace/sync action buttons gated on config changes, namespace state, and one-shot sync per page load
- Wizard order — envelope encryption precedes sync-data (ENV-ENC1 vs ENV-RAW1); device pairing follows sync-data; sync-data step clarifies `notifyLocalChange()` is required while `sync()` is optional (debounced auto-push); conflict modal — side-by-side choice cards with in-card actions; conflict JSON response stays on the step panel after the modal closes; Join modal accepts QR payload (`esr://pair/v1/…`) or namespace ID + pairing code for guest devices, sync password when head uses ENV-ENC1; pairing step QR click copies `qrPayload` to clipboard; connect Reconnect always enabled and re-fetches `GET /namespaces/{id}`; namespace step JSON stays in sync on reconnect and when visiting the step; encryption step Run applies pending encrypt/password changes and syncs to relay (disabled until settings change); envelope previews on sync-data and encryption steps refresh when a remote pull updates the document via `importDocument`; footer step dots between Back and Next with hover tooltips for step titles; mobile footer Back/Next/Finish show icon-only controls; step dots show a sliding window of five steps at a time up to and including the lg tier (max-width 1279px, xl and above show all steps); mobile layout clips horizontal overflow so only code blocks scroll sideways inside their container

### Fixed

- Encryption step Run button — apply/sync no longer no-ops because `canApplyEncryption()` was checked after `busy` was set
- Join modal closes automatically after a successful pairing sync instead of staying on a perpetual “syncing” message; stays open with a local error message when join fails
- Notifications step shows WebSocket as off when `notificationsEnabled` is false instead of “connecting / poll”
- Intro left pane — senkron.la, docs, GitHub, and donate links replace the cloud-sync comparison cards; right pane keeps feature cards and start button only
- Finish button opens a completion screen with summary, restart, and next-step links (EN/TR)
- Cross-tab document updates — mirror `localStorage` edits via the `storage` event; relay catch-up on focus is handled by the SDK scheduler only
- Register Prism `bash`/`http` grammars and split HTTP examples into header + JSON body blocks so terminal commands and request/response payloads are syntax-highlighted; use `http`/`typescript`/`bash` per snippet instead of mixed `bash` blocks

