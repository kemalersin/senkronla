'use client'

import { useCallback, useEffect, useState } from 'react'

import { fetchDeveloperSession, invalidateDeveloperSessionCache } from '@/lib/auth-session-client'

export const DEVELOPER_SESSION_CHANGED_EVENT = 'senkronla:developer-session-changed'

export function notifyDeveloperSessionChanged() {
  invalidateDeveloperSessionCache()
  window.dispatchEvent(new Event(DEVELOPER_SESSION_CHANGED_EVENT))
}

export function useDeveloperSession(initialAuthenticated = false) {
  const [authenticated, setAuthenticated] = useState(initialAuthenticated)

  const checkSession = useCallback(async (fresh = false) => {
    const session = await fetchDeveloperSession(fresh ? { fresh: true } : undefined)
    setAuthenticated(session.authenticated)
  }, [])

  useEffect(() => {
    void checkSession()

    function onSessionChanged() {
      void checkSession()
    }

    window.addEventListener(DEVELOPER_SESSION_CHANGED_EVENT, onSessionChanged)
    return () => window.removeEventListener(DEVELOPER_SESSION_CHANGED_EVENT, onSessionChanged)
  }, [checkSession])

  return authenticated
}
