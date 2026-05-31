'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'

import { OperatorSpinner } from '@/components/operator-spinner'
import { Link } from '@/i18n/navigation'

interface ApiErrorBody {
  error?: { message?: string; code?: string }
}

export function DeveloperVerifyEmailPage() {
  const t = useTranslations('developer')
  const searchParams = useSearchParams()
  const token = searchParams.get('token')?.trim() ?? ''

  const [state, setState] = useState<'loading' | 'success' | 'error' | 'missing'>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!token) {
      setState('missing')
      return
    }

    let cancelled = false

    async function verify() {
      try {
        const response = await fetch('/api/developer/auth/verify-email', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token }),
        })

        const body = (await response.json()) as ApiErrorBody

        if (cancelled) {
          return
        }

        if (!response.ok) {
          setErrorMessage(body.error?.message ?? t('verifyFailed'))
          setState('error')
          return
        }

        setState('success')
      } catch {
        if (!cancelled) {
          setErrorMessage(t('verifyFailed'))
          setState('error')
        }
      }
    }

    void verify()

    return () => {
      cancelled = true
    }
  }, [token, t])

  return (
    <div className="operator-shell developer-auth-shell">
      <div className="developer-auth-card card">
        <header className="developer-auth-header">
          <h1>{t('verifyTitle')}</h1>
        </header>

        {state === 'loading' && <OperatorSpinner label={t('loading')} />}

        {state === 'missing' && (
          <div className="developer-auth-error" role="alert">
            <p>{t('verifyMissingToken')}</p>
          </div>
        )}

        {state === 'success' && (
          <div className="developer-auth-notice" role="status">
            {t('verifySuccess')}
          </div>
        )}

        {state === 'error' && (
          <div className="developer-auth-error" role="alert">
            <p>{errorMessage}</p>
          </div>
        )}

        <footer className="developer-auth-footer">
          <Link href="/developer">{t('backToLogin')}</Link>
        </footer>
      </div>
    </div>
  )
}
