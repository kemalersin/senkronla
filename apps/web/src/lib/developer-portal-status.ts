import { fetchRelayJson } from '@/lib/relay-proxy'

interface HealthResponse {
  developerPortal?: {
    enabled?: boolean
  }
}

export async function isDeveloperPortalEnabled(): Promise<boolean> {
  try {
    const { status, body } = await fetchRelayJson<HealthResponse>('/health')
    if (status !== 200 && status !== 503) {
      return false
    }

    return body.developerPortal?.enabled === true
  } catch {
    return false
  }
}
