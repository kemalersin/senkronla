export interface DeveloperSessionState {
  authenticated: boolean
  email: string | null
}

const DEVELOPER_SESSION_URL = '/api/developer/auth/session'
const OPERATOR_SESSION_URL = '/api/operator/auth/session'

let developerSessionPromise: Promise<DeveloperSessionState> | null = null
let operatorSessionPromise: Promise<boolean> | null = null

export function invalidateDeveloperSessionCache() {
  developerSessionPromise = null
}

export function invalidateOperatorSessionCache() {
  operatorSessionPromise = null
}

export function fetchDeveloperSession(options?: { fresh?: boolean }): Promise<DeveloperSessionState> {
  if (options?.fresh) {
    developerSessionPromise = null
  }

  if (!developerSessionPromise) {
    developerSessionPromise = (async () => {
      try {
        const response = await fetch(DEVELOPER_SESSION_URL)
        if (!response.ok) {
          return { authenticated: false, email: null }
        }

        const body = (await response.json()) as { email?: string }
        return { authenticated: true, email: body.email ?? null }
      } catch {
        return { authenticated: false, email: null }
      }
    })()
  }

  return developerSessionPromise
}

export function fetchOperatorSession(options?: { fresh?: boolean }): Promise<boolean> {
  if (options?.fresh) {
    operatorSessionPromise = null
  }

  if (!operatorSessionPromise) {
    operatorSessionPromise = fetch(OPERATOR_SESSION_URL)
      .then((response) => response.ok)
      .catch(() => false)
  }

  return operatorSessionPromise
}
