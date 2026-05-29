'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'

import { DeveloperAccountPanel } from '@/components/developer-account-panel'
import { notifyDeveloperSessionChanged } from '@/hooks/use-developer-session'
import { useRouter } from '@/i18n/navigation'
import { OperatorAppsPanel } from '@/components/operator-apps-panel'
import { OperatorSegmentedField } from '@/components/operator-segmented-field'
import { OperatorSpinner } from '@/components/operator-spinner'
import { getPublicApiOrigin } from '@/lib/public-api-url'

interface ApiErrorBody {
  error?: { message?: string; code?: string }
}

async function readJson<T>(response: Response): Promise<T & ApiErrorBody> {
  return (await response.json()) as T & ApiErrorBody
}

const DEVELOPER_AUTH_NOTICE_KEY = 'developer-auth-notice'

function formatAuthError(
  body: ApiErrorBody,
  t: ReturnType<typeof useTranslations<'developer'>>,
): string {
  const message = body.error?.message?.trim()

  switch (body.error?.code) {
    case 'UNAUTHORIZED':
    case 'DEVELOPER_INVALID_CREDENTIALS':
      return t('authInvalidCredentials')
    case 'DEVELOPER_EMAIL_EXISTS':
      return t('authEmailExists')
    case 'DEVELOPER_EMAIL_NOT_VERIFIED':
      return t('authEmailNotVerified')
    case 'DEVELOPER_ACCOUNT_DISABLED':
      return t('authAccountDisabled')
    default:
      if (message === 'Invalid email or password') {
        return t('authInvalidCredentials')
      }

      return message || t('authFailed')
  }
}

export function DeveloperPortal({
  initialAuthMode = 'login',
  hasSessionCookie = false,
}: {
  initialAuthMode?: 'login' | 'register'
  hasSessionCookie?: boolean
}) {
  const t = useTranslations('developer')
  const router = useRouter()
  const apiOrigin = getPublicApiOrigin()

  const [authState, setAuthState] = useState<'loading' | 'guest' | 'authenticated'>(
    hasSessionCookie ? 'loading' : 'guest',
  )
  const [authMode, setAuthMode] = useState<'login' | 'register'>(initialAuthMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)
  const [authNotice, setAuthNotice] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(false)
  const [profileEmail, setProfileEmail] = useState<string | null>(null)
  const [page, setPage] = useState(0)

  const checkSession = useCallback(async () => {
    const response = await fetch('/api/developer/auth/session')

    if (!response.ok) {
      setAuthState('guest')
      setProfileEmail(null)
      return
    }

    const body = await readJson<{ email?: string }>(response)
    setProfileEmail(body.email ?? null)
    setAuthState('authenticated')
  }, [])

  useEffect(() => {
    void checkSession()
  }, [checkSession])

  useEffect(() => {
    setAuthMode(initialAuthMode)
  }, [initialAuthMode])

  useEffect(() => {
    const storedNotice = sessionStorage.getItem(DEVELOPER_AUTH_NOTICE_KEY)

    if (storedNotice === 'register-pending') {
      setAuthNotice(t('registerPendingVerification'))
      sessionStorage.removeItem(DEVELOPER_AUTH_NOTICE_KEY)
    }
  }, [t])

  async function handleAuthSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAuthLoading(true)
    setAuthError(null)
    setAuthNotice(null)

    const path = authMode === 'login' ? '/api/developer/auth/login' : '/api/developer/auth/register'

    try {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })

      const body = await readJson<{ ok?: boolean; token?: string }>(response)

      if (!response.ok) {
        setAuthError(formatAuthError(body, t))
        return
      }

      if (authMode === 'register' && !body.token) {
        setPassword('')
        sessionStorage.setItem(DEVELOPER_AUTH_NOTICE_KEY, 'register-pending')
        router.push('/developer')
        return
      }

      setPassword('')
      await checkSession()
      notifyDeveloperSessionChanged()
    } catch {
      setAuthError(t('authFailed'))
    } finally {
      setAuthLoading(false)
    }
  }

  async function handleLogout() {
    await fetch('/api/developer/auth/logout', { method: 'POST' })
    setAuthState('guest')
    setProfileEmail(null)
    notifyDeveloperSessionChanged()
  }

  if (authState === 'loading') {
    return (
      <div className="operator-shell developer-auth-shell">
        <OperatorSpinner label={t('loading')} />
      </div>
    )
  }

  if (authState === 'guest') {
    return (
      <div className="operator-shell developer-auth-shell">
        <div className="developer-auth-card card">
          <header className="developer-auth-header">
            <h1>{t('title')}</h1>
            <p className="developer-auth-intro">
              {authMode === 'login' ? t('loginIntro') : t('registerIntro')}
            </p>
          </header>

          <OperatorSegmentedField
            label={t('authModeLabel')}
            value={authMode}
            options={[
              { value: 'login', label: t('login') },
              { value: 'register', label: t('register') },
            ]}
            onChange={(mode) => {
              setAuthError(null)
              setAuthNotice(null)
              router.push(mode === 'register' ? '/developer/register' : '/developer')
            }}
          />

          <form className="developer-auth-form" onSubmit={handleAuthSubmit}>
            <div className="form-field">
              <label htmlFor="developer-email">{t('email')}</label>
              <input
                id="developer-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="developer-password">{t('password')}</label>
              <input
                id="developer-password"
                type="password"
                autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={authMode === 'register' ? 8 : undefined}
                required
              />
              {authMode === 'register' && (
                <span className="form-hint">{t('passwordHint')}</span>
              )}
            </div>

            <button type="submit" className="btn btn-primary developer-auth-submit" disabled={authLoading}>
              {authLoading
                ? t('submitting')
                : authMode === 'login'
                  ? t('login')
                  : t('register')}
            </button>
          </form>

          {authNotice && (
            <div className="developer-auth-notice" role="status">
              {authNotice}
            </div>
          )}

          {authError && (
            <div className="developer-auth-error" role="alert">
              {authError}
            </div>
          )}

          <footer className="developer-auth-footer">
            <span className="operator-muted">{t('apiOriginLabel')}</span>
            <code className="developer-auth-api-origin">{apiOrigin}</code>
          </footer>
        </div>
      </div>
    )
  }

  return (
    <div className="operator-shell">
      <header className="operator-header">
        <div>
          <h1>{t('title')}</h1>
          <p className="operator-muted">{t('intro')}</p>
        </div>
      </header>

      <DeveloperAccountPanel
        profileEmail={profileEmail}
        apiOrigin={apiOrigin}
        onLogout={() => void handleLogout()}
      />

      <OperatorAppsPanel
        authState={authState}
        page={page}
        mode="developer"
        onUnauthorized={() => setAuthState('guest')}
        onPageChange={setPage}
      />
    </div>
  )
}
