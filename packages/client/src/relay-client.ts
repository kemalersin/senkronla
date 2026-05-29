import { isEsrError } from './errors.js'
import { relayRequest } from './http.js'
import type {
  CreateNamespaceInput,
  CreateNamespaceResult,
  DeviceInfo,
  HeadMeta,
  NamespaceLimits,
  PairingTokenResult,
  PushDocumentInput,
  PushDocumentResult,
  RecoverInput,
  RecoverResult,
  RedeemPairingInput,
  RedeemPairingResult,
  RedeemUnlockResult,
} from './types.js'
import type { EsrDocEnvelope } from '@senkronla/protocol'

export interface RelayClientOptions {
  baseUrl: string
  clientDeviceId: string
  appId?: string
  appPlatform?: 'web' | 'ios' | 'android'
  bundleId?: string
  clientSecret?: string
  clientVersion?: string
  getDeviceToken?: () => string | null | Promise<string | null>
  onDeviceToken?: (token: string) => void | Promise<void>
  fetch?: typeof fetch
}

export class RelayClient {
  readonly clientDeviceId: string
  private readonly baseUrl: string
  private readonly getDeviceTokenFn?: RelayClientOptions['getDeviceToken']
  private readonly onDeviceTokenFn?: RelayClientOptions['onDeviceToken']
  private readonly fetchImpl?: typeof fetch
  private inMemoryToken: string | null = null
  private readonly appHeaders: Record<string, string>

  constructor(options: RelayClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '')
    this.clientDeviceId = options.clientDeviceId
    this.getDeviceTokenFn = options.getDeviceToken
    this.onDeviceTokenFn = options.onDeviceToken
    this.fetchImpl = options.fetch

    this.appHeaders = {}
    if (options.appId) {
      this.appHeaders['x-esr-app-id'] = options.appId
    }
    if (options.appPlatform) {
      this.appHeaders['x-esr-platform'] = options.appPlatform
    }
    if (options.bundleId) {
      this.appHeaders['x-esr-bundle-id'] = options.bundleId
    }
    if (options.clientSecret) {
      this.appHeaders['x-esr-client-secret'] = options.clientSecret
    }
    if (options.clientVersion) {
      this.appHeaders['x-esr-client-version'] = options.clientVersion
    }
  }

  getAppHeaders(): Record<string, string> {
    return { ...this.appHeaders }
  }

  async getDeviceToken(): Promise<string | null> {
    if (this.inMemoryToken) {
      return this.inMemoryToken
    }

    return (await this.getDeviceTokenFn?.()) ?? null
  }

  async setDeviceToken(token: string): Promise<void> {
    this.inMemoryToken = token
    await this.onDeviceTokenFn?.(token)
  }

  private async authToken(): Promise<string | null> {
    return this.getDeviceToken()
  }

  private request<T>(method: string, path: string, body?: unknown, token?: string | null) {
    return relayRequest<T>(this.baseUrl, {
      method,
      path,
      body,
      token,
      fetchImpl: this.fetchImpl,
      headers: this.appHeaders,
    })
  }

  async createNamespace(input: CreateNamespaceInput): Promise<CreateNamespaceResult> {
    const { data } = await this.request<CreateNamespaceResult>('POST', '/namespaces', {
      namespaceId: input.namespaceId,
      namespaceLabel: input.namespaceLabel,
      recoveryKeyProof: input.recoveryKeyProof,
      deviceLabel: input.deviceLabel,
      clientDeviceId: input.clientDeviceId,
    })

    await this.setDeviceToken(data.deviceToken)
    return data
  }

  async getNamespace(namespaceId: string): Promise<{
    namespaceId: string
    namespaceLabel: string
    limits: NamespaceLimits
    head: HeadMeta | null
    lastSyncAt: string | null
  }> {
    const token = await this.authToken()
    const { data } = await this.request<{
      namespaceId: string
      namespaceLabel: string
      limits: NamespaceLimits
      head: HeadMeta | null
      lastSyncAt: string | null
    }>('GET', `/namespaces/${namespaceId}`, undefined, token)
    return data
  }

  async listDevices(namespaceId: string): Promise<{ devices: DeviceInfo[]; limits: NamespaceLimits }> {
    const token = await this.authToken()
    const { data } = await this.request<{ devices: DeviceInfo[]; limits: NamespaceLimits }>(
      'GET',
      `/namespaces/${namespaceId}/devices`,
      undefined,
      token,
    )
    return data
  }

  async revokeDevice(namespaceId: string, deviceId: string): Promise<void> {
    const token = await this.authToken()
    await this.request('DELETE', `/namespaces/${namespaceId}/devices/${deviceId}`, undefined, token)
  }

  async createPairingToken(
    namespaceId: string,
    options?: { ttlSeconds?: number; allowedAppIds?: string[] },
  ): Promise<PairingTokenResult> {
    const token = await this.authToken()
    const { data } = await this.request<PairingTokenResult>(
      'POST',
      `/namespaces/${namespaceId}/pairing-tokens`,
      options ?? {},
      token,
    )
    return data
  }

  async redeemPairingCode(input: RedeemPairingInput): Promise<RedeemPairingResult> {
    const { data } = await this.request<RedeemPairingResult>(
      'POST',
      `/namespaces/${input.namespaceId}/devices`,
      {
        pairingCode: input.pairingCode,
        deviceLabel: input.deviceLabel,
        clientDeviceId: this.clientDeviceId,
      },
    )

    await this.setDeviceToken(data.deviceToken)
    return data
  }

  async recover(input: RecoverInput): Promise<RecoverResult> {
    const { data } = await this.request<RecoverResult>(
      'POST',
      `/namespaces/${input.namespaceId}/recover`,
      {
        recoveryKeyProof: input.recoveryKeyProof,
        deviceLabel: input.deviceLabel,
        clientDeviceId: input.clientDeviceId,
      },
    )

    await this.setDeviceToken(data.deviceToken)
    return data
  }

  async listDocuments(
    namespaceId: string,
  ): Promise<{ documents: Array<HeadMeta & { documentId: string }> }> {
    const token = await this.authToken()
    const { data } = await this.request<{ documents: Array<HeadMeta & { documentId: string }> }>(
      'GET',
      `/namespaces/${namespaceId}/documents`,
      undefined,
      token,
    )
    return data
  }

  async getHeadMeta(namespaceId: string, documentId = 'primary'): Promise<HeadMeta | null> {
    const token = await this.authToken()
    try {
      const { data } = await this.request<HeadMeta>(
        'GET',
        `/namespaces/${namespaceId}/documents/${documentId}/head/meta`,
        undefined,
        token,
      )
      return data
    } catch (error) {
      if (isEsrError(error) && error.code === 'DOCUMENT_NOT_FOUND') {
        return null
      }
      throw error
    }
  }

  async getHead(namespaceId: string, documentId = 'primary'): Promise<EsrDocEnvelope> {
    const token = await this.authToken()
    const { data } = await this.request<EsrDocEnvelope>(
      'GET',
      `/namespaces/${namespaceId}/documents/${documentId}/head`,
      undefined,
      token,
    )
    return data
  }

  async pushDocument(input: PushDocumentInput): Promise<PushDocumentResult> {
    const token = await this.authToken()
    const documentId = input.documentId ?? 'primary'
    const { data } = await this.request<PushDocumentResult>(
      'PUT',
      `/namespaces/${input.namespaceId}/documents/${documentId}`,
      {
        expectedRevision: input.expectedRevision ?? null,
        envelope: input.envelope,
      },
      token,
    )
    return data
  }

  async getLimits(namespaceId: string): Promise<NamespaceLimits> {
    const token = await this.authToken()
    const { data } = await this.request<NamespaceLimits>(
      'GET',
      `/namespaces/${namespaceId}/limits`,
      undefined,
      token,
    )
    return data
  }

  async redeemUnlockCode(namespaceId: string, unlockCode: string): Promise<RedeemUnlockResult> {
    const token = await this.authToken()
    const { data } = await this.request<RedeemUnlockResult>(
      'POST',
      `/namespaces/${namespaceId}/unlock`,
      { unlockCode },
      token,
    )
    return data
  }
}
