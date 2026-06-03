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

function adminBearerAuth() {
  return {
    type: 'bearer',
    bearer: [{ key: 'token', value: '{{adminToken}}', type: 'string' }],
  }
}

function developerBearerAuth() {
  return {
    type: 'bearer',
    bearer: [{ key: 'token', value: '{{developerToken}}', type: 'string' }],
  }
}

function noAuth() {
  return { type: 'noauth' }
}

function jsonHeaders(): Array<{ key: string; value: string; disabled?: boolean; description?: string }> {
  return [{ key: 'Content-Type', value: 'application/json' }]
}

function appRegistryWebHeaders(): Array<{ key: string; value: string; description?: string }> {
  return [
    {
      key: 'X-ESR-App-Id',
      value: '{{esrAppId}}',
      description: 'Public app id — required when apps.enabled is true',
    },
    {
      key: 'Origin',
      value: '{{webOrigin}}',
      description: 'Browser origin — must match a verified origin for web apps',
    },
  ]
}

function appRegistryNativeHeaders(): Array<{ key: string; value: string; description?: string }> {
  return [
    {
      key: 'X-ESR-App-Id',
      value: '{{esrAppId}}',
      description: 'Public app id — required when apps.enabled is true',
    },
    {
      key: 'X-ESR-Platform',
      value: '{{nativePlatform}}',
      description: 'Native platform: ios, android, or desktop',
    },
    {
      key: 'X-ESR-Bundle-Id',
      value: '{{bundleId}}',
      description: 'Registered bundle id for the native app',
    },
    {
      key: 'X-ESR-Client-Secret',
      value: '{{clientSecret}}',
      description: 'Required when GET /health → apps.nativeRequireClientSecret is true',
    },
  ]
}

function withJsonAndAppWebHeaders(): ReturnType<typeof jsonHeaders> {
  return [...jsonHeaders(), ...appRegistryWebHeaders()]
}

function withJsonAndAppNativeHeaders(): ReturnType<typeof jsonHeaders> {
  return [...jsonHeaders(), ...appRegistryNativeHeaders()]
}

function namespaceCreateBody(): Record<string, unknown> {
  return {
    namespaceId: '{{namespaceId}}',
    namespaceLabel: '{{namespaceLabel}}',
    deviceLabel: '{{deviceLabelHost}}',
    clientDeviceId: '{{clientDeviceId}}',
    recoveryKeyProof: {
      salt: '{{recoverySalt}}',
      hash: '{{recoveryHash}}',
    },
  }
}

function namespaceCreatedTests(): string[] {
  return [
    "pm.test('Namespace created', function () {",
    '    pm.response.to.have.status(201);',
    '    const json = pm.response.json();',
    "    pm.expect(json.deviceToken).to.be.a('string');",
    "    pm.environment.set('namespaceId', json.namespaceId);",
    "    pm.environment.set('deviceToken', json.deviceToken);",
    "    pm.environment.set('deviceId', json.deviceId);",
    '});',
  ]
}

function pairingRedeemBody(): Record<string, unknown> {
  return {
    pairingCode: '{{pairingCode}}',
    deviceLabel: '{{deviceLabelGuest}}',
    clientDeviceId: '{{guestClientDeviceId}}',
  }
}

function pairingRedeemTests(): string[] {
  return [
    "pm.test('Device paired', function () {",
    '    pm.response.to.have.status(201);',
    '    const json = pm.response.json();',
    "    pm.environment.set('guestDeviceToken', json.deviceToken);",
    "    pm.environment.set('guestDeviceId', json.deviceId);",
    '});',
  ]
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
  auth?:
    | ReturnType<typeof bearerAuth>
    | ReturnType<typeof adminBearerAuth>
    | ReturnType<typeof developerBearerAuth>
    | ReturnType<typeof noAuth>
  headers?: Array<{ key: string; value: string; disabled?: boolean; description?: string }>
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
        '    const json = pm.response.json();',
        "    pm.expect(json.status).to.eql('ok');",
        "    pm.expect(json.developerPortal).to.have.property('enabled');",
        "    pm.expect(json.apps).to.have.property('enabled');",
        "    pm.expect(json.apps).to.have.property('nativeRequireClientSecret');",
        '});',
      ],
    }),
    httpRequest({
      name: '2. Create namespace (first device)',
      method: 'POST',
      url: '{{relayBaseUrl}}/namespaces',
      auth: noAuth(),
      headers: withJsonAndAppWebHeaders(),
      description:
        'Creates a workspace and returns the first device token. When app registration is enforced, `X-ESR-App-Id` and `Origin` must match a registered web app.',
      body: namespaceCreateBody(),
      tests: namespaceCreatedTests(),
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
      name: 'List devices',
      method: 'GET',
      url: '{{relayBaseUrl}}/namespaces/{{namespaceId}}/devices',
      description: 'Client-agnostic — no app registry headers required.',
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

function buildWebClientItems(): PostmanItem[] {
  return [
    httpRequest({
      name: '1. Create namespace',
      method: 'POST',
      url: '{{relayBaseUrl}}/namespaces',
      auth: noAuth(),
      headers: withJsonAndAppWebHeaders(),
      description:
        'First device for a browser/SPA. Headers: `X-ESR-App-Id`, `Origin` (must match a verified web origin).',
      body: namespaceCreateBody(),
      tests: namespaceCreatedTests(),
    }),
    httpRequest({
      name: '2. Create pairing token (host)',
      method: 'POST',
      url: '{{relayBaseUrl}}/namespaces/{{namespaceId}}/pairing-tokens',
      headers: withJsonAndAppWebHeaders(),
      description: 'Host generates a 6-digit code. Same web headers as namespace create.',
      body: { ttlSeconds: 600, allowedAppIds: ['{{esrAppId}}'] },
      tests: [
        "pm.test('Pairing token created', function () {",
        '    pm.response.to.have.status(201);',
        '    const json = pm.response.json();',
        "    pm.environment.set('pairingCode', json.code);",
        '});',
      ],
    }),
    httpRequest({
      name: '3. Redeem pairing code (guest)',
      method: 'POST',
      url: '{{relayBaseUrl}}/namespaces/{{namespaceId}}/devices',
      auth: noAuth(),
      headers: withJsonAndAppWebHeaders(),
      description: 'Guest browser redeems the code — no device token required.',
      body: pairingRedeemBody(),
      tests: pairingRedeemTests(),
    }),
    httpRequest({
      name: '4. Create pairing token (scoped allowedAppIds)',
      method: 'POST',
      url: '{{relayBaseUrl}}/namespaces/{{namespaceId}}/pairing-tokens',
      headers: withJsonAndAppWebHeaders(),
      description: 'Optional — restrict which registered apps may redeem the pairing code.',
      body: {
        ttlSeconds: 600,
        allowedAppIds: ['{{esrAppId}}'],
      },
    }),
  ]
}

function buildNativeClientItems(): PostmanItem[] {
  return [
    httpRequest({
      name: '1. Create namespace',
      method: 'POST',
      url: '{{relayBaseUrl}}/namespaces',
      auth: noAuth(),
      headers: withJsonAndAppNativeHeaders(),
      description:
        'First device on iOS/Android/desktop. Headers: `X-ESR-App-Id`, `X-ESR-Platform`, `X-ESR-Bundle-Id`, optional `X-ESR-Client-Secret`.',
      body: namespaceCreateBody(),
      tests: namespaceCreatedTests(),
    }),
    httpRequest({
      name: '2. Create pairing token (host)',
      method: 'POST',
      url: '{{relayBaseUrl}}/namespaces/{{namespaceId}}/pairing-tokens',
      headers: withJsonAndAppNativeHeaders(),
      description: 'Native host pairing — same native headers as namespace create.',
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
      name: '3. Redeem pairing code (guest)',
      method: 'POST',
      url: '{{relayBaseUrl}}/namespaces/{{namespaceId}}/devices',
      auth: noAuth(),
      headers: withJsonAndAppNativeHeaders(),
      description:
        'Native guest redeems the code. Set `bundleId`, `nativePlatform`, and `clientSecret` in the environment first.',
      body: pairingRedeemBody(),
      tests: pairingRedeemTests(),
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

function buildDeveloperAuthItems(): PostmanItem[] {
  return [
    httpRequest({
      name: 'Register developer',
      method: 'POST',
      url: '{{relayBaseUrl}}/developer/register',
      auth: noAuth(),
      headers: jsonHeaders(),
      description:
        'Requires `apps.registrationMode: self_service` and `ESR_DEVELOPER_JWT_SECRET`. May return JWT immediately or a pending-verification message.',
      body: {
        email: '{{developerEmail}}',
        password: '{{developerPassword}}',
      },
      tests: [
        "pm.test('Developer registered or pending verification', function () {",
        '    pm.response.to.have.status(201);',
        '    const json = pm.response.json();',
        '    if (json.token) {',
        "        pm.environment.set('developerToken', json.token);",
        '    }',
        '});',
      ],
    }),
    httpRequest({
      name: 'Login developer',
      method: 'POST',
      url: '{{relayBaseUrl}}/developer/login',
      auth: noAuth(),
      headers: jsonHeaders(),
      body: {
        email: '{{developerEmail}}',
        password: '{{developerPassword}}',
      },
      tests: [
        "pm.test('Developer JWT issued', function () {",
        '    pm.response.to.have.status(200);',
        "    pm.environment.set('developerToken', pm.response.json().token);",
        '});',
      ],
    }),
    httpRequest({
      name: 'Get developer profile',
      method: 'GET',
      url: '{{relayBaseUrl}}/developer/me',
      auth: developerBearerAuth(),
    }),
    httpRequest({
      name: 'Change password',
      method: 'PATCH',
      url: '{{relayBaseUrl}}/developer/password',
      auth: developerBearerAuth(),
      headers: jsonHeaders(),
      body: {
        currentPassword: '{{developerPassword}}',
        newPassword: '{{developerPassword}}',
      },
    }),
    httpRequest({
      name: 'Logout developer',
      method: 'POST',
      url: '{{relayBaseUrl}}/developer/logout',
      auth: developerBearerAuth(),
    }),
  ]
}

function buildDeveloperAppItems(): PostmanItem[] {
  return [
    httpRequest({
      name: 'List apps (search by bundle ID)',
      method: 'GET',
      url: '{{relayBaseUrl}}/developer/apps?q={{bundleId}}',
      auth: developerBearerAuth(),
      description: '`q` matches app ID, display name, or registered bundle ID.',
    }),
    httpRequest({
      name: 'Create app (web)',
      method: 'POST',
      url: '{{relayBaseUrl}}/developer/apps',
      auth: developerBearerAuth(),
      headers: jsonHeaders(),
      description:
        'Server assigns `esr_app_*` id. App starts pending; no client secret until rotate-secret.',
      body: {
        name: '{{appName}}',
        type: 'web',
      },
      tests: [
        "pm.test('App created', function () {",
        '    pm.response.to.have.status(201);',
        '    const json = pm.response.json();',
        "    pm.environment.set('esrAppId', json.appId);",
        '});',
      ],
    }),
    httpRequest({
      name: 'Get app detail',
      method: 'GET',
      url: '{{relayBaseUrl}}/developer/apps/{{esrAppId}}',
      auth: developerBearerAuth(),
    }),
    httpRequest({
      name: 'Add web origin',
      method: 'POST',
      url: '{{relayBaseUrl}}/developer/apps/{{esrAppId}}/origins',
      auth: developerBearerAuth(),
      headers: jsonHeaders(),
      body: {
        origin: '{{webOrigin}}',
      },
      tests: [
        "pm.test('Origin added', function () {",
        '    pm.response.to.have.status(201);',
        '    const json = pm.response.json();',
        '    const origin = json.origins.find((row) => row.origin === pm.environment.get("webOrigin"));',
        '    if (origin) {',
        "        pm.environment.set('originId', origin.id);",
        '    }',
        '});',
      ],
    }),
    httpRequest({
      name: 'Verify web origin',
      method: 'POST',
      url: '{{relayBaseUrl}}/developer/apps/{{esrAppId}}/origins/{{originId}}/verify',
      auth: developerBearerAuth(),
      description: 'DNS TXT or HTTPS `/.well-known/esr-app-verification` — see App Registry docs.',
    }),
    httpRequest({
      name: 'Add native bundle',
      method: 'POST',
      url: '{{relayBaseUrl}}/developer/apps/{{esrAppId}}/bundles',
      auth: developerBearerAuth(),
      headers: jsonHeaders(),
      description:
        'When `apps.native.requireManualReview` is true, bundle stays pending until operator approval.',
      body: {
        platform: 'ios',
        bundleId: '{{bundleId}}',
      },
      tests: [
        "pm.test('Bundle added', function () {",
        '    pm.response.to.have.status(201);',
        '    const json = pm.response.json();',
        '    const bundle = json.bundles.find((row) => row.bundleId === pm.environment.get("bundleId"));',
        '    if (bundle) {',
        "        pm.environment.set('nativeBundleRecordId', bundle.id);",
        '    }',
        '});',
      ],
    }),
    httpRequest({
      name: 'Rotate client secret',
      method: 'POST',
      url: '{{relayBaseUrl}}/developer/apps/{{esrAppId}}/rotate-secret',
      auth: developerBearerAuth(),
      description: 'Requires active app and approved bundles when manual review is enabled.',
      tests: [
        "pm.test('Client secret rotated', function () {",
        '    pm.response.to.have.status(200);',
        "    pm.environment.set('clientSecret', pm.response.json().clientSecret);",
        '});',
      ],
    }),
    httpRequest({
      name: 'Archive app',
      method: 'DELETE',
      url: '{{relayBaseUrl}}/developer/apps/{{esrAppId}}',
      auth: developerBearerAuth(),
      description: 'Soft-delete — status becomes `archived`. Origins can be removed; bundle rows remain.',
    }),
  ]
}

function buildAdminRevisionItems(): PostmanItem[] {
  return [
    httpRequest({
      name: 'Get sync settings (retention)',
      method: 'GET',
      url: '{{relayBaseUrl}}/admin/settings/sync',
      auth: adminBearerAuth(),
      description:
        'Returns `revisionRetentionDays` and `revisionRetentionCount` from config (`ESR_REVISION_RETENTION_DAYS`, `ESR_REVISION_RETENTION_COUNT`).',
    }),
    httpRequest({
      name: 'Purge revisions (namespace, by date)',
      method: 'POST',
      url: '{{relayBaseUrl}}/admin/revisions/purge',
      auth: adminBearerAuth(),
      headers: jsonHeaders(),
      description:
        'Manual cleanup. Date mode always keeps the current head. Count mode includes the head in `keepLastRevisions`.',
      body: {
        mode: 'date',
        before: '2026-01-01T00:00:00.000Z',
        scope: 'namespace',
        namespaceId: '{{namespaceId}}',
      },
    }),
    httpRequest({
      name: 'Purge revisions (app, by count)',
      method: 'POST',
      url: '{{relayBaseUrl}}/admin/revisions/purge',
      auth: adminBearerAuth(),
      headers: jsonHeaders(),
      body: {
        mode: 'count',
        keepLastRevisions: 50,
        scope: 'app',
        appId: '{{esrAppId}}',
      },
    }),
  ]
}

function buildAdminAppItems(): PostmanItem[] {
  return [
    httpRequest({
      name: 'List apps (search by bundle ID)',
      method: 'GET',
      url: '{{relayBaseUrl}}/admin/apps?q={{bundleId}}',
      auth: adminBearerAuth(),
      description: '`q` matches app ID, display name, or registered bundle ID.',
    }),
    httpRequest({
      name: 'Create app (operator)',
      method: 'POST',
      url: '{{relayBaseUrl}}/admin/apps',
      auth: adminBearerAuth(),
      headers: jsonHeaders(),
      body: {
        appId: '{{esrAppId}}',
        name: '{{appName}}',
        type: 'web',
        status: 'active',
        origins: ['{{webOrigin}}'],
      },
      tests: [
        "pm.test('Operator app created', function () {",
        '    pm.response.to.have.status(201);',
        '});',
      ],
    }),
    httpRequest({
      name: 'Get app detail',
      method: 'GET',
      url: '{{relayBaseUrl}}/admin/apps/{{esrAppId}}',
      auth: adminBearerAuth(),
    }),
    httpRequest({
      name: 'Add native bundle',
      method: 'POST',
      url: '{{relayBaseUrl}}/admin/apps/{{esrAppId}}/bundles',
      auth: adminBearerAuth(),
      headers: jsonHeaders(),
      body: {
        platform: 'ios',
        bundleId: '{{bundleId}}',
      },
      tests: [
        "pm.test('Bundle added', function () {",
        '    pm.response.to.have.status(201);',
        '    const json = pm.response.json();',
        '    const bundle = json.bundles.find((row) => row.bundleId === pm.environment.get("bundleId"));',
        '    if (bundle) {',
        "        pm.environment.set('nativeBundleRecordId', bundle.id);",
        '    }',
        '});',
      ],
    }),
    httpRequest({
      name: 'Approve native bundle',
      method: 'POST',
      url: '{{relayBaseUrl}}/admin/apps/{{esrAppId}}/bundles/{{nativeBundleRecordId}}/approve',
      auth: adminBearerAuth(),
      description: 'Optional for developer-submitted bundles pending manual review.',
    }),
    httpRequest({
      name: 'Suspend app',
      method: 'PATCH',
      url: '{{relayBaseUrl}}/admin/apps/{{esrAppId}}',
      auth: adminBearerAuth(),
      headers: jsonHeaders(),
      body: { status: 'suspended' },
    }),
    httpRequest({
      name: 'Archive app',
      method: 'DELETE',
      url: '{{relayBaseUrl}}/admin/apps/{{esrAppId}}',
      auth: adminBearerAuth(),
    }),
  ]
}

function buildAdminDeveloperItems(): PostmanItem[] {
  return [
    httpRequest({
      name: 'List developer accounts',
      method: 'GET',
      url: '{{relayBaseUrl}}/admin/developers?q={{developerEmail}}&filter=all',
      auth: adminBearerAuth(),
    }),
    httpRequest({
      name: 'Get developer account',
      method: 'GET',
      url: '{{relayBaseUrl}}/admin/developers/{{developerAccountId}}',
      auth: adminBearerAuth(),
      description: 'Set `developerAccountId` from list response `items[].id`.',
    }),
    httpRequest({
      name: 'Verify developer email',
      method: 'PATCH',
      url: '{{relayBaseUrl}}/admin/developers/{{developerAccountId}}',
      auth: adminBearerAuth(),
      headers: jsonHeaders(),
      body: { emailVerified: true },
    }),
    httpRequest({
      name: 'Disable developer account',
      method: 'PATCH',
      url: '{{relayBaseUrl}}/admin/developers/{{developerAccountId}}',
      auth: adminBearerAuth(),
      headers: jsonHeaders(),
      body: { disabled: true },
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
        '3. Pick **Web client** or **Native client** (run numbered requests in order when `apps.enabled` is true).',
        '',
        'Collection auth uses `{{deviceToken}}`. Unauthenticated routes override auth per request.',
        '',
        '**App registry:** Set `esrAppId`, `webOrigin` (web), or `bundleId` / `nativePlatform` / `clientSecret` (native). Portal folders need `adminToken` or developer credentials.',
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
        'Web client happy path when app registry is enabled: health → namespace → sync. For native, use the **Native client** folder instead.',
      ),
      folder(
        'Web client',
        buildWebClientItems(),
        'Browser/SPA flow when app registration is enforced. Headers: `X-ESR-App-Id` + `Origin`. Run requests 1 → 3 in order.',
      ),
      folder(
        'Native client',
        buildNativeClientItems(),
        'iOS/Android/desktop flow when app registration is enforced. Headers: `X-ESR-App-Id` + platform + bundle id (+ client secret when required). Run requests 1 → 3 in order.',
      ),
      folder('Namespaces', buildNamespaceItems()),
      folder('Documents', buildDocumentItems()),
      folder(
        'Devices & pairing',
        buildDeviceItems(),
        'Client-agnostic device management after pairing. Pairing flows live under **Web client** or **Native client**.',
      ),
      folder('Recovery', buildRecoveryItems()),
      folder('Limits & unlock', buildLimitItems()),
      folder('WebSocket', buildWebSocketItems()),
      folder(
        'App registry — Developer auth',
        buildDeveloperAuthItems(),
        'Self-service registration and JWT session. Requires developer portal enabled on the relay.',
      ),
      folder(
        'App registry — Developer apps',
        buildDeveloperAppItems(),
        'Create and manage your own applications. List search matches app ID, name, or bundle ID.',
      ),
      folder(
        'Operator — revisions',
        buildAdminRevisionItems(),
        'Automatic retention via `ESR_REVISION_RETENTION_DAYS` / `ESR_REVISION_RETENTION_COUNT`; manual purge for deployment, namespace, or app scope.',
      ),
      folder(
        'App registry — Operator apps',
        buildAdminAppItems(),
        'Operator-managed applications. Set `adminToken` (Bearer) from `ESR_ADMIN_TOKEN`.',
      ),
      folder(
        'App registry — Operator developers',
        buildAdminDeveloperItems(),
        'Manage self-service developer accounts (verify email, disable).',
      ),
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
      value: 'esr_app_example',
      type: 'default',
      enabled: true,
    },
    { key: 'appName', value: 'Example App', type: 'default', enabled: true },
    { key: 'webOrigin', value: 'https://app.example.com', type: 'default', enabled: true },
    { key: 'bundleId', value: 'com.example.app', type: 'default', enabled: true },
    { key: 'nativePlatform', value: 'ios', type: 'default', enabled: true },
    { key: 'originId', value: '', type: 'default', enabled: true },
    { key: 'nativeBundleRecordId', value: '', type: 'default', enabled: true },
    { key: 'clientSecret', value: '', type: 'secret', enabled: true },
    { key: 'adminToken', value: '', type: 'secret', enabled: true },
    { key: 'developerToken', value: '', type: 'secret', enabled: true },
    { key: 'developerEmail', value: 'dev@example.com', type: 'default', enabled: true },
    { key: 'developerPassword', value: 'change-me-12chars', type: 'secret', enabled: true },
    {
      key: 'developerAccountId',
      value: '',
      type: 'default',
      enabled: true,
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
