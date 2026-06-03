import type { ConflictContext, HeadMeta, PairingHostResult } from '@senkronla/client'

export interface HttpMessageParts {
  headers: string
  body?: string
}

function joinHttpMessage(parts: HttpMessageParts): string {
  return parts.body ? `${parts.headers}\n\n${parts.body}` : parts.headers
}

/** Shorten SHA-256 digests in demo JSON output (prefix … suffix). */
export function demoContentSha256(digest?: string | null): string {
  if (!digest || digest === '…') return '…'
  if (digest.includes('…')) return digest
  const prefix = 28
  const suffix = 14
  if (digest.length <= prefix + suffix) return digest
  return `${digest.slice(0, prefix)}…${digest.slice(-suffix)}`
}

/** Shorten namespace UUIDs in demo code blocks (prefix … suffix). */
export function demoNamespaceId(id?: string | null): string {
  if (!id || id === '…') return '…'
  if (id.includes('…')) return id
  const prefix = 8
  const suffix = 8
  if (id.length <= prefix + suffix + 1) return id
  return `${id.slice(0, prefix)}…${id.slice(-suffix)}`
}

/** Redact bearer-style secrets in demo JSON output. */
export function demoRedactSecret(value?: string | null): string {
  if (!value || value === '…') return '…'
  if (value.includes('…')) return value
  const prefix = 8
  const suffix = 6
  if (value.length <= prefix + suffix + 1) return value
  return `${value.slice(0, prefix)}…${value.slice(-suffix)}`
}

/** Recursively shorten namespaceId / contentSha256 fields for on-screen JSON. */
export function demoSanitizeForDisplay<T>(value: T): T {
  if (value === null || value === undefined) return value
  if (Array.isArray(value)) {
    return value.map((item) => demoSanitizeForDisplay(item)) as T
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (key === 'namespaceId' && typeof item === 'string') {
        out[key] = demoNamespaceId(item)
      } else if (key === 'deviceToken' && typeof item === 'string') {
        out[key] = demoRedactSecret(item)
      } else if (key === 'contentSha256' && typeof item === 'string') {
        out[key] = demoContentSha256(item)
      } else {
        out[key] = demoSanitizeForDisplay(item)
      }
    }
    return out as T
  }
  return value
}

export function demoJsonForDisplay(value: unknown): string {
  return JSON.stringify(demoSanitizeForDisplay(value), null, 2)
}

export function demoHeadMeta(meta: HeadMeta): HeadMeta {
  return { ...meta, contentSha256: demoContentSha256(meta.contentSha256) }
}

export const DEMO_SHA256_LOCAL = '2c26b46b68ffc68ff99b453a1fe3…5daf940e395977'
export const DEMO_SHA256_REMOTE = 'ef92b778bafe771e89245a89a8fb…9117823be1718c'

function healthOrigin(relayUrl: string): string {
  try {
    const parsed = new URL(relayUrl.replace(/\/$/, ''))
    parsed.pathname = parsed.pathname.replace(/\/v1\/?$/, '') || '/'
    parsed.pathname = `${parsed.pathname.replace(/\/$/, '')}/health`
    parsed.search = ''
    parsed.hash = ''
    return parsed.toString()
  } catch {
    return relayUrl.replace(/\/v1\/?$/, '') + '/health'
  }
}

export function formatHealthRequestParts(relayUrl: string): { http: string; curl: string } {
  const url = healthOrigin(relayUrl)
  const parsed = new URL(url)
  return {
    http: `GET ${parsed.pathname} HTTP/1.1\nHost: ${parsed.host}`,
    curl: `curl -sS ${url}`,
  }
}

export function formatHealthRequest(relayUrl: string): string {
  const { http, curl } = formatHealthRequestParts(relayUrl)
  return `${http}\n\n${curl}`
}

export function formatHealthResponse(appsEnabled: boolean | null, websocket = true): string {
  return JSON.stringify(
    {
      status: 'ok',
      websocket,
      apps: {
        enabled: appsEnabled ?? false,
      },
    },
    null,
    2,
  )
}

export function formatConnectRequest(relayUrl: string, appId: string): string {
  const trimmedAppId = appId.trim()
  const appHeader = trimmedAppId ? `\n  appId: '${trimmedAppId}',` : ''
  return `// Client SDK — connect
await EsrSync.connect({
  relayUrl: '${relayUrl}',${appHeader}
  storage: createLocalStorageAdapter(),
  document,
  onRecoveryPhrase,
  onConflict,
})`
}

export function formatNamespaceRequestParts(namespaceId: string, label: string): HttpMessageParts {
  const id = demoNamespaceId(namespaceId)
  return {
    headers: `POST /v1/namespaces HTTP/1.1\nContent-Type: application/json`,
    body: JSON.stringify(
      {
        namespaceId: id,
        namespaceLabel: label,
        recoveryKeyProof: '…',
        deviceLabel: 'Demo device',
      },
      null,
      2,
    ),
  }
}

export function formatNamespaceRequest(namespaceId: string, label: string): string {
  return joinHttpMessage(formatNamespaceRequestParts(namespaceId, label))
}

export function formatNamespaceResponse(namespaceId: string, created: boolean, recoveryPhrase?: string): string {
  return JSON.stringify(
    {
      namespaceId: demoNamespaceId(namespaceId),
      created,
      ...(recoveryPhrase ? { recoveryPhrase: recoveryPhrase.split(' ') } : {}),
    },
    null,
    2,
  )
}

export function formatHeadMetaRequest(namespaceId: string): string {
  return `GET /v1/namespaces/${demoNamespaceId(namespaceId)}/documents/primary/head/meta HTTP/1.1`
}

export function formatHeadMetaResponse(meta: HeadMeta): string {
  return JSON.stringify(demoHeadMeta(meta), null, 2)
}

export function formatSyncRequestParts(namespaceId: string): { sdk: string; http: string } {
  const doc = `/v1/namespaces/${demoNamespaceId(namespaceId)}/documents/primary`
  return {
    sdk: 'await sync.sync()',
    http: [
      `GET ${doc}/head/meta HTTP/1.1`,
      `GET ${doc}/head HTTP/1.1`,
      `PUT ${doc} HTTP/1.1`,
    ].join('\n'),
  }
}

export function formatSyncRequest(namespaceId: string): string {
  const { sdk, http } = formatSyncRequestParts(namespaceId)
  return `${sdk}\n\n${http}`
}

export function formatPushRequestParts(namespaceId: string, revision: string | null): HttpMessageParts {
  const id = demoNamespaceId(namespaceId)
  return {
    headers: `PUT /v1/namespaces/${id}/documents/primary HTTP/1.1\nContent-Type: application/json`,
    body: JSON.stringify(
      {
        expectedRevision: revision ?? null,
        envelope: {
          magic: 'ESR-DOC1',
          namespaceId: id,
          revision: '…',
          contentSha256: '…',
          payload: '…',
        },
      },
      null,
      2,
    ),
  }
}

export function formatPushRequest(namespaceId: string, revision: string | null): string {
  return joinHttpMessage(formatPushRequestParts(namespaceId, revision))
}

export function formatPairingRequestParts(namespaceId: string): HttpMessageParts {
  return {
    headers: `POST /v1/namespaces/${demoNamespaceId(namespaceId)}/pairing-tokens HTTP/1.1\nContent-Type: application/json`,
    body: JSON.stringify({ ttlSeconds: 300 }, null, 2),
  }
}

export function formatPairingRequest(namespaceId: string): string {
  return joinHttpMessage(formatPairingRequestParts(namespaceId))
}

export function formatPairingResponse(pairing: PairingHostResult): string {
  return JSON.stringify(pairing, null, 2)
}

export function formatJoinPairingRequestParts(namespaceId: string, code: string): HttpMessageParts {
  return {
    headers: `POST /v1/namespaces/${demoNamespaceId(namespaceId)}/pairing/redeem HTTP/1.1\nContent-Type: application/json`,
    body: JSON.stringify({ pairingCode: code, deviceLabel: 'Demo device' }, null, 2),
  }
}

export function formatJoinPairingRequest(namespaceId: string, code: string): string {
  return joinHttpMessage(formatJoinPairingRequestParts(namespaceId, code))
}

export interface ParsedPairingPayload {
  namespaceId: string
  code: string
  exp?: number
  host?: string
}

/** Example `qrPayload` from `startPairing()` — used in Join modal placeholder and docs samples. */
export const DEMO_PAIRING_QR_PAYLOAD = `esr://pair/v1/550e8400-e29b-41d4-a716-446655440000?code=482913&exp=1748427900&host=${encodeURIComponent('Alice laptop')}`

const DEMO_DEVICE_NAMES = ['Alice', 'Bob', 'Carol', 'Deniz', 'Ece', 'Mehmet', 'Zeynep'] as const
const DEMO_DEVICE_TYPES = ['laptop', 'phone', 'tablet', 'browser', 'desktop'] as const

/** Friendly random label for the connect step — matches agent doc samples (`Alice laptop`, …). */
export function randomDemoDeviceLabel(): string {
  const name = DEMO_DEVICE_NAMES[Math.floor(Math.random() * DEMO_DEVICE_NAMES.length)]!
  const type = DEMO_DEVICE_TYPES[Math.floor(Math.random() * DEMO_DEVICE_TYPES.length)]!
  return `${name} ${type}`
}

/** Parse `esr://pair/v1/{namespaceId}?code=…&exp=…&host=…` from startPairing(). */
export function parsePairingQrPayload(payload: string): ParsedPairingPayload | null {
  const trimmed = payload.trim()
  if (!trimmed) {
    return null
  }
  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'esr:' || url.hostname !== 'pair') {
      return null
    }
    const match = url.pathname.match(/^\/v1\/([^/]+)$/)
    if (!match) {
      return null
    }
    const namespaceId = decodeURIComponent(match[1])
    const code = url.searchParams.get('code')
    if (!code || !/^\d{6}$/.test(code)) {
      return null
    }
    const expRaw = url.searchParams.get('exp')
    const exp = expRaw ? Number.parseInt(expRaw, 10) : undefined
    const hostRaw = url.searchParams.get('host')
    return {
      namespaceId,
      code,
      ...(Number.isFinite(exp) ? { exp } : {}),
      ...(hostRaw ? { host: decodeURIComponent(hostRaw) } : {}),
    }
  } catch {
    return null
  }
}

export function formatConflictHttpStatus(): string {
  return `HTTP/1.1 409 Conflict\nContent-Type: application/json`
}

export function formatConflictResponse(ctx: ConflictContext): string {
  return JSON.stringify(
    {
      error: {
        code: 'REVISION_CONFLICT',
        message: 'Expected revision does not match head',
        details: {
          documentId: ctx.documentId,
          expectedRevision: ctx.knownRevision,
          remoteRevision: ctx.remoteRevision,
          remoteMeta: demoHeadMeta(ctx.remoteMeta),
        },
      },
    },
    null,
    2,
  )
}

export function formatWsConnectRequestParts(relayUrl: string, namespaceId: string): { http: string; shell: string } {
  const id = demoNamespaceId(namespaceId)
  const query = `namespaceId=${id}`
  try {
    const parsed = new URL(relayUrl.replace(/\/$/, ''))
    parsed.protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:'
    const pathname = `${parsed.pathname.replace(/\/v1\/?$/, '')}/v1/ws`
    const wsUrl = `${parsed.protocol}//${parsed.host}${pathname}?${query}`
    return {
      http: `GET ${pathname}?${query} HTTP/1.1\nUpgrade: websocket\nConnection: Upgrade`,
      shell: `wscat -c '${wsUrl}'`,
    }
  } catch {
    return {
      http: `GET /v1/ws?${query} HTTP/1.1\nUpgrade: websocket\nConnection: Upgrade`,
      shell: `wscat -c 'wss://relay.example/v1/ws?${query}'`,
    }
  }
}

export function formatWsConnectRequest(relayUrl: string, namespaceId: string): string {
  const { http, shell } = formatWsConnectRequestParts(relayUrl, namespaceId)
  return `${http}\n\n${shell}`
}

export function formatWsNotification(meta: HeadMeta, documentId = 'primary'): string {
  return JSON.stringify(
    {
      type: 'head_changed',
      documentId,
      meta: demoHeadMeta(meta),
    },
    null,
    2,
  )
}

export function formatEncryptionRequest(): string {
  return `createDocumentAdapter({
  encrypt: true,
  resolvePassword: async () => userSyncPassword,
  exportDocument: () => store.state,
  importDocument: (data) => store.replace(data),
})`
}

export function formatInstallCommand(): string {
  return 'npm install @senkronla/client'
}
