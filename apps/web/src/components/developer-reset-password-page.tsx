'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'

import { Link, useRouter } from '@/i18n/navigation'

interface ApiErrorBody {
  error?: { message?: string; code?: string }
}

export function DeveloperResetPasswordPage() {
  const t = useTranslations('developer')
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')?.trim() ?? ''

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (password !== confirmPassword) {
      setError(t('passwordMismatch'))
      return
    }

    if (!token) {
      setError(t('resetMissingToken'))
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/developer/auth/reset-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      })

      const body = (await response.json()) as ApiErrorBody

      if (!response.ok) {
        if (body.error?.code === 'INVALID_TOKEN') {
          setError(t('resetInvalidToken'))
        } else {
          setError(body.error?.message ?? t('resetFailed'))
        }
        return
      }

      router.push('/developer')
    } catch {
      setError(t('resetFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="operator-shell developer-auth-shell">
      <div className="developer-auth-card card">
        <header className="developer-auth-header">
          <h1>{t('resetPasswordTitle')}</h1>
          <p className="developer-auth-intro">{t('resetPasswordIntro')}</p>
        </header>

        {!token ? (
          <div className="developer-auth-error" role="alert">
            <p>{t('resetMissingToken')}</p>
          </div>
        ) : (
          <form className="developer-auth-form" onSubmit={handleSubmit}>
            <div className="form-field">
              <label htmlFor="reset-password">{t('newPassword')}</label>
              <input
                id="reset-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={8}
                required
              />
              <span className="form-hint">{t('passwordHint')}</span>
            </div>

            <div className="form-field">
              <label htmlFor="reset-password-confirm">{t('confirmPassword')}</label>
              <input
                id="reset-password-confirm"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                minLength={8}
                required
              />
            </div>

            {error && (
              <div className="developer-auth-error" role="alert">
                <p>{error}</p>
              </div>
            )}

            <button type="submit" className="btn btn-primary developer-auth-submit" disabled={loading}>
              {loading ? t('submitting') : t('resetPassword')}
            </button>
          </form>
        )}

        <footer className="developer-auth-footer">
          <Link href="/developer">{t('backToLogin')}</Link>
        </footer>
      </div>
    </div>
  )
}
