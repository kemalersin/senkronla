import { getPublicApiOrigin } from '@/lib/public-api-url'

export function getRelayV1BaseUrl(): string {
  return `${getPublicApiOrigin()}/v1`
}

export async function fetchRelayJson<T>(
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: T }> {
  const origin = getPublicApiOrigin()
  const response = await fetch(`${origin}${path}`, {
    ...init,
    cache: 'no-store',
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
