'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'

import { Link } from '@/i18n/navigation'

interface ApiErrorBody {
  error?: { message?: string }
}

export function DeveloperForgotPasswordPage() {
  const t = useTranslations('developer')
  const locale = useLocale()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/developer/auth/request-password-reset', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), locale }),
      })

      const body = (await response.json()) as ApiErrorBody

      if (!response.ok) {
        setError(body.error?.message ?? t('resetRequestFailed'))
        return
      }

      setSent(true)
    } catch {
      setError(t('resetRequestFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="operator-shell developer-auth-shell">
      <div className="developer-auth-card card">
        <header className="developer-auth-header">
          <h1>{t('forgotPasswordTitle')}</h1>
          <p className="developer-auth-intro">{t('forgotPasswordIntro')}</p>
        </header>

        {sent ? (
          <div className="developer-auth-notice" role="status">
            {t('resetEmailSent')}
          </div>
        ) : (
          <form className="developer-auth-form" onSubmit={handleSubmit}>
            <div className="form-field">
              <label htmlFor="forgot-email">{t('email')}</label>
              <input
                id="forgot-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>

            {error && (
              <div className="developer-auth-error" role="alert">
                <p>{error}</p>
              </div>
            )}

            <button type="submit" className="btn btn-primary developer-auth-submit" disabled={loading}>
              {loading ? t('submitting') : t('sendResetLink')}
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
