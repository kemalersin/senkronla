import { getRelayV1BaseUrl } from '@/lib/relay-proxy'
import { getOperatorToken } from '@/lib/operator-auth'

export class OperatorAuthError extends Error {
  constructor(message = 'Unauthorized') {
    super(message)
    this.name = 'OperatorAuthError'
  }
}

export async function relayAdminJson<T>(
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: T }> {
  const token = await getOperatorToken()

  if (!token) {
    throw new OperatorAuthError()
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

    if (errorBody.error?.code === 'UNAUTHORIZED' || errorBody.error?.code === 'ADMIN_API_DISABLED') {
      throw new OperatorAuthError(errorBody.error.message)
    }
  }

  return { status: response.status, body }
}

export async function verifyOperatorToken(token: string): Promise<boolean> {
  const response = await fetch(`${getRelayV1BaseUrl()}/admin/overview`, {
    headers: { authorization: `Bearer ${token}` },
    cache: 'no-store',
  })

  return response.ok
}
