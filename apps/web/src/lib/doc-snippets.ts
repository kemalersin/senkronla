const SAMPLE = {
  namespaceId: '550e8400-e29b-41d4-a716-446655440000',
  namespaceLabel: 'Acme Corp workspace',
  clientDeviceId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
  deviceId: '01HZPXDEVICEHOST01',
  guestDeviceId: '01HZPXDEVICEGUEST01',
  deviceToken: 'dvt_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6',
  revision: '01HZQXK8Y3V5G2N4M6P7R9S1T',
  recoverySalt: 'c2FsdC1leGFtcGxlLWJ5dGVz',
  recoveryHash: 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3',
  contentSha256: 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3',
  writtenAt: '2026-05-28T10:15:00.000Z',
  pairingCode: '482913',
  unlockCode: 'UNLK-7X9K-2M4P',
} as const

function sampleLimits(activeDevices = 1, nested = false) {
  const prop = nested ? '    ' : '  '
  const close = nested ? '  ' : ''
  return `{
${prop}"freeDeviceLimit": 2,
${prop}"purchasedSlots": 0,
${prop}"maxDevices": 2,
${prop}"activeDevices": ${activeDevices},
${prop}"canAddDevice": ${activeDevices < 2},
${prop}"onLimitReached": {
${prop}  "mode": "payment",
${prop}  "slotPackages": [3, 5, 10]
${prop}}
${close}}`
}

function sampleEnvelope(revision: string = SAMPLE.revision, nested = false) {
  const prop = nested ? '    ' : '  '
  const close = nested ? '  ' : ''
  return `{
${prop}"magic": "ESR-DOC1",
${prop}"schemaVersion": 1,
${prop}"namespaceId": "${SAMPLE.namespaceId}",
${prop}"namespaceLabel": "${SAMPLE.namespaceLabel}",
${prop}"documentId": "primary",
${prop}"revision": "${revision}",
${prop}"deviceId": "${SAMPLE.deviceId}",
${prop}"writtenAt": "${SAMPLE.writtenAt}",
${prop}"contentType": "application/vnd.myapp+json",
${prop}"contentMagic": "ENV-RAW1",
${prop}"contentSha256": "${SAMPLE.contentSha256}",
${prop}"payload": "eyJub3RlIjoiSGVsbG8ifQ=="
${close}}`
}

function authHeader(token = SAMPLE.deviceToken) {
  return `Authorization: Bearer ${token}`
}

export function createGuideSnippets(relayUrl: string) {
  return {
    minimalSetup: `import {
  EsrSync,
  createDocumentAdapter,
  createLocalStorageAdapter,
} from '@senkronla/client'

const document = createDocumentAdapter({
  namespaceId: '${SAMPLE.namespaceId}',
  namespaceLabel: '${SAMPLE.namespaceLabel}',
  contentType: 'application/vnd.myapp+json',
  exportDocument: () => appStore.exportJson(),
  importDocument: (data) => appStore.importJson(data),
})

const sync = await EsrSync.connect({
  relayUrl: '${relayUrl}',
  document,
  storage: createLocalStorageAdapter('myapp'),
  onRecoveryPhrase: async ({ phrase }) => {
    await ui.showRecoveryModal(phrase)
  },
  onConflict: async (ctx) => {
    return ui.askKeepLocalOrRemote(ctx.remoteMeta.writtenAt)
  },
})

await sync.ensureNamespace()
await sync.sync()
appStore.onChange(() => sync.notifyLocalChange())`,

    ensureNamespace: `// First launch — creates workspace and shows recovery phrase
const { namespaceId, created, recoveryPhrase } = await sync.ensureNamespace({
  namespaceLabel: '${SAMPLE.namespaceLabel}',
})

if (created) {
  console.log('Save this phrase offline:', recoveryPhrase)
}

// Later launches — verifies stored device token
const check = await sync.ensureNamespace()
// { namespaceId: '${SAMPLE.namespaceId}', created: false }`,

    sync: `const result = await sync.sync()

switch (result.status) {
  case 'ok':
    console.log('In sync')
    break
  case 'offline':
    console.log('Network unavailable — retry later')
    break
  case 'conflict':
    // onConflict callback handles UX; or call resolveConflict manually
    break
  case 'error':
    console.error(result.error.code, result.error.message)
    break
}`,

    notifyLocalChange: `// Call after every local edit — debounced push (default 2s)
appStore.onChange(() => {
  sync.notifyLocalChange()
})

// getStatus() becomes 'pending_push' until push completes`,

    flushPush: `// Before logout or when you need an immediate upload
await sync.flushPush()

// Skips debounce — pushes current snapshot right away`,

    startPairing: `const { code, qrPayload, expiresAt } = await sync.startPairing()

ui.showPairingScreen({
  code,           // "482913" — 6 digits
  qrPayload,      // esr://pair/v1/...?code=482913&exp=...
  expiresAt,      // ISO timestamp
})`,

    joinPairing: `// Guest device — same namespaceId in the document adapter
await sync.joinPairing('482913')

// Stores device token, then runs sync() automatically
// Pulls remote snapshot into your app via importDocument()`,

    recover: `// All devices lost — user enters 24-word phrase
await sync.recover(
  'abandon ability able about above absent absorb abstract absurd abuse access accident'
)

// Issues new device token; revokes every previously paired device
// Then runs sync() to pull latest remote snapshot`,

    listDevices: `const { devices, limits } = await sync.listDevices()

for (const device of devices) {
  console.log(device.label, device.isCurrent ? '(this device)' : '')
}
// limits.maxDevices, limits.activeDevices, limits.canAddDevice`,

    revokeDevice: `// Remove another device from the workspace (not the last one)
await sync.revokeDevice('${SAMPLE.guestDeviceId}')

// Server returns 204 — refresh device list in your settings UI`,

    redeemUnlockCode: `// Operator-generated unlock code for extra device slots
await sync.redeemUnlockCode('${SAMPLE.unlockCode}')

// Then retry pairing or check limits via listDevices()`,

    resolveConflict: `// Manual resolution when status is 'conflict'
await sync.resolveConflict('remote') // accept server version
// or
await sync.resolveConflict('local')  // force-push local snapshot`,

    getStatus: `const status = sync.getStatus()
// 'idle' | 'syncing' | 'pending_push' | 'conflict' | 'offline' | 'ws_connected'

const lastError = sync.getLastError()
if (lastError) {
  console.error(lastError.code, lastError.message)
}`,

    connectOptions: `const sync = await EsrSync.connect({
  relayUrl: '${relayUrl}',
  document,
  storage: createLocalStorageAdapter('myapp'),
  deviceLabel: 'Alice laptop',
  onRecoveryPhrase: async ({ phrase }) => { /* required */ },
  onConflict: async (ctx) => 'remote',
  onDeviceLimit: async (ctx) => {
    if (ctx.code === 'DEVICE_LIMIT_PAYMENT_REQUIRED') {
      ui.showUpgrade(ctx.slotPackages)
    }
  },
  onStatusChange: (status) => ui.setSyncIndicator(status),
  onError: (error) => logger.warn(error.code),
  pushDebounceMs: 2000,
  notificationsEnabled: true,
  persistRecoveryPhrase: true,
})`,

    pairingHost: `const { code, qrPayload, expiresAt } = await sync.startPairing()
ui.showPairingScreen({ code, qrPayload, expiresAt })`,

    pairingGuest: `await sync.joinPairing(codeFromUser)`,

    recovery: `await sync.recover(phraseFromUser)`,
  }
}

export interface HttpExamplePair {
  request: string
  response?: string
}

export function createApiSnippets(relayUrl: string) {
  const v1 = relayUrl.replace(/\/$/, '')
  const origin = v1.replace(/\/v1$/, '')
  const ns = SAMPLE.namespaceId
  const auth = authHeader()

  return {
    health: {
      request: `GET ${origin}/health`,
      response: `{
  "status": "ok",
  "version": "1.0.0",
  "db": "ok",
  "blob": "ok"
}`,
    } satisfies HttpExamplePair,

    createNamespace: {
      request: `POST ${v1}/namespaces
Content-Type: application/json

{
  "namespaceId": "${ns}",
  "namespaceLabel": "${SAMPLE.namespaceLabel}",
  "deviceLabel": "Alice laptop",
  "clientDeviceId": "${SAMPLE.clientDeviceId}",
  "recoveryKeyProof": {
    "salt": "${SAMPLE.recoverySalt}",
    "hash": "${SAMPLE.recoveryHash}"
  }
}`,
      response: `HTTP/1.1 201 Created

{
  "namespaceId": "${ns}",
  "deviceToken": "${SAMPLE.deviceToken}",
  "deviceId": "${SAMPLE.deviceId}",
  "limits": ${sampleLimits(1, true)}
}`,
    } satisfies HttpExamplePair,

    getNamespace: {
      request: `GET ${v1}/namespaces/${ns}
${auth}`,
      response: `{
  "namespaceId": "${ns}",
  "namespaceLabel": "${SAMPLE.namespaceLabel}",
  "limits": ${sampleLimits(1, true)},
  "head": {
    "revision": "${SAMPLE.revision}",
    "writtenAt": "${SAMPLE.writtenAt}",
    "deviceId": "${SAMPLE.deviceId}",
    "contentSha256": "${SAMPLE.contentSha256}",
    "contentMagic": "ENV-RAW1",
    "sizeBytes": 128
  },
  "lastSyncAt": "${SAMPLE.writtenAt}"
}`,
    } satisfies HttpExamplePair,

    createPairingToken: {
      request: `POST ${v1}/namespaces/${ns}/pairing-tokens
${auth}
Content-Type: application/json

{
  "ttlSeconds": 600
}`,
      response: `HTTP/1.1 201 Created
RateLimit-PairingToken-Limit: 30
RateLimit-PairingToken-Remaining: 29
RateLimit-PairingToken-Reset: 3600

{
  "code": "${SAMPLE.pairingCode}",
  "expiresAt": "2026-05-28T10:25:00.000Z",
  "qrPayload": "esr://pair/v1/${ns}?code=${SAMPLE.pairingCode}&exp=1748427900&host=Alice%20laptop"
}`,
    } satisfies HttpExamplePair,

    redeemPairing: {
      request: `POST ${v1}/namespaces/${ns}/devices
Content-Type: application/json

{
  "pairingCode": "${SAMPLE.pairingCode}",
  "deviceLabel": "Bob phone",
  "clientDeviceId": "7c9e6679-7425-40de-944b-e07fc1f90ae7"
}`,
      response: `HTTP/1.1 201 Created
RateLimit-Pair-Limit: 20
RateLimit-Pair-Remaining: 19
RateLimit-Pair-Reset: 3600

{
  "deviceToken": "dvt_guest_token_example_9876543210",
  "deviceId": "${SAMPLE.guestDeviceId}",
  "limits": ${sampleLimits(2, true)}
}`,
    } satisfies HttpExamplePair,

    listDevices: {
      request: `GET ${v1}/namespaces/${ns}/devices
${auth}`,
      response: `{
  "devices": [
    {
      "deviceId": "${SAMPLE.deviceId}",
      "clientDeviceId": "${SAMPLE.clientDeviceId}",
      "label": "Alice laptop",
      "pairedAt": "2026-05-28T09:00:00.000Z",
      "lastSeenAt": "${SAMPLE.writtenAt}",
      "isCurrent": true
    },
    {
      "deviceId": "${SAMPLE.guestDeviceId}",
      "clientDeviceId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
      "label": "Bob phone",
      "pairedAt": "2026-05-28T10:20:00.000Z",
      "lastSeenAt": "2026-05-28T10:22:00.000Z",
      "isCurrent": false
    }
  ],
  "limits": ${sampleLimits(2, true)}
}`,
    } satisfies HttpExamplePair,

    revokeDevice: {
      request: `DELETE ${v1}/namespaces/${ns}/devices/${SAMPLE.guestDeviceId}
${auth}`,
      response: `HTTP/1.1 204 No Content`,
    } satisfies HttpExamplePair,

    recover: {
      request: `POST ${v1}/namespaces/${ns}/recover
Content-Type: application/json

{
  "recoveryKeyProof": {
    "salt": "${SAMPLE.recoverySalt}",
    "hash": "${SAMPLE.recoveryHash}"
  },
  "deviceLabel": "Recovery laptop",
  "clientDeviceId": "9b2c3d4e-5f6a-7b8c-9d0e-1f2a3b4c5d6e"
}`,
      response: `HTTP/1.1 200 OK
RateLimit-Recover-Limit: 5
RateLimit-Recover-Remaining: 4
RateLimit-Recover-Reset: 3600

{
  "deviceToken": "dvt_recovery_token_example_1122334455",
  "deviceId": "01HZPXDEVICERECOV01",
  "revokedDeviceCount": 2,
  "limits": ${sampleLimits(1, true)}
}`,
    } satisfies HttpExamplePair,

    getDocumentHeadMeta: {
      request: `GET ${v1}/namespaces/${ns}/documents/primary/head/meta
${auth}`,
      response: `{
  "revision": "${SAMPLE.revision}",
  "writtenAt": "${SAMPLE.writtenAt}",
  "deviceId": "${SAMPLE.deviceId}",
  "contentSha256": "${SAMPLE.contentSha256}",
  "contentMagic": "ENV-RAW1",
  "sizeBytes": 128,
  "rateLimits": {
    "push": { "limit": 120, "remaining": 119, "reset": 3600 }
  }
}`,
    } satisfies HttpExamplePair,

    getDocumentHead: {
      request: `GET ${v1}/namespaces/${ns}/documents/primary/head
${auth}`,
      response: sampleEnvelope(),
    } satisfies HttpExamplePair,

    pushDocumentFirst: {
      request: `PUT ${v1}/namespaces/${ns}/documents/primary
${auth}
Content-Type: application/json

{
  "expectedRevision": null,
  "envelope": ${sampleEnvelope('01HZQXNEWREVISION01', true)}
}`,
      response: `HTTP/1.1 201 Created
RateLimit-Push-Limit: 120
RateLimit-Push-Remaining: 119
RateLimit-Push-Reset: 3600

{
  "revision": "01HZQXNEWREVISION01",
  "writtenAt": "2026-05-28T10:30:00.000Z",
  "contentSha256": "${SAMPLE.contentSha256}",
  "writerDeviceId": "${SAMPLE.deviceId}",
  "rateLimits": {
    "push": { "limit": 120, "remaining": 119, "reset": 3600 }
  }
}`,
    } satisfies HttpExamplePair,

    pushDocumentUpdate: {
      request: `PUT ${v1}/namespaces/${ns}/documents/primary
${auth}
Content-Type: application/json

{
  "expectedRevision": "${SAMPLE.revision}",
  "envelope": ${sampleEnvelope('01HZQXUPDATEDREV02', true)}
}`,
      response: `HTTP/1.1 201 Created

{
  "revision": "01HZQXUPDATEDREV02",
  "writtenAt": "2026-05-28T11:00:00.000Z",
  "contentSha256": "b775b46031522f9d518e5876efdc5fb9b15b2f4fff2fb18f099f97g8g8b38bf4",
  "writerDeviceId": "${SAMPLE.deviceId}"
}`,
    } satisfies HttpExamplePair,

    getLimits: {
      request: `GET ${v1}/namespaces/${ns}/limits
${auth}`,
      response: sampleLimits(2),
    } satisfies HttpExamplePair,

    redeemUnlock: {
      request: `POST ${v1}/namespaces/${ns}/unlock
${auth}
Content-Type: application/json

{
  "unlockCode": "${SAMPLE.unlockCode}"
}`,
      response: `{
  "slotsAdded": 3,
  "purchasedSlots": 3,
  "maxDevices": 5,
  "canAddDevice": true
}`,
    } satisfies HttpExamplePair,

    websocketConnect: {
      request: `GET ${v1}/namespaces/${ns}/notifications
Upgrade: websocket
Sec-WebSocket-Protocol: esr-notifications-v1
${auth}`,
      response: `// Server → client (head_changed)
{
  "type": "head_changed",
  "documentId": "primary",
  "revision": "01HZQXUPDATEDREV02",
  "contentSha256": "${SAMPLE.contentSha256}",
  "writtenAt": "2026-05-28T11:00:00.000Z",
  "writerDeviceId": "${SAMPLE.deviceId}"
}

// Server → client (limits_changed)
{
  "type": "limits_changed",
  "maxDevices": 5,
  "activeDevices": 2,
  "purchasedSlots": 3
}`,
    } satisfies HttpExamplePair,

    revisionConflict: {
      request: `PUT ${v1}/namespaces/${ns}/documents/primary
${auth}
Content-Type: application/json

{
  "expectedRevision": "01HZSTALE_REVISION",
  "envelope": ${sampleEnvelope('01HZSTALE_REVISION', true)}
}`,
      response: `HTTP/1.1 409 Conflict

{
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Expected revision does not match server head",
    "details": {
      "remoteMeta": {
        "revision": "${SAMPLE.revision}",
        "writtenAt": "${SAMPLE.writtenAt}",
        "deviceId": "${SAMPLE.deviceId}",
        "contentSha256": "${SAMPLE.contentSha256}",
        "contentMagic": "ENV-RAW1",
        "sizeBytes": 128
      }
    }
  }
}`,
    } satisfies HttpExamplePair,
  }
}

export function createEsrGuideSnippets(exampleOrigin = 'https://yourdomain.com') {
  const origin = exampleOrigin.replace(/\/$/, '')
  return {
    dockerEnv: `cp docker/.env.example .env`,
    dockerBundled: `cd docker\ndocker compose --profile bundled-db up --build`,
    dockerExternal: `# macOS/Windows — Postgres on host\nESR_DATABASE_URL=postgresql://user:pass@host.docker.internal:5432/esr\n\ncd docker\ndocker compose up api web`,
    localPostgres: `cd docker && docker compose --profile bundled-db up postgres -d`,
    localDev: `pnpm install\ncp .env.example .env\npnpm dev`,
    healthCheck: `curl -s ${origin}/health`,
    migrate: `pnpm --filter @senkronla/server migrate`,
    unlockCode: `pnpm --filter @senkronla/cli exec senkronla generate-unlock-code \\\n  --namespace-id 550e8400-e29b-41d4-a716-446655440000 \\\n  --slots 3 \\\n  --note "Invoice #1234"`,
  }
}
