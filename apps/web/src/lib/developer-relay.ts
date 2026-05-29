import { getRelayV1BaseUrl } from '@/lib/relay-proxy'
import { getDeveloperToken } from '@/lib/developer-auth'

export class DeveloperAuthError extends Error {
  constructor(message = 'Unauthorized') {
    super(message)
    this.name = 'DeveloperAuthError'
  }
}

export async function relayDeveloperJson<T>(
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: T }> {
  const token = await getDeveloperToken()

  if (!token) {
    throw new DeveloperAuthError()
  }

  const response = await fetch(`${getRelayV1BaseUrl()}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      ...init?.headers,
      authorization: `Bearer ${token}`,
    },
  })

  const text = await response.text()
  let body: T

  try {
    body = text ? (JSON.parse(text) as T) : ({} as T)
  } catch {
    throw new Error(text || `Relay request failed (${response.status})`)
  }

  if (response.status === 401 || response.status === 503) {
    const errorBody = body as { error?: { code?: string; message?: string } }

    if (
      errorBody.error?.code === 'UNAUTHORIZED' ||
      errorBody.error?.code === 'DEVELOPER_PORTAL_DISABLED'
    ) {
      throw new DeveloperAuthError(errorBody.error.message)
    }
  }

  return { status: response.status, body }
}

export async function relayDeveloperPublicJson<T>(
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: T }> {
  const response = await fetch(`${getRelayV1BaseUrl()}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      ...init?.headers,
    },
  })

  const text = await response.text()
  let body: T

  try {
    body = text ? (JSON.parse(text) as T) : ({} as T)
  } catch {
    throw new Error(text || `Relay request failed (${response.status})`)
  }

  return { status: response.status, body }
}
