import { fetchRelayJson } from '@/lib/relay-proxy'

export interface RelayHealthSnapshot {
  developerPortalEnabled: boolean
  nativeRequireClientSecret: boolean
}

interface HealthResponse {
  developerPortal?: {
    enabled?: boolean
  }
  apps?: {
    nativeRequireClientSecret?: boolean
  }
}

const defaultSnapshot: RelayHealthSnapshot = {
  developerPortalEnabled: false,
  nativeRequireClientSecret: false,
}

export async function fetchRelayHealth(): Promise<RelayHealthSnapshot> {
  try {
    const { status, body } = await fetchRelayJson<HealthResponse>('/health')
    if (status !== 200 && status !== 503) {
      return defaultSnapshot
    }

    return {
      developerPortalEnabled: body.developerPortal?.enabled === true,
      nativeRequireClientSecret: body.apps?.nativeRequireClientSecret === true,
    }
  } catch {
    return defaultSnapshot
  }
}

export async function isDeveloperPortalEnabled(): Promise<boolean> {
  const health = await fetchRelayHealth()
  return health.developerPortalEnabled
}
