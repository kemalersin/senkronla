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

export function createGuideSnippets(relayUrl: string) {
  return {
    minimalSetup: `import {
  EsrSync,
  createDocumentAdapter,
  createLocalStorageAdapter,
  generateNamespaceId,
} from '@senkronla/client'

const namespaceId = generateNamespaceId()
// Persist before ensureNamespace — same id across reinstalls (or use your workspace UUID)

const document = createDocumentAdapter({
  namespaceId,
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
    // 'remote' | 'local' | 'cancel'
  },
})

await sync.ensureNamespace()
await sync.sync() // all documents on startup
appStore.onChange(() => sync.notifyLocalChange('primary'))`,

    multiDocumentSync: `const sync = await EsrSync.connect({
  relayUrl: '${relayUrl}',
  storage: createLocalStorageAdapter('myapp'),
  documents: [
    { adapter: mainDocumentAdapter },
    { documentId: 'settings', adapter: settingsDocumentAdapter },
  ],
  onRecoveryPhrase: async ({ phrase }) => ui.showRecoveryModal(phrase),
  onConflict: async (ctx) => {
    console.log('Conflict on', ctx.documentId)
    return 'remote'
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

    notifyLocalChange: `// Call after every local edit — debounced push (default 2s)
appStore.onChange(() => sync.notifyLocalChange('primary'))
settingsStore.onChange(() => sync.notifyLocalChange('settings'))

// getStatus() becomes 'pending_push' until push completes`,

    flushPush: `// Before logout or when you need an immediate upload
await sync.flushPush() // all slots with pending changes
await sync.flushPush('settings') // one document

// Skips debounce — pushes current snapshot right away`,

    startPairing: `const { code, qrPayload, expiresAt } = await sync.startPairing()

ui.showPairingScreen({
  code,           // "482913" — 6 digits
  qrPayload,      // esr://pair/v1/...?code=482913&exp=...
  expiresAt,      // ISO timestamp
})`,

    joinPairing: `// Guest device — same namespaceId in the document adapter
await sync.joinPairing('482913')

// Stores device token, then runs sync() (all documents)
// Pulls remote snapshots via importDocument() per slot`,

    recover: `// All devices lost — user enters 24-word phrase
await sync.recover(
  'abandon ability able about above absent absorb abstract absurd abuse access accident'
)

// Issues new device token; revokes every previously paired device
// Then runs sync() to pull latest remote snapshots (all documents)`,

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
await sync.resolveConflict('remote', 'primary')
await sync.resolveConflict('local', 'settings')`,

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
  onConflict: async (ctx) => {
    console.log('Conflict on', ctx.documentId)
    return 'remote'
  },
  onDocumentStatusChange: (documentId, status) => ui.setDocBadge(documentId, status),
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

    encryptedDocumentAdapter: `const document = createDocumentAdapter({
  namespaceId: workspace.id,
  namespaceLabel: workspace.name,
  contentType: 'application/vnd.myapp+json',
  encrypt: true,
  resolvePassword: async () => {
    // Your app supplies this — the SDK never generates a sync password.
    // Session unlock, OS keychain, or a user prompt are typical sources.
    return session.getSyncPassword()
  },
  exportDocument: () => store.exportSnapshot(),
  importDocument: (data) => store.importSnapshot(data),
})`,

    buildEncryptedEnvelope: `import { buildEnvelope, extractDocument } from '@senkronla/client'

const password = await session.getSyncPassword()

const envelope = await buildEnvelope({
  namespaceId: workspace.id,
  namespaceLabel: workspace.name,
  documentJson: JSON.stringify(await store.exportSnapshot()),
  deviceId: clientDeviceId,
  contentType: 'application/vnd.myapp+json',
  encrypt: true,
  password,
})

// Pull path — same password required to decrypt ENV-ENC1
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
