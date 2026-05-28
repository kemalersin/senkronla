import { EsrError, parseApiError } from './errors.js'

export interface RequestOptions {
  method: string
  path: string
  body?: unknown
  token?: string | null
  fetchImpl?: typeof fetch
}

export async function relayRequest<T>(
  baseUrl: string,
  options: RequestOptions,
): Promise<{ status: number; data: T }> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  if (!fetchImpl) {
    throw new EsrError('ESR_CLIENT_NO_FETCH', 'Fetch API is not available in this environment')
  }

  const url = `${baseUrl.replace(/\/$/, '')}${options.path}`
  const headers: Record<string, string> = {
    accept: 'application/json',
  }

  if (options.body !== undefined) {
    headers['content-type'] = 'application/json'
  }

  if (options.token) {
    headers.authorization = `Bearer ${options.token}`
  }

  let response: Response

  try {
    response = await fetchImpl(url, {
      method: options.method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
  } catch {
    throw new EsrError('ESR_CLIENT_OFFLINE', 'Network request failed')
  }

  if (response.status === 204) {
    return { status: response.status, data: undefined as T }
  }

  const text = await response.text()
  const data = text ? (JSON.parse(text) as T) : (undefined as T)

  if (!response.ok) {
    throw parseApiError(response.status, data)
  }

  return { status: response.status, data }
}
