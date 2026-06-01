import { API_EXAMPLE_DOCUMENT_ID, API_SAMPLE, escapeJsonString } from '@/lib/api-sample-data'

const SAMPLE = API_SAMPLE

const JSON_INDENT = '  '

function jsonIndent(depth: number): string {
  return JSON_INDENT.repeat(depth)
}

function sampleLimits(activeDevices = 1, depth = 0): string {
  const d1 = jsonIndent(depth + 1)
  const d2 = jsonIndent(depth + 2)
  return `{
${d1}"freeDeviceLimit": 2,
${d1}"purchasedSlots": 0,
${d1}"maxDevices": 2,
${d1}"activeDevices": ${activeDevices},
${d1}"canAddDevice": ${activeDevices < 2},
${d1}"onLimitReached": {
${d2}"mode": "payment",
${d2}"slotPackages": [3, 5, 10]
${d1}}
${jsonIndent(depth)}}`
}

function envelopeContentType(documentId: string): string {
  return documentId === 'primary'
    ? 'application/vnd.myapp+json'
    : 'application/vnd.example.notes+json'
}

function envelopeSchemaVersion(documentId: string): number {
  return documentId === 'primary' ? 1 : 2
}

function envelopeFieldLines(
  indent: string,
  documentId: string,
  revision: string,
  writtenAt: string,
  payload: string,
  contentSha256: string,
  contentMagic: 'ENV-RAW1' | 'ENV-ENC1' = SAMPLE.contentMagic,
): string {
  return `${indent}"magic": "ESR-DOC1",
${indent}"schemaVersion": ${envelopeSchemaVersion(documentId)},
${indent}"namespaceId": "${SAMPLE.namespaceId}",
${indent}"namespaceLabel": "${SAMPLE.namespaceLabel}",
${indent}"documentId": "${documentId}",
${indent}"revision": "${revision}",
${indent}"deviceId": "${SAMPLE.deviceId}",
${indent}"writtenAt": "${writtenAt}",
${indent}"contentType": "${envelopeContentType(documentId)}",
${indent}"contentMagic": "${contentMagic}",
${indent}"contentSha256": "${contentSha256}",
${indent}"payload": "${escapeJsonString(payload)}"`
}

function formatEnvelope(
  documentId: string,
  revision: string,
  options?: {
    writtenAt?: string
    depth?: number
    payload?: string
    contentSha256?: string
    contentMagic?: 'ENV-RAW1' | 'ENV-ENC1'
  },
): string {
  const depth = options?.depth ?? 1
  const writtenAt = options?.writtenAt ?? SAMPLE.writtenAt
  const payload =
    options?.payload ??
    (documentId === 'primary' ? SAMPLE.payloadPrimary : SAMPLE.payload)
  const contentSha256 =
    options?.contentSha256 ??
    (documentId === 'primary' ? SAMPLE.contentSha256Primary : SAMPLE.contentSha256)
  const contentMagic = options?.contentMagic ?? SAMPLE.contentMagic
  return `{
${envelopeFieldLines(jsonIndent(depth + 1), documentId, revision, writtenAt, payload, contentSha256, contentMagic)}
${jsonIndent(depth)}}`
}

function buildPushRequest(
  documentId: string,
  revision: string,
  expectedRevision: string | null,
  writtenAt?: string,
  options?: { payload?: string; contentSha256?: string },
): string {
  const expectedLine =
    expectedRevision === null
      ? '  "expectedRevision": null,'
      : `  "expectedRevision": "${expectedRevision}",`
  return `{
${expectedLine}
  "envelope": ${formatEnvelope(documentId, revision, { writtenAt, depth: 1, ...options })}
}`
}

function pushCreatedResponse(
  revision: string,
  writtenAt: string,
  contentSha256: string,
  putDocumentRemaining: number,
  globalIpRemaining: number,
): string {
  return `HTTP/1.1 201 Created
RateLimit-PutDocument-Limit: 120
RateLimit-PutDocument-Remaining: ${putDocumentRemaining}
RateLimit-PutDocument-Reset: 3600

{
  "revision": "${revision}",
  "writtenAt": "${writtenAt}",
  "contentSha256": "${contentSha256}",
  "writerDeviceId": "${SAMPLE.deviceId}",
  ${rateLimitsJson([
    ['global_ip', 300, globalIpRemaining, 42, 60],
    ['put_document', 120, putDocumentRemaining, 3600, 3600],
  ])}
}`
}

function authHeader(token = SAMPLE.deviceToken) {
  return `Authorization: Bearer ${token}`
}

type RateLimitActionId = 'global_ip' | 'put_document' | 'recover' | 'pair_device' | 'pairing_token'

function rateLimitQuotaJson(
  action: RateLimitActionId,
  limit: number,
  remaining: number,
  resetAfterSeconds: number,
  windowSeconds: number,
): string {
  const d2 = jsonIndent(2)
  const d3 = jsonIndent(3)
  return `${d2}"${action}": {
${d3}"action": "${action}",
${d3}"limit": ${limit},
${d3}"remaining": ${remaining},
${d3}"resetAfterSeconds": ${resetAfterSeconds},
${d3}"windowSeconds": ${windowSeconds}
${d2}}`
}

function rateLimitsJson(quotas: Array<[RateLimitActionId, number, number, number, number]>): string {
  const lines = quotas.map(([action, limit, remaining, reset, window]) =>
    rateLimitQuotaJson(action, limit, remaining, reset, window),
  )
  return `"rateLimits": {
${lines.join(',\n')}
${jsonIndent(1)}}`
}

function rateLimitDetailJson(
  action: RateLimitActionId,
  limit: number,
  remaining: number,
  resetAfterSeconds: number,
  windowSeconds: number,
): string {
  const d3 = jsonIndent(3)
  const d4 = jsonIndent(4)
  return `${d3}"rateLimit": {
${d4}"action": "${action}",
${d4}"limit": ${limit},
${d4}"remaining": ${remaining},
${d4}"resetAfterSeconds": ${resetAfterSeconds},
${d4}"windowSeconds": ${windowSeconds}
${d3}}`
}

/** Shown at the top of multi-step SDK samples in docs and agent files. */
export const SDK_SAMPLE_LEGEND = `// Code sample legend
//   // app:     APP code — not part of @senkronla/client
//   appStore, appUi, appSession — placeholder names; wire to the app's state/UI/auth
//   EsrSync, createDocumentAdapter, … — SDK (@senkronla/client)`

export const npmInstallSnippets = {
  client: `npm install @senkronla/client\n# or\npnpm add @senkronla/client`,
  protocol: `npm install @senkronla/protocol\n# or\npnpm add @senkronla/protocol`,
  cli: `npm install -g @senkronla/cli\n# or\nnpx @senkronla/cli --help`,
} as const

export function createGuideSnippets(relayUrl: string) {
  return {
    minimalSetup: `${SDK_SAMPLE_LEGEND}

import {
  EsrSync,
  createDocumentAdapter,
  createLocalStorageAdapter,
  generateNamespaceId,
} from '@senkronla/client'

const namespaceId = generateNamespaceId()
// app: persist before ensureNamespace — same id across reinstalls

const document = createDocumentAdapter({
  namespaceId,
  namespaceLabel: '${SAMPLE.namespaceLabel}',
  contentType: 'application/vnd.myapp+json',
  // app: serialize / restore app state as JSON
  exportDocument: () => appStore.exportJson(),
  importDocument: (json) => appStore.importJson(json),
})

const sync = await EsrSync.connect({
  relayUrl: '${relayUrl}',
  appId: 'esr_app_mynotes', // required when GET /health → apps.enabled is true
  document,
  storage: createLocalStorageAdapter('myapp'),
  // app: required — show once; user must save offline
  onRecoveryPhrase: async ({ phrase }) => {
    await appUi.showRecoveryModal(phrase)
  },
  // app: required — return 'remote' | 'local' | 'cancel'
  onConflict: async (ctx) => {
    return appUi.askKeepLocalOrRemote(ctx.remoteMeta.writtenAt)
  },
})
// Native: add appPlatform, bundleId; clientSecret when GET /health → apps.nativeRequireClientSecret

await sync.ensureNamespace()
await sync.sync()
// app: call after every local edit (Redux, DB hook, etc.)
appStore.onChange(() => sync.notifyLocalChange('primary'))`,

    multiDocumentSync: `const sync = await EsrSync.connect({
  relayUrl: '${relayUrl}',
  appId: 'esr_app_mynotes', // required when GET /health → apps.enabled is true
  storage: createLocalStorageAdapter('myapp'),
  documents: [
    { adapter: mainDocumentAdapter },
    { documentId: 'settings', adapter: settingsDocumentAdapter },
  ],
  // app: required callbacks — replace with app UI
  onRecoveryPhrase: async ({ phrase }) => appUi.showRecoveryModal(phrase),
  onConflict: async (ctx) => {
    return appUi.askKeepLocalOrRemote(ctx.remoteMeta.writtenAt)
  },
})

await sync.ensureNamespace()
sync.notifyLocalChange('settings')
await sync.sync('settings') // pull + push for one document`,

    ensureNamespace: `// First launch — creates workspace and shows recovery phrase
const { namespaceId, created, recoveryPhrase } = await sync.ensureNamespace({
  namespaceLabel: '${SAMPLE.namespaceLabel}',
})

if (created) {
  console.log('Save this phrase offline:', recoveryPhrase)
}

// Later launches — verifies stored device token
const check = await sync.ensureNamespace()
// { namespaceId, created: false }`,

    sync: `// All connected documents (default)
const result = await sync.sync()

// Single document
const settingsResult = await sync.sync('settings')

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

    notifyLocalChange: `// app: subscribe to appStore — call after every local edit
appStore.onChange(() => sync.notifyLocalChange('primary'))
appSettingsStore.onChange(() => sync.notifyLocalChange('settings'))

// getStatus() becomes 'pending_push' until push completes`,

    flushPush: `// Before logout or when you need an immediate upload
await sync.flushPush() // all slots with pending changes
await sync.flushPush('settings') // one document

// Skips debounce — pushes current snapshot right away`,

    startPairing: `const { code, qrPayload, expiresAt } = await sync.startPairing()

// app: display code / QR in app pairing UI
appUi.showPairingScreen({ code, qrPayload, expiresAt })`,

    joinPairing: `// app: read 6-digit code from user input (QR scan or manual entry)
await sync.joinPairing(codeFromUser)

// Stores device token, then runs sync() (all documents)
// Pulls remote snapshots via importDocument() per slot`,

    recover: `// app: read 24-word phrase from user input
await sync.recover(phraseFromUser)

// Issues new device token; revokes every previously paired device
// Then runs sync() to pull latest remote snapshots (all documents)`,

    listDevices: `const { devices, limits } = await sync.listDevices()

for (const device of devices) {
  console.log(device.label, device.isCurrent ? '(this device)' : '')
}
// limits.maxDevices, limits.activeDevices, limits.canAddDevice`,

    revokeDevice: `await sync.revokeDevice('${SAMPLE.guestDeviceId}')
// app: refresh device list in app settings UI`,

    redeemUnlockCode: `// Operator-generated unlock code for extra device slots
await sync.redeemUnlockCode('${SAMPLE.unlockCode}')

// Then retry pairing or check limits via listDevices()`,

    resolveConflict: `// Manual resolution when status is 'conflict'
await sync.resolveConflict('remote', 'primary')
await sync.resolveConflict('local', 'settings')`,

    getStatus: `const status = sync.getStatus()
// 'idle' | 'syncing' | 'pending_push' | 'conflict' | 'offline' | 'ws_connected'

const lastError = sync.getLastError()
if (lastError) {
  console.error(lastError.code, lastError.message)
}`,

    connectWithAppWeb: `const sync = await EsrSync.connect({
  relayUrl: '${relayUrl}',
  appId: 'esr_app_mynotes',
  document,
  storage: createLocalStorageAdapter('myapp'),
  // app: implement — placeholders shown; see integration section
  onRecoveryPhrase: async ({ phrase }) => appUi.showRecoveryModal(phrase),
  onConflict: async () => appUi.askKeepLocalOrRemote(),
})`,

    connectWithAppNative: `const sync = await EsrSync.connect({
  relayUrl: '${relayUrl}',
  appId: 'esr_app_mynotes_mobile',
  appPlatform: 'ios', // ios | android | desktop
  bundleId: 'com.example.mynotes',
  // app: when GET /health → apps.nativeRequireClientSecret is true
  // clientSecret: process.env.ESR_CLIENT_SECRET,
  document,
  storage: createSecureStorageAdapter(), // app: Keychain / secure EsrStorage
  onRecoveryPhrase: async ({ phrase }) => appUi.showRecoveryModal(phrase),
  onConflict: async () => appUi.askKeepLocalOrRemote(),
})`,

    pairingHostScoped: `const { code, qrPayload, expiresAt } = await sync.startPairing({
  allowedAppIds: ['esr_app_mynotes_mobile'],
})`,

    connectOptions: `const sync = await EsrSync.connect({
  relayUrl: '${relayUrl}',
  appId: 'esr_app_mynotes', // required when GET /health → apps.enabled is true
  document,
  storage: createLocalStorageAdapter('myapp'),
  deviceLabel: 'Alice laptop',
  onRecoveryPhrase: async ({ phrase }) => appUi.showRecoveryModal(phrase),
  onConflict: async (ctx) => appUi.askKeepLocalOrRemote(ctx.remoteMeta.writtenAt),
  // app: optional UI hooks
  onDocumentStatusChange: (documentId, status) => appUi.setDocBadge(documentId, status),
  onDeviceLimit: async (ctx) => {
    if (ctx.code === 'DEVICE_LIMIT_PAYMENT_REQUIRED') {
      appUi.showUpgrade(ctx.slotPackages)
    }
  },
  onStatusChange: (status) => appUi.setSyncIndicator(status),
  onError: (error) => appLogger.warn(error.code),
  pushDebounceMs: 2000,
  notificationsEnabled: true,
  persistRecoveryPhrase: true,
})
// Native: add appPlatform, bundleId; clientSecret when GET /health → apps.nativeRequireClientSecret`,

    pairingHost: `const { code, qrPayload, expiresAt } = await sync.startPairing()

// app: display code / QR in app pairing UI
appUi.showPairingScreen({ code, qrPayload, expiresAt })`,

    pairingGuest: `await sync.joinPairing(codeFromUser)`,

    recovery: `await sync.recover(phraseFromUser)`,

    encryptedDocumentAdapter: `const document = createDocumentAdapter({
  namespaceId: appWorkspace.id,
  namespaceLabel: appWorkspace.name,
  contentType: 'application/vnd.myapp+json',
  encrypt: true,
  // app: sync password — SDK never generates it
  resolvePassword: async () => appSession.getSyncPassword(),
  exportDocument: () => appStore.exportSnapshot(),
  importDocument: (json) => appStore.importSnapshot(json),
})`,

    buildEncryptedEnvelope: `import { buildEnvelope, extractDocument } from '@senkronla/client'

// app: same password source as resolvePassword()
const password = await appSession.getSyncPassword()

const envelope = await buildEnvelope({
  namespaceId: appWorkspace.id,
  namespaceLabel: appWorkspace.name,
  documentJson: JSON.stringify(await appStore.exportSnapshot()),
  deviceId: clientDeviceId,
  contentType: 'application/vnd.myapp+json',
  encrypt: true,
  password,
})

const json = await extractDocument(remoteEnvelope, password)`,
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
    appHeadersWeb: `POST ${v1}/namespaces
Content-Type: application/json
X-ESR-App-Id: esr_app_mynotes
Origin: https://app.example.com

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

    appHeadersNative: `GET ${v1}/namespaces/${ns}
X-ESR-App-Id: esr_app_mynotes_mobile
X-ESR-Platform: ios
X-ESR-Bundle-Id: com.example.mynotes
Authorization: Bearer dvt_...
# Optional when native.requireClientSecret: true (unauthenticated routes too):
# X-ESR-Client-Secret: {client_secret}`,

    health: {
      request: `GET ${origin}/health`,
      response: `{
  "status": "ok",
  "version": "0.1.8",
  "database": { "status": "ok", "mode": "external" },
  "blob": { "status": "ok", "path": "/var/lib/senkronla/blobs" },
  "websocket": true,
  "developerPortal": { "enabled": false },
  "apps": {
    "enabled": false,
    "nativeRequireClientSecret": false
  }
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
  "limits": ${sampleLimits(1, 1)}
}`,
    } satisfies HttpExamplePair,

    getNamespace: {
      request: `GET ${v1}/namespaces/${ns}
${auth}`,
      response: `{
  "namespaceId": "${ns}",
  "namespaceLabel": "${SAMPLE.namespaceLabel}",
  "limits": ${sampleLimits(1, 1)},
  "head": {
    "revision": "${SAMPLE.revision}",
    "writtenAt": "${SAMPLE.writtenAt}",
    "deviceId": "${SAMPLE.deviceId}",
    "contentSha256": "${SAMPLE.contentSha256Primary}",
    "contentMagic": "${SAMPLE.contentMagic}",
    "sizeBytes": ${SAMPLE.sizeBytesPrimary}
  },
  "lastSyncAt": "${SAMPLE.writtenAt}",
  "documents": [
    {
      "documentId": "primary",
      "revision": "${SAMPLE.revision}",
      "writtenAt": "${SAMPLE.writtenAt}",
      "deviceId": "${SAMPLE.deviceId}",
      "contentSha256": "${SAMPLE.contentSha256Primary}",
      "contentMagic": "${SAMPLE.contentMagic}",
      "sizeBytes": ${SAMPLE.sizeBytesPrimary}
    }
  ]
}`,
    } satisfies HttpExamplePair,

    listDocuments: {
      request: `GET ${v1}/namespaces/${ns}/documents
${auth}`,
      response: `{
  "documents": [
    {
      "documentId": "primary",
      "revision": "${SAMPLE.revision}",
      "writtenAt": "${SAMPLE.writtenAt}",
      "deviceId": "${SAMPLE.deviceId}",
      "contentSha256": "${SAMPLE.contentSha256Primary}",
      "contentMagic": "${SAMPLE.contentMagic}",
      "sizeBytes": ${SAMPLE.sizeBytesPrimary}
    },
    {
      "documentId": "${API_EXAMPLE_DOCUMENT_ID}",
      "revision": "01HZQXNOTESREV01",
      "writtenAt": "2026-05-28T11:00:00.000Z",
      "deviceId": "${SAMPLE.deviceId}",
      "contentSha256": "${SAMPLE.contentSha256}",
      "contentMagic": "${SAMPLE.contentMagic}",
      "sizeBytes": ${SAMPLE.sizeBytesNotes}
    }
  ],
  ${rateLimitsJson([['global_ip', 300, 299, 42, 60]])}
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
  "qrPayload": "esr://pair/v1/${ns}?code=${SAMPLE.pairingCode}&exp=1748427900&host=Alice%20laptop",
  ${rateLimitsJson([
    ['global_ip', 300, 298, 42, 60],
    ['pairing_token', 30, 29, 3600, 3600],
  ])}
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
  "limits": ${sampleLimits(2, 1)},
  ${rateLimitsJson([
    ['global_ip', 300, 297, 42, 60],
    ['pair_device', 20, 19, 3600, 3600],
  ])}
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
  "limits": ${sampleLimits(2, 1)}
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
  "limits": ${sampleLimits(1, 1)},
  ${rateLimitsJson([
    ['global_ip', 300, 296, 42, 60],
    ['recover', 5, 4, 3600, 3600],
  ])}
}`,
    } satisfies HttpExamplePair,

    getDocumentHeadMeta: {
      request: `GET ${v1}/namespaces/${ns}/documents/${API_EXAMPLE_DOCUMENT_ID}/head/meta
${auth}`,
      response: `{
  "revision": "01HZQXNOTESREV01",
  "writtenAt": "2026-05-28T11:00:00.000Z",
  "deviceId": "${SAMPLE.deviceId}",
  "contentSha256": "${SAMPLE.contentSha256}",
  "contentMagic": "${SAMPLE.contentMagic}",
  "sizeBytes": ${SAMPLE.sizeBytesNotes},
  ${rateLimitsJson([['global_ip', 300, 299, 42, 60]])}
}`,
    } satisfies HttpExamplePair,

    getDocumentHead: {
      request: `GET ${v1}/namespaces/${ns}/documents/${API_EXAMPLE_DOCUMENT_ID}/head
${auth}`,
      response: `{
  "envelope": ${formatEnvelope(API_EXAMPLE_DOCUMENT_ID, '01HZQXNOTESREV01', {
    writtenAt: '2026-05-28T11:00:00.000Z',
    depth: 1,
  })},
  ${rateLimitsJson([['global_ip', 300, 299, 42, 60]])}
}`,
    } satisfies HttpExamplePair,

    pushDocumentCreate: {
      request: `PUT ${v1}/namespaces/${ns}/documents/${API_EXAMPLE_DOCUMENT_ID}
${auth}
Content-Type: application/json

${buildPushRequest(API_EXAMPLE_DOCUMENT_ID, '01HZQXNOTESREV01', null, '2026-05-28T11:00:00.000Z')}`,
      response: pushCreatedResponse(
        '01HZQXNOTESREV01',
        '2026-05-28T11:00:00.000Z',
        SAMPLE.contentSha256,
        119,
        298,
      ),
    } satisfies HttpExamplePair,

    pushDocumentUpdate: {
      request: `PUT ${v1}/namespaces/${ns}/documents/${API_EXAMPLE_DOCUMENT_ID}
${auth}
Content-Type: application/json

${buildPushRequest(API_EXAMPLE_DOCUMENT_ID, '01HZQXNOTESREV02', '01HZQXNOTESREV01', '2026-05-28T11:05:00.000Z', {
        payload: SAMPLE.payloadUpdate,
        contentSha256: SAMPLE.contentSha256Update,
      })}`,
      response: pushCreatedResponse(
        '01HZQXNOTESREV02',
        '2026-05-28T11:05:00.000Z',
        SAMPLE.contentSha256Update,
        118,
        297,
      ),
    } satisfies HttpExamplePair,

    rateLimitResponseShape: `// Success — rateLimits keys match internal action ids (not header suffixes)
{
  ${rateLimitsJson([
    ['global_ip', 300, 298, 42, 60],
    ['put_document', 120, 119, 3600, 3600],
  ])}
}

// 429 — no top-level rateLimits; single quota in error.details
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Document PUT rate limit exceeded",
    "details": {
      "retryAfterSeconds": 3600,
      "action": "put_document",
${rateLimitDetailJson('put_document', 120, 0, 3600, 3600)}
    }
  }
}`,

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
      response: `// Client → server (optional filter after auth_ok)
{ "type": "subscribe", "documentIds": ["primary", "${API_EXAMPLE_DOCUMENT_ID}"] }

// Server → client (head_changed)
{
  "type": "head_changed",
  "documentId": "${API_EXAMPLE_DOCUMENT_ID}",
  "revision": "01HZQXNOTESREV02",
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
      request: `PUT ${v1}/namespaces/${ns}/documents/${API_EXAMPLE_DOCUMENT_ID}
${auth}
Content-Type: application/json

${buildPushRequest(API_EXAMPLE_DOCUMENT_ID, '01HZQXNOTESREV02', '01HZSTALE_REVISION', '2026-05-28T11:05:00.000Z', {
        payload: SAMPLE.payloadUpdate,
        contentSha256: SAMPLE.contentSha256Update,
      })}`,
      response: `HTTP/1.1 409 Conflict

{
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Expected revision does not match server head",
    "details": {
      "remoteMeta": {
        "revision": "01HZQXNOTESREV01",
        "writtenAt": "2026-05-28T11:00:00.000Z",
        "deviceId": "${SAMPLE.deviceId}",
        "contentSha256": "${SAMPLE.contentSha256}",
        "contentMagic": "${SAMPLE.contentMagic}",
        "sizeBytes": ${SAMPLE.sizeBytesNotes}
      }
    }
  }
}`,
    } satisfies HttpExamplePair,

    envEnc1InnerExample: `{
  "magic": "ENV-ENC1",
  "kdf": "PBKDF2-SHA256",
  "iterations": 600000,
  "salt": "...",
  "nonce": "...",
  "ciphertext": "..."
}`,

    restEnvEnc1Build: `import { buildEnvEnc1Payload, sha256Hex } from '@senkronla/protocol'

const documentJson = '{"note":"Hello"}'
const password = await yourApp.getSyncPassword() // never sent to the relay
const payload = await buildEnvEnc1Payload(documentJson, password)

const envelope = {
  magic: 'ESR-DOC1',
  schemaVersion: 2,
  namespaceId,
  namespaceLabel,
  documentId: 'notes',
  revision: newRevisionUlid,
  deviceId,
  writtenAt: new Date().toISOString(),
  contentType: 'application/vnd.myapp+json',
  contentMagic: 'ENV-ENC1',
  contentSha256: sha256Hex(payload),
  payload,
}

// PUT /v1/namespaces/{id}/documents/{documentId}
// Body: { "expectedRevision": null | "...", "envelope": envelope }`,
  }
}

export function createEsrGuideSnippets(exampleOrigin = 'https://yourdomain.com') {
  const origin = exampleOrigin.replace(/\/$/, '')
  return {
    dockerEnv: `cp .env.example .env`,
    dockerBundled: `docker compose --project-directory . -f docker/docker-compose.yml --env-file .env --profile bundled-db up --build`,
    dockerResources: `docker compose --project-directory . -f docker/docker-compose.yml -f docker/docker-compose.resources.example.yml \\\n  --env-file .env --profile bundled-db up --build`,
    dockerExternal: `# macOS/Windows — Postgres on host\n# Add to .env:\nESR_COMPOSE_DATABASE_URL=postgresql://user:pass@host.docker.internal:5432/esr\n\ndocker compose --project-directory . -f docker/docker-compose.yml --env-file .env up api web`,
    localPostgres: `docker compose --project-directory . -f docker/docker-compose.yml --env-file .env --profile bundled-db up postgres -d`,
    localDev: `pnpm install\ncp .env.example .env\npnpm dev`,
    healthCheck: `curl -s ${origin}/health`,
    migrate: `pnpm --filter @senkronla/server migrate`,
    unlockCode: `export ESR_ADMIN_TOKEN="your-admin-token"\nexport ESR_PUBLIC_URL="${origin}"\n\nnpx @senkronla/cli generate-unlock-code \\\n  --namespace-id 550e8400-e29b-41d4-a716-446655440000 \\\n  --slots 3 \\\n  --note "Invoice #1234"`,
    rateLimitConfig: `limits:
  rateLimit:
    enabled: true
    recoverPerHour: 5
    pairingPerHour: 20
    pairingTokensPerHour: 30
    pushPerHourPerDevice: 120
    generalPerMinutePerIp: 300

apps:
  limits:
    perApp:
      namespacesPerDay: 100
      recoverPerHour: 5
      pairingTokensPerHour: 30`,
  }
}
