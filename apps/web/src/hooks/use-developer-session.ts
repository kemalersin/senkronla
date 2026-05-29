'use client'

import { useCallback, useEffect, useState } from 'react'

export const DEVELOPER_SESSION_CHANGED_EVENT = 'senkronla:developer-session-changed'

export function notifyDeveloperSessionChanged() {
  window.dispatchEvent(new Event(DEVELOPER_SESSION_CHANGED_EVENT))
}

export function useDeveloperSession(initialAuthenticated = false) {
  const [authenticated, setAuthenticated] = useState(initialAuthenticated)

  const checkSession = useCallback(async () => {
    try {
      const response = await fetch('/api/developer/auth/session')
      setAuthenticated(response.ok)
    } catch {
      setAuthenticated(false)
    }
  }, [])

  useEffect(() => {
    void checkSession()

    window.addEventListener(DEVELOPER_SESSION_CHANGED_EVENT, checkSession)
    return () => window.removeEventListener(DEVELOPER_SESSION_CHANGED_EVENT, checkSession)
  }, [checkSession])

  return authenticated
}
