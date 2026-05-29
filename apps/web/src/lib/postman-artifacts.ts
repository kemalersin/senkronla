import { randomUUID } from 'node:crypto'

import { API_EXAMPLE_DOCUMENT_ID, API_SAMPLE } from '@/lib/api-sample-data'

const POSTMAN_SCHEMA = 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'

interface PostmanRequestItem {
  name: string
  request: Record<string, unknown>
  response?: unknown[]
  event?: Array<{ listen: string; script: { type: string; exec: string[] } }>
  description?: string
}

interface PostmanFolderItem {
  name: string
  description?: string
  item: Array<PostmanRequestItem | PostmanFolderItem>
}

type PostmanItem = PostmanRequestItem | PostmanFolderItem

function isFolder(item: PostmanItem): item is PostmanFolderItem {
  return 'item' in item
}

function bearerAuth() {
  return {
    type: 'bearer',
    bearer: [{ key: 'token', value: '{{deviceToken}}', type: 'string' }],
  }
}

function noAuth() {
  return { type: 'noauth' }
}

function jsonHeaders(): Array<{ key: string; value: string }> {
  return [{ key: 'Content-Type', value: 'application/json' }]
}

function testScript(lines: string[]) {
  return [
    {
      listen: 'test',
      script: {
        type: 'text/javascript',
        exec: lines,
      },
    },
  ]
}

function envelopeBody(
  documentId: string,
  revision: string,
  writtenAt: string,
  options?: { payload?: string; contentSha256?: string },
): Record<string, unknown> {
  const schemaVersion = documentId === 'primary' ? 1 : 2
  const contentType =
    documentId === 'primary'
      ? 'application/vnd.myapp+json'
      : 'application/vnd.example.notes+json'
  const payload =
    options?.payload ??
    (documentId === 'primary' ? API_SAMPLE.payloadPrimary : API_SAMPLE.payload)
  const contentSha256 =
    options?.contentSha256 ??
    (documentId === 'primary' ? API_SAMPLE.contentSha256Primary : API_SAMPLE.contentSha256)

  return {
    magic: 'ESR-DOC1',
    schemaVersion,
    namespaceId: '{{namespaceId}}',
    namespaceLabel: '{{namespaceLabel}}',
    documentId,
    revision,
    deviceId: '{{deviceId}}',
    writtenAt,
    contentType,
    contentMagic: API_SAMPLE.contentMagic,
    contentSha256,
    payload,
  }
}

function pushBody(
  documentId: string,
  revision: string,
  expectedRevision: string | null,
  writtenAt: string,
  options?: { payload?: string; contentSha256?: string },
): Record<string, unknown> {
  return {
    expectedRevision,
    envelope: envelopeBody(documentId, revision, writtenAt, options),
  }
}

function httpRequest(options: {
  name: string
  method: string
  url: string
  description?: string
  auth?: ReturnType<typeof bearerAuth> | ReturnType<typeof noAuth>
  headers?: Array<{ key: string; value: string }>
  body?: Record<string, unknown>
  tests?: string[]
}): PostmanRequestItem {
  const request: Record<string, unknown> = {
    method: options.method,
    header: options.headers ?? [],
    url: options.url,
    description: options.description,
    auth: options.auth ?? bearerAuth(),
  }

  if (options.body !== undefined) {
    request.body = {
      mode: 'raw',
      raw: JSON.stringify(options.body, null, 2),
      options: { raw: { language: 'json' } },
    }
  }

  return {
    name: options.name,
    request,
    event: options.tests ? testScript(options.tests) : undefined,
    description: options.description,
  }
}

function folder(name: string, items: PostmanItem[], description?: string): PostmanFolderItem {
  return { name, description, item: items }
}

function buildQuickStartItems(): PostmanItem[] {
  const docId = API_EXAMPLE_DOCUMENT_ID

  return [
    httpRequest({
      name: '1. Health check',
      method: 'GET',
      url: '{{relayOrigin}}/health',
      auth: noAuth(),
      description: 'Relay health — no authentication required.',
      tests: [
        "pm.test('Relay is healthy', function () {",
        '    pm.response.to.have.status(200);',
        "    pm.expect(pm.response.json().status).to.eql('ok');",
        '});',
      ],
    }),
    httpRequest({
      name: '2. Create namespace (first device)',
      method: 'POST',
      url: '{{relayBaseUrl}}/namespaces',
      auth: noAuth(),
      headers: jsonHeaders(),
      description:
        'Creates a workspace and returns the first device token. Run this before authenticated requests, or use the pre-filled sample token in the environment.',
      body: {
        namespaceId: '{{namespaceId}}',
        namespaceLabel: '{{namespaceLabel}}',
        deviceLabel: '{{deviceLabelHost}}',
        clientDeviceId: '{{clientDeviceId}}',
        recoveryKeyProof: {
          salt: '{{recoverySalt}}',
          hash: '{{recoveryHash}}',
        },
      },
      tests: [
        "pm.test('Namespace created', function () {",
        '    pm.response.to.have.status(201);',
        '    const json = pm.response.json();',
        "    pm.expect(json.deviceToken).to.be.a('string');",
        "    pm.environment.set('namespaceId', json.namespaceId);",
        "    pm.environment.set('deviceToken', json.deviceToken);",
        "    pm.environment.set('deviceId', json.deviceId);",
        '});',
      ],
    }),
    httpRequest({
      name: '3. List documents',
      method: 'GET',
      url: `{{relayBaseUrl}}/namespaces/{{namespaceId}}/documents`,
      description: 'Lists all document heads in the namespace.',
      tests: [
        "pm.test('Documents listed', function () {",
        '    pm.response.to.have.status(200);',
        "    pm.expect(pm.response.json().documents).to.be.an('array');",
        '});',
      ],
    }),
    httpRequest({
      name: `4. Push document — first (${docId})`,
      method: 'PUT',
      url: `{{relayBaseUrl}}/namespaces/{{namespaceId}}/documents/${docId}`,
      headers: jsonHeaders(),
      description: 'First push for a non-primary document. `expectedRevision` must be null.',
      body: pushBody(docId, '{{notesRevision}}', null, '{{notesWrittenAt}}'),
      tests: [
        "pm.test('Document pushed', function () {",
        '    pm.response.to.have.status(201);',
        '    const json = pm.response.json();',
        "    pm.environment.set('notesRevision', json.revision);",
        '});',
      ],
    }),
    httpRequest({
      name: `5. Get head meta (${docId})`,
      method: 'GET',
      url: `{{relayBaseUrl}}/namespaces/{{namespaceId}}/documents/${docId}/head/meta`,
      description: 'Lightweight head metadata — poll this before deciding to pull.',
      tests: [
        "pm.test('Head meta returned', function () {",
        '    pm.response.to.have.status(200);',
        "    pm.environment.set('notesRevision', pm.response.json().revision);",
        '});',
      ],
    }),
    httpRequest({
      name: `6. Get head (${docId})`,
      method: 'GET',
      url: `{{relayBaseUrl}}/namespaces/{{namespaceId}}/documents/${docId}/head`,
      description: 'Full envelope for import when revision differs from local state.',
    }),
  ]
}

function buildNamespaceItems(): PostmanItem[] {
  return [
    httpRequest({
      name: 'Create namespace',
      method: 'POST',
      url: '{{relayBaseUrl}}/namespaces',
      auth: noAuth(),
      headers: jsonHeaders(),
      description: 'Create workspace + first device. Returns `deviceToken` and `deviceId`.',
      body: {
        namespaceId: '{{namespaceId}}',
        namespaceLabel: '{{namespaceLabel}}',
        deviceLabel: '{{deviceLabelHost}}',
        clientDeviceId: '{{clientDeviceId}}',
        recoveryKeyProof: {
          salt: '{{recoverySalt}}',
          hash: '{{recoveryHash}}',
        },
      },
      tests: [
        "pm.test('Namespace created', function () {",
        '    pm.response.to.have.status(201);',
        '    const json = pm.response.json();',
        "    pm.environment.set('namespaceId', json.namespaceId);",
        "    pm.environment.set('deviceToken', json.deviceToken);",
        "    pm.environment.set('deviceId', json.deviceId);",
        '});',
      ],
    }),
    httpRequest({
      name: 'Get namespace',
      method: 'GET',
      url: '{{relayBaseUrl}}/namespaces/{{namespaceId}}',
      description: 'Metadata, limits, primary head summary, and document list.',
    }),
  ]
}

function buildDocumentItems(): PostmanItem[] {
  const docId = API_EXAMPLE_DOCUMENT_ID

  return [
    httpRequest({
      name: 'List documents',
      method: 'GET',
      url: '{{relayBaseUrl}}/namespaces/{{namespaceId}}/documents',
    }),
    httpRequest({
      name: `Get head meta (${docId})`,
      method: 'GET',
      url: `{{relayBaseUrl}}/namespaces/{{namespaceId}}/documents/${docId}/head/meta`,
      tests: [
        "pm.test('Head meta', function () {",
        '    pm.response.to.have.status(200);',
        "    pm.environment.set('notesRevision', pm.response.json().revision);",
        '});',
      ],
    }),
    httpRequest({
      name: `Get head (${docId})`,
      method: 'GET',
      url: `{{relayBaseUrl}}/namespaces/{{namespaceId}}/documents/${docId}/head`,
    }),
    httpRequest({
      name: 'Get head meta (primary alias)',
      method: 'GET',
      url: '{{relayBaseUrl}}/namespaces/{{namespaceId}}/documents/primary/head/meta',
      description: 'Legacy alias path for the default `primary` document.',
    }),
    httpRequest({
      name: 'Get head (primary alias)',
      method: 'GET',
      url: '{{relayBaseUrl}}/namespaces/{{namespaceId}}/documents/primary/head',
    }),
    httpRequest({
      name: `Push document — first (${docId})`,
      method: 'PUT',
      url: `{{relayBaseUrl}}/namespaces/{{namespaceId}}/documents/${docId}`,
      headers: jsonHeaders(),
      body: pushBody(docId, '{{notesRevision}}', null, '{{notesWrittenAt}}'),
      tests: [
        "pm.test('Document pushed', function () {",
        '    pm.response.to.have.status(201);',
        "    pm.environment.set('notesRevision', pm.response.json().revision);",
        '});',
      ],
    }),
    httpRequest({
      name: `Push document — update (${docId})`,
      method: 'PUT',
      url: `{{relayBaseUrl}}/namespaces/{{namespaceId}}/documents/${docId}`,
      headers: jsonHeaders(),
      description: '`expectedRevision` must match the current server head.',
      body: pushBody(
        docId,
        '{{notesRevisionUpdate}}',
        '{{notesRevision}}',
        '{{notesWrittenAtUpdate}}',
        { payload: API_SAMPLE.payloadUpdate, contentSha256: API_SAMPLE.contentSha256Update },
      ),
      tests: [
        "pm.test('Document updated', function () {",
        '    pm.response.to.have.status(201);',
        "    pm.environment.set('notesRevision', pm.response.json().revision);",
        '});',
      ],
    }),
    httpRequest({
      name: `Push document — revision conflict (${docId})`,
      method: 'PUT',
      url: `{{relayBaseUrl}}/namespaces/{{namespaceId}}/documents/${docId}`,
      headers: jsonHeaders(),
      description: 'Example request with a stale `expectedRevision` — expect `409 REVISION_CONFLICT`.',
      body: pushBody(docId, '{{notesRevisionUpdate}}', '01HZSTALE_REVISION', '{{notesWrittenAtUpdate}}', {
        payload: API_SAMPLE.payloadUpdate,
        contentSha256: API_SAMPLE.contentSha256Update,
      }),
      tests: [
        "pm.test('Revision conflict', function () {",
        '    pm.response.to.have.status(409);',
        "    pm.expect(pm.response.json().error.code).to.eql('REVISION_CONFLICT');",
        '});',
      ],
    }),
    httpRequest({
      name: 'Push document — primary (first)',
      method: 'PUT',
      url: '{{relayBaseUrl}}/namespaces/{{namespaceId}}/documents/primary',
      headers: jsonHeaders(),
      description: 'First push for the default `primary` document (schemaVersion 1).',
      body: pushBody('primary', '{{primaryRevision}}', null, '{{writtenAt}}'),
    }),
  ]
}

function buildDeviceItems(): PostmanItem[] {
  return [
    httpRequest({
      name: 'Create pairing token (host)',
      method: 'POST',
      url: '{{relayBaseUrl}}/namespaces/{{namespaceId}}/pairing-tokens',
      headers: jsonHeaders(),
      description:
        'Host device generates a 6-digit pairing code. When `apps.enabled`, add header `X-ESR-App-Id: {{esrAppId}}` (enable in environment). Optional body scope: `{ "ttlSeconds": 600, "allowedAppIds": ["esr_app_a", "esr_app_b"] }`.',
      body: { ttlSeconds: 600 },
      tests: [
        "pm.test('Pairing token created', function () {",
        '    pm.response.to.have.status(201);',
        '    const json = pm.response.json();',
        "    pm.environment.set('pairingCode', json.code);",
        '});',
      ],
    }),
    httpRequest({
      name: 'Redeem pairing code (guest)',
      method: 'POST',
      url: '{{relayBaseUrl}}/namespaces/{{namespaceId}}/devices',
      auth: noAuth(),
      headers: jsonHeaders(),
      description: 'Guest device redeems the pairing code — no device token required.',
      body: {
        pairingCode: '{{pairingCode}}',
        deviceLabel: '{{deviceLabelGuest}}',
        clientDeviceId: '{{guestClientDeviceId}}',
      },
      tests: [
        "pm.test('Device paired', function () {",
        '    pm.response.to.have.status(201);',
        '    const json = pm.response.json();',
        "    pm.environment.set('guestDeviceToken', json.deviceToken);",
        "    pm.environment.set('guestDeviceId', json.deviceId);",
        '});',
      ],
    }),
    httpRequest({
      name: 'List devices',
      method: 'GET',
      url: '{{relayBaseUrl}}/namespaces/{{namespaceId}}/devices',
    }),
    httpRequest({
      name: 'Revoke device',
      method: 'DELETE',
      url: '{{relayBaseUrl}}/namespaces/{{namespaceId}}/devices/{{guestDeviceId}}',
      description: 'Removes a paired device. The last remaining device cannot be revoked.',
      tests: [
        "pm.test('Device revoked', function () {",
        '    pm.response.to.have.status(204);',
        '});',
      ],
    }),
  ]
}

function buildRecoveryItems(): PostmanItem[] {
  return [
    httpRequest({
      name: 'Recover namespace',
      method: 'POST',
      url: '{{relayBaseUrl}}/namespaces/{{namespaceId}}/recover',
      auth: noAuth(),
      headers: jsonHeaders(),
      description:
        '**Warning:** revokes every existing device token in the workspace. Uses recovery key proof, not the raw phrase.',
      body: {
        recoveryKeyProof: {
          salt: '{{recoverySalt}}',
          hash: '{{recoveryHash}}',
        },
        deviceLabel: '{{deviceLabelRecovery}}',
        clientDeviceId: '{{recoveryClientDeviceId}}',
      },
      tests: [
        "pm.test('Namespace recovered', function () {",
        '    pm.response.to.have.status(200);',
        '    const json = pm.response.json();',
        "    pm.environment.set('deviceToken', json.deviceToken);",
        "    pm.environment.set('deviceId', json.deviceId);",
        '});',
      ],
    }),
  ]
}

function buildLimitItems(): PostmanItem[] {
  return [
    httpRequest({
      name: 'Get limits',
      method: 'GET',
      url: '{{relayBaseUrl}}/namespaces/{{namespaceId}}/limits',
    }),
    httpRequest({
      name: 'Redeem unlock code',
      method: 'POST',
      url: '{{relayBaseUrl}}/namespaces/{{namespaceId}}/unlock',
      headers: jsonHeaders(),
      description: 'Operator-generated unlock code adds purchased device slots.',
      body: { unlockCode: '{{unlockCode}}' },
    }),
  ]
}

function buildWebSocketItems(): PostmanItem[] {
  return [
    httpRequest({
      name: 'Connect to notifications',
      method: 'GET',
      url: '{{relayWsBaseUrl}}/namespaces/{{namespaceId}}/notifications',
      description: [
        'WebSocket upgrade for `head_changed` and `limits_changed` events.',
        '',
        'In Postman: switch protocol to **WebSocket**, set header `Sec-WebSocket-Protocol: esr-notifications-v1`, and send the same `Authorization: Bearer {{deviceToken}}` header.',
        '',
        'After `auth_ok`, optionally send:',
        '```json',
        '{ "type": "subscribe", "documentIds": ["primary", "notes"] }',
        '```',
        '',
        'Always fetch document data over HTTP (`GET .../head`) — notifications carry metadata only.',
      ].join('\n'),
      headers: [{ key: 'Sec-WebSocket-Protocol', value: 'esr-notifications-v1' }],
    }),
  ]
}

export function buildPostmanCollection() {
  return {
    info: {
      _postman_id: randomUUID(),
      name: 'Senkronla Relay API v1',
      description: [
        'Runnable Postman collection for the Senkronla Envelope Sync Relay REST API (`/v1`).',
        '',
        '**Setup**',
        '1. Import `senkronla-relay-local.postman_environment.json` (or the production template).',
        '2. Set `relayOrigin` to your relay host (default: `http://localhost:8080`).',
        '3. Run **Quick start** folder in order, or use the pre-filled sample variables for read-only requests.',
        '',
        'Collection auth uses `{{deviceToken}}`. Unauthenticated routes override auth per request.',
        '',
        '**App registry (v1.3, optional):** When the relay has `apps.enabled: true`, set `esrAppId` in the environment and add `X-ESR-App-Id` to namespace/pairing requests. See agent API docs for native bundle headers.',
        '',
        'Docs: https://senkronla.dev/api',
      ].join('\n'),
      schema: POSTMAN_SCHEMA,
    },
    auth: bearerAuth(),
    item: [
      folder(
        'Quick start (run in order)',
        buildQuickStartItems(),
        'Minimal happy-path flow: health → create namespace → list → push → poll → pull.',
      ),
      folder('Namespaces', buildNamespaceItems()),
      folder('Documents', buildDocumentItems()),
      folder('Devices & pairing', buildDeviceItems()),
      folder('Recovery', buildRecoveryItems()),
      folder('Limits & unlock', buildLimitItems()),
      folder('WebSocket', buildWebSocketItems()),
    ],
    variable: [
      { key: 'relayOrigin', value: 'http://localhost:8080' },
      { key: 'relayBaseUrl', value: '{{relayOrigin}}/v1' },
      { key: 'relayWsBaseUrl', value: 'ws://localhost:8080/v1' },
    ],
  }
}

export interface PostmanEnvironmentSpec {
  id?: string
  name: string
  relayOrigin: string
}

function wsOriginFromHttp(origin: string): string {
  if (origin.startsWith('https://')) {
    return `wss://${origin.slice('https://'.length)}`
  }
  if (origin.startsWith('http://')) {
    return `ws://${origin.slice('http://'.length)}`
  }
  return origin
}

export function buildPostmanEnvironment(spec: PostmanEnvironmentSpec) {
  const relayOrigin = spec.relayOrigin.replace(/\/$/, '')
  const relayBaseUrl = `${relayOrigin}/v1`
  const relayWsBaseUrl = `${wsOriginFromHttp(relayOrigin)}/v1`

  const values: Array<{ key: string; value: string; type: string; enabled: boolean }> = [
    { key: 'relayOrigin', value: relayOrigin, type: 'default', enabled: true },
    { key: 'relayBaseUrl', value: relayBaseUrl, type: 'default', enabled: true },
    { key: 'relayWsBaseUrl', value: relayWsBaseUrl, type: 'default', enabled: true },
    { key: 'namespaceId', value: API_SAMPLE.namespaceId, type: 'default', enabled: true },
    { key: 'namespaceLabel', value: API_SAMPLE.namespaceLabel, type: 'default', enabled: true },
    { key: 'clientDeviceId', value: API_SAMPLE.clientDeviceId, type: 'default', enabled: true },
    { key: 'guestClientDeviceId', value: API_SAMPLE.guestClientDeviceId, type: 'default', enabled: true },
    { key: 'recoveryClientDeviceId', value: API_SAMPLE.recoveryClientDeviceId, type: 'default', enabled: true },
    { key: 'deviceToken', value: API_SAMPLE.deviceToken, type: 'secret', enabled: true },
    { key: 'guestDeviceToken', value: API_SAMPLE.guestDeviceToken, type: 'secret', enabled: true },
    { key: 'deviceId', value: API_SAMPLE.deviceId, type: 'default', enabled: true },
    { key: 'guestDeviceId', value: API_SAMPLE.guestDeviceId, type: 'default', enabled: true },
    { key: 'documentId', value: API_EXAMPLE_DOCUMENT_ID, type: 'default', enabled: true },
    { key: 'primaryRevision', value: API_SAMPLE.revision, type: 'default', enabled: true },
    { key: 'notesRevision', value: API_SAMPLE.notesRevision, type: 'default', enabled: true },
    { key: 'notesRevisionUpdate', value: API_SAMPLE.notesRevisionUpdate, type: 'default', enabled: true },
    { key: 'writtenAt', value: API_SAMPLE.writtenAt, type: 'default', enabled: true },
    { key: 'notesWrittenAt', value: API_SAMPLE.notesWrittenAt, type: 'default', enabled: true },
    { key: 'notesWrittenAtUpdate', value: API_SAMPLE.notesWrittenAtUpdate, type: 'default', enabled: true },
    { key: 'syncPassword', value: API_SAMPLE.syncPassword, type: 'secret', enabled: true },
    { key: 'contentSha256', value: API_SAMPLE.contentSha256, type: 'default', enabled: true },
    { key: 'contentSha256Update', value: API_SAMPLE.contentSha256Update, type: 'default', enabled: true },
    { key: 'contentSha256Primary', value: API_SAMPLE.contentSha256Primary, type: 'default', enabled: true },
    { key: 'recoverySalt', value: API_SAMPLE.recoverySalt, type: 'default', enabled: true },
    { key: 'recoveryHash', value: API_SAMPLE.recoveryHash, type: 'default', enabled: true },
    { key: 'pairingCode', value: API_SAMPLE.pairingCode, type: 'default', enabled: true },
    {
      key: 'esrAppId',
      value: '',
      type: 'default',
      enabled: false,
    },
    { key: 'unlockCode', value: API_SAMPLE.unlockCode, type: 'default', enabled: true },
    { key: 'deviceLabelHost', value: API_SAMPLE.deviceLabelHost, type: 'default', enabled: true },
    { key: 'deviceLabelGuest', value: API_SAMPLE.deviceLabelGuest, type: 'default', enabled: true },
    { key: 'deviceLabelRecovery', value: API_SAMPLE.deviceLabelRecovery, type: 'default', enabled: true },
  ]

  return {
    id: spec.id ?? randomUUID(),
    name: spec.name,
    values,
    _postman_variable_scope: 'environment',
    _postman_exported_at: new Date().toISOString(),
    _postman_exported_using: 'Senkronla docs generator',
  }
}

export const POSTMAN_ARTIFACT_PATHS = {
  collection: '/postman/senkronla-relay.postman_collection.json',
  localEnvironment: '/postman/senkronla-relay-local.postman_environment.json',
  productionEnvironment: '/postman/senkronla-relay-production.postman_environment.json',
} as const

export function buildPostmanArtifacts() {
  return {
    collection: buildPostmanCollection(),
    environments: {
      local: buildPostmanEnvironment({
        name: 'Senkronla Relay — Local',
        relayOrigin: 'http://localhost:8080',
      }),
      production: buildPostmanEnvironment({
        name: 'Senkronla Relay — Production',
        relayOrigin: 'https://your-relay.example.com',
      }),
    },
  }
}

function countRequests(items: PostmanItem[]): number {
  return items.reduce((count, item) => {
    if (isFolder(item)) {
      return count + countRequests(item.item)
    }
    return count + 1
  }, 0)
}

export function getPostmanRequestCount(): number {
  const collection = buildPostmanCollection()
  return countRequests(collection.item as PostmanItem[])
}
